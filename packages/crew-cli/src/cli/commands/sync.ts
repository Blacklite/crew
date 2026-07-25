/**
 * Crew Sync — synchronizes crew-state branches and git notes with a remote.
 *
 * Used directly (`crew sync`) or invoked by git hooks (pre-push, post-merge, post-rewrite).
 * Handles both orphan and two-layer backends transparently.
 *
 * Design:
 * - Fetches remote crew-state branch(es) and fast-forwards local refs
 * - Pushes local crew-state branch(es) to remote
 * - For two-layer, also syncs refs/notes/crew* namespaces
 * - Uses fast-forward-only semantics to avoid data loss on divergence
 * - Recursion guard via CREW_SYNC_ACTIVE env var
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const CREW_SYNC_ENV = 'CREW_SYNC_ACTIVE';
const STATE_BRANCH_PREFIX = 'crew-state';

export interface SyncOptions {
  direction: 'push' | 'pull' | 'both';
  remote?: string;
  cwd?: string;
  quiet?: boolean;
}

/**
 * Detect the configured state backend from .crew/config.json
 */
function detectBackend(cwd: string): string | null {
  try {
    const configPath = path.join(cwd, '.crew', 'config.json');
    const raw = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw);
    return config.stateBackend || null;
  } catch {
    return null;
  }
}

/**
 * Get git repo root for the given working directory.
 */
function getRepoRoot(cwd: string): string {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

/**
 * Discover all local crew-state branches (supports subcrews).
 * Uses strict prefix matching: crew-state or crew-state/<name>
 */
function discoverStateBranches(cwd: string): string[] {
  try {
    const output = execFileSync('git', ['for-each-ref', '--format=%(refname:short)', `refs/heads/${STATE_BRANCH_PREFIX}`], {
      cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const exact = output ? output.split('\n').filter(Boolean) : [];

    // Also find crew-state/* (subcrew branches)
    const subOutput = execFileSync('git', ['for-each-ref', '--format=%(refname:short)', `refs/heads/${STATE_BRANCH_PREFIX}/`], {
      cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const subs = subOutput ? subOutput.split('\n').filter(Boolean) : [];

    return [...exact, ...subs];
  } catch {
    return [];
  }
}

/**
 * Discover remote crew-state branches.
 */
function discoverRemoteStateBranches(cwd: string, remote: string): string[] {
  try {
    const output = execFileSync('git', ['for-each-ref', '--format=%(refname:short)', `refs/remotes/${remote}/${STATE_BRANCH_PREFIX}`], {
      cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const exact = output ? output.split('\n').filter(Boolean) : [];

    const subOutput = execFileSync('git', ['for-each-ref', '--format=%(refname:short)', `refs/remotes/${remote}/${STATE_BRANCH_PREFIX}/`], {
      cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const subs = subOutput ? subOutput.split('\n').filter(Boolean) : [];

    return [...exact, ...subs];
  } catch {
    return [];
  }
}

/**
 * Resolve the default remote for the current branch (or fallback to 'origin').
 */
function resolveRemote(cwd: string): string {
  try {
    const branch = execFileSync('git', ['symbolic-ref', '--short', 'HEAD'], {
      cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const remote = execFileSync('git', ['config', `branch.${branch}.remote`], {
      cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return remote || 'origin';
  } catch {
    return 'origin';
  }
}

/**
 * Pull: fetch remote state branches and fast-forward local refs.
 */
function syncPull(cwd: string, remote: string, backend: string | null, quiet: boolean): void {
  // Fetch crew-state refs from remote
  try {
    execFileSync('git', ['fetch', remote, `+refs/heads/${STATE_BRANCH_PREFIX}:refs/remotes/${remote}/${STATE_BRANCH_PREFIX}`, `+refs/heads/${STATE_BRANCH_PREFIX}/*:refs/remotes/${remote}/${STATE_BRANCH_PREFIX}/*`], {
      cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    // Remote may not have these refs yet — not an error
    if (!quiet) console.log('  No remote crew-state refs found (first push will create them).');
    return;
  }

  // Fast-forward local branches from remote-tracking refs
  const remoteBranches = discoverRemoteStateBranches(cwd, remote);
  for (const remoteBranch of remoteBranches) {
    // remoteBranch is like "origin/crew-state" — extract local name
    const localName = remoteBranch.replace(`${remote}/`, '');
    const localRef = `refs/heads/${localName}`;
    const remoteRef = `refs/remotes/${remoteBranch}`;

    try {
      // Check if local branch exists
      execFileSync('git', ['rev-parse', '--verify', localRef], {
        cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
      });
      // Local exists — try fast-forward
      const localSha = execFileSync('git', ['rev-parse', localRef], {
        cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      const remoteSha = execFileSync('git', ['rev-parse', remoteRef], {
        cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();

      if (localSha === remoteSha) continue; // Already up-to-date

      // Check if fast-forward is possible (local is ancestor of remote)
      try {
        execFileSync('git', ['merge-base', '--is-ancestor', localSha, remoteSha], {
          cwd, stdio: ['pipe', 'pipe', 'pipe'],
        });
        // Fast-forward: update local ref
        execFileSync('git', ['update-ref', localRef, remoteSha], {
          cwd, stdio: ['pipe', 'pipe', 'pipe'],
        });
        if (!quiet) console.log(`  ✓ ${localName}: fast-forwarded`);
      } catch {
        // Diverged — cannot fast-forward
        if (!quiet) console.log(`  ⚠ ${localName}: diverged from remote (manual merge needed)`);
      }
    } catch {
      // Local branch doesn't exist — create it tracking the remote
      const remoteSha = execFileSync('git', ['rev-parse', remoteRef], {
        cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      execFileSync('git', ['update-ref', localRef, remoteSha], {
        cwd, stdio: ['pipe', 'pipe', 'pipe'],
      });
      if (!quiet) console.log(`  ✓ ${localName}: created from remote`);
    }
  }

  // For two-layer: also fetch notes
  if (backend === 'two-layer') {
    try {
      execFileSync('git', ['fetch', remote, '+refs/notes/crew*:refs/notes/crew*'], {
        cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
      });
      if (!quiet) console.log('  ✓ notes synced');
    } catch {
      // Notes may not exist yet
    }
  }
}

/**
 * Push: push local state branches to remote.
 */
function syncPush(cwd: string, remote: string, backend: string | null, quiet: boolean): void {
  const branches = discoverStateBranches(cwd);
  if (branches.length === 0) {
    if (!quiet) console.log('  No local crew-state branches to push.');
    return;
  }

  // Build refspecs for all state branches
  const refspecs = branches.map(b => `refs/heads/${b}:refs/heads/${b}`);

  try {
    execFileSync('git', ['push', '--no-verify', remote, ...refspecs], {
      cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (!quiet) console.log(`  ✓ pushed: ${branches.join(', ')}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? (err as any).stderr || err.message : String(err);
    if (msg.includes('non-fast-forward')) {
      if (!quiet) console.log(`  ⚠ push rejected (non-fast-forward). Run 'crew sync --pull' first.`);
    } else {
      if (!quiet) console.log(`  ⚠ push failed: ${msg}`);
    }
  }

  // For two-layer: also push notes
  if (backend === 'two-layer') {
    try {
      execFileSync('git', ['push', '--no-verify', remote, 'refs/notes/crew*:refs/notes/crew*'], {
        cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
      });
      if (!quiet) console.log('  ✓ notes pushed');
    } catch {
      // Notes may not exist yet — not an error
    }
  }
}

/**
 * Main sync entrypoint.
 */
export async function runSync(options: SyncOptions): Promise<void> {
  // Recursion guard — prevent re-entry when our push triggers pre-push
  if (process.env[CREW_SYNC_ENV]) {
    return;
  }
  process.env[CREW_SYNC_ENV] = '1';

  try {
    const cwd = options.cwd || process.cwd();
    const repoRoot = getRepoRoot(cwd);
    const remote = options.remote || resolveRemote(repoRoot);
    const backend = detectBackend(repoRoot);
    const quiet = options.quiet ?? false;

    // Skip sync for backends that don't need it
    if (backend === 'local' || backend === 'external' || backend === 'external-stub' || backend === null) {
      if (!quiet) console.log(`crew sync: backend is '${backend || 'local'}' — no remote sync needed.`);
      return;
    }

    if (!quiet) console.log(`crew sync: ${options.direction} (remote: ${remote}, backend: ${backend || 'orphan'})`);

    if (options.direction === 'pull' || options.direction === 'both') {
      syncPull(repoRoot, remote, backend, quiet);
    }
    if (options.direction === 'push' || options.direction === 'both') {
      syncPush(repoRoot, remote, backend, quiet);
    }
  } finally {
    delete process.env[CREW_SYNC_ENV];
  }
}
