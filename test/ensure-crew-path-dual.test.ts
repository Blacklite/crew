/**
 * Tests for ensureCrewPathDual() and ensureCrewPathResolved()
 * Dual-root write support based on @spboyer (Shayne Boyer)'s remote mode design.
 */

import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ensureCrewPathDual, ensureCrewPathResolved } from '@blacklite/crew-sdk/resolution';
import type { ResolvedCrewPaths } from '@blacklite/crew-sdk/resolution';

// Use fixed absolute paths for deterministic tests (no filesystem needed — pure validation)
const PROJECT_DIR = join(process.cwd(), 'project', '.crew');
const TEAM_DIR = join(process.cwd(), 'shared-team', '.crew');

describe('ensureCrewPathDual()', () => {
  describe('local mode (projectDir === teamDir)', () => {
    it('behaves like single-root when both dirs are the same', () => {
      const p = join(PROJECT_DIR, 'decisions', 'log.md');
      expect(ensureCrewPathDual(p, PROJECT_DIR, PROJECT_DIR)).toBe(p);
    });

    it('rejects paths outside the single root', () => {
      const outside = join(process.cwd(), 'outside.txt');
      expect(() => ensureCrewPathDual(outside, PROJECT_DIR, PROJECT_DIR))
        .toThrow(/outside both crew roots/);
    });
  });

  describe('remote mode (projectDir !== teamDir)', () => {
    it('accepts writes to projectDir', () => {
      const p = join(PROJECT_DIR, 'decisions', 'decision.md');
      expect(ensureCrewPathDual(p, PROJECT_DIR, TEAM_DIR)).toBe(p);
    });

    it('accepts writes to teamDir', () => {
      const p = join(TEAM_DIR, 'agents', 'edie', 'charter.md');
      expect(ensureCrewPathDual(p, PROJECT_DIR, TEAM_DIR)).toBe(p);
    });

    it('rejects writes outside both roots', () => {
      const outside = join(process.cwd(), 'random', 'file.txt');
      expect(() => ensureCrewPathDual(outside, PROJECT_DIR, TEAM_DIR))
        .toThrow(/outside both crew roots/);
    });
  });

  it('allows paths inside the system temp directory', () => {
    const p = join(tmpdir(), 'crew-scratch', 'temp.json');
    expect(ensureCrewPathDual(p, PROJECT_DIR, TEAM_DIR)).toBe(p);
  });

  it('rejects path traversal attack (../../etc/passwd)', () => {
    const traversal = join(PROJECT_DIR, '..', '..', 'etc', 'passwd');
    expect(() => ensureCrewPathDual(traversal, PROJECT_DIR, TEAM_DIR))
      .toThrow(/outside both crew roots/);
  });

  it('accepts subdirectories of valid roots', () => {
    const projectSub = join(PROJECT_DIR, 'logs', 'orchestration', 'run-001.json');
    const teamSub = join(TEAM_DIR, 'casting', 'registry.json');
    expect(ensureCrewPathDual(projectSub, PROJECT_DIR, TEAM_DIR)).toBe(projectSub);
    expect(ensureCrewPathDual(teamSub, PROJECT_DIR, TEAM_DIR)).toBe(teamSub);
  });

  it('accepts exact root paths', () => {
    expect(ensureCrewPathDual(PROJECT_DIR, PROJECT_DIR, TEAM_DIR)).toBe(PROJECT_DIR);
    expect(ensureCrewPathDual(TEAM_DIR, PROJECT_DIR, TEAM_DIR)).toBe(TEAM_DIR);
  });
});

describe('ensureCrewPathResolved()', () => {
  const localPaths: ResolvedCrewPaths = {
    mode: 'local',
    projectDir: PROJECT_DIR,
    teamDir: PROJECT_DIR,
    config: null,
    name: '.crew',
    isLegacy: false,
  };

  const remotePaths: ResolvedCrewPaths = {
    mode: 'remote',
    projectDir: PROJECT_DIR,
    teamDir: TEAM_DIR,
    config: { version: 1, teamRoot: '../shared-team/.crew', projectKey: null },
    name: '.crew',
    isLegacy: false,
  };

  it('works with ResolvedCrewPaths in local mode', () => {
    const p = join(PROJECT_DIR, 'decisions.md');
    expect(ensureCrewPathResolved(p, localPaths)).toBe(p);
  });

  it('works with ResolvedCrewPaths in remote mode (projectDir)', () => {
    const p = join(PROJECT_DIR, 'logs', 'run.json');
    expect(ensureCrewPathResolved(p, remotePaths)).toBe(p);
  });

  it('works with ResolvedCrewPaths in remote mode (teamDir)', () => {
    const p = join(TEAM_DIR, 'agents', 'fenster', 'scratch.md');
    expect(ensureCrewPathResolved(p, remotePaths)).toBe(p);
  });

  it('rejects paths outside both roots via ResolvedCrewPaths', () => {
    const outside = join(process.cwd(), 'nope.txt');
    expect(() => ensureCrewPathResolved(outside, remotePaths))
      .toThrow(/outside both crew roots/);
  });
});
