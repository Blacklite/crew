/**
 * Tests for resolveCrew() and resolveGlobalCrewPath()
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { resolveCrew, resolveGlobalCrewPath, ensureCrewPath, ensurePersonalCrewDir, clearResolveCrewCache } from '@blacklite/crew-sdk/resolution';

const TMP = join(process.cwd(), `.test-resolution-${randomBytes(4).toString('hex')}`);

function scaffold(...dirs: string[]): void {
  for (const d of dirs) {
    mkdirSync(join(TMP, d), { recursive: true });
  }
}

describe('resolveCrew()', () => {
  beforeEach(() => {
    clearResolveCrewCache();
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
  });

  afterEach(() => {
    clearResolveCrewCache();
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
  });

  it('returns path when .crew/ exists at startDir', () => {
    scaffold('.git', '.crew');
    expect(resolveCrew(TMP)).toBe(join(TMP, '.crew'));
  });

  it('returns null when no .crew/ exists and .git is at startDir', () => {
    scaffold('.git');
    expect(resolveCrew(TMP)).toBeNull();
  });

  it('walks up and finds .crew/ in parent', () => {
    scaffold('.git', '.crew', 'packages', 'packages/app');
    expect(resolveCrew(join(TMP, 'packages', 'app'))).toBe(join(TMP, '.crew'));
  });

  it('stops at .git boundary and does not walk above repo root', () => {
    // outer has .crew, inner is its own repo without .crew
    scaffold('outer/.crew', 'outer/inner/.git');
    expect(resolveCrew(join(TMP, 'outer', 'inner'))).toBeNull();
  });

  it('handles .git worktree file (not directory)', () => {
    scaffold('repo');
    // .git as a file (worktree pointer)
    writeFileSync(join(TMP, 'repo', '.git'), 'gitdir: /somewhere/.git/worktrees/repo');
    mkdirSync(join(TMP, 'repo', 'src'), { recursive: true });
    expect(resolveCrew(join(TMP, 'repo', 'src'))).toBeNull();
  });

  it('finds .crew in worktree that has it', () => {
    scaffold('repo/.crew', 'repo/src');
    writeFileSync(join(TMP, 'repo', '.git'), 'gitdir: /somewhere/.git/worktrees/repo');
    expect(resolveCrew(join(TMP, 'repo', 'src'))).toBe(join(TMP, 'repo', '.crew'));
  });

  it('falls back to main checkout .crew/ when worktree has none', () => {
    // main checkout: TMP/main with .git dir + .crew dir
    mkdirSync(join(TMP, 'main', '.git'), { recursive: true });
    mkdirSync(join(TMP, 'main', '.crew'), { recursive: true });
    // worktree: TMP/main/.worktrees/feature with .git FILE
    mkdirSync(join(TMP, 'main', '.worktrees', 'feature', 'src'), { recursive: true });
    writeFileSync(
      join(TMP, 'main', '.worktrees', 'feature', '.git'),
      'gitdir: ../../.git/worktrees/feature',
    );
    // Starting from worktree src/, should find main checkout's .crew/
    expect(resolveCrew(join(TMP, 'main', '.worktrees', 'feature', 'src')))
      .toBe(join(TMP, 'main', '.crew'));
  });

  it('prefers worktree-local .crew/ over main checkout when both exist', () => {
    // main checkout with .crew/
    mkdirSync(join(TMP, 'main', '.git'), { recursive: true });
    mkdirSync(join(TMP, 'main', '.crew'), { recursive: true });
    // worktree with its own .crew/
    mkdirSync(join(TMP, 'main', '.worktrees', 'feature', '.crew'), { recursive: true });
    mkdirSync(join(TMP, 'main', '.worktrees', 'feature', 'src'), { recursive: true });
    writeFileSync(
      join(TMP, 'main', '.worktrees', 'feature', '.git'),
      'gitdir: ../../.git/worktrees/feature',
    );
    // Worktree-local .crew/ wins
    expect(resolveCrew(join(TMP, 'main', '.worktrees', 'feature', 'src')))
      .toBe(join(TMP, 'main', '.worktrees', 'feature', '.crew'));
  });

  it('defaults to cwd when no argument given', () => {
    // Just verify it doesn't throw
    const result = resolveCrew();
    expect(result === null || typeof result === 'string').toBe(true);
  });

  it('finds .crew/ at root from a deeply nested directory (3+ levels)', () => {
    scaffold('.git', '.crew', 'a/b/c/d');
    expect(resolveCrew(join(TMP, 'a', 'b', 'c', 'd'))).toBe(join(TMP, '.crew'));
  });

  it('finds the nearest .crew/ when multiple exist', () => {
    scaffold('.git', '.crew', 'packages/.crew', 'packages/app');
    // Starting from packages/app, the nearest .crew/ is packages/.crew
    expect(resolveCrew(join(TMP, 'packages', 'app'))).toBe(join(TMP, 'packages', '.crew'));
  });

  it('finds root .crew/ when no closer one exists', () => {
    scaffold('.git', '.crew', 'packages/app/src');
    expect(resolveCrew(join(TMP, 'packages', 'app', 'src'))).toBe(join(TMP, '.crew'));
  });

  it('follows symlinked .crew/ directory', function () {
    if (process.platform === 'win32') {
      // Symlinks on Windows require elevated privileges
      return;
    }
    const { symlinkSync } = require('node:fs') as typeof import('node:fs');
    scaffold('.git', 'real-crew', 'project/src');
    symlinkSync(join(TMP, 'real-crew'), join(TMP, 'project', '.crew'));
    expect(resolveCrew(join(TMP, 'project', 'src'))).toBe(join(TMP, 'project', '.crew'));
  });
});

describe('resolveGlobalCrewPath()', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns a string path', () => {
    const result = resolveGlobalCrewPath();
    expect(typeof result).toBe('string');
    expect(result.endsWith('crew')).toBe(true);
  });

  it('creates the directory if missing', () => {
    const result = resolveGlobalCrewPath();
    expect(existsSync(result)).toBe(true);
  });

  it('respects XDG_CONFIG_HOME on Linux', () => {
    if (process.platform === 'win32' || process.platform === 'darwin') return;

    const customXdg = join(TMP, 'xdg');
    mkdirSync(customXdg, { recursive: true });

    vi.stubEnv('XDG_CONFIG_HOME', customXdg);
    const result = resolveGlobalCrewPath();
    expect(result).toBe(join(customXdg, 'crew'));
    expect(existsSync(result)).toBe(true);
  });

  it('uses APPDATA on Windows', () => {
    if (process.platform !== 'win32') return;

    const appdata = process.env['APPDATA'];
    if (!appdata) return; // APPDATA should always be set on Windows
    const result = resolveGlobalCrewPath();
    expect(result).toBe(join(appdata, 'crew'));
  });
});

describe('ensureCrewPath()', () => {
  const crewRoot = join(TMP, '.crew');

  it('allows a path inside .crew/', () => {
    const p = join(crewRoot, 'agents', 'fenster', 'scratch.md');
    expect(ensureCrewPath(p, crewRoot)).toBe(p);
  });

  it('allows .crew/ root itself', () => {
    expect(ensureCrewPath(crewRoot, crewRoot)).toBe(crewRoot);
  });

  it('allows a path inside the system temp directory', () => {
    const p = join(tmpdir(), 'crew-temp-file.txt');
    expect(ensureCrewPath(p, crewRoot)).toBe(p);
  });

  it('rejects a path at the repo root', () => {
    const repoRoot = join(TMP, 'issue1.txt');
    expect(() => ensureCrewPath(repoRoot, crewRoot)).toThrow(/outside the \.crew\/ directory/);
  });

  it('rejects an arbitrary absolute path', () => {
    const arbitrary = join(TMP, 'some', 'other', 'dir', 'file.txt');
    expect(() => ensureCrewPath(arbitrary, crewRoot)).toThrow(/outside the \.crew\/ directory/);
  });

  it('rejects path traversal that escapes .crew/ via ..', () => {
    const traversal = join(crewRoot, '..', 'evil.txt');
    expect(() => ensureCrewPath(traversal, crewRoot)).toThrow(/outside the \.crew\/ directory/);
  });
});

describe('ensurePersonalCrewDir()', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('creates personal-crew/agents/ and config.json', () => {
    const dir = ensurePersonalCrewDir();
    expect(existsSync(dir)).toBe(true);
    expect(existsSync(join(dir, 'agents'))).toBe(true);
    expect(existsSync(join(dir, 'config.json'))).toBe(true);

    const config = JSON.parse(
      require('node:fs').readFileSync(join(dir, 'config.json'), 'utf-8'),
    );
    expect(config.defaultModel).toBe('auto');
    expect(config.ghostProtocol).toBe(true);
  });

  it('is idempotent — does not overwrite existing config', () => {
    const dir = ensurePersonalCrewDir();
    const configPath = join(dir, 'config.json');

    // Write custom config
    const custom = { defaultModel: 'gpt-4', ghostProtocol: true, custom: true };
    require('node:fs').writeFileSync(configPath, JSON.stringify(custom), 'utf-8');

    // Call again — should not overwrite
    ensurePersonalCrewDir();
    const config = JSON.parse(
      require('node:fs').readFileSync(configPath, 'utf-8'),
    );
    expect(config.custom).toBe(true);
    expect(config.defaultModel).toBe('gpt-4');
  });

  it('returns path inside resolveGlobalCrewPath()', () => {
    const globalDir = resolveGlobalCrewPath();
    const personalDir = ensurePersonalCrewDir();
    expect(personalDir).toBe(join(globalDir, 'personal-crew'));
  });
});
