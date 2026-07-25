/**
 * Nap subprocess / --team-root resolution tests (#734)
 *
 * Verifies that the nap command works correctly when invoked from a
 * subprocess with a different working directory, as happens with
 * Copilot CLI bang commands (!crew nap) on Windows.
 *
 * The fix: getCrewStartDir() respects CREW_TEAM_ROOT env var,
 * falling back to process.cwd() when unset.
 *
 * @see packages/crew-cli/src/cli-entry.ts — getCrewStartDir()
 * @see https://github.com/Blacklite/crew/issues/734
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

import { runNap } from '../../packages/crew-cli/src/cli/core/nap.js';

// ============================================================================
// Helpers
// ============================================================================

const tmpDirs: string[] = [];

function createTestCrewDir(): string {
  const tmpDir = mkdtempSync(join(tmpdir(), 'crew-nap-subprocess-'));
  tmpDirs.push(tmpDir);
  const crewDir = join(tmpDir, '.crew');
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
  return crewDir;
}

// ============================================================================
// Tests
// ============================================================================

describe('nap: subprocess / --team-root resolution (#734)', () => {
  const savedTeamRoot = process.env['CREW_TEAM_ROOT'];

  beforeEach(() => {
    delete process.env['CREW_TEAM_ROOT'];
  });

  afterEach(() => {
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

  it('runNap succeeds with explicit crewDir from a different working directory', async () => {
    const crewDir = createTestCrewDir();
    const differentCwd = mkdtempSync(join(tmpdir(), 'crew-nap-other-cwd-'));
    tmpDirs.push(differentCwd);
    const previousCwd = process.cwd();

    try {
      // This simulates the key scenario from #734: nap is called with a
      // crewDir resolved from CREW_TEAM_ROOT while the current working
      // directory points somewhere else.
      process.chdir(differentCwd);

      const result = await runNap({ crewDir, dryRun: true });

      expect(result).toBeDefined();
      expect(result.actions).toBeDefined();
      expect(result.before).toBeDefined();
      expect(result.after).toBeDefined();
    } finally {
      process.chdir(previousCwd);
    }
  });

  it('runNap returns empty result when crewDir does not exist', async () => {
    const nonExistent = join(tmpdir(), 'crew-nap-nonexistent-dir');
    const result = await runNap({ crewDir: nonExistent, dryRun: true });

    expect(result.actions).toHaveLength(0);
    expect(result.before.totalFiles).toBe(0);
    expect(result.after.totalFiles).toBe(0);
  });
});
