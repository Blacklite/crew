/**
 * Tests for the registry CRUD helpers and the dual-path readManifest fix.
 *
 * Covers:
 * - readManifest accepts both repo-root and repo-root/.crew paths
 * - readCrewRegistry / writeCrewRegistry round-trip
 * - addRegistryEntry: success, duplicate-name rejection, invalid-manifest rejection
 * - removeRegistryEntry: returns true/false correctly
 * - Entries written by addRegistryEntry are picked up by discoverCrews
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  readManifest,
  readCrewRegistry,
  writeCrewRegistry,
  addRegistryEntry,
  removeRegistryEntry,
  discoverCrews,
} from '../packages/crew-sdk/src/runtime/cross-crew.js';

const VALID_MANIFEST = {
  name: 'peer-crew',
  capabilities: ['kubernetes'],
  contact: { repo: 'org/peer' },
  accepts: ['issues'],
} as const;

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanDir(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

function writePeerManifest(repoDir: string, manifest: object = VALID_MANIFEST): void {
  const crewDir = path.join(repoDir, '.crew');
  fs.mkdirSync(crewDir, { recursive: true });
  fs.writeFileSync(path.join(crewDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

// ============================================================================
// readManifest dual-path
// ============================================================================

describe('readManifest — dual-path acceptance', () => {
  let peer: string;

  beforeEach(() => {
    peer = makeTempDir('peer-');
    writePeerManifest(peer);
  });

  afterEach(() => cleanDir(peer));

  it('accepts the repo root path', () => {
    const m = readManifest(peer);
    expect(m).not.toBeNull();
    expect(m!.name).toBe('peer-crew');
  });

  it('accepts a path with trailing .crew', () => {
    const m = readManifest(path.join(peer, '.crew'));
    expect(m).not.toBeNull();
    expect(m!.name).toBe('peer-crew');
  });

  it('accepts a path with trailing .crew/', () => {
    const m = readManifest(path.join(peer, '.crew') + path.sep);
    expect(m).not.toBeNull();
  });

  it('returns null when no manifest is present', () => {
    const empty = makeTempDir('empty-');
    try {
      expect(readManifest(empty)).toBeNull();
    } finally {
      cleanDir(empty);
    }
  });
});

// ============================================================================
// Registry CRUD
// ============================================================================

describe('readCrewRegistry / writeCrewRegistry', () => {
  let dir: string;

  beforeEach(() => {
    dir = makeTempDir('me-');
    fs.mkdirSync(path.join(dir, '.crew'), { recursive: true });
  });

  afterEach(() => cleanDir(dir));

  it('returns empty array when no registry file exists', () => {
    expect(readCrewRegistry(path.join(dir, '.crew'))).toEqual([]);
  });

  it('round-trips entries', () => {
    const entries = [
      { name: 'a', path: '/tmp/a' },
      { name: 'b', path: '/tmp/b' },
    ];
    writeCrewRegistry(path.join(dir, '.crew'), entries);
    expect(readCrewRegistry(path.join(dir, '.crew'))).toEqual(entries);
  });

  it('returns empty on malformed JSON', () => {
    const reg = path.join(dir, '.crew', 'crew-registry.json');
    fs.writeFileSync(reg, '{ not json');
    expect(readCrewRegistry(path.join(dir, '.crew'))).toEqual([]);
  });

  it('returns empty when JSON is not an array', () => {
    const reg = path.join(dir, '.crew', 'crew-registry.json');
    fs.writeFileSync(reg, '{"name":"a","path":"/tmp"}');
    expect(readCrewRegistry(path.join(dir, '.crew'))).toEqual([]);
  });

  it('filters out malformed entries', () => {
    const reg = path.join(dir, '.crew', 'crew-registry.json');
    fs.writeFileSync(reg, JSON.stringify([
      { name: 'good', path: '/tmp/g' },
      { name: 42, path: '/tmp/bad' },
      { name: 'no-path' },
      null,
      { name: 'ok', path: '/tmp/ok' },
    ]));
    const entries = readCrewRegistry(path.join(dir, '.crew'));
    expect(entries.map(e => e.name).sort()).toEqual(['good', 'ok']);
  });

  it('creates .crew dir on write if missing', () => {
    const fresh = makeTempDir('fresh-');
    try {
      const crewDir = path.join(fresh, '.crew');
      writeCrewRegistry(crewDir, [{ name: 'x', path: '/tmp/x' }]);
      expect(fs.existsSync(path.join(crewDir, 'crew-registry.json'))).toBe(true);
    } finally {
      cleanDir(fresh);
    }
  });
});

describe('addRegistryEntry', () => {
  let me: string;
  let peer: string;
  let myCrewDir: string;

  beforeEach(() => {
    me = makeTempDir('me-');
    peer = makeTempDir('peer-');
    myCrewDir = path.join(me, '.crew');
    fs.mkdirSync(myCrewDir, { recursive: true });
    writePeerManifest(peer);
  });

  afterEach(() => {
    cleanDir(me);
    cleanDir(peer);
  });

  it('writes the entry on success', () => {
    const result = addRegistryEntry(myCrewDir, 'friend', peer);
    expect(result.added).toBe(true);
    expect(result.manifest?.name).toBe('peer-crew');
    expect(readCrewRegistry(myCrewDir)).toEqual([{ name: 'friend', path: peer }]);
  });

  it('refuses on duplicate name', () => {
    addRegistryEntry(myCrewDir, 'friend', peer);
    const second = addRegistryEntry(myCrewDir, 'friend', peer);
    expect(second.added).toBe(false);
    expect(second.reason).toBe('duplicate-name');
    expect(readCrewRegistry(myCrewDir).length).toBe(1);
  });

  it('refuses when path has no manifest', () => {
    const noManifest = makeTempDir('no-manifest-');
    try {
      const result = addRegistryEntry(myCrewDir, 'broken', noManifest);
      expect(result.added).toBe(false);
      expect(result.reason).toBe('invalid-manifest');
      expect(readCrewRegistry(myCrewDir)).toEqual([]);
    } finally {
      cleanDir(noManifest);
    }
  });

  it('accepts .crew-suffixed paths', () => {
    const result = addRegistryEntry(myCrewDir, 'friend', path.join(peer, '.crew'));
    expect(result.added).toBe(true);
  });
});

describe('removeRegistryEntry', () => {
  let me: string;
  let myCrewDir: string;

  beforeEach(() => {
    me = makeTempDir('me-');
    myCrewDir = path.join(me, '.crew');
    fs.mkdirSync(myCrewDir, { recursive: true });
    writeCrewRegistry(myCrewDir, [
      { name: 'a', path: '/tmp/a' },
      { name: 'b', path: '/tmp/b' },
    ]);
  });

  afterEach(() => cleanDir(me));

  it('returns true and removes when name exists', () => {
    expect(removeRegistryEntry(myCrewDir, 'a')).toBe(true);
    expect(readCrewRegistry(myCrewDir)).toEqual([{ name: 'b', path: '/tmp/b' }]);
  });

  it('returns false when name does not exist', () => {
    expect(removeRegistryEntry(myCrewDir, 'missing')).toBe(false);
    expect(readCrewRegistry(myCrewDir).length).toBe(2);
  });
});

// ============================================================================
// End-to-end — addRegistryEntry feeds discoverCrews
// ============================================================================

describe('registry → discoverCrews integration', () => {
  let me: string;
  let peer: string;
  let myCrewDir: string;

  beforeEach(() => {
    me = makeTempDir('me-');
    peer = makeTempDir('peer-');
    myCrewDir = path.join(me, '.crew');
    fs.mkdirSync(myCrewDir, { recursive: true });
    writePeerManifest(peer);
  });

  afterEach(() => {
    cleanDir(me);
    cleanDir(peer);
  });

  it('addRegistryEntry makes the peer discoverable', () => {
    addRegistryEntry(myCrewDir, 'friend', peer);
    const discovered = discoverCrews(myCrewDir);
    expect(discovered.length).toBe(1);
    expect(discovered[0]?.manifest.name).toBe('peer-crew');
    expect(discovered[0]?.source).toBe('registry');
    expect(discovered[0]?.sourceRef).toBe('friend');
  });

  it('removeRegistryEntry makes the peer un-discoverable', () => {
    addRegistryEntry(myCrewDir, 'friend', peer);
    expect(discoverCrews(myCrewDir).length).toBe(1);
    removeRegistryEntry(myCrewDir, 'friend');
    expect(discoverCrews(myCrewDir).length).toBe(0);
  });
});
