/**
 * `crew sync` command — basic unit coverage.
 *
 * Gap 1 from iteration-2 smoke: post-commit hook invokes `crew sync --quiet`
 * but the subcommand did not exist. This test confirms the entrypoint resolves
 * and exits cleanly on local/worktree backends (no-op), and that it correctly
 * detects an orphan-style backend without crashing when there is no remote.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { runSync } from '../packages/crew-cli/src/cli/commands/sync.js';

function mkRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crew-sync-cmd-'));
  execFileSync('git', ['init', '-q', '-b', 'main', dir], { stdio: ['pipe', 'pipe', 'pipe'] });
  execFileSync('git', ['-C', dir, 'config', 'user.email', 'test@example.com']);
  execFileSync('git', ['-C', dir, 'config', 'user.name', 'Test']);
  fs.writeFileSync(path.join(dir, 'README.md'), '# t\n');
  execFileSync('git', ['-C', dir, 'add', '.']);
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', 'init']);
  fs.mkdirSync(path.join(dir, '.crew'), { recursive: true });
  return dir;
}

describe('crew sync command', () => {
  let dir: string;
  beforeEach(() => { dir = mkRepo(); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('no-ops cleanly when backend is local', async () => {
    fs.writeFileSync(path.join(dir, '.crew', 'config.json'),
      JSON.stringify({ version: 1, stateBackend: 'local' }, null, 2));
    await expect(runSync({ direction: 'both', cwd: dir, quiet: true })).resolves.toBeUndefined();
  });

  it('no-ops cleanly when no .crew/config.json exists', async () => {
    fs.rmSync(path.join(dir, '.crew'), { recursive: true, force: true });
    await expect(runSync({ direction: 'both', cwd: dir, quiet: true })).resolves.toBeUndefined();
  });

  it('runs without throwing for two-layer backend even with no remote configured', async () => {
    fs.writeFileSync(path.join(dir, '.crew', 'config.json'),
      JSON.stringify({ version: 1, stateBackend: 'two-layer' }, null, 2));
    // No remote — fetch will fail silently inside syncPull; push will report "no branches".
    await expect(runSync({ direction: 'both', cwd: dir, quiet: true })).resolves.toBeUndefined();
  });
});
