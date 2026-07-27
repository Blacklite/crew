/**
 * Upstream sync-state tests.
 *
 * Regression cover for the churn bug: `last_synced` used to be written into the
 * tracked `.crew/upstream.json` on every sync. Because `crew upstream sync` runs
 * from the post-checkout and post-merge git hooks, that dirtied the working tree
 * on every pull and every branch switch. Timestamps now live in
 * `.crew/_upstream_repos/.sync-state.json`, which is gitignored.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  syncStateFile,
  readSyncState,
  writeSyncState,
  setLastSynced,
  clearLastSynced,
  migrateLegacySyncState,
} from '../../packages/crew-cli/src/cli/commands/upstream.js';
import type { UpstreamConfig } from '@blacklite/crew-sdk';

let repoDir: string;
let crewDir: string;

beforeEach(() => {
  repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'upstream-sync-state-'));
  crewDir = path.join(repoDir, '.crew');
  fs.mkdirSync(crewDir, { recursive: true });
});

afterEach(() => {
  try { fs.rmSync(repoDir, { recursive: true, force: true }); } catch { /* ok */ }
});

describe('syncStateFile', () => {
  it('lives inside the gitignored _upstream_repos directory', () => {
    expect(syncStateFile(crewDir)).toBe(path.join(crewDir, '_upstream_repos', '.sync-state.json'));
  });
});

describe('readSyncState', () => {
  it('returns empty state when the file does not exist', () => {
    expect(readSyncState(crewDir)).toEqual({ version: 1, last_synced: {} });
  });

  it('returns empty state for malformed JSON rather than throwing', () => {
    fs.mkdirSync(path.join(crewDir, '_upstream_repos'), { recursive: true });
    fs.writeFileSync(syncStateFile(crewDir), 'not json {{{');
    expect(readSyncState(crewDir)).toEqual({ version: 1, last_synced: {} });
  });

  it('tolerates a file missing the last_synced key', () => {
    fs.mkdirSync(path.join(crewDir, '_upstream_repos'), { recursive: true });
    fs.writeFileSync(syncStateFile(crewDir), JSON.stringify({ version: 1 }));
    expect(readSyncState(crewDir)).toEqual({ version: 1, last_synced: {} });
  });
});

describe('writeSyncState', () => {
  it('creates _upstream_repos and gitignores it', () => {
    writeSyncState(crewDir, repoDir, { version: 1, last_synced: { org: '2026-01-01T00:00:00.000Z' } });

    expect(fs.existsSync(syncStateFile(crewDir))).toBe(true);
    expect(fs.readFileSync(path.join(repoDir, '.gitignore'), 'utf8')).toContain('.crew/_upstream_repos/');
  });

  it('round-trips through readSyncState', () => {
    const state = { version: 1 as const, last_synced: { org: '2026-01-01T00:00:00.000Z', team: '2026-02-02T00:00:00.000Z' } };
    writeSyncState(crewDir, repoDir, state);
    expect(readSyncState(crewDir)).toEqual(state);
  });

  it('does not duplicate the gitignore entry across repeated writes', () => {
    writeSyncState(crewDir, repoDir, { version: 1, last_synced: {} });
    writeSyncState(crewDir, repoDir, { version: 1, last_synced: {} });

    const gitignore = fs.readFileSync(path.join(repoDir, '.gitignore'), 'utf8');
    expect(gitignore.match(/\.crew\/_upstream_repos\//g)).toHaveLength(1);
  });
});

describe('setLastSynced / clearLastSynced', () => {
  it('records a timestamp for one upstream without disturbing others', () => {
    setLastSynced(crewDir, repoDir, 'org', '2026-01-01T00:00:00.000Z');
    setLastSynced(crewDir, repoDir, 'team', '2026-02-02T00:00:00.000Z');

    expect(readSyncState(crewDir).last_synced).toEqual({
      org: '2026-01-01T00:00:00.000Z',
      team: '2026-02-02T00:00:00.000Z',
    });
  });

  it('overwrites the timestamp on a repeat sync', () => {
    setLastSynced(crewDir, repoDir, 'org', '2026-01-01T00:00:00.000Z');
    setLastSynced(crewDir, repoDir, 'org', '2026-03-03T00:00:00.000Z');

    expect(readSyncState(crewDir).last_synced.org).toBe('2026-03-03T00:00:00.000Z');
  });

  it('clears only the named upstream', () => {
    setLastSynced(crewDir, repoDir, 'org', '2026-01-01T00:00:00.000Z');
    setLastSynced(crewDir, repoDir, 'team', '2026-02-02T00:00:00.000Z');
    clearLastSynced(crewDir, repoDir, 'org');

    expect(readSyncState(crewDir).last_synced).toEqual({ team: '2026-02-02T00:00:00.000Z' });
  });

  it('clearing an unknown upstream is a no-op', () => {
    setLastSynced(crewDir, repoDir, 'org', '2026-01-01T00:00:00.000Z');
    clearLastSynced(crewDir, repoDir, 'nope');

    expect(readSyncState(crewDir).last_synced).toEqual({ org: '2026-01-01T00:00:00.000Z' });
  });
});

describe('migrateLegacySyncState', () => {
  function legacyConfig(): UpstreamConfig {
    return {
      upstreams: [
        { name: 'org', type: 'git', source: 'https://github.com/org/repo', ref: 'main', added_at: '2026-01-01T00:00:00Z', last_synced: '2026-05-05T00:00:00.000Z' },
        { name: 'team', type: 'local', source: '/tmp/team', added_at: '2026-01-01T00:00:00Z', last_synced: null },
      ],
    };
  }

  it('strips last_synced from every entry and reports that a rewrite is needed', () => {
    const data = legacyConfig();
    expect(migrateLegacySyncState(crewDir, repoDir, data)).toBe(true);

    for (const entry of data.upstreams) {
      expect('last_synced' in entry).toBe(false);
    }
  });

  it('moves the timestamp into the gitignored sync-state file', () => {
    migrateLegacySyncState(crewDir, repoDir, legacyConfig());

    // The null-valued entry carries nothing worth preserving.
    expect(readSyncState(crewDir).last_synced).toEqual({ org: '2026-05-05T00:00:00.000Z' });
  });

  it('is a no-op on an already-migrated config — so upstream.json is never rewritten', () => {
    const data: UpstreamConfig = {
      upstreams: [{ name: 'org', type: 'git', source: 'https://github.com/org/repo', ref: 'main', added_at: '2026-01-01T00:00:00Z' }],
    };
    expect(migrateLegacySyncState(crewDir, repoDir, data)).toBe(false);
  });

  it('does not let a stale tracked timestamp clobber a newer local one', () => {
    setLastSynced(crewDir, repoDir, 'org', '2026-09-09T00:00:00.000Z');
    migrateLegacySyncState(crewDir, repoDir, legacyConfig());

    expect(readSyncState(crewDir).last_synced.org).toBe('2026-09-09T00:00:00.000Z');
  });

  it('leaves the rest of the entry untouched', () => {
    const data = legacyConfig();
    migrateLegacySyncState(crewDir, repoDir, data);

    expect(data.upstreams[0]).toEqual({
      name: 'org',
      type: 'git',
      source: 'https://github.com/org/repo',
      ref: 'main',
      added_at: '2026-01-01T00:00:00Z',
    });
  });
});

describe('churn regression — upstream.json stays byte-stable across syncs', () => {
  it('serialised config is identical before and after repeated sync bookkeeping', () => {
    const data: UpstreamConfig = {
      upstreams: [{ name: 'org', type: 'git', source: 'https://github.com/org/repo', ref: 'main', added_at: '2026-01-01T00:00:00Z' }],
    };
    const before = JSON.stringify(data, null, 2) + '\n';

    // Three syncs, each recording a distinct timestamp.
    setLastSynced(crewDir, repoDir, 'org', '2026-01-01T00:00:00.000Z');
    setLastSynced(crewDir, repoDir, 'org', '2026-01-02T00:00:00.000Z');
    setLastSynced(crewDir, repoDir, 'org', '2026-01-03T00:00:00.000Z');

    // Migration never fires again, so the tracked file is never rewritten...
    expect(migrateLegacySyncState(crewDir, repoDir, data)).toBe(false);
    expect(JSON.stringify(data, null, 2) + '\n').toBe(before);

    // ...while the timestamp still advanced, out of tree.
    expect(readSyncState(crewDir).last_synced.org).toBe('2026-01-03T00:00:00.000Z');
  });
});
