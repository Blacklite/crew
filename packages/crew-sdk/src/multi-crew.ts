/**
 * Multi-crew resolution, configuration, and migration.
 *
 * Supports multiple personal crews via a global config directory:
 *   - Windows: %APPDATA%/crew/
 *   - macOS:   ~/Library/Application Support/crew/
 *   - Linux:   $XDG_CONFIG_HOME/crew/ (default ~/.config/crew/)
 *
 * Each crew is registered in crews.json and has its own directory
 * under crews/{name}/ in the global config root.
 *
 * Resolution chain for resolveCrewPath():
 *   explicit name → CREW_NAME env var → active in crews.json → "default" → legacy fallback
 *
 * @module multi-crew
 */

import path from 'node:path';
import { FSStorageProvider } from './storage/fs-storage-provider.js';
import { resolveGlobalCrewPath } from './resolution.js';

const storage = new FSStorageProvider();

// ============================================================================
// Types
// ============================================================================

/** A single crew entry in crews.json. */
export interface CrewEntry {
  /** Human-readable crew name (kebab-case recommended). */
  name: string;
  /** Absolute path to the crew's .crew/ state directory. */
  path: string;
  /** ISO-8601 timestamp when this crew was created. */
  created_at: string;
}

/** Schema for the global crews.json config file. */
export interface MultiCrewConfig {
  /** All registered crews. */
  crews: CrewEntry[];
  /** Name of the currently active crew. */
  active: string;
}

/** Information returned by listCrews(). */
export interface CrewInfo {
  name: string;
  path: string;
  active: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const CREWS_JSON = 'crews.json';
const CREWS_DIR = 'crews';
const DEFAULT_CREW = 'default';
const LEGACY_DIR = '.crew';

// ============================================================================
// Internal helpers
// ============================================================================

/** Path to crews.json inside the global config root. */
function crewsJsonPath(): string {
  return path.join(resolveGlobalCrewPath(), CREWS_JSON);
}

/** Read and parse crews.json, returning null if missing or malformed. */
function loadCrewsConfig(): MultiCrewConfig | null {
  const configPath = crewsJsonPath();
  if (!storage.existsSync(configPath)) {
    return null;
  }
  try {
    const raw = storage.readSync(configPath) ?? '';
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'crews' in parsed &&
      Array.isArray((parsed as Record<string, unknown>).crews) &&
      'active' in parsed &&
      typeof (parsed as Record<string, unknown>).active === 'string'
    ) {
      return parsed as MultiCrewConfig;
    }
    return null;
  } catch {
    return null;
  }
}

/** Write crews.json atomically. */
function saveCrewsConfig(config: MultiCrewConfig): void {
  const configPath = crewsJsonPath();
  storage.writeSync(configPath, JSON.stringify(config, null, 2) + '\n');
}

/** Validate a crew name: non-empty, no slashes, no dots-only. */
function validateName(name: string): void {
  if (!name || /[/\\]/.test(name) || /^\.+$/.test(name)) {
    throw new Error(`Invalid crew name: "${name}". Names must be non-empty and cannot contain slashes.`);
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Returns the platform-appropriate global config directory for crews.
 * Delegates to resolveGlobalCrewPath() which handles Windows/macOS/Linux.
 */
export function getCrewRoot(): string {
  return resolveGlobalCrewPath();
}

/**
 * Resolve the filesystem path for a named crew's state directory.
 *
 * Resolution chain:
 *  1. Explicit `name` parameter
 *  2. CREW_NAME environment variable
 *  3. `active` field in crews.json
 *  4. "default"
 *  5. Legacy ~/.crew fallback (if no crews.json exists)
 *
 * Triggers auto-migration on first call if a legacy layout is detected.
 */
export function resolveCrewPath(name?: string): string {
  // Auto-migrate legacy layout if needed
  migrateIfNeeded();

  // Read crews.json once (previously this was loaded 2–3 times per call:
  // once via the .active fallback in the resolution chain, again to look
  // up the entry by name, and a third time via internals).
  const config = loadCrewsConfig();

  const resolved =
    name ??
    process.env['CREW_NAME'] ??
    config?.active ??
    DEFAULT_CREW;

  // Look up registered path
  if (config) {
    const entry = config.crews.find((s) => s.name === resolved);
    if (entry) {
      return entry.path;
    }
  }

  // Fallback: derive path inside global config dir
  const root = getCrewRoot();
  return path.join(root, CREWS_DIR, resolved);
}

/**
 * List all registered crews with their active status.
 */
export function listCrews(): CrewInfo[] {
  const config = loadCrewsConfig();
  if (!config) {
    return [];
  }
  return config.crews.map((s) => ({
    name: s.name,
    path: s.path,
    active: s.name === config.active,
  }));
}

/**
 * Create a new crew directory and register it in crews.json.
 * Returns the absolute path to the new crew's state directory.
 *
 * @throws If a crew with the given name already exists.
 */
export function createCrew(name: string): string {
  validateName(name);

  // Ensure crews.json exists (migrate or bootstrap)
  migrateIfNeeded();
  let config = loadCrewsConfig();
  if (!config) {
    config = { crews: [], active: DEFAULT_CREW };
  }

  if (config.crews.some((s) => s.name === name)) {
    throw new Error(`Crew "${name}" already exists.`);
  }

  const crewDir = path.join(getCrewRoot(), CREWS_DIR, name);
  storage.mkdirSync(crewDir, { recursive: true });

  config.crews.push({
    name,
    path: crewDir,
    created_at: new Date().toISOString(),
  });
  saveCrewsConfig(config);

  return crewDir;
}

/**
 * Delete a crew by name. Removes its directory and unregisters it.
 *
 * @throws If the crew is the currently active one, or if it doesn't exist.
 */
export function deleteCrew(name: string): void {
  validateName(name);

  const config = loadCrewsConfig();
  if (!config) {
    throw new Error(`Crew "${name}" not found.`);
  }

  if (config.active === name) {
    throw new Error(`Cannot delete the active crew "${name}". Switch to another crew first.`);
  }

  const idx = config.crews.findIndex((s) => s.name === name);
  if (idx === -1) {
    throw new Error(`Crew "${name}" not found.`);
  }

  const entry = config.crews[idx];
  if (entry && storage.existsSync(entry.path)) {
    storage.deleteDirSync(entry.path);
  }

  config.crews.splice(idx, 1);
  saveCrewsConfig(config);
}

/**
 * Set the active crew in crews.json.
 *
 * @throws If the named crew is not registered.
 */
export function switchCrew(name: string): void {
  validateName(name);

  const config = loadCrewsConfig();
  if (!config) {
    throw new Error(`No crews configured. Cannot switch to "${name}".`);
  }

  if (!config.crews.some((s) => s.name === name)) {
    throw new Error(`Crew "${name}" not found. Register it first with createCrew().`);
  }

  config.active = name;
  saveCrewsConfig(config);
}

/**
 * Detect legacy ~/.crew layout and register it as "default" in crews.json.
 *
 * Migration is **non-destructive**: files are NOT moved. The existing path
 * is simply registered in crews.json so the new resolution chain finds it.
 *
 * @returns `true` if migration was performed, `false` if not needed.
 */
export function migrateIfNeeded(): boolean {
  const root = getCrewRoot();
  const configPath = path.join(root, CREWS_JSON);

  // If crews.json already exists, no migration needed
  if (storage.existsSync(configPath)) {
    return false;
  }

  // Check for legacy ~/.crew directory
  const home = process.env['HOME'] ?? process.env['USERPROFILE'] ?? '';
  const legacyDir = path.join(home, LEGACY_DIR);

  if (!home || !storage.existsSync(legacyDir) || !storage.isDirectorySync(legacyDir)) {
    // No legacy layout — bootstrap empty config
    const config: MultiCrewConfig = {
      crews: [],
      active: DEFAULT_CREW,
    };
    saveCrewsConfig(config);
    return false;
  }

  // Legacy layout detected — register it as "default" without moving files
  const config: MultiCrewConfig = {
    crews: [
      {
        name: DEFAULT_CREW,
        path: legacyDir,
        created_at: new Date().toISOString(),
      },
    ],
    active: DEFAULT_CREW,
  };
  saveCrewsConfig(config);
  return true;
}
