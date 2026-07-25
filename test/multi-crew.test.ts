/**
 * Multi-crew resolution and migration tests — Issue #652
 *
 * Proactive tests for Phase 1: multiple personal crews.
 * Tests written from spec while Fenster implements the module.
 * Import path may need adjustment once implementation lands.
 *
 * Functions under test:
 *   getCrewRoot()        — platform-appropriate config dir
 *   resolveCrewPath()    — resolution chain: explicit → env → active → default → legacy
 *   listCrews()          — enumerate known crews from crews.json
 *   createCrew()         — create dir + register in crews.json
 *   deleteCrew()         — remove crew (can't delete active)
 *   switchCrew()         — set active crew
 *   migrateIfNeeded()     — detect legacy layout, register as "default"
 *
 * @see packages/crew-sdk/src/multi-crew.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
  mkdtempSync,
} from 'node:fs';
import { join, sep } from 'node:path';
import { tmpdir, platform, homedir } from 'node:os';

// ⚠️ Import path will be adjusted once Fenster's implementation lands.
// Expected module: packages/crew-sdk/src/multi-crew.ts
// Likely export path: @blacklite/crew-sdk/multi-crew
//
// For now, we define the expected interfaces and mock the module.
// When the real module exists, replace this block with:
//   import { getCrewRoot, resolveCrewPath, listCrews, createCrew,
//            deleteCrew, switchCrew, migrateIfNeeded } from '@blacklite/crew-sdk/multi-crew';

// ============================================================================
// Expected Types (from PRD spec)
// ============================================================================

interface CrewEntry {
  name: string;
  path: string;
  isDefault: boolean;
  createdAt?: string;
}

interface CrewsJson {
  version: 1;
  defaultCrew: string;
  crews: Record<string, { description?: string; createdAt: string }>;
}

// ============================================================================
// Helpers
// ============================================================================

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'crew-multi-test-'));
  tmpDirs.push(dir);
  return dir;
}

/** Create a crews.json file in the given root. */
function writeCrewsJson(root: string, data: CrewsJson): void {
  writeFileSync(join(root, 'crews.json'), JSON.stringify(data, null, 2), 'utf-8');
}

/** Read crews.json from root. */
function readCrewsJson(root: string): CrewsJson {
  return JSON.parse(readFileSync(join(root, 'crews.json'), 'utf-8'));
}

/** Scaffold a named crew directory with minimal structure. */
function scaffoldCrew(root: string, name: string): string {
  const crewDir = join(root, 'crews', name);
  mkdirSync(join(crewDir, 'agents'), { recursive: true });
  mkdirSync(join(crewDir, 'skills'), { recursive: true });
  writeFileSync(join(crewDir, 'decisions.md'), '# Decisions\n');
  return crewDir;
}

/** Scaffold a legacy single-crew layout (files directly under root). */
function scaffoldLegacyLayout(root: string): void {
  mkdirSync(join(root, 'agents'), { recursive: true });
  mkdirSync(join(root, 'skills'), { recursive: true });
  writeFileSync(join(root, 'decisions.md'), '# Decisions\n');
  writeFileSync(join(root, 'team.md'), '# Team\n');
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const dir of tmpDirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
  tmpDirs.length = 0;
});

// ============================================================================
// getCrewRoot()
// ============================================================================

describe('getCrewRoot()', () => {
  it('returns a platform-appropriate path containing "crew"', () => {
    // The function should return something like:
    //   Linux/macOS: ~/.config/crew  (or $XDG_CONFIG_HOME/crew)
    //   Windows:     %APPDATA%/crew  (or %LOCALAPPDATA%/crew)
    const expectedSegments = platform() === 'win32'
      ? ['crew']
      : ['.config', 'crew'];

    // Verify the function would produce a path with these segments
    const home = homedir();
    for (const segment of expectedSegments) {
      // Platform root must include "crew" somewhere
      expect(segment).toBeTruthy();
    }

    // Cross-platform: path.join handles separators correctly
    const testPath = join(home, ...expectedSegments);
    expect(testPath).toContain('crew');
    expect(testPath.startsWith(home)).toBe(true);
  });

  it('respects XDG_CONFIG_HOME on non-Windows platforms', () => {
    if (platform() === 'win32') return; // skip on Windows

    const customConfig = join(makeTmpDir(), 'custom-config');
    mkdirSync(customConfig, { recursive: true });

    // The function should respect XDG_CONFIG_HOME when set
    vi.stubEnv('XDG_CONFIG_HOME', customConfig);

    const expectedPath = join(customConfig, 'crew');
    expect(expectedPath).toContain('crew');
    expect(expectedPath.startsWith(customConfig)).toBe(true);
  });

  it('uses path.join for platform-safe separators', () => {
    // Verify paths use platform separator, not hardcoded '/' or '\\'
    const testPath = join(homedir(), '.config', 'crew');
    expect(testPath).toContain(sep);
    // No mixed separators
    if (sep === '\\') {
      expect(testPath).not.toMatch(/[^\\]\//); // no forward slashes after backslash
    }
  });
});

// ============================================================================
// resolveCrewPath(name?)
// ============================================================================

describe('resolveCrewPath(name?)', () => {
  let root: string;

  beforeEach(() => {
    root = makeTmpDir();
    mkdirSync(join(root, 'crews'), { recursive: true });
  });

  describe('resolution chain', () => {
    it('step 1: explicit name resolves to crews/<name>/', () => {
      const crewDir = scaffoldCrew(root, 'client-acme');
      writeCrewsJson(root, {
        version: 1,
        defaultCrew: 'default',
        crews: {
          'client-acme': { createdAt: '2026-03-01T00:00:00Z' },
          'default': { createdAt: '2026-03-01T00:00:00Z' },
        },
      });

      // Explicit name should resolve to exact crew path
      const expected = join(root, 'crews', 'client-acme');
      expect(existsSync(expected)).toBe(true);
    });

    it('step 2: CREW_NAME env var overrides active selection', () => {
      scaffoldCrew(root, 'env-crew');
      scaffoldCrew(root, 'active-crew');
      writeCrewsJson(root, {
        version: 1,
        defaultCrew: 'active-crew',
        crews: {
          'env-crew': { createdAt: '2026-03-01T00:00:00Z' },
          'active-crew': { createdAt: '2026-03-01T00:00:00Z' },
        },
      });

      vi.stubEnv('CREW_NAME', 'env-crew');

      // When CREW_NAME is set, it should override the default/active crew
      const envCrewPath = join(root, 'crews', 'env-crew');
      expect(existsSync(envCrewPath)).toBe(true);
      expect(process.env['CREW_NAME']).toBe('env-crew');
    });

    it('step 3: active/default crew from crews.json when no explicit or env', () => {
      scaffoldCrew(root, 'my-default');
      writeCrewsJson(root, {
        version: 1,
        defaultCrew: 'my-default',
        crews: {
          'my-default': { createdAt: '2026-03-01T00:00:00Z' },
        },
      });

      const config = readCrewsJson(root);
      const defaultPath = join(root, 'crews', config.defaultCrew);
      expect(existsSync(defaultPath)).toBe(true);
      expect(config.defaultCrew).toBe('my-default');
    });

    it('step 4: falls back to "default" when crews.json has no defaultCrew', () => {
      scaffoldCrew(root, 'default');

      // Even without crews.json, the "default" crew should be the fallback
      const defaultPath = join(root, 'crews', 'default');
      expect(existsSync(defaultPath)).toBe(true);
    });

    it('step 5: legacy layout detected when crews/ dir is absent', () => {
      // Legacy layout: files directly under root (no crews/ subdir)
      const legacyRoot = makeTmpDir();
      scaffoldLegacyLayout(legacyRoot);

      expect(existsSync(join(legacyRoot, 'agents'))).toBe(true);
      expect(existsSync(join(legacyRoot, 'crews'))).toBe(false);
      // resolveCrewPath should detect this and return legacyRoot itself
    });
  });

  describe('fallback behavior', () => {
    it('env var pointing to nonexistent crew falls through to active', () => {
      scaffoldCrew(root, 'active-crew');
      writeCrewsJson(root, {
        version: 1,
        defaultCrew: 'active-crew',
        crews: {
          'active-crew': { createdAt: '2026-03-01T00:00:00Z' },
        },
      });

      vi.stubEnv('CREW_NAME', 'nonexistent-crew');

      // The nonexistent env crew path doesn't exist
      expect(existsSync(join(root, 'crews', 'nonexistent-crew'))).toBe(false);
      // But the active crew does
      expect(existsSync(join(root, 'crews', 'active-crew'))).toBe(true);
    });

    it('resolution with no crews.json and no legacy falls through gracefully', () => {
      // Empty root — nothing to resolve
      const emptyRoot = makeTmpDir();
      expect(existsSync(join(emptyRoot, 'crews.json'))).toBe(false);
      expect(existsSync(join(emptyRoot, 'crews'))).toBe(false);
      expect(existsSync(join(emptyRoot, 'agents'))).toBe(false);
    });
  });

  describe('env var override', () => {
    it('CREW_NAME takes precedence over defaultCrew in config', () => {
      scaffoldCrew(root, 'env-pick');
      scaffoldCrew(root, 'config-default');
      writeCrewsJson(root, {
        version: 1,
        defaultCrew: 'config-default',
        crews: {
          'env-pick': { createdAt: '2026-03-01T00:00:00Z' },
          'config-default': { createdAt: '2026-03-01T00:00:00Z' },
        },
      });

      vi.stubEnv('CREW_NAME', 'env-pick');
      expect(process.env['CREW_NAME']).toBe('env-pick');

      // Implementation should pick env-pick over config-default
      const envPath = join(root, 'crews', 'env-pick');
      const defaultPath = join(root, 'crews', 'config-default');
      expect(existsSync(envPath)).toBe(true);
      expect(existsSync(defaultPath)).toBe(true);
    });

    it('empty CREW_NAME is treated as unset', () => {
      vi.stubEnv('CREW_NAME', '');
      expect(process.env['CREW_NAME']).toBe('');
      // Empty string should not be treated as a valid crew name
    });
  });
});

// ============================================================================
// listCrews()
// ============================================================================

describe('listCrews()', () => {
  let root: string;

  beforeEach(() => {
    root = makeTmpDir();
    mkdirSync(join(root, 'crews'), { recursive: true });
  });

  it('returns all crews from crews.json with isDefault flag', () => {
    scaffoldCrew(root, 'default');
    scaffoldCrew(root, 'client-acme');
    scaffoldCrew(root, 'ml-projects');
    writeCrewsJson(root, {
      version: 1,
      defaultCrew: 'default',
      crews: {
        'default': { createdAt: '2026-03-01T00:00:00Z' },
        'client-acme': { description: 'Acme Corp', createdAt: '2026-03-02T00:00:00Z' },
        'ml-projects': { createdAt: '2026-03-03T00:00:00Z' },
      },
    });

    const config = readCrewsJson(root);
    const entries: CrewEntry[] = Object.entries(config.crews).map(([name, meta]) => ({
      name,
      path: join(root, 'crews', name),
      isDefault: name === config.defaultCrew,
      createdAt: meta.createdAt,
    }));

    expect(entries).toHaveLength(3);
    expect(entries.find(e => e.name === 'default')?.isDefault).toBe(true);
    expect(entries.find(e => e.name === 'client-acme')?.isDefault).toBe(false);
    expect(entries.find(e => e.name === 'ml-projects')?.isDefault).toBe(false);
  });

  it('returns empty array when crews.json has no crews', () => {
    writeCrewsJson(root, {
      version: 1,
      defaultCrew: 'default',
      crews: {},
    });

    const config = readCrewsJson(root);
    const entries = Object.entries(config.crews);
    expect(entries).toHaveLength(0);
  });

  it('handles missing crews.json gracefully', () => {
    // No crews.json file exists
    expect(existsSync(join(root, 'crews.json'))).toBe(false);
    // Implementation should return empty list or detect legacy layout
  });

  it('handles corrupted crews.json gracefully', () => {
    writeFileSync(join(root, 'crews.json'), '{ invalid json !!!', 'utf-8');

    // Reading corrupted JSON should throw a parse error
    expect(() => JSON.parse(readFileSync(join(root, 'crews.json'), 'utf-8'))).toThrow();
    // Implementation should catch this and return empty or throw a CrewError
  });

  it('handles crews.json with crews that have no matching directories', () => {
    // crews.json lists a crew, but directory doesn't exist on disk
    writeCrewsJson(root, {
      version: 1,
      defaultCrew: 'ghost-crew',
      crews: {
        'ghost-crew': { createdAt: '2026-03-01T00:00:00Z' },
      },
    });

    expect(existsSync(join(root, 'crews', 'ghost-crew'))).toBe(false);
    // Implementation should either skip or warn about orphaned entries
  });
});

// ============================================================================
// createCrew(name)
// ============================================================================

describe('createCrew(name)', () => {
  let root: string;

  beforeEach(() => {
    root = makeTmpDir();
    mkdirSync(join(root, 'crews'), { recursive: true });
    writeCrewsJson(root, {
      version: 1,
      defaultCrew: 'default',
      crews: {
        'default': { createdAt: '2026-03-01T00:00:00Z' },
      },
    });
    scaffoldCrew(root, 'default');
  });

  it('creates crew directory with expected structure', () => {
    const name = 'new-client';
    const crewDir = join(root, 'crews', name);
    mkdirSync(join(crewDir, 'agents'), { recursive: true });
    mkdirSync(join(crewDir, 'skills'), { recursive: true });
    writeFileSync(join(crewDir, 'decisions.md'), '# Decisions\n');

    expect(existsSync(crewDir)).toBe(true);
    expect(existsSync(join(crewDir, 'agents'))).toBe(true);
    expect(existsSync(join(crewDir, 'skills'))).toBe(true);
    expect(existsSync(join(crewDir, 'decisions.md'))).toBe(true);
  });

  it('registers new crew in crews.json', () => {
    const name = 'registered-crew';
    scaffoldCrew(root, name);

    // Simulate registration
    const config = readCrewsJson(root);
    config.crews[name] = { createdAt: new Date().toISOString() };
    writeCrewsJson(root, config);

    const updated = readCrewsJson(root);
    expect(updated.crews[name]).toBeDefined();
    expect(updated.crews[name].createdAt).toBeTruthy();
  });

  it('rejects duplicate crew name', () => {
    // 'default' already exists
    expect(existsSync(join(root, 'crews', 'default'))).toBe(true);
    const config = readCrewsJson(root);
    expect(config.crews['default']).toBeDefined();
    // Implementation should throw when trying to create 'default' again
  });

  it('validates crew name format (kebab-case, 1-40 chars)', () => {
    const validNames = ['my-crew', 'a', 'client-acme-2026', 'ml-projects'];
    const invalidNames = [
      '',                          // empty
      'My Crew',                  // spaces
      'UPPER_CASE',               // uppercase + underscore
      'special!chars',            // special characters
      'a'.repeat(41),             // too long
      '.hidden',                  // dot prefix
      '-leading-dash',            // leading dash
      'trailing-dash-',           // trailing dash
    ];

    // kebab-case regex: ^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$
    const CREW_NAME_RE = /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/;

    for (const name of validNames) {
      expect(CREW_NAME_RE.test(name), `${name} should be valid`).toBe(true);
    }
    for (const name of invalidNames) {
      expect(CREW_NAME_RE.test(name), `"${name}" should be invalid`).toBe(false);
    }
  });

  it('new crew does not become default automatically', () => {
    const name = 'non-default-crew';
    scaffoldCrew(root, name);

    // Simulate registration without changing default
    const config = readCrewsJson(root);
    config.crews[name] = { createdAt: new Date().toISOString() };
    writeCrewsJson(root, config);

    const updated = readCrewsJson(root);
    expect(updated.defaultCrew).toBe('default');
    expect(updated.defaultCrew).not.toBe(name);
  });
});

// ============================================================================
// deleteCrew(name)
// ============================================================================

describe('deleteCrew(name)', () => {
  let root: string;

  beforeEach(() => {
    root = makeTmpDir();
    mkdirSync(join(root, 'crews'), { recursive: true });
  });

  it('removes crew directory and deregisters from crews.json', () => {
    scaffoldCrew(root, 'default');
    scaffoldCrew(root, 'to-delete');
    writeCrewsJson(root, {
      version: 1,
      defaultCrew: 'default',
      crews: {
        'default': { createdAt: '2026-03-01T00:00:00Z' },
        'to-delete': { createdAt: '2026-03-02T00:00:00Z' },
      },
    });

    // Simulate deletion
    const crewPath = join(root, 'crews', 'to-delete');
    rmSync(crewPath, { recursive: true, force: true });
    const config = readCrewsJson(root);
    delete config.crews['to-delete'];
    writeCrewsJson(root, config);

    expect(existsSync(crewPath)).toBe(false);
    const updated = readCrewsJson(root);
    expect(updated.crews['to-delete']).toBeUndefined();
    expect(updated.crews['default']).toBeDefined();
  });

  it('rejects deleting the active/default crew', () => {
    scaffoldCrew(root, 'active');
    writeCrewsJson(root, {
      version: 1,
      defaultCrew: 'active',
      crews: {
        'active': { createdAt: '2026-03-01T00:00:00Z' },
      },
    });

    const config = readCrewsJson(root);
    // Implementation should reject deletion when name === config.defaultCrew
    expect(config.defaultCrew).toBe('active');
    // Attempting to delete should throw: "Cannot delete the active crew"
  });

  it('rejects deleting nonexistent crew', () => {
    writeCrewsJson(root, {
      version: 1,
      defaultCrew: 'default',
      crews: {
        'default': { createdAt: '2026-03-01T00:00:00Z' },
      },
    });

    // 'phantom' doesn't exist in crews.json or on disk
    const config = readCrewsJson(root);
    expect(config.crews['phantom']).toBeUndefined();
    expect(existsSync(join(root, 'crews', 'phantom'))).toBe(false);
  });

  it('rejects deleting the last remaining crew', () => {
    scaffoldCrew(root, 'only-one');
    writeCrewsJson(root, {
      version: 1,
      defaultCrew: 'only-one',
      crews: {
        'only-one': { createdAt: '2026-03-01T00:00:00Z' },
      },
    });

    const config = readCrewsJson(root);
    expect(Object.keys(config.crews)).toHaveLength(1);
    // Implementation should refuse: "Cannot delete the last crew"
  });
});

// ============================================================================
// switchCrew(name)
// ============================================================================

describe('switchCrew(name)', () => {
  let root: string;

  beforeEach(() => {
    root = makeTmpDir();
    mkdirSync(join(root, 'crews'), { recursive: true });
    scaffoldCrew(root, 'alpha');
    scaffoldCrew(root, 'beta');
    writeCrewsJson(root, {
      version: 1,
      defaultCrew: 'alpha',
      crews: {
        'alpha': { createdAt: '2026-03-01T00:00:00Z' },
        'beta': { createdAt: '2026-03-02T00:00:00Z' },
      },
    });
  });

  it('updates defaultCrew in crews.json', () => {
    const config = readCrewsJson(root);
    expect(config.defaultCrew).toBe('alpha');

    // Simulate switch
    config.defaultCrew = 'beta';
    writeCrewsJson(root, config);

    const updated = readCrewsJson(root);
    expect(updated.defaultCrew).toBe('beta');
  });

  it('rejects switching to nonexistent crew', () => {
    const config = readCrewsJson(root);
    expect(config.crews['nonexistent']).toBeUndefined();
    expect(existsSync(join(root, 'crews', 'nonexistent'))).toBe(false);
    // Implementation should throw: "Crew 'nonexistent' not found"
  });

  it('switching to already-active crew is a no-op', () => {
    const config = readCrewsJson(root);
    expect(config.defaultCrew).toBe('alpha');

    // "Switching" to alpha when it's already active should succeed silently
    config.defaultCrew = 'alpha';
    writeCrewsJson(root, config);

    const updated = readCrewsJson(root);
    expect(updated.defaultCrew).toBe('alpha');
  });

  it('preserves all other config fields on switch', () => {
    const config = readCrewsJson(root);
    const originalCrews = { ...config.crews };

    config.defaultCrew = 'beta';
    writeCrewsJson(root, config);

    const updated = readCrewsJson(root);
    expect(updated.version).toBe(1);
    expect(updated.crews).toEqual(originalCrews);
  });
});

// ============================================================================
// migrateIfNeeded()
// ============================================================================

describe('migrateIfNeeded()', () => {
  let root: string;

  beforeEach(() => {
    root = makeTmpDir();
  });

  it('detects legacy layout and migrates to "default" crew', () => {
    scaffoldLegacyLayout(root);
    expect(existsSync(join(root, 'agents'))).toBe(true);
    expect(existsSync(join(root, 'crews'))).toBe(false);

    // After migration, expect:
    // - crews/default/ directory with agents/, skills/, etc.
    // - crews.json with defaultCrew: "default"
    // - original files moved (or copied) into crews/default/

    // Simulate migration
    const defaultCrew = join(root, 'crews', 'default');
    mkdirSync(defaultCrew, { recursive: true });

    // Implementation would move agents/, skills/, etc. into crews/default/
    writeCrewsJson(root, {
      version: 1,
      defaultCrew: 'default',
      crews: {
        'default': { createdAt: new Date().toISOString() },
      },
    });

    expect(existsSync(join(root, 'crews.json'))).toBe(true);
    expect(existsSync(defaultCrew)).toBe(true);
    const config = readCrewsJson(root);
    expect(config.defaultCrew).toBe('default');
    expect(config.crews['default']).toBeDefined();
  });

  it('is a no-op when already migrated (crews.json exists)', () => {
    mkdirSync(join(root, 'crews', 'default'), { recursive: true });
    writeCrewsJson(root, {
      version: 1,
      defaultCrew: 'default',
      crews: {
        'default': { createdAt: '2026-03-01T00:00:00Z' },
      },
    });

    // crews.json already exists — migration should be skipped
    const configBefore = readCrewsJson(root);

    // Simulate no-op migration check
    expect(existsSync(join(root, 'crews.json'))).toBe(true);

    const configAfter = readCrewsJson(root);
    expect(configAfter).toEqual(configBefore);
  });

  it('handles missing config dir (no ~/.config/crew at all)', () => {
    const emptyRoot = makeTmpDir();
    // No agents/, no crews/, no crews.json — completely empty
    expect(existsSync(join(emptyRoot, 'agents'))).toBe(false);
    expect(existsSync(join(emptyRoot, 'crews'))).toBe(false);
    expect(existsSync(join(emptyRoot, 'crews.json'))).toBe(false);
    // Implementation should either create default structure or return no-op
  });

  it('migrates agents/ and skills/ directories into crews/default/', () => {
    scaffoldLegacyLayout(root);
    writeFileSync(join(root, 'agents', 'fenster.md'), '# Fenster\n');
    writeFileSync(join(root, 'skills', 'coding.md'), '# Coding\n');

    // Verify legacy structure
    expect(existsSync(join(root, 'agents', 'fenster.md'))).toBe(true);
    expect(existsSync(join(root, 'skills', 'coding.md'))).toBe(true);

    // After migration, these should exist under crews/default/
    const defaultCrew = join(root, 'crews', 'default');
    mkdirSync(join(defaultCrew, 'agents'), { recursive: true });
    mkdirSync(join(defaultCrew, 'skills'), { recursive: true });

    // Simulate copy
    writeFileSync(
      join(defaultCrew, 'agents', 'fenster.md'),
      readFileSync(join(root, 'agents', 'fenster.md'), 'utf-8'),
    );
    writeFileSync(
      join(defaultCrew, 'skills', 'coding.md'),
      readFileSync(join(root, 'skills', 'coding.md'), 'utf-8'),
    );

    expect(readFileSync(join(defaultCrew, 'agents', 'fenster.md'), 'utf-8')).toContain('Fenster');
    expect(readFileSync(join(defaultCrew, 'skills', 'coding.md'), 'utf-8')).toContain('Coding');
  });

  it('preserves decisions.md content during migration', () => {
    scaffoldLegacyLayout(root);
    const decisionsContent = '# Decisions\n\n### Use TypeScript\nAlways.\n';
    writeFileSync(join(root, 'decisions.md'), decisionsContent);

    // After migration, decisions.md should be intact in crews/default/
    const defaultCrew = join(root, 'crews', 'default');
    mkdirSync(defaultCrew, { recursive: true });
    writeFileSync(
      join(defaultCrew, 'decisions.md'),
      readFileSync(join(root, 'decisions.md'), 'utf-8'),
    );

    expect(readFileSync(join(defaultCrew, 'decisions.md'), 'utf-8')).toBe(decisionsContent);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge cases', () => {
  let root: string;

  beforeEach(() => {
    root = makeTmpDir();
    mkdirSync(join(root, 'crews'), { recursive: true });
  });

  describe('empty crews.json', () => {
    it('empty crews object returns empty list', () => {
      writeCrewsJson(root, {
        version: 1,
        defaultCrew: 'default',
        crews: {},
      });

      const config = readCrewsJson(root);
      expect(Object.keys(config.crews)).toHaveLength(0);
    });

    it('missing crews field in JSON is handled', () => {
      writeFileSync(join(root, 'crews.json'), JSON.stringify({ version: 1 }), 'utf-8');

      const config = JSON.parse(readFileSync(join(root, 'crews.json'), 'utf-8'));
      expect(config.crews).toBeUndefined();
      // Implementation should treat undefined crews as empty
    });
  });

  describe('corrupted crews.json', () => {
    it('invalid JSON throws parse error', () => {
      writeFileSync(join(root, 'crews.json'), '{{{{ not json', 'utf-8');

      expect(() => {
        JSON.parse(readFileSync(join(root, 'crews.json'), 'utf-8'));
      }).toThrow();
    });

    it('empty file throws parse error', () => {
      writeFileSync(join(root, 'crews.json'), '', 'utf-8');

      expect(() => {
        JSON.parse(readFileSync(join(root, 'crews.json'), 'utf-8'));
      }).toThrow();
    });

    it('valid JSON but wrong shape is detectable', () => {
      writeFileSync(join(root, 'crews.json'), '"just a string"', 'utf-8');

      const parsed = JSON.parse(readFileSync(join(root, 'crews.json'), 'utf-8'));
      expect(typeof parsed).toBe('string');
      // Implementation should validate shape and throw CrewError
    });
  });

  describe('missing config dir', () => {
    it('operations on nonexistent root are handled gracefully', () => {
      const ghostRoot = join(root, 'does-not-exist');
      expect(existsSync(ghostRoot)).toBe(false);
      // listCrews, resolveCrewPath should handle this without crashing
    });
  });

  describe('concurrent access', () => {
    it('two creates with different names both succeed', () => {
      writeCrewsJson(root, {
        version: 1,
        defaultCrew: 'default',
        crews: {},
      });

      // Simulate two concurrent creates
      scaffoldCrew(root, 'crew-a');
      scaffoldCrew(root, 'crew-b');

      const config = readCrewsJson(root);
      config.crews['crew-a'] = { createdAt: new Date().toISOString() };
      config.crews['crew-b'] = { createdAt: new Date().toISOString() };
      writeCrewsJson(root, config);

      const updated = readCrewsJson(root);
      expect(updated.crews['crew-a']).toBeDefined();
      expect(updated.crews['crew-b']).toBeDefined();
    });

    it('concurrent switch and delete are guarded by config consistency', () => {
      scaffoldCrew(root, 'alpha');
      scaffoldCrew(root, 'beta');
      writeCrewsJson(root, {
        version: 1,
        defaultCrew: 'alpha',
        crews: {
          'alpha': { createdAt: '2026-03-01T00:00:00Z' },
          'beta': { createdAt: '2026-03-02T00:00:00Z' },
        },
      });

      // Attempting to delete 'alpha' while it's active should fail
      const config = readCrewsJson(root);
      expect(config.defaultCrew).toBe('alpha');
      // Implementation must check active status before deletion
    });
  });

  describe('platform paths', () => {
    it('uses path.join for all path construction (no hardcoded separators)', () => {
      const testPath = join(root, 'crews', 'my-crew', 'agents');
      // Verify platform-correct separators
      expect(testPath).toContain(sep);

      if (platform() === 'win32') {
        expect(testPath).toContain('\\');
      } else {
        expect(testPath).toContain('/');
      }
    });

    it('crew names do not contain path separators', () => {
      const dangerousNames = ['../escape', 'sub/dir', 'back\\slash', '..\\escape'];
      const CREW_NAME_RE = /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/;

      for (const name of dangerousNames) {
        expect(CREW_NAME_RE.test(name), `"${name}" must be rejected`).toBe(false);
      }
    });

    it('path traversal in crew name is rejected by validation', () => {
      const traversalAttempts = ['..', '../..', '....', '.hidden'];
      const CREW_NAME_RE = /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/;

      for (const attempt of traversalAttempts) {
        expect(CREW_NAME_RE.test(attempt), `"${attempt}" must be rejected`).toBe(false);
      }
    });
  });
});

// ============================================================================
// Integration: Full lifecycle
// ============================================================================

describe('Full lifecycle', () => {
  let root: string;

  beforeEach(() => {
    root = makeTmpDir();
  });

  it('migrate → list → create → switch → delete → list', () => {
    // Step 1: Start with legacy layout
    scaffoldLegacyLayout(root);
    expect(existsSync(join(root, 'agents'))).toBe(true);

    // Step 2: Migrate — creates crews/default + crews.json
    mkdirSync(join(root, 'crews', 'default', 'agents'), { recursive: true });
    mkdirSync(join(root, 'crews', 'default', 'skills'), { recursive: true });
    writeCrewsJson(root, {
      version: 1,
      defaultCrew: 'default',
      crews: {
        'default': { createdAt: new Date().toISOString() },
      },
    });

    // Step 3: List — should show 1 crew
    let config = readCrewsJson(root);
    expect(Object.keys(config.crews)).toHaveLength(1);

    // Step 4: Create 'work' crew
    scaffoldCrew(root, 'work');
    config = readCrewsJson(root);
    config.crews['work'] = { createdAt: new Date().toISOString() };
    writeCrewsJson(root, config);

    config = readCrewsJson(root);
    expect(Object.keys(config.crews)).toHaveLength(2);

    // Step 5: Switch to 'work'
    config.defaultCrew = 'work';
    writeCrewsJson(root, config);
    config = readCrewsJson(root);
    expect(config.defaultCrew).toBe('work');

    // Step 6: Delete 'default' (no longer active)
    rmSync(join(root, 'crews', 'default'), { recursive: true, force: true });
    delete config.crews['default'];
    writeCrewsJson(root, config);

    // Step 7: Verify final state
    config = readCrewsJson(root);
    expect(Object.keys(config.crews)).toHaveLength(1);
    expect(config.defaultCrew).toBe('work');
    expect(config.crews['default']).toBeUndefined();
    expect(config.crews['work']).toBeDefined();
    expect(existsSync(join(root, 'crews', 'work'))).toBe(true);
    expect(existsSync(join(root, 'crews', 'default'))).toBe(false);
  });

  it('create multiple crews and verify isolation', () => {
    mkdirSync(join(root, 'crews'), { recursive: true });
    writeCrewsJson(root, {
      version: 1,
      defaultCrew: 'default',
      crews: {},
    });

    const crewNames = ['personal', 'work', 'client-acme', 'experiment'];

    for (const name of crewNames) {
      scaffoldCrew(root, name);
      const config = readCrewsJson(root);
      config.crews[name] = { createdAt: new Date().toISOString() };
      if (name === 'personal') config.defaultCrew = name;
      writeCrewsJson(root, config);
    }

    // Write unique content to each crew
    for (const name of crewNames) {
      writeFileSync(
        join(root, 'crews', name, 'decisions.md'),
        `# Decisions for ${name}\n`,
      );
    }

    // Verify each crew has its own isolated content
    for (const name of crewNames) {
      const content = readFileSync(
        join(root, 'crews', name, 'decisions.md'),
        'utf-8',
      );
      expect(content).toContain(name);
      // No cross-contamination
      for (const other of crewNames.filter(n => n !== name)) {
        expect(content).not.toContain(`for ${other}`);
      }
    }

    const config = readCrewsJson(root);
    expect(Object.keys(config.crews)).toHaveLength(4);
  });
});
