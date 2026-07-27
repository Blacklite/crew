/**
 * crew upstream — CLI commands for managing upstream Crew sources.
 *
 * Commands:
 *   crew upstream add <source> [--name <name>] [--ref <branch>]
 *   crew upstream remove <name>
 *   crew upstream list
 *   crew upstream sync [name]
 *
 * @module cli/commands/upstream
 */

import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { FSStorageProvider } from '@blacklite/crew-sdk';

const storage = new FSStorageProvider();
import { success, warn, info } from '../core/output.js';
import { fatal } from '../core/errors.js';
import { detectCrewDir } from '../core/detect-crew-dir.js';

/** Validate a git ref (branch/tag) — reject shell metacharacters. */
function isValidGitRef(ref: string): boolean {
  return /^[a-zA-Z0-9._\-/]+$/.test(ref);
}

/** Validate an upstream name — alphanumeric, hyphens, underscores, dots. */
function isValidUpstreamName(name: string): boolean {
  return /^[a-zA-Z0-9._-]+$/.test(name);
}
import type { UpstreamConfig, UpstreamSource, UpstreamSyncState } from '@blacklite/crew-sdk';

function readUpstreams(upstreamFile: string): UpstreamConfig {
  if (!storage.existsSync(upstreamFile)) return { upstreams: [] };
  try {
    const raw = storage.readSync(upstreamFile);
    if (!raw) return { upstreams: [] };
    return JSON.parse(raw) as UpstreamConfig;
  } catch {
    return { upstreams: [] };
  }
}

function writeUpstreams(upstreamFile: string, data: UpstreamConfig): void {
  storage.mkdirSync(path.dirname(upstreamFile), { recursive: true });
  storage.writeSync(upstreamFile, JSON.stringify(data, null, 2) + '\n');
}

// ---------------------------------------------------------------------------
// Sync state — machine-local, gitignored.
//
// `upstream.json` is tracked, so writing a timestamp into it on every sync left
// the working tree permanently dirty. `crew upstream sync` is invoked from the
// post-checkout and post-merge git hooks, so "every sync" means every pull and
// every branch switch. Timestamps therefore live beside the cached clones in
// `.crew/_upstream_repos/`, which is already gitignored.
//
// All helpers here are best-effort: sync state is display metadata, and losing
// it must never fail a sync (the hooks run silently and must not block a merge).
// ---------------------------------------------------------------------------

/** Path to the gitignored sync-state file for a crew directory. */
export function syncStateFile(crewDir: string): string {
  return path.join(crewDir, '_upstream_repos', '.sync-state.json');
}

/** Read machine-local sync state. Returns empty state if absent or malformed. */
export function readSyncState(crewDir: string): UpstreamSyncState {
  const file = syncStateFile(crewDir);
  if (!storage.existsSync(file)) return { version: 1, last_synced: {} };
  try {
    const raw = storage.readSync(file);
    if (!raw) return { version: 1, last_synced: {} };
    const parsed = JSON.parse(raw) as Partial<UpstreamSyncState>;
    return { version: 1, last_synced: parsed.last_synced ?? {} };
  } catch {
    return { version: 1, last_synced: {} };
  }
}

/**
 * Persist sync state, creating (and gitignoring) `_upstream_repos/` if needed.
 * Silently gives up on failure — a read-only checkout must not break `sync`.
 */
export function writeSyncState(crewDir: string, repoDir: string, state: UpstreamSyncState): void {
  try {
    storage.mkdirSync(path.join(crewDir, '_upstream_repos'), { recursive: true });
    ensureGitignoreEntry(repoDir, '.crew/_upstream_repos/');
    storage.writeSync(syncStateFile(crewDir), JSON.stringify(state, null, 2) + '\n');
  } catch {
    /* best-effort: sync state is display metadata, never load-bearing */
  }
}

/** Record a successful sync for one upstream. */
export function setLastSynced(crewDir: string, repoDir: string, name: string, iso: string): void {
  const state = readSyncState(crewDir);
  state.last_synced[name] = iso;
  writeSyncState(crewDir, repoDir, state);
}

/** Drop sync state for one upstream (used by `crew upstream remove`). */
export function clearLastSynced(crewDir: string, repoDir: string, name: string): void {
  const state = readSyncState(crewDir);
  if (!(name in state.last_synced)) return;
  delete state.last_synced[name];
  writeSyncState(crewDir, repoDir, state);
}

/**
 * Move any legacy `last_synced` values out of `upstream.json` and into the
 * gitignored sync-state file.
 *
 * Mutates `data` in place. Returns true when `upstream.json` needs rewriting —
 * that rewrite is a one-time cleanup diff, after which the file stops churning.
 */
export function migrateLegacySyncState(crewDir: string, repoDir: string, data: UpstreamConfig): boolean {
  const legacy = data.upstreams.filter(u => 'last_synced' in u);
  if (legacy.length === 0) return false;

  const state = readSyncState(crewDir);
  for (const entry of legacy) {
    // Don't let a stale tracked value clobber a newer local one.
    if (entry.last_synced && !state.last_synced[entry.name]) {
      state.last_synced[entry.name] = entry.last_synced;
    }
    delete entry.last_synced;
  }
  writeSyncState(crewDir, repoDir, state);
  return true;
}

function detectSourceType(source: string): 'local' | 'git' | 'export' {
  if (source.endsWith('.json') && storage.existsSync(path.resolve(source))) return 'export';
  if (source.startsWith('http://') || source.startsWith('https://') || source.startsWith('file://') || source.endsWith('.git')) return 'git';
  if (storage.existsSync(path.resolve(source))) return 'local';
  if (source.includes('/') && !source.includes('\\')) return 'git';
  throw new Error(`Cannot determine source type for "${source}". Provide a git URL, local path, or export JSON file.`);
}

function deriveName(source: string, type: string): string {
  if (type === 'export') return path.basename(source, '.json').replace('crew-export', 'upstream');
  if (type === 'git') {
    const cleaned = source.replace(/\.git$/, '');
    const parts = cleaned.split('/');
    return parts[parts.length - 1] || 'upstream';
  }
  return path.basename(path.resolve(source)) || 'upstream';
}

function ensureGitignoreEntry(repoDir: string, entry: string): void {
  const gitignorePath = path.join(repoDir, '.gitignore');
  let content = '';
  if (storage.existsSync(gitignorePath)) content = storage.readSync(gitignorePath) ?? '';
  if (!content.includes(entry)) {
    const nl = content && !content.endsWith('\n') ? '\n' : '';
    storage.writeSync(gitignorePath, content + nl + entry + '\n');
  }
}

export async function upstreamCommand(args: string[]): Promise<void> {
  const action = args[0];
  if (!action || !['add', 'remove', 'list', 'sync'].includes(action)) {
    fatal('Usage: crew upstream add|remove|list|sync');
    return;
  }

  const crewDirInfo = detectCrewDir(process.cwd());
  if (!storage.existsSync(crewDirInfo.path)) {
    fatal('No crew found — run init first.');
    return;
  }

  const crewDir = crewDirInfo.path;
  const repoDir = path.dirname(crewDir);
  const upstreamFile = path.join(crewDir, 'upstream.json');

  if (action === 'add') {
    const source = args[1];
    if (!source) {
      fatal('Usage: crew upstream add <source> [--name <name>] [--ref <branch>]');
      return;
    }

    const type = detectSourceType(source);
    const nameIdx = args.indexOf('--name');
    const name = (nameIdx !== -1 && args[nameIdx + 1]) ? args[nameIdx + 1]! : deriveName(source, type);
    if (!isValidUpstreamName(name)) {
      fatal(`Invalid upstream name "${name}". Use only alphanumeric characters, hyphens, underscores, and dots.`);
    }

    const data = readUpstreams(upstreamFile);
    migrateLegacySyncState(crewDir, repoDir, data);
    if (data.upstreams.some(u => u.name === name)) {
      fatal(`Upstream "${name}" already exists. Use a different --name or remove it first.`);
      return;
    }

    const entry: UpstreamSource = {
      name,
      type,
      source: type === 'local' || type === 'export' ? path.resolve(source) : source,
      added_at: new Date().toISOString(),
    };
    if (type === 'git') {
      const refIdx = args.indexOf('--ref');
      const ref = (refIdx !== -1 && args[refIdx + 1]) ? args[refIdx + 1]! : 'main';
      if (!isValidGitRef(ref)) {
        fatal(`Invalid git ref "${ref}". Use only alphanumeric characters, hyphens, underscores, dots, and slashes.`);
      }
      entry.ref = ref;
    }

    data.upstreams.push(entry);
    writeUpstreams(upstreamFile, data);

    // Auto-clone for git sources
    if (type === 'git') {
      const reposDir = path.join(crewDir, '_upstream_repos');
      const cloneDir = path.join(reposDir, name);
      storage.mkdirSync(reposDir, { recursive: true });
      ensureGitignoreEntry(repoDir, '.crew/_upstream_repos/');

      try {
        const ref = entry.ref || 'main';
        execFileSync('git', ['clone', '--depth', '1', '--branch', ref, '--single-branch', source, cloneDir], { stdio: 'pipe', timeout: 60000 });
        setLastSynced(crewDir, repoDir, name, new Date().toISOString());
        success(`Cloned upstream repo to .crew/_upstream_repos/${name}`);
      } catch (err) {
        warn(`Clone failed — run "crew upstream sync" to retry: ${(err as Error).message}`);
      }
    }

    success(`Added upstream: ${name} (${type}: ${entry.source})`);
    if (type === 'local') {
      info('The coordinator reads from this path live at session start — no sync needed.');
    }
  }

  if (action === 'remove') {
    const name = args[1];
    if (!name) { fatal('Usage: crew upstream remove <name>'); return; }

    const data = readUpstreams(upstreamFile);
    migrateLegacySyncState(crewDir, repoDir, data);
    const before = data.upstreams.length;
    data.upstreams = data.upstreams.filter(u => u.name !== name);
    if (data.upstreams.length === before) {
      fatal(`Upstream "${name}" not found.`);
      return;
    }
    writeUpstreams(upstreamFile, data);

    // Clean up cached clone and its machine-local sync timestamp
    const repoDir2 = path.join(crewDir, '_upstream_repos', name);
    if (storage.existsSync(repoDir2)) {
      storage.deleteDirSync(repoDir2);
      success(`Removed cached clone for ${name}`);
    }
    clearLastSynced(crewDir, repoDir, name);

    success(`Removed upstream: ${name}`);
  }

  if (action === 'list') {
    const data = readUpstreams(upstreamFile);
    if (migrateLegacySyncState(crewDir, repoDir, data)) writeUpstreams(upstreamFile, data);
    if (data.upstreams.length === 0) {
      info('No upstreams configured');
      info('\nAdd one with: crew upstream add <source>');
      return;
    }
    const state = readSyncState(crewDir);
    info('\nConfigured upstreams:\n');
    for (const u of data.upstreams) {
      // Fall back to the legacy in-config value until migration has run.
      const lastSynced = state.last_synced[u.name] ?? u.last_synced ?? null;
      const synced = lastSynced ? `synced ${lastSynced.split('T')[0]}` : 'never synced';
      const ref = u.ref ? ` (ref: ${u.ref})` : '';
      info(`  ${u.name}  →  ${u.type}: ${u.source}${ref}  (${synced})`);
    }
    info('');
  }

  if (action === 'sync') {
    const data = readUpstreams(upstreamFile);
    if (data.upstreams.length === 0) {
      fatal('No upstreams configured. Run "crew upstream add <source>" first.');
      return;
    }

    const specificName = args[1];
    const toSync = specificName ? data.upstreams.filter(u => u.name === specificName) : data.upstreams;
    if (specificName && toSync.length === 0) {
      fatal(`Upstream "${specificName}" not found.`);
      return;
    }

    info(`\nSyncing ${toSync.length} upstream(s)...\n`);
    let synced = 0;
    const state = readSyncState(crewDir);

    for (const upstream of toSync) {
      if (upstream.type === 'local' || upstream.type === 'export') {
        // Validate source exists
        const resolvedPath = path.resolve(upstream.source);
        if (!storage.existsSync(resolvedPath)) {
          warn(`${upstream.name}: source not found: ${upstream.source}`);
          continue;
        }
        state.last_synced[upstream.name] = new Date().toISOString();
        synced++;
        success(`${upstream.name} (${upstream.type} — read live): validated`);
      } else if (upstream.type === 'git') {
        const reposDir = path.join(crewDir, '_upstream_repos');
        const cloneDir = path.join(reposDir, upstream.name);
        storage.mkdirSync(reposDir, { recursive: true });
        ensureGitignoreEntry(repoDir, '.crew/_upstream_repos/');

        try {
          if (storage.existsSync(path.join(cloneDir, '.git'))) {
            execFileSync('git', ['-C', cloneDir, 'pull', '--ff-only'], { stdio: 'pipe', timeout: 60000 });
          } else {
            if (storage.existsSync(cloneDir)) storage.deleteDirSync(cloneDir);
            const ref = upstream.ref || 'main';
            execFileSync('git', ['clone', '--depth', '1', '--branch', ref, '--single-branch', upstream.source, cloneDir], { stdio: 'pipe', timeout: 60000 });
          }
          state.last_synced[upstream.name] = new Date().toISOString();
          synced++;
          success(`${upstream.name} (git — synced)`);
        } catch (err) {
          warn(`${upstream.name}: git sync failed: ${(err as Error).message}`);
        }
      }
    }

    writeSyncState(crewDir, repoDir, state);
    // `upstream.json` is only rewritten when legacy timestamps still need
    // evicting — otherwise sync leaves the tracked config untouched.
    if (migrateLegacySyncState(crewDir, repoDir, data)) writeUpstreams(upstreamFile, data);
    info(`\n${synced}/${toSync.length} upstream(s) synced.\n`);
  }
}
