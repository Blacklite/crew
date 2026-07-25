/**
 * Cross-Crew Orchestration — discovery, delegation, and manifest support.
 *
 * Enables crews to discover each other via manifests, delegate work
 * across repository boundaries, and track cross-crew issue completion.
 *
 * @module runtime/cross-crew
 */

import { join } from 'path';
import { FSStorageProvider } from '../storage/fs-storage-provider.js';

const storage = new FSStorageProvider();

// ============================================================================
// Types
// ============================================================================

/** Contact information for reaching a crew. */
export interface CrewContact {
  /** GitHub repository in "owner/repo" format. */
  repo: string;
  /** Labels to apply when creating issues for this crew. */
  labels?: string[];
}

/** Work types a crew accepts from other crews. */
export type AcceptedWorkType = 'issues' | 'prs';

/**
 * Crew manifest — the public contract a crew exposes for discovery.
 * Stored at `.crew/manifest.json` in a crew's repository.
 */
export interface CrewManifest {
  /** Human-readable crew name (e.g., "platform-crew"). */
  name: string;
  /** Schema version for forward compatibility. */
  version?: string;
  /** One-line description of this crew's purpose. */
  description?: string;
  /** Capability tags (e.g., ["kubernetes", "helm", "monitoring"]). */
  capabilities: string[];
  /** How to reach this crew (repo + labels). */
  contact: CrewContact;
  /** Work types this crew accepts from other crews. */
  accepts: AcceptedWorkType[];
  /** Named skills this crew offers. */
  skills?: string[];
}

/** A discovered crew with its manifest and source location. */
export interface DiscoveredCrew {
  /** Manifest data. */
  manifest: CrewManifest;
  /** How this crew was discovered. */
  source: 'upstream' | 'registry' | 'local';
  /** Upstream name or registry path (for provenance). */
  sourceRef: string;
}

/** Options for creating a cross-crew issue. */
export interface CrossCrewIssueOptions {
  /** Target repo in "owner/repo" format. */
  targetRepo: string;
  /** Issue title (will be prefixed with [cross-crew]). */
  title: string;
  /** Issue body with context and acceptance criteria. */
  body: string;
  /** Labels to apply (crew labels are added automatically). */
  labels?: string[];
}

/** Result of creating a cross-crew issue. */
export interface CrossCrewIssueResult {
  /** Whether the issue was successfully created. */
  success: boolean;
  /** Issue URL if created, or error message if not. */
  url?: string;
  /** Error message if creation failed. */
  error?: string;
}

/** Status of a tracked cross-crew issue. */
export interface CrossCrewWorkStatus {
  /** Issue URL being tracked. */
  url: string;
  /** Current state. */
  state: 'open' | 'closed' | 'unknown';
  /** Issue title (from last poll). */
  title?: string;
  /** Error message if status check failed. */
  error?: string;
}

// ============================================================================
// Manifest Operations
// ============================================================================

/** Validate a manifest object has all required fields. */
export function validateManifest(data: unknown): data is CrewManifest {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  if (typeof obj['name'] !== 'string' || obj['name'].length === 0) return false;
  if (!Array.isArray(obj['capabilities'])) return false;
  if (!Array.isArray(obj['accepts'])) return false;
  if (typeof obj['contact'] !== 'object' || obj['contact'] === null) return false;
  const contact = obj['contact'] as Record<string, unknown>;
  if (typeof contact['repo'] !== 'string' || contact['repo'].length === 0) return false;
  // Validate accepts values
  const validAccepts = new Set(['issues', 'prs']);
  for (const a of obj['accepts'] as unknown[]) {
    if (typeof a !== 'string' || !validAccepts.has(a)) return false;
  }
  return true;
}

/**
 * Read and parse a crew manifest from a directory path.
 *
 * Looks for `.crew/manifest.json` relative to the given root.
 *
 * **Dual-path acceptance:** If `repoPath` already ends in `.crew` (or
 * `.crew/` / `.crew\`), the trailing segment is stripped before the
 * lookup so both the repo root AND the `.crew` directory work as input.
 * This matches how users naturally describe a crew in registry/upstream
 * configuration ("point me at their `.crew/` dir" vs "point me at their
 * repo root") without forcing one form.
 */
export function readManifest(repoPath: string): CrewManifest | null {
  const normalized = repoPath.replace(/[/\\]$/, '');
  const root = normalized.endsWith('.crew') || normalized.endsWith('/.crew') || normalized.endsWith('\\.crew')
    ? normalized.slice(0, normalized.length - '.crew'.length).replace(/[/\\]$/, '')
    : normalized;
  const manifestPath = join(root, '.crew', 'manifest.json');
  if (!storage.existsSync(manifestPath)) return null;
  try {
    const raw = storage.readSync(manifestPath) ?? '';
    const parsed: unknown = JSON.parse(raw);
    if (!validateManifest(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ============================================================================
// Discovery
// ============================================================================

/**
 * Upstream entry — minimal shape we need from upstream.json.
 * Re-declared here to avoid circular dependency with upstream module.
 */
interface UpstreamEntry {
  name: string;
  type: string;
  source: string;
}

interface UpstreamJsonFile {
  upstreams: UpstreamEntry[];
}

/**
 * Discover crews from upstream sources.
 * Reads `.crew/upstream.json` and checks each upstream for a manifest.
 */
export function discoverFromUpstreams(crewDir: string): DiscoveredCrew[] {
  const upstreamPath = join(crewDir, 'upstream.json');
  if (!storage.existsSync(upstreamPath)) return [];

  let config: UpstreamJsonFile;
  try {
    config = JSON.parse(storage.readSync(upstreamPath) ?? '') as UpstreamJsonFile;
  } catch {
    return [];
  }

  if (!Array.isArray(config.upstreams)) return [];

  const discovered: DiscoveredCrew[] = [];
  for (const upstream of config.upstreams) {
    if (upstream.type === 'local' && upstream.source) {
      const manifest = readManifest(upstream.source);
      if (manifest) {
        discovered.push({
          manifest,
          source: 'upstream',
          sourceRef: upstream.name,
        });
      }
    } else if (upstream.type === 'git') {
      // For git upstreams, check the cached clone directory
      const cloneDir = join(crewDir, '_upstream_repos', upstream.name);
      const manifest = readManifest(cloneDir);
      if (manifest) {
        discovered.push({
          manifest,
          source: 'upstream',
          sourceRef: upstream.name,
        });
      }
    }
  }

  return discovered;
}

/**
 * Discover crews from a registry file.
 * A registry is a JSON file listing repo paths to check for manifests.
 */
export function discoverFromRegistry(registryPath: string): DiscoveredCrew[] {
  if (!storage.existsSync(registryPath)) return [];

  let entries: Array<{ name: string; path: string }>;
  try {
    const raw = storage.readSync(registryPath) ?? '';
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    entries = parsed as Array<{ name: string; path: string }>;
  } catch {
    return [];
  }

  const discovered: DiscoveredCrew[] = [];
  for (const entry of entries) {
    if (typeof entry.path === 'string') {
      const manifest = readManifest(entry.path);
      if (manifest) {
        discovered.push({
          manifest,
          source: 'registry',
          sourceRef: entry.name || entry.path,
        });
      }
    }
  }

  return discovered;
}

/**
 * Discover all crews from all available sources.
 * Checks upstreams first, then a registry file if present.
 */
export function discoverCrews(crewDir: string): DiscoveredCrew[] {
  const fromUpstreams = discoverFromUpstreams(crewDir);
  const registryPath = join(crewDir, 'crew-registry.json');
  const fromRegistry = discoverFromRegistry(registryPath);

  // Deduplicate by manifest name (upstreams take priority)
  const seen = new Set(fromUpstreams.map(d => d.manifest.name));
  const merged = [...fromUpstreams];
  for (const d of fromRegistry) {
    if (!seen.has(d.manifest.name)) {
      seen.add(d.manifest.name);
      merged.push(d);
    }
  }

  return merged;
}

// ============================================================================
// Registry CRUD — manage .crew/crew-registry.json
// ============================================================================

/** A single entry in `.crew/crew-registry.json`. */
export interface RegistryEntry {
  /** Identifier within this repo's registry. Unique. */
  name: string;
  /** Filesystem path to the peer crew (repo root OR its .crew dir). */
  path: string;
}

/**
 * Read `.crew/crew-registry.json` and return its entries.
 * Returns an empty array if the file does not exist or is malformed.
 */
export function readCrewRegistry(crewDir: string): RegistryEntry[] {
  const registryPath = join(crewDir, 'crew-registry.json');
  if (!storage.existsSync(registryPath)) return [];
  try {
    const raw = storage.readSync(registryPath) ?? '';
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e): e is RegistryEntry =>
        typeof e === 'object' && e !== null &&
        typeof (e as RegistryEntry).name === 'string' &&
        typeof (e as RegistryEntry).path === 'string',
      );
  } catch {
    return [];
  }
}

/**
 * Overwrite `.crew/crew-registry.json` with the given entries.
 * Creates the file (and `.crew/` directory) if missing.
 */
export function writeCrewRegistry(crewDir: string, entries: RegistryEntry[]): void {
  if (!storage.existsSync(crewDir)) {
    storage.mkdirSync(crewDir, { recursive: true });
  }
  const registryPath = join(crewDir, 'crew-registry.json');
  storage.writeSync(registryPath, JSON.stringify(entries, null, 2) + '\n');
}

/** Result of `addRegistryEntry`. */
export interface AddRegistryEntryResult {
  /** True if a new entry was written. */
  added: boolean;
  /** Reason if not added: 'duplicate-name' | 'invalid-manifest'. */
  reason?: 'duplicate-name' | 'invalid-manifest';
  /** The manifest validated against the path (when added). */
  manifest?: CrewManifest;
}

/**
 * Add a peer crew to `.crew/crew-registry.json`.
 *
 * Validates that the path resolves to a readable manifest before writing.
 * Refuses on duplicate name. Accepts both repo-root and `.crew`-suffixed
 * paths (see `readManifest`).
 */
export function addRegistryEntry(
  crewDir: string,
  name: string,
  path: string,
): AddRegistryEntryResult {
  const existing = readCrewRegistry(crewDir);
  if (existing.some(e => e.name === name)) {
    return { added: false, reason: 'duplicate-name' };
  }
  const manifest = readManifest(path);
  if (!manifest) {
    return { added: false, reason: 'invalid-manifest' };
  }
  const next = [...existing, { name, path }];
  writeCrewRegistry(crewDir, next);
  return { added: true, manifest };
}

/**
 * Remove an entry from `.crew/crew-registry.json` by name.
 * Returns true if an entry was removed, false if no matching name was found.
 */
export function removeRegistryEntry(crewDir: string, name: string): boolean {
  const existing = readCrewRegistry(crewDir);
  const next = existing.filter(e => e.name !== name);
  if (next.length === existing.length) return false;
  writeCrewRegistry(crewDir, next);
  return true;
}

// ============================================================================
// Delegation
// ============================================================================

/**
 * Build the CLI args for creating a cross-crew issue via `gh issue create`.
 * Returns the argument array (does not execute — callers run the command).
 */
export function buildDelegationArgs(options: CrossCrewIssueOptions): string[] {
  const title = options.title.startsWith('[cross-crew]')
    ? options.title
    : `[cross-crew] ${options.title}`;

  const args = [
    'issue', 'create',
    '--repo', options.targetRepo,
    '--title', title,
    '--body', options.body,
  ];

  const labels = [...(options.labels || [])];
  if (!labels.includes('crew:cross-crew')) {
    labels.push('crew:cross-crew');
  }
  for (const label of labels) {
    args.push('--label', label);
  }

  return args;
}

/**
 * Build the CLI args for checking a cross-crew issue status via `gh`.
 * Parses an issue URL into --repo and issue number.
 */
export function buildStatusCheckArgs(issueUrl: string): string[] | null {
  // Parse GitHub issue URL: https://github.com/owner/repo/issues/123
  const match = /github\.com\/([^/]+\/[^/]+)\/issues\/(\d+)/.exec(issueUrl);
  if (!match) return null;
  const repo = match[1]!;
  const number = match[2]!;
  return ['issue', 'view', '--repo', repo, number, '--json', 'state,title'];
}

/**
 * Parse the JSON output from `gh issue view --json state,title`.
 */
export function parseIssueStatus(jsonOutput: string, issueUrl: string): CrossCrewWorkStatus {
  try {
    const data = JSON.parse(jsonOutput) as { state: string; title: string };
    return {
      url: issueUrl,
      state: data.state === 'CLOSED' ? 'closed' : data.state === 'OPEN' ? 'open' : 'unknown',
      title: data.title,
    };
  } catch {
    return { url: issueUrl, state: 'unknown', error: 'Failed to parse issue status' };
  }
}

// ============================================================================
// Display Helpers
// ============================================================================

/** Format discovered crews for terminal display. */
export function formatDiscoveryTable(crews: DiscoveredCrew[]): string {
  if (crews.length === 0) {
    return 'No crews discovered. Add a peer with "crew registry add <name> <path>", or an upstream with "crew upstream add".';
  }

  const lines: string[] = ['\nDiscovered crews:\n'];
  for (const s of crews) {
    const caps = s.manifest.capabilities.slice(0, 5).join(', ');
    const capsSuffix = s.manifest.capabilities.length > 5 ? `, +${s.manifest.capabilities.length - 5} more` : '';
    const accepts = s.manifest.accepts.join(', ');
    lines.push(`  ${s.manifest.name}  →  ${s.manifest.contact.repo}  (${caps}${capsSuffix})`);
    lines.push(`    Accepts: ${accepts}  |  Source: ${s.source} (${s.sourceRef})`);
    if (s.manifest.description) {
      lines.push(`    ${s.manifest.description}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

/** Find a crew by name from a list of discovered crews. */
export function findCrewByName(crews: DiscoveredCrew[], name: string): DiscoveredCrew | undefined {
  return crews.find(s => s.manifest.name === name);
}
