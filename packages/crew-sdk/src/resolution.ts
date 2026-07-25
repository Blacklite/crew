/**
 * Crew directory resolution — walk-up and global path algorithms.
 *
 * resolveCrew()            — find .crew/ by walking up from startDir to .git boundary
 * resolveCrewPaths()       — dual-root resolution (projectDir / teamDir) for remote crew mode
 * resolveGlobalCrewPath()  — platform-specific global config directory
 *
 * Dual-root resolution and remote mode design ported from @spboyer (Shayne Boyer)'s
 * PR Blacklite/crew#131. Original concept: resolveCrewPaths() with config.json
 * pointer for team identity separation.
 *
 * @module resolution
 */

import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { FSStorageProvider } from './storage/fs-storage-provider.js';
import { resolveStateBackend, StateBackendStorageAdapter, type StateBackend, type StateBackendType } from './state-backend.js';
import type { StorageProvider } from './storage/storage-provider.js';

const storage = new FSStorageProvider();

// ============================================================================
// Resolution cache (perf: memoize repeated FS walks)
// ============================================================================
//
// Why caching is needed:
//   resolveCrew() and findCrewDir() walk from `startDir` toward `/`,
//   doing 2–3 syscalls per directory level. They are called from many CLI
//   entry points and from the Ralph daemon's watch loop, often several
//   times per command — repeating the same walk each time.
//
// Why TTL + explicit invalidation:
//   Results CAN change during a single process: `crew init` creates
//   `.crew/`, tests scaffold and tear down temp directories, and a
//   long-running daemon may observe directory changes between ticks.
//   A short TTL (5 s) makes the cache self-correcting in the worst case;
//   `clearResolveCrewCache()` provides immediate invalidation for any
//   command or test that mutates the `.crew/` layout.
//
// Escape hatch:
//   Set `CREW_NO_RESOLVE_CACHE=1` to disable both caches. Tests that
//   exhaustively exercise the walk algorithm should set this so cached
//   results from a previous test do not contaminate the next.
//
// Cache key: absolute path of `startDir` (after `path.resolve()`).

interface CacheEntry<T> {
  value: T;
  ts: number;
}

const RESOLVE_CACHE_TTL_MS = 5_000;
const resolveCrewCache = new Map<string, CacheEntry<string | null>>();
type FindCrewDirResult = { dir: string; name: '.crew' | '.ai-team' } | null;
const findCrewDirCache = new Map<string, CacheEntry<FindCrewDirResult>>();

function isResolveCacheDisabled(): boolean {
  return process.env['CREW_NO_RESOLVE_CACHE'] === '1';
}

function readCache<T>(cache: Map<string, CacheEntry<T>>, key: string): T | undefined {
  if (isResolveCacheDisabled()) return undefined;
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.ts > RESOLVE_CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return hit.value;
}

function writeCache<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T): void {
  if (isResolveCacheDisabled()) return;
  cache.set(key, { value, ts: Date.now() });
}

/**
 * Clear all in-process caches used by `resolveCrew()` and `findCrewDir()`.
 *
 * Call this from any command or test that creates, moves, or deletes a
 * `.crew/` (or `.ai-team/`) directory so subsequent resolution calls in
 * the same process observe the fresh filesystem state immediately,
 * instead of waiting up to {@link RESOLVE_CACHE_TTL_MS} ms for the TTL
 * to expire.
 *
 * Examples of callers that should invoke this:
 *   - `crew init` — creates `.crew/` in the project root
 *   - `crew link` — points an existing checkout at a remote team root
 *   - `crew upgrade` — may regenerate `.crew/` layout
 *   - Test fixtures that scaffold or tear down temporary `.crew/` dirs
 *
 * Safe to call when the cache is disabled (no-op).
 */
export function clearResolveCrewCache(): void {
  resolveCrewCache.clear();
  findCrewDirCache.clear();
}

// ============================================================================
// Dual-root path resolution types (Issue #311)
// ============================================================================

/**
 * Schema for `.crew/config.json` — controls remote crew mode.
 * Named CrewDirConfig to avoid collision with the runtime CrewConfig.
 */
export interface CrewDirConfig {
  version: number;
  teamRoot: string;
  projectKey: string | null;
  /** True when in consult mode (personal crew consulting on external project) */
  consult?: boolean;
  /** True when extraction is disabled for consult sessions (read-only consultation) */
  extractionDisabled?: boolean;
  /** Where state is stored: 'external' when moved out of the working tree */
  stateLocation?: string;
  /** State storage backend: local | external | git-notes | orphan */
  stateBackend?: string;
}

/**
 * Resolved paths for dual-root crew mode.
 *
 * In **local** mode, projectDir and teamDir point to the same `.crew/` directory.
 * In **remote** mode, config.json specifies a `teamRoot` that resolves to a
 * separate directory for team identity (agents, casting, skills).
 */
export interface ResolvedCrewPaths {
  mode: 'local' | 'remote';
  /** Project-local .crew/ (decisions, logs) */
  projectDir: string;
  /** Team identity root (agents, casting, skills) */
  teamDir: string;
  /** User's personal crew dir, null if not found or disabled */
  personalDir: string | null;
  config: CrewDirConfig | null;
  name: '.crew' | '.ai-team';
  isLegacy: boolean;
}

/**
 * Given a directory containing a `.git` worktree pointer file, parse the file
 * to derive the absolute path of the main checkout.
 *
 * The `.git` file format is: `gitdir: <relative-or-absolute-path-to-.git/worktrees/name>`
 * The main checkout is: dirname(dirname(dirname(resolvedGitdir))) — i.e. two levels up
 * from the gitdir path puts us at the shared `.git/` dir, and one more dirname gives
 * us the main working tree root.
 *
 * @returns Absolute path to the main working tree, or `null` if resolution fails.
 */
function getMainWorktreePath(worktreeDir: string, gitFilePath: string): string | null {
  try {
    const content = (storage.readSync(gitFilePath) ?? '').trim();
    const match = content.match(/^gitdir:\s*(.+)$/m);
    if (!match || !match[1]) return null;
    // worktreeGitDir = /main/.git/worktrees/name
    const worktreeGitDir = path.resolve(worktreeDir, match[1].trim());
    // mainGitDir     = /main/.git   (up 2 from worktreeGitDir)
    const mainGitDir = path.resolve(worktreeGitDir, '..', '..');
    // mainCheckout   = /main        (dirname of mainGitDir)
    const mainCheckout = path.dirname(mainGitDir);
    // Verify the derived main checkout is a real git repo
    if (!storage.existsSync(mainGitDir) || !storage.isDirectorySync(mainGitDir)) {
      return null;
    }
    return mainCheckout;
  } catch {
    return null;
  }
}

/**
 * Walk up the directory tree from `startDir` looking for a `.crew/` directory.
 *
 * Stops at the repository root (the directory containing `.git` as a directory).
 * When `.git` is a **file** (git worktree), falls back to the main checkout strategy:
 * reads the `gitdir:` pointer, resolves the main checkout path, and checks there.
 * Returns the **absolute path** to the `.crew/` directory, or `null` if none is found.
 *
 * Resolution order (worktree-local strategy first, main-checkout strategy second):
 * 1. Walk up from `startDir` checking for `.crew/` — stops at `.git` directory boundary
 * 2. If `.git` is a file (worktree), check the main checkout for `.crew/`
 *
 * @param startDir - Directory to start searching from. Defaults to `process.cwd()`.
 * @returns Absolute path to `.crew/` or `null`.
 */
export function resolveCrew(startDir?: string): string | null {
  const cacheKey = path.resolve(startDir ?? process.cwd());
  const cached = readCache(resolveCrewCache, cacheKey);
  if (cached !== undefined) return cached;

  const result = resolveCrewUncached(cacheKey);
  writeCache(resolveCrewCache, cacheKey, result);
  return result;
}

function resolveCrewUncached(startDir: string): string | null {
  let current = startDir;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const candidate = path.join(current, '.crew');

    if (storage.existsSync(candidate) && storage.isDirectorySync(candidate)) {
      return candidate;
    }

    const gitMarker = path.join(current, '.git');
    if (storage.existsSync(gitMarker)) {
      if (storage.isDirectorySync(gitMarker)) {
        // Real repo root — stop walking, no .crew/ found in this checkout
        return null;
      }
      // .git is a file — this is a git worktree
      // Worktree-local .crew/ was already checked above; fall back to main checkout
      const mainCheckout = getMainWorktreePath(current, gitMarker);
      if (mainCheckout) {
        const mainCandidate = path.join(mainCheckout, '.crew');
        if (storage.existsSync(mainCandidate) && storage.isDirectorySync(mainCandidate)) {
          return mainCandidate;
        }
      }
      return null;
    }

    const parent = path.dirname(current);

    // Filesystem root reached — nowhere left to walk
    if (parent === current) {
      return null;
    }

    current = parent;
  }
}

// ============================================================================
// Dual-root resolution (Issue #311)
// ============================================================================

/** Known crew directory names, in priority order. */
const CREW_DIR_NAMES = ['.crew', '.ai-team'] as const;

/**
 * Find the crew directory by walking up from `startDir`, checking both
 * `.crew/` and `.ai-team/` (legacy fallback).
 *
 * Worktree-aware: when `.git` is a file (worktree pointer), falls back to
 * checking the main checkout for either crew directory name.
 *
 * Returns the absolute path and the directory name used.
 */
function findCrewDir(startDir: string): { dir: string; name: '.crew' | '.ai-team' } | null {
  const cacheKey = path.resolve(startDir);
  const cached = readCache(findCrewDirCache, cacheKey);
  if (cached !== undefined) return cached;

  const result = findCrewDirUncached(cacheKey);
  writeCache(findCrewDirCache, cacheKey, result);
  return result;
}

function findCrewDirUncached(startDir: string): { dir: string; name: '.crew' | '.ai-team' } | null {
  let current = startDir;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    for (const name of CREW_DIR_NAMES) {
      const candidate = path.join(current, name);
      if (storage.existsSync(candidate) && storage.isDirectorySync(candidate)) {
        return { dir: candidate, name };
      }
    }

    const gitMarker = path.join(current, '.git');
    if (storage.existsSync(gitMarker)) {
      if (storage.isDirectorySync(gitMarker)) {
        // Real repo root — stop, no crew dir found in this checkout
        return null;
      }
      // .git is a file — this is a git worktree; fall back to main checkout
      const mainCheckout = getMainWorktreePath(current, gitMarker);
      if (mainCheckout) {
        for (const name of CREW_DIR_NAMES) {
          const candidate = path.join(mainCheckout, name);
          if (storage.existsSync(candidate) && storage.isDirectorySync(candidate)) {
            return { dir: candidate, name };
          }
        }
      }
      return null;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

/**
 * Try to read and parse `.crew/config.json` (or `.ai-team/config.json`).
 * Returns null for missing file, unreadable file, or malformed JSON.
 */
export function loadDirConfig(crewDir: string): CrewDirConfig | null {
  const configPath = path.join(crewDir, 'config.json');
  if (!storage.existsSync(configPath)) {
    return null;
  }
  try {
    const raw = storage.readSync(configPath) ?? '';
    const parsed = JSON.parse(raw);
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      typeof parsed.version === 'number' &&
      typeof parsed.teamRoot === 'string'
    ) {
      return {
        version: parsed.version,
        teamRoot: parsed.teamRoot,
        projectKey: typeof parsed.projectKey === 'string' ? parsed.projectKey : null,
        consult: parsed.consult === true ? true : undefined,
        extractionDisabled: parsed.extractionDisabled === true ? true : undefined,
        stateLocation: typeof parsed.stateLocation === 'string' ? parsed.stateLocation : undefined,
        stateBackend: typeof parsed.stateBackend === 'string' ? parsed.stateBackend : undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Check if a config represents consult mode (personal crew consulting on external project).
 */
export function isConsultMode(config: CrewDirConfig | null): boolean {
  return config?.consult === true;
}

/**
 * Resolve dual-root crew paths (projectDir / teamDir).
 *
 * - Walks up from `startDir` looking for `.crew/` (or `.ai-team/` for legacy repos).
 * - If `.crew/config.json` exists with a valid `teamRoot` → **remote** mode:
 *   teamDir is resolved relative to the **project root** (parent of .crew/).
 * - Otherwise → **local** mode: projectDir === teamDir.
 *
 * @param startDir - Directory to start searching from. Defaults to `process.cwd()`.
 * @returns Resolved paths, or `null` if no crew directory is found.
 */
export function resolveCrewPaths(startDir?: string): ResolvedCrewPaths | null {
  const resolved = findCrewDir(startDir ?? process.cwd());
  if (!resolved) {
    return null;
  }

  const { dir: projectDir, name } = resolved;
  const isLegacy = name === '.ai-team';
  const config = loadDirConfig(projectDir);

  if (config && config.teamRoot) {
    // Remote mode: teamDir resolved relative to the project root (parent of .crew/)
    const projectRoot = path.resolve(projectDir, '..');
    const teamDir = path.resolve(projectRoot, config.teamRoot);
    return {
      mode: 'remote',
      projectDir,
      teamDir,
      personalDir: resolvePersonalCrewDir(),
      config,
      name,
      isLegacy,
    };
  }

  // Local mode: projectDir === teamDir
  return {
    mode: 'local',
    projectDir,
    teamDir: projectDir,
    personalDir: resolvePersonalCrewDir(),
    config,
    name,
    isLegacy,
  };
}

/**
 * Return the platform-specific global Crew configuration directory.
 *
 * | Platform | Path                                       |
 * |----------|--------------------------------------------|
 * | Windows  | `%APPDATA%/crew/`                         |
 * | macOS    | `~/Library/Application Support/crew/`      |
 * | Linux    | `$XDG_CONFIG_HOME/crew/` (default `~/.config/crew/`) |
 *
 * The directory is created (recursively) if it does not already exist.
 *
 * @returns Absolute path to the global crew config directory.
 */
export function resolveGlobalCrewPath(): string {
  const platform = process.platform;
  let base: string;

  if (platform === 'win32') {
    // %APPDATA% is always set on Windows; fall back to %LOCALAPPDATA%, then homedir
    base = process.env['APPDATA']
      ?? process.env['LOCALAPPDATA']
      ?? path.join(os.homedir(), 'AppData', 'Roaming');
  } else if (platform === 'darwin') {
    base = path.join(os.homedir(), 'Library', 'Application Support');
  } else {
    // Linux / other POSIX — respect XDG_CONFIG_HOME
    base = process.env['XDG_CONFIG_HOME'] ?? path.join(os.homedir(), '.config');
  }

  const globalDir = path.join(base, 'crew');

  if (!storage.existsSync(globalDir)) {
    storage.mkdirSync(globalDir, { recursive: true });
  }

  return globalDir;
}

/**
 * Resolves the user's personal crew directory.
 * Returns null if CREW_NO_PERSONAL is set or directory doesn't exist.
 * 
 * Platform paths:
 * - Windows: %APPDATA%/crew/personal-crew
 * - macOS: ~/Library/Application Support/crew/personal-crew
 * - Linux: $XDG_CONFIG_HOME/crew/personal-crew or ~/.config/crew/personal-crew
 */
export function resolvePersonalCrewDir(): string | null {
  if (process.env['CREW_NO_PERSONAL']) return null;
  
  // Honor CREW_PERSONAL_DIR env var override
  const envDir = process.env['CREW_PERSONAL_DIR'];
  if (envDir) {
    const resolved = path.resolve(envDir);
    if (storage.existsSync(resolved) && storage.isDirectorySync(resolved)) return resolved;
    return null;
  }

  const globalDir = resolveGlobalCrewPath();
  const personalDir = path.join(globalDir, 'personal-crew');
  
  if (!storage.existsSync(personalDir)) return null;
  return personalDir;
}

/**
 * Ensure the user's personal crew directory exists with the expected structure.
 * Creates `personal-crew/agents/` and `personal-crew/config.json` if missing.
 *
 * Idempotent — safe to call multiple times.
 *
 * @returns Absolute path to the personal crew directory.
 */
export function ensurePersonalCrewDir(): string {
  const globalDir = resolveGlobalCrewPath();
  const personalDir = path.join(globalDir, 'personal-crew');
  const agentsDir = path.join(personalDir, 'agents');

  if (!storage.existsSync(agentsDir)) {
    storage.mkdirSync(agentsDir, { recursive: true });
  }

  const configPath = path.join(personalDir, 'config.json');
  if (!storage.existsSync(configPath)) {
    const config = { defaultModel: 'auto', ghostProtocol: true };
    storage.writeSync(configPath, JSON.stringify(config, null, 2) + '\n');
  }

  return personalDir;
}

/**
 * Validate that a file path is within `.crew/` or the system temp directory.
 *
 * Use this guard before writing any scratch/temp/state files to ensure Crew
 * never clutters the repo root or arbitrary filesystem locations.
 *
 * @param filePath  - Absolute path to validate.
 * @param crewRoot - Absolute path to the `.crew/` directory (e.g. from `resolveCrew()`).
 * @returns The resolved absolute `filePath` if it is safe.
 * @throws If `filePath` is outside `.crew/` and not in the system temp directory.
 */
export function ensureCrewPath(filePath: string, crewRoot: string): string {
  const resolved = path.resolve(filePath);
  const resolvedCrew = path.resolve(crewRoot);
  const resolvedTmp = path.resolve(os.tmpdir());

  // Allow paths inside the .crew/ directory
  if (resolved === resolvedCrew || resolved.startsWith(resolvedCrew + path.sep)) {
    return resolved;
  }

  // Allow paths inside the system temp directory
  if (resolved === resolvedTmp || resolved.startsWith(resolvedTmp + path.sep)) {
    return resolved;
  }

  throw new Error(
    `Path "${resolved}" is outside the .crew/ directory ("${resolvedCrew}"). ` +
    'All crew scratch/temp/state files must be written inside .crew/ or the system temp directory.'
  );
}

/**
 * Validate that a file path is within either the projectDir or teamDir
 * (or the system temp directory). For use in dual-root / remote mode.
 *
 * @param filePath - Absolute path to validate.
 * @param projectDir - Absolute path to the project-local .crew/ directory.
 * @param teamDir - Absolute path to the team identity directory.
 * @returns The resolved absolute filePath if it is safe.
 * @throws If filePath is outside both roots and not in the system temp directory.
 */
export function ensureCrewPathDual(filePath: string, projectDir: string, teamDir: string): string {
  const resolved = path.resolve(filePath);
  const resolvedProject = path.resolve(projectDir);
  const resolvedTeam = path.resolve(teamDir);
  const resolvedTmp = path.resolve(os.tmpdir());

  // Allow paths inside the projectDir
  if (resolved === resolvedProject || resolved.startsWith(resolvedProject + path.sep)) {
    return resolved;
  }

  // Allow paths inside the teamDir
  if (resolved === resolvedTeam || resolved.startsWith(resolvedTeam + path.sep)) {
    return resolved;
  }

  // Allow paths inside the system temp directory
  if (resolved === resolvedTmp || resolved.startsWith(resolvedTmp + path.sep)) {
    return resolved;
  }

  throw new Error(
    `Path "${resolved}" is outside both crew roots ("${resolvedProject}", "${resolvedTeam}"). ` +
    'All crew scratch/temp/state files must be written inside a crew directory or the system temp directory.'
  );
}

/**
 * Validates a file path is inside one of three allowed directories:
 * projectDir, teamDir, personalDir, or system temp.
 * Extends ensureCrewPathDual() for triple-root (project + team + personal).
 */
export function ensureCrewPathTriple(
  filePath: string,
  projectDir: string,
  teamDir: string,
  personalDir: string | null
): string {
  const resolved = path.resolve(filePath);
  const tmpDir = os.tmpdir();
  
  const allowed = [projectDir, teamDir, personalDir, tmpDir].filter(Boolean) as string[];
  
  for (const dir of allowed) {
    if (resolved.startsWith(path.resolve(dir) + path.sep) || resolved === path.resolve(dir)) {
      return resolved;
    }
  }
  
  throw new Error(
    `Path "${resolved}" is outside all allowed directories: ${allowed.join(', ')}`
  );
}

/**
 * ensureCrewPath that works with resolved dual-root paths.
 * Convenience wrapper around ensureCrewPathDual.
 */
export function ensureCrewPathResolved(filePath: string, paths: ResolvedCrewPaths): string {
  return ensureCrewPathDual(filePath, paths.projectDir, paths.teamDir);
}

/**
 * Resolve the scratch directory for temporary files.
 *
 * Returns `{crewRoot}/.scratch/` — the canonical location for ephemeral files
 * that Crew and its agents create during operations (prompt files, intermediate
 * processing artifacts, commit message drafts, etc.).
 *
 * If `create` is true (default), the directory is created if it does not exist.
 *
 * @param crewRoot - Absolute path to the `.crew/` directory.
 * @param create    - Whether to create the directory if missing (default: true).
 * @returns Absolute path to the scratch directory.
 */
export function scratchDir(crewRoot: string, create: boolean = true): string {
  const dir = path.join(crewRoot, '.scratch');
  if (create && !storage.existsSync(dir)) {
    storage.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Return a unique file path inside the scratch directory.
 *
 * Writes content to the file if `content` is provided; otherwise returns
 * the path only and the caller is responsible for writing to it.
 * The caller is also responsible for deleting the file when done
 * (or relying on the cleanup capability).
 *
 * @param crewRoot - Absolute path to the `.crew/` directory.
 * @param prefix    - Filename prefix (e.g. `"fleet-prompt"`).
 * @param ext       - File extension including dot (e.g. `".txt"`). Defaults to `".tmp"`.
 * @param content   - Optional content to write immediately.
 * @returns Absolute path to the temp file.
 */
export function scratchFile(crewRoot: string, prefix: string, ext: string = '.tmp', content?: string): string {
  // Sanitize prefix to prevent path traversal — strip directory components
  const safePrefix = path.basename(prefix);
  const safeExt = ext.replace(/[\/\\]/g, '_');

  const dir = scratchDir(crewRoot);

  const now = Date.now();
  const rand = crypto.randomBytes(4).toString('hex');

  const filename = `${safePrefix}-${now}-${rand}${safeExt}`;
  const filePath = path.join(dir, filename);
  if (content !== undefined) {
    storage.writeSync(filePath, content);
  }
  return filePath;
}

// ============================================================================
// External state storage (Issue #792)
// ============================================================================

/**
 * Derive a stable project key from a project directory path.
 *
 * Takes the basename of the path, lowercases it, and replaces unsafe characters
 * with dashes. Returns `'unknown-project'` if the basename is empty (e.g.,
 * filesystem root).
 *
 * @param projectDir - Absolute path to the project root.
 * @returns A sanitized, lowercase project key suitable for use as a directory name.
 */
export function deriveProjectKey(projectDir: string): string {
  const normalized = projectDir.replace(/\\/g, '/');
  const base = path.basename(normalized);
  if (!base) return 'unknown-project';

  const sanitized = base
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/^-+|-+$/g, '');

  return sanitized || 'unknown-project';
}

/**
 * Resolve the external state directory for a project.
 *
 * Returns `{globalDir}/projects/{sanitizedKey}/` where `globalDir` is the
 * platform-specific global config directory (e.g., `%APPDATA%/crew` on Windows,
 * `~/Library/Application Support/crew` on macOS, `$XDG_CONFIG_HOME/crew` or
 * `~/.config/crew` on Linux).
 *
 * Validates the project key to prevent path traversal. Throws if the key
 * is empty or contains `..` sequences.
 *
 * @param projectKey - The project key (from deriveProjectKey or user-supplied).
 * @param create     - Whether to create the directory if it doesn't exist (default: true).
 * @returns Absolute path to the project's external state directory.
 * @throws If projectKey is empty or contains path traversal sequences.
 */
export function resolveExternalStateDir(projectKey: string, create: boolean = true): string {
  if (!projectKey || projectKey.includes('..')) {
    throw new Error('Invalid project key');
  }

  // Sanitize: replace path separators and unsafe chars with dashes
  const sanitized = projectKey
    .replace(/[/\\]/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!sanitized) {
    throw new Error('Invalid project key');
  }

  const globalDir = resolveGlobalCrewPath();
  const projectsDir = path.join(globalDir, 'projects', sanitized);

  if (create && !storage.existsSync(projectsDir)) {
    storage.mkdirSync(projectsDir, { recursive: true });
  }

  return projectsDir;
}

// ============================================================================
// CREW_HOME — roaming crew root (Issue #1038)
// ============================================================================

/**
 * Resolve the crew home directory — a roaming crew root for personal agents
 * and presets that follows the user across machines.
 *
 * Resolution order:
 * 1. `CREW_HOME` env var (explicit override, e.g. a synced folder)
 * 2. `~/.crew/` (conventional default — user's home dir)
 *
 * Unlike `resolveGlobalCrewPath()` (which returns platform-specific app config),
 * crew home is a **crew root** — it can contain `agents/`, `presets/`, etc.
 *
 * @param create - Whether to create the directory if missing (default: false).
 * @returns Absolute path to the crew home directory, or null if it doesn't
 *          exist and `create` is false.
 */
export function resolveCrewHome(create: boolean = false): string | null {
  const envHome = process.env['CREW_HOME'];
  const homeDir = envHome
    ? path.resolve(envHome)
    : path.join(os.homedir(), '.crew');

  if (storage.existsSync(homeDir)) {
    if (!storage.isDirectorySync(homeDir)) {
      throw new Error(`CREW_HOME path exists but is not a directory: ${homeDir}`);
    }
    return homeDir;
  }

  if (create) {
    storage.mkdirSync(homeDir, { recursive: true });
    return homeDir;
  }

  return null;
}

/**
 * Ensure the crew home directory exists with standard structure.
 * Creates `agents/` and `presets/` subdirectories.
 *
 * Idempotent — safe to call multiple times.
 *
 * @returns Absolute path to the crew home directory.
 */
export function ensureCrewHome(): string {
  const homeDir = resolveCrewHome(true)!;

  const agentsDir = path.join(homeDir, 'agents');
  if (!storage.existsSync(agentsDir)) {
    storage.mkdirSync(agentsDir, { recursive: true });
  }

  const presetsDir = path.join(homeDir, 'presets');
  if (!storage.existsSync(presetsDir)) {
    storage.mkdirSync(presetsDir, { recursive: true });
  }

  return homeDir;
}

/**
 * Resolve the presets directory within crew home.
 *
 * @returns Absolute path to `<crew-home>/presets/`, or null if crew home
 *          doesn't exist.
 */
export function resolvePresetsDir(): string | null {
  const homeDir = resolveCrewHome();
  if (!homeDir) return null;

  const presetsDir = path.join(homeDir, 'presets');
  if (!storage.existsSync(presetsDir) || !storage.isDirectorySync(presetsDir)) return null;

  return presetsDir;
}

// ============================================================================
// State backend resolution (Issue #1003)
// ============================================================================

/**
 * Resolved state context for a crew session.
 *
 * Combines the resolved paths with the active state backend. Commands
 * and SDK functions that need state I/O use this context instead of
 * directly instantiating an FSStorageProvider.
 *
 * **Boundary:** Only mutable crew state flows through the backend.
 * Bootstrap artifacts (config.json, team.md structure checks) stay on
 * the local filesystem because they are needed before a backend can be
 * resolved.
 */
export interface CrewStateContext {
  /** Dual-root resolved paths (projectDir, teamDir, etc.) */
  paths: ResolvedCrewPaths;
  /** The active state backend (local, git-notes, or orphan) */
  backend: StateBackend;
  /** The repo root directory (for git-native backends) */
  repoRoot: string;
  /** StorageProvider backed by the active state backend — pass to SDK modules */
  storage: StorageProvider;
}

/**
 * Resolve the full crew state context: paths + state backend.
 *
 * Call once at command entry and thread the context through to SDK functions.
 * This ensures the configured state backend (local, git-notes, orphan)
 * applies to all crew operations — not just the watch command.
 *
 * @param startDir - Directory to start searching from. Defaults to cwd.
 * @param cliOverride - CLI flag override for state backend type.
 * @returns Resolved context, or null if no crew directory is found.
 */
export function resolveCrewState(startDir?: string, cliOverride?: StateBackendType): CrewStateContext | null {
  const paths = resolveCrewPaths(startDir);
  if (!paths) return null;

  // Resolve actual repo root via git — handles linked worktrees correctly
  const effectiveStart = startDir ?? process.cwd();
  let repoRoot: string;
  try {
    repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: effectiveStart, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    // Fallback: derive from .crew/ parent if git is unavailable
    repoRoot = path.resolve(paths.projectDir, '..');
  }

  // Resolve the backend from config + CLI override
  const backend = resolveStateBackend(paths.projectDir, repoRoot, cliOverride);

  // For local backend, use FSStorageProvider directly (more capable).
  // For git-notes/orphan, bridge via StateBackendStorageAdapter.
  const stateStorage: StorageProvider = backend.name === 'local'
    ? new FSStorageProvider()
    : new StateBackendStorageAdapter(backend, paths.projectDir);

  return { paths, backend, repoRoot, storage: stateStorage };
}
