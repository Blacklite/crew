/**
 * Worktree regression tests — Issue #521
 *
 * Both resolveCrew() and detectCrewDir() must handle .git FILES (worktree
 * pointers) by reading the gitdir: pointer and falling back to the main
 * checkout's .crew/. The implementation parses .git via fs.readFileSync —
 * no child_process calls are made.
 *
 * Test directory structure:
 *  tmp/
 *    main/        ← main checkout
 *      .git/      ← real .git directory
 *        worktrees/
 *          feature-521/
 *      .crew/
 *    worktree/    ← worktree
 *      .git       ← FILE: "gitdir: ../main/.git/worktrees/feature-521"
 *
 * @see packages/crew-sdk/src/resolution.ts       resolveCrew()
 * @see packages/crew-cli/src/cli/core/detect-crew-dir.ts  detectCrewDir()
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { resolveCrew } from '@blacklite/crew-sdk/resolution';
import { detectCrewDir } from '@blacklite/crew-cli/core/detect-crew-dir';

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('worktree regression (#521)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'crew-worktree-test-'));
  });

  afterEach(() => {
    if (existsSync(tmp)) {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  // ── resolveCrew() ────────────────────────────────────────────────────────

  describe('resolveCrew()', () => {
    it('.git FILE is not treated as a hard stop — falls back to main checkout', () => {
      // Worktree: .git is a FILE (pointer), no .crew/
      const worktree = join(tmp, 'worktree');
      mkdirSync(worktree);
      writeFileSync(
        join(worktree, '.git'),
        'gitdir: ../main/.git/worktrees/feature-521',
      );

      // Main checkout: .git is a DIRECTORY with worktrees/, .crew/ is present
      const main = join(tmp, 'main');
      mkdirSync(join(main, '.git', 'worktrees', 'feature-521'), { recursive: true });
      mkdirSync(join(main, '.crew'), { recursive: true });

      // CURRENT CODE → returns null  (treats .git file as hard stop)  ← FAILS
      // AFTER FIX    → returns main/.crew via worktree fallback       ← PASSES
      expect(resolveCrew(worktree)).toBe(join(main, '.crew'));
    });

    it('.git DIRECTORY still marks the repo root boundary correctly', () => {
      // Normal checkout: .git is a directory, .crew/ is present inside
      const repo = join(tmp, 'repo');
      mkdirSync(join(repo, '.git'), { recursive: true });
      mkdirSync(join(repo, '.crew'), { recursive: true });
      mkdirSync(join(repo, 'src'), { recursive: true });

      // resolveCrew() should find .crew/ before hitting the .git directory
      expect(resolveCrew(join(repo, 'src'))).toBe(join(repo, '.crew'));
    });

    it('worktree fallback: resolves .crew/ from src/ subdir inside worktree', () => {
      // Worktree has a nested src/ — walk-up crosses the worktree root
      const worktree = join(tmp, 'worktree');
      mkdirSync(join(worktree, 'src'), { recursive: true });
      writeFileSync(
        join(worktree, '.git'),
        'gitdir: ../main/.git/worktrees/feature-521',
      );

      const main = join(tmp, 'main');
      mkdirSync(join(main, '.git', 'worktrees', 'feature-521'), { recursive: true });
      mkdirSync(join(main, '.crew'), { recursive: true });

      // CURRENT CODE → returns null  ← FAILS
      // AFTER FIX    → returns main/.crew  ← PASSES
      expect(resolveCrew(join(worktree, 'src'))).toBe(join(main, '.crew'));
    });

    it('worktree fallback: returns null when main checkout also has no .crew/', () => {
      // Worktree: .git file, no .crew/
      const worktree = join(tmp, 'worktree');
      mkdirSync(worktree);
      writeFileSync(
        join(worktree, '.git'),
        'gitdir: ../main/.git/worktrees/feature-521',
      );

      // Main: .git directory with worktrees/, but ALSO no .crew/
      const main = join(tmp, 'main');
      mkdirSync(join(main, '.git', 'worktrees', 'feature-521'), { recursive: true });

      // Neither location has .crew/→ should return null in both old and new code
      // (This is a "should stay null" control test.)
      expect(resolveCrew(worktree)).toBeNull();
    });
  });

  // ── detectCrewDir() ──────────────────────────────────────────────────────

  describe('detectCrewDir()', () => {
    it('finds .crew/ from main checkout when invoked from a worktree', () => {
      // Worktree: .git file, no .crew/
      const worktree = join(tmp, 'worktree');
      mkdirSync(worktree);
      writeFileSync(
        join(worktree, '.git'),
        'gitdir: ../main/.git/worktrees/feature-521',
      );

      // Main: .git directory with worktrees/, .crew/ present
      const main = join(tmp, 'main');
      mkdirSync(join(main, '.git', 'worktrees', 'feature-521'), { recursive: true });
      mkdirSync(join(main, '.crew'), { recursive: true });

      // CURRENT CODE → returns { path: worktree/.crew, ... } — non-existent  ← FAILS
      // AFTER FIX    → returns { path: main/.crew, ... }                      ← PASSES
      const info = detectCrewDir(worktree);
      expect(info.path).toBe(join(main, '.crew'));
      expect(existsSync(info.path)).toBe(true);
      expect(info.isLegacy).toBe(false);
    });

    it('local checkout (non-worktree): still finds .crew/ at dest', () => {
      // Normal checkout — no worktree involved
      const repo = join(tmp, 'repo');
      mkdirSync(join(repo, '.git'), { recursive: true });
      mkdirSync(join(repo, '.crew'), { recursive: true });

      const info = detectCrewDir(repo);
      expect(info.path).toBe(join(repo, '.crew'));
      expect(info.isLegacy).toBe(false);
    });

    it('crew init in worktree: does not silently create a duplicate .crew/', () => {
      // Scenario: developer runs `crew init` from inside a worktree where
      // the main checkout already has .crew/.  The init command calls
      // detectCrewDir(cwd) to decide where to write.
      //
      // CURRENT: detectCrewDir returns worktree/.crew (non-existent) → init
      //          scaffolds a NEW .crew/ inside the worktree — silent data split.
      //
      // AFTER FIX: detectCrewDir returns main/.crew → init sees an existing
      //            .crew/ and prompts the user instead of silently duplicating.

      const worktree = join(tmp, 'worktree');
      mkdirSync(worktree);
      writeFileSync(
        join(worktree, '.git'),
        'gitdir: ../main/.git/worktrees/feature-521',
      );

      const main = join(tmp, 'main');
      mkdirSync(join(main, '.git', 'worktrees', 'feature-521'), { recursive: true });
      mkdirSync(join(main, '.crew'), { recursive: true });

      const info = detectCrewDir(worktree);

      // CURRENT CODE → info.path === worktree/.crew  (wrong)  ← FAILS
      // AFTER FIX    → info.path === main/.crew       (correct) ← PASSES
      expect(info.path).not.toBe(join(worktree, '.crew'));
      expect(info.path).toBe(join(main, '.crew'));

      // The worktree directory must NOT have a .crew/ created as a side effect
      expect(existsSync(join(worktree, '.crew'))).toBe(false);
    });
  });

  // ── statSync guard ────────────────────────────────────────────────────────

  describe('statSync guard — crafted .git redirection', () => {
    it('resolveCrew(): crafted .git pointing to non-existent path returns null, not crash', () => {
      const worktree = join(tmp, 'worktree');
      mkdirSync(worktree);
      // gitdir points to a path where mainCheckout/.git does not exist
      writeFileSync(join(worktree, '.git'), 'gitdir: ../nonexistent/.git/worktrees/malicious');

      expect(resolveCrew(worktree)).toBeNull();
    });

    it('detectCrewDir(): crafted .git pointing to non-existent path returns fallback, not crash', () => {
      const worktree = join(tmp, 'worktree');
      mkdirSync(worktree);
      writeFileSync(join(worktree, '.git'), 'gitdir: ../nonexistent/.git/worktrees/malicious');

      const info = detectCrewDir(worktree);
      // Falls back to the default (worktree/.crew) without crashing
      expect(info.path).toBe(join(worktree, '.crew'));
    });
  });
});
