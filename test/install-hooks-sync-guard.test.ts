/**
 * Regression tests for three install-hooks bugs shipped in 0.11.0-build.6.
 *
 * 1. post-commit exported CREW_SYNC_ACTIVE before invoking `crew sync`. runSync()
 *    early-returns when that variable is set, so the child process was a silent
 *    no-op and crew-state never advanced on commit. Covered by an *effect-level*
 *    test (remote ref must move) — asserting "the hook ran" would have passed
 *    while the bug was live.
 * 2. The pre-commit guard blocked `.crew/casting/` (authoritative identity that
 *    must be committed) and matched a `.crew/routing/` directory that does not
 *    exist (the file is `routing.md`).
 * 3. installHook()'s force path was dead code — `filter(() => true)` then fell
 *    through to the append branch, so `--force` appended a *second* crew section.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  installGitHooks,
  stripCrewSections,
} from '../packages/crew-cli/src/cli/commands/install-hooks.js';
import { runSync } from '../packages/crew-cli/src/cli/commands/sync.js';

const CREW_HOOK_MARKER = '# --- crew-sync-hook ---';
const CREW_HOOK_END_MARKER = '# --- /crew-sync-hook ---';

/** The canonical empty tree object — lets us build commits without a work tree. */
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

function git(cwd: string, args: string[], env?: NodeJS.ProcessEnv): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    ...(env ? { env } : {}),
  }).trim();
}

function configureRepo(dir: string): void {
  git(dir, ['config', 'user.email', 'test@example.com']);
  git(dir, ['config', 'user.name', 'Crew Hook Test']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
}

/** A work repo with a bare `origin`, a `main` commit, and .crew/config.json. */
function mkRepoWithRemote(backend = 'two-layer'): { root: string; work: string; remote: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crew-hookfix-'));
  const remote = path.join(root, 'remote.git');
  const work = path.join(root, 'work');

  execFileSync('git', ['init', '--bare', '-q', '-b', 'main', remote], { stdio: ['pipe', 'pipe', 'pipe'] });
  execFileSync('git', ['init', '-q', '-b', 'main', work], { stdio: ['pipe', 'pipe', 'pipe'] });
  configureRepo(work);

  fs.writeFileSync(path.join(work, 'README.md'), '# test\n');
  git(work, ['add', 'README.md']);
  git(work, ['commit', '-q', '-m', 'init']);
  git(work, ['remote', 'add', 'origin', remote]);
  git(work, ['push', '-q', 'origin', 'main']);

  fs.mkdirSync(path.join(work, '.crew'), { recursive: true });
  fs.writeFileSync(
    path.join(work, '.crew', 'config.json'),
    JSON.stringify({ version: 1, stateBackend: backend }, null, 2),
  );

  return { root, work, remote };
}

/** Create refs/heads/crew-state locally, push it, then advance it by one commit. */
function seedCrewStateAheadOfRemote(work: string): { pushed: string; local: string } {
  const first = git(work, ['commit-tree', EMPTY_TREE, '-m', 'crew state 1']);
  git(work, ['update-ref', 'refs/heads/crew-state', first]);
  git(work, ['push', '-q', 'origin', 'refs/heads/crew-state:refs/heads/crew-state']);

  const second = git(work, ['commit-tree', EMPTY_TREE, '-p', first, '-m', 'crew state 2']);
  git(work, ['update-ref', 'refs/heads/crew-state', second]);

  return { pushed: first, local: second };
}

/**
 * A stand-in `crew` on PATH. It reproduces exactly the contract runSync() has
 * with the environment: bail out when CREW_SYNC_ACTIVE is already set, otherwise
 * push crew-state. The "…mirrors runSync" claim is pinned by the
 * `runSync honours CREW_SYNC_ACTIVE` tests below, which exercise the real code.
 */
function installCrewStub(root: string): string {
  const binDir = path.join(root, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(
    path.join(binDir, 'crew'),
    [
      '#!/bin/sh',
      '# Test stub for `crew sync` — mirrors the CREW_SYNC_ACTIVE guard in runSync().',
      'if [ -n "$CREW_SYNC_ACTIVE" ]; then',
      '  exit 0',
      'fi',
      "git push --no-verify origin 'refs/heads/crew-state:refs/heads/crew-state' >/dev/null 2>&1",
      'exit 0',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
  return binDir;
}

function countSections(content: string): number {
  return content.split(CREW_HOOK_MARKER).length - 1;
}

function readHook(work: string, name: string): string {
  return fs.readFileSync(path.join(work, '.git', 'hooks', name), 'utf-8');
}

/** Run `git commit`, returning the exit status and stderr instead of throwing. */
function tryCommit(work: string, message: string, extraPath?: string): { ok: boolean; stderr: string } {
  const env = { ...process.env };
  if (extraPath) env['PATH'] = `${extraPath}${path.delimiter}${process.env['PATH'] ?? ''}`;
  try {
    execFileSync('git', ['commit', '-q', '-m', message], {
      cwd: work,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
    });
    return { ok: true, stderr: '' };
  } catch (err: unknown) {
    const stderr = (err as { stderr?: string }).stderr ?? '';
    return { ok: false, stderr };
  }
}

describe('Bug 1: post-commit must not export CREW_SYNC_ACTIVE', () => {
  let ctx: { root: string; work: string; remote: string };

  beforeEach(() => { ctx = mkRepoWithRemote('two-layer'); });
  afterEach(() => { fs.rmSync(ctx.root, { recursive: true, force: true }); });

  it('advances refs/heads/crew-state on the remote when a working-tree commit is made', () => {
    const { pushed, local } = seedCrewStateAheadOfRemote(ctx.work);
    expect(git(ctx.remote, ['rev-parse', 'refs/heads/crew-state'])).toBe(pushed);

    installGitHooks(ctx.work, { force: false });
    const binDir = installCrewStub(ctx.root);

    fs.writeFileSync(path.join(ctx.work, 'file.txt'), 'hello\n');
    git(ctx.work, ['add', 'file.txt']);
    const result = tryCommit(ctx.work, 'trigger post-commit', binDir);
    expect(result.ok, result.stderr).toBe(true);

    // The observable effect: the remote crew-state ref moved to the local tip.
    // With the exported guard in place this assertion fails — the stub (like the
    // real `crew sync`) exits early and the remote stays at `pushed`.
    expect(git(ctx.remote, ['rev-parse', 'refs/heads/crew-state'])).toBe(local);
  });

  it('still refuses to run when CREW_SYNC_ACTIVE is inherited from the caller', () => {
    const { pushed } = seedCrewStateAheadOfRemote(ctx.work);
    installGitHooks(ctx.work, { force: false });
    const binDir = installCrewStub(ctx.root);

    fs.writeFileSync(path.join(ctx.work, 'file.txt'), 'hello\n');
    git(ctx.work, ['add', 'file.txt']);
    execFileSync('git', ['commit', '-q', '-m', 'inherited guard'], {
      cwd: ctx.work,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        CREW_SYNC_ACTIVE: '1',
        PATH: `${binDir}${path.delimiter}${process.env['PATH'] ?? ''}`,
      },
    });

    // Re-entry guard preserved: nothing was pushed.
    expect(git(ctx.remote, ['rev-parse', 'refs/heads/crew-state'])).toBe(pushed);
  });

  it('generates a post-commit hook that reads but never sets CREW_SYNC_ACTIVE', () => {
    installGitHooks(ctx.work, { force: false });
    const postCommit = readHook(ctx.work, 'post-commit');

    expect(postCommit).toContain('crew sync --quiet');
    expect(postCommit).toContain('[ -z "$CREW_SYNC_ACTIVE" ]');
    expect(postCommit).not.toContain('export CREW_SYNC_ACTIVE');
  });

  it('leaves the inline-git sync hooks exporting CREW_SYNC_ACTIVE (their guard is legitimate)', () => {
    installGitHooks(ctx.work, { force: false });
    for (const hook of ['pre-push', 'post-merge', 'post-rewrite', 'post-checkout']) {
      expect(readHook(ctx.work, hook), hook).toContain('export CREW_SYNC_ACTIVE=1');
    }
  });
});

describe('Bug 1: runSync honours CREW_SYNC_ACTIVE (the contract the hook must respect)', () => {
  let ctx: { root: string; work: string; remote: string };

  beforeEach(() => { ctx = mkRepoWithRemote('two-layer'); });
  afterEach(() => {
    delete process.env['CREW_SYNC_ACTIVE'];
    fs.rmSync(ctx.root, { recursive: true, force: true });
  });

  it('pushes crew-state when the variable is unset', async () => {
    const { local } = seedCrewStateAheadOfRemote(ctx.work);
    await runSync({ direction: 'push', cwd: ctx.work, quiet: true });
    expect(git(ctx.remote, ['rev-parse', 'refs/heads/crew-state'])).toBe(local);
  });

  it('does nothing when the variable is already set', async () => {
    const { pushed } = seedCrewStateAheadOfRemote(ctx.work);
    process.env['CREW_SYNC_ACTIVE'] = '1';
    await runSync({ direction: 'push', cwd: ctx.work, quiet: true });
    expect(git(ctx.remote, ['rev-parse', 'refs/heads/crew-state'])).toBe(pushed);
  });
});

describe('Bug 2: pre-commit guard scope', () => {
  let ctx: { root: string; work: string; remote: string };

  beforeEach(() => {
    ctx = mkRepoWithRemote('two-layer');
    installGitHooks(ctx.work, { force: false });
  });
  afterEach(() => { fs.rmSync(ctx.root, { recursive: true, force: true }); });

  function stage(relPath: string, contents = 'x\n'): void {
    const full = path.join(ctx.work, relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, contents);
    git(ctx.work, ['add', '-f', relPath]);
  }

  it('allows committing .crew/casting/ — casting is identity, not two-layer state', () => {
    stage('.crew/casting/registry.json', '{}\n');
    stage('.crew/casting/history.json', '[]\n');
    const result = tryCommit(ctx.work, 'add casting identity');
    expect(result.ok, result.stderr).toBe(true);
  });

  it('allows committing .crew/routing.md — static config, and no routing/ dir exists', () => {
    stage('.crew/routing.md', '# routing\n');
    const result = tryCommit(ctx.work, 'add routing');
    expect(result.ok, result.stderr).toBe(true);
  });

  it('still blocks .crew/decisions.md', () => {
    stage('.crew/decisions.md', '# decisions\n');
    const result = tryCommit(ctx.work, 'add decisions');
    expect(result.ok).toBe(false);
    expect(result.stderr).toContain('crew pre-commit');
    expect(result.stderr).toContain('.crew/decisions.md');
  });

  it('still blocks .crew/agents/*/history.md', () => {
    stage('.crew/agents/scribe/history.md', '# history\n');
    const result = tryCommit(ctx.work, 'add history');
    expect(result.ok).toBe(false);
    expect(result.stderr).toContain('.crew/agents/scribe/history.md');
  });

  it('blocks the mutable file but leaves casting committable in the same tree', () => {
    stage('.crew/casting/registry.json', '{}\n');
    stage('.crew/decisions.md', '# decisions\n');
    expect(tryCommit(ctx.work, 'mixed').ok).toBe(false);

    git(ctx.work, ['restore', '--staged', '.crew/decisions.md']);
    const result = tryCommit(ctx.work, 'casting only');
    expect(result.ok, result.stderr).toBe(true);
  });

  it('guards exactly the paths in the crew-state .gitignore block', () => {
    const preCommit = readHook(ctx.work, 'pre-commit');
    // Inspect the grep pattern itself, not the surrounding explanatory comments.
    const grepLine = preCommit.split('\n').find(l => l.includes('git diff --cached'));
    expect(grepLine).toBeDefined();
    expect(grepLine).toContain('decisions\\.md');
    expect(grepLine).toContain('agents/.+/history\\.md');
    expect(grepLine).not.toContain('casting/');
    expect(grepLine).not.toContain('routing/');
  });
});

describe('Bug 3: --force replaces the crew section instead of appending', () => {
  let ctx: { root: string; work: string; remote: string };
  const ALL_HOOKS = ['pre-push', 'post-merge', 'post-rewrite', 'post-checkout', 'pre-commit', 'post-commit'];

  beforeEach(() => { ctx = mkRepoWithRemote('two-layer'); });
  afterEach(() => { fs.rmSync(ctx.root, { recursive: true, force: true }); });

  it('leaves exactly one crew section after repeated forced reinstalls', () => {
    installGitHooks(ctx.work, { force: false });
    installGitHooks(ctx.work, { force: true });
    installGitHooks(ctx.work, { force: true });

    for (const hook of ALL_HOOKS) {
      const content = readHook(ctx.work, hook);
      expect(countSections(content), `${hook} sections`).toBe(1);
      expect(content.split(CREW_HOOK_END_MARKER).length - 1, `${hook} end markers`).toBe(1);
      expect(content.startsWith('#!/bin/sh'), `${hook} shebang`).toBe(true);
    }
  });

  it('re-installed hooks are still functional shell scripts', () => {
    installGitHooks(ctx.work, { force: false });
    installGitHooks(ctx.work, { force: true });

    // A duplicated crew section would run the guard twice; a mangled one would
    // fail to parse. Both show up as a non-zero `sh -n` / commit failure.
    for (const hook of ALL_HOOKS) {
      execFileSync('sh', ['-n', path.join(ctx.work, '.git', 'hooks', hook)], { stdio: ['pipe', 'pipe', 'pipe'] });
    }
    fs.writeFileSync(path.join(ctx.work, 'file.txt'), 'hello\n');
    git(ctx.work, ['add', 'file.txt']);
    expect(tryCommit(ctx.work, 'after force reinstall').ok).toBe(true);
  });

  it('preserves a pre-existing user hook across a forced reinstall', () => {
    const hooksDir = path.join(ctx.work, '.git', 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });
    fs.writeFileSync(
      path.join(hooksDir, 'pre-commit'),
      '#!/bin/sh\n# husky\necho "user hook ran"\n',
      { mode: 0o755 },
    );

    installGitHooks(ctx.work, { force: false });
    installGitHooks(ctx.work, { force: true });

    const content = readHook(ctx.work, 'pre-commit');
    expect(countSections(content)).toBe(1);
    expect(content).toContain('echo "user hook ran"');
    expect(content.split('echo "user hook ran"').length - 1).toBe(1);
  });

  it('cleans up hooks installed before the end marker existed', () => {
    const hooksDir = path.join(ctx.work, '.git', 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });
    // Shape written by <= 0.11.0-build.6: user content, then an unterminated
    // crew section appended to the end of the file.
    fs.writeFileSync(
      path.join(hooksDir, 'post-commit'),
      `#!/bin/sh\necho "user hook ran"\n\n${CREW_HOOK_MARKER}\n# legacy crew body\nexport CREW_SYNC_ACTIVE=1\n`,
      { mode: 0o755 },
    );

    installGitHooks(ctx.work, { force: true });

    const content = readHook(ctx.work, 'post-commit');
    expect(countSections(content)).toBe(1);
    expect(content).toContain('echo "user hook ran"');
    expect(content).not.toContain('# legacy crew body');
    expect(content).not.toContain('export CREW_SYNC_ACTIVE');
  });

  it('skips without --force when a crew section is already present', () => {
    installGitHooks(ctx.work, { force: false });
    const before = readHook(ctx.work, 'post-commit');
    installGitHooks(ctx.work, { force: false });
    expect(readHook(ctx.work, 'post-commit')).toBe(before);
  });
});

describe('stripCrewSections', () => {
  it('removes a terminated section and keeps surrounding content', () => {
    const input = [
      '#!/bin/sh',
      'echo before',
      CREW_HOOK_MARKER,
      'echo crew',
      CREW_HOOK_END_MARKER,
      'echo after',
      '',
    ].join('\n');
    expect(stripCrewSections(input)).toBe('#!/bin/sh\necho before\necho after\n');
  });

  it('removes every section when a previous --force duplicated them', () => {
    const section = `${CREW_HOOK_MARKER}\necho crew\n${CREW_HOOK_END_MARKER}`;
    const input = `#!/bin/sh\necho user\n${section}\n${section}\n`;
    const out = stripCrewSections(input);
    expect(out).not.toContain('echo crew');
    expect(out).toContain('echo user');
  });

  it('treats an unterminated (pre-end-marker) section as running to EOF', () => {
    const input = `#!/bin/sh\necho user\n\n${CREW_HOOK_MARKER}\necho legacy crew\n`;
    expect(stripCrewSections(input).trimEnd()).toBe('#!/bin/sh\necho user');
  });

  it('is a no-op for hooks with no crew section', () => {
    const input = '#!/bin/sh\necho user\n';
    expect(stripCrewSections(input)).toBe(input);
  });
});
