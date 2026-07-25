/**
 * CREW_TEAM_ROOT resolution tests (#836)
 *
 * Verifies that the CREW_TEAM_ROOT env var correctly controls crew
 * directory resolution across all scenarios:
 *   - env var set → uses that path
 *   - env var unset → falls back to process.cwd()
 *   - env var empty string → falls back to process.cwd()
 *   - resolveCrew honours the resolved start directory
 *   - invalid CREW_TEAM_ROOT produces a null result (no crash)
 *
 * These tests simulate the Copilot CLI bang-command scenario where
 * the subprocess working directory differs from the interactive shell.
 *
 * @see packages/crew-cli/src/cli-entry.ts — getCrewStartDir()
 * @see packages/crew-sdk/src/resolution.ts  — resolveCrew()
 * @see https://github.com/Blacklite/crew/issues/836
 */

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { resolveCrew } from '../../packages/crew-sdk/src/resolution.js';

// ============================================================================
// Helpers
// ============================================================================

const tmpDirs: string[] = [];

/**
 * Reproduce the private getCrewStartDir() logic from cli-entry.ts so we
 * can unit-test the env-var resolution without depending on the private fn.
 *
 * The real implementation is:
 *   function getCrewStartDir(): string {
 *     return process.env['CREW_TEAM_ROOT'] || process.cwd();
 *   }
 */
function getCrewStartDir(): string {
  return process.env['CREW_TEAM_ROOT'] || process.cwd();
}

/** Create a minimal valid .crew directory tree inside a temp folder. */
function createCrewProject(): { root: string; crewDir: string } {
  const root = mkdtempSync(join(tmpdir(), 'crew-team-root-'));
  tmpDirs.push(root);

  const crewDir = join(root, '.crew');
  mkdirSync(join(crewDir, 'agents', 'edie'), { recursive: true });
  mkdirSync(join(crewDir, 'decisions', 'inbox'), { recursive: true });
  mkdirSync(join(crewDir, 'orchestration-log'), { recursive: true });
  writeFileSync(join(crewDir, 'team.md'), '# Team\n');
  writeFileSync(join(crewDir, 'routing.md'), '# Routing\n');
  writeFileSync(join(crewDir, 'decisions.md'), '# Decisions\n');
  writeFileSync(
    join(crewDir, 'agents', 'edie', 'history.md'),
    '## Core Context\n\nTest agent.\n',
  );

  // Add a .git directory so resolveCrew stops walking at this level
  mkdirSync(join(root, '.git'), { recursive: true });

  return { root, crewDir };
}

// ============================================================================
// Tests — getCrewStartDir() resolution logic
// ============================================================================

describe('CREW_TEAM_ROOT resolution (#836)', () => {
  const savedTeamRoot = process.env['CREW_TEAM_ROOT'];
  const originalCwd = process.cwd();

  beforeEach(() => {
    delete process.env['CREW_TEAM_ROOT'];
  });

  afterEach(() => {
    // Restore cwd
    process.chdir(originalCwd);
    // Restore env
    if (savedTeamRoot !== undefined) {
      process.env['CREW_TEAM_ROOT'] = savedTeamRoot;
    } else {
      delete process.env['CREW_TEAM_ROOT'];
    }
    // Clean up temp dirs
    for (const dir of tmpDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  // --------------------------------------------------------------------------
  // getCrewStartDir() env-var scenarios
  // --------------------------------------------------------------------------

  describe('getCrewStartDir() env-var handling', () => {
    it('returns CREW_TEAM_ROOT when the env var is set', () => {
      const { root } = createCrewProject();
      process.env['CREW_TEAM_ROOT'] = root;

      expect(getCrewStartDir()).toBe(root);
    });

    it('falls back to process.cwd() when CREW_TEAM_ROOT is unset', () => {
      delete process.env['CREW_TEAM_ROOT'];

      expect(getCrewStartDir()).toBe(process.cwd());
    });

    it('falls back to process.cwd() when CREW_TEAM_ROOT is empty string', () => {
      process.env['CREW_TEAM_ROOT'] = '';

      // Empty string is falsy → || falls through to process.cwd()
      expect(getCrewStartDir()).toBe(process.cwd());
    });
  });

  // --------------------------------------------------------------------------
  // resolveCrew integration with CREW_TEAM_ROOT
  // --------------------------------------------------------------------------

  describe('resolveCrew() uses getCrewStartDir result', () => {
    it('resolveCrew finds .crew/ when CREW_TEAM_ROOT points to a valid project', () => {
      const { root, crewDir } = createCrewProject();
      process.env['CREW_TEAM_ROOT'] = root;

      const startDir = getCrewStartDir();
      const result = resolveCrew(startDir);

      expect(result).toBe(crewDir);
    });

    it('resolveCrew finds .crew/ even when cwd is elsewhere', () => {
      const { root, crewDir } = createCrewProject();
      const otherDir = mkdtempSync(join(tmpdir(), 'crew-other-cwd-'));
      tmpDirs.push(otherDir);

      // Simulate Copilot CLI subprocess scenario:
      // cwd is some random directory, but CREW_TEAM_ROOT points to real project
      process.chdir(otherDir);
      process.env['CREW_TEAM_ROOT'] = root;

      const startDir = getCrewStartDir();
      const result = resolveCrew(startDir);

      expect(result).toBe(crewDir);
    });

    it('resolveCrew returns null when CREW_TEAM_ROOT is unset and cwd has no .crew/', () => {
      const emptyDir = mkdtempSync(join(tmpdir(), 'crew-empty-'));
      tmpDirs.push(emptyDir);
      // Add .git so resolveCrew stops walking here
      mkdirSync(join(emptyDir, '.git'), { recursive: true });

      delete process.env['CREW_TEAM_ROOT'];
      process.chdir(emptyDir);

      const startDir = getCrewStartDir();
      const result = resolveCrew(startDir);

      expect(result).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // Invalid / non-existent CREW_TEAM_ROOT
  // --------------------------------------------------------------------------

  describe('invalid CREW_TEAM_ROOT path', () => {
    it('resolveCrew returns null for a non-existent CREW_TEAM_ROOT path', () => {
      const fakePath = join(tmpdir(), 'crew-nonexistent-' + Date.now());
      process.env['CREW_TEAM_ROOT'] = fakePath;

      const startDir = getCrewStartDir();
      const result = resolveCrew(startDir);

      // Non-existent path → resolveCrew walks up and finds nothing → null
      expect(result).toBeNull();
    });

    it('resolveCrew returns null for a CREW_TEAM_ROOT pointing to a dir without .crew/', () => {
      const dirWithoutCrew = mkdtempSync(join(tmpdir(), 'crew-no-crew-dir-'));
      tmpDirs.push(dirWithoutCrew);
      // Add .git so resolveCrew stops walking here
      mkdirSync(join(dirWithoutCrew, '.git'), { recursive: true });

      process.env['CREW_TEAM_ROOT'] = dirWithoutCrew;

      const startDir = getCrewStartDir();
      const result = resolveCrew(startDir);

      expect(result).toBeNull();
    });
  });
});
