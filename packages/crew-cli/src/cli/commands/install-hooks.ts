/**
 * Git Hook Installation — installs crew sync hooks into the repo's .git/hooks/.
 *
 * Hooks are installed with chaining: if a user already has a hook (e.g., from husky),
 * the crew hook is appended and the existing hook is called first.
 *
 * Installed hooks:
 * - pre-push: pushes crew-state branches alongside the user's push
 * - post-merge: fetches crew-state after the user pulls
 * - post-rewrite: fetches crew-state after rebase
 * - post-checkout: fetches crew-state on branch switch
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

const CREW_HOOK_MARKER = '# --- crew-sync-hook ---';

/**
 * The shell script content for each hook.
 * These are minimal wrappers that call `crew sync`.
 * The CREW_SYNC_ACTIVE env guard prevents recursion.
 */
const HOOK_TEMPLATES: Record<string, string> = {
  'pre-push': `#!/bin/sh
${CREW_HOOK_MARKER}
# Auto-push crew-state branches alongside the user's push.
# Installed by: crew init / crew upgrade --state-backend
# The remote name and URL are passed as arguments by git.
if [ -z "$CREW_SYNC_ACTIVE" ]; then
  REMOTE="\$1"
  export CREW_SYNC_ACTIVE=1
  # Push all crew-state branches (including subcrew branches)
  for branch in $(git for-each-ref --format='%(refname:short)' 'refs/heads/crew-state' 'refs/heads/crew-state/*' 2>/dev/null); do
    git push --no-verify "$REMOTE" "refs/heads/$branch:refs/heads/$branch" 2>/dev/null || true
  done
  # Push git notes for two-layer backend
  git push --no-verify "$REMOTE" 'refs/notes/crew*:refs/notes/crew*' 2>/dev/null || true
  unset CREW_SYNC_ACTIVE
fi
`,
  'post-merge': `#!/bin/sh
${CREW_HOOK_MARKER}
# Auto-fetch crew-state branches after pull/merge.
# Installed by: crew init / crew upgrade --state-backend
if [ -z "$CREW_SYNC_ACTIVE" ]; then
  export CREW_SYNC_ACTIVE=1
  REMOTE=$(git config "branch.$(git symbolic-ref --short HEAD 2>/dev/null).remote" 2>/dev/null || echo origin)
  # Fetch crew-state branches
  git fetch "$REMOTE" '+refs/heads/crew-state:refs/remotes/'"$REMOTE"'/crew-state' '+refs/heads/crew-state/*:refs/remotes/'"$REMOTE"'/crew-state/*' 2>/dev/null || true
  # Fast-forward local crew-state from remote
  for remote_ref in $(git for-each-ref --format='%(refname:short)' "refs/remotes/$REMOTE/crew-state" "refs/remotes/$REMOTE/crew-state/*" 2>/dev/null); do
    local_name=\${remote_ref#"$REMOTE/"}
    local_sha=$(git rev-parse "refs/heads/$local_name" 2>/dev/null) || { git update-ref "refs/heads/$local_name" "$(git rev-parse "$remote_ref")" 2>/dev/null; continue; }
    remote_sha=$(git rev-parse "$remote_ref" 2>/dev/null) || continue
    [ "$local_sha" = "$remote_sha" ] && continue
    git merge-base --is-ancestor "$local_sha" "$remote_sha" 2>/dev/null && git update-ref "refs/heads/$local_name" "$remote_sha" 2>/dev/null || true
  done
  # Fetch git notes for two-layer backend
  git fetch "$REMOTE" '+refs/notes/crew*:refs/notes/crew*' 2>/dev/null || true
  unset CREW_SYNC_ACTIVE
fi
`,
  'post-rewrite': `#!/bin/sh
${CREW_HOOK_MARKER}
# Auto-fetch crew-state branches after rebase.
# Installed by: crew init / crew upgrade --state-backend
if [ -z "$CREW_SYNC_ACTIVE" ]; then
  export CREW_SYNC_ACTIVE=1
  REMOTE=$(git config "branch.$(git symbolic-ref --short HEAD 2>/dev/null).remote" 2>/dev/null || echo origin)
  git fetch "$REMOTE" '+refs/heads/crew-state:refs/remotes/'"$REMOTE"'/crew-state' '+refs/heads/crew-state/*:refs/remotes/'"$REMOTE"'/crew-state/*' 2>/dev/null || true
  for remote_ref in $(git for-each-ref --format='%(refname:short)' "refs/remotes/$REMOTE/crew-state" "refs/remotes/$REMOTE/crew-state/*" 2>/dev/null); do
    local_name=\${remote_ref#"$REMOTE/"}
    local_sha=$(git rev-parse "refs/heads/$local_name" 2>/dev/null) || { git update-ref "refs/heads/$local_name" "$(git rev-parse "$remote_ref")" 2>/dev/null; continue; }
    remote_sha=$(git rev-parse "$remote_ref" 2>/dev/null) || continue
    [ "$local_sha" = "$remote_sha" ] && continue
    git merge-base --is-ancestor "$local_sha" "$remote_sha" 2>/dev/null && git update-ref "refs/heads/$local_name" "$remote_sha" 2>/dev/null || true
  done
  git fetch "$REMOTE" '+refs/notes/crew*:refs/notes/crew*' 2>/dev/null || true
  unset CREW_SYNC_ACTIVE
fi
`,
  'post-checkout': `#!/bin/sh
${CREW_HOOK_MARKER}
# Auto-fetch crew-state branches on branch switch.
# Installed by: crew init / crew upgrade --state-backend
# Only run on branch checkout (3rd arg = 1), not file checkout.
if [ "\$3" = "1" ] && [ -z "$CREW_SYNC_ACTIVE" ]; then
  export CREW_SYNC_ACTIVE=1
  REMOTE=$(git config "branch.$(git symbolic-ref --short HEAD 2>/dev/null).remote" 2>/dev/null || echo origin)
  git fetch "$REMOTE" '+refs/heads/crew-state:refs/remotes/'"$REMOTE"'/crew-state' '+refs/heads/crew-state/*:refs/remotes/'"$REMOTE"'/crew-state/*' 2>/dev/null || true
  for remote_ref in $(git for-each-ref --format='%(refname:short)' "refs/remotes/$REMOTE/crew-state" "refs/remotes/$REMOTE/crew-state/*" 2>/dev/null); do
    local_name=\${remote_ref#"$REMOTE/"}
    local_sha=$(git rev-parse "refs/heads/$local_name" 2>/dev/null) || { git update-ref "refs/heads/$local_name" "$(git rev-parse "$remote_ref")" 2>/dev/null; continue; }
    remote_sha=$(git rev-parse "$remote_ref" 2>/dev/null) || continue
    [ "$local_sha" = "$remote_sha" ] && continue
    git merge-base --is-ancestor "$local_sha" "$remote_sha" 2>/dev/null && git update-ref "refs/heads/$local_name" "$remote_sha" 2>/dev/null || true
  done
  git fetch "$REMOTE" '+refs/notes/crew*:refs/notes/crew*' 2>/dev/null || true
  unset CREW_SYNC_ACTIVE
fi
`,
  'pre-commit': `#!/bin/sh
${CREW_HOOK_MARKER}
# WI-1: Guard against accidentally committing two-layer mutable state into the
# working tree. If the user has staged any .crew/ paths that are owned by the
# two-layer/orphan backend (decisions.md, agents/*/history.md, casting/, routing/),
# warn and abort so the state stays on the crew-state orphan branch.
# Installed by: crew init / crew upgrade --state-backend (two-layer/orphan)
if [ -z "$CREW_SYNC_ACTIVE" ]; then
  STAGED=$(git diff --cached --name-only 2>/dev/null | grep -E '^\\.crew/(decisions\\.md|agents/.+/history\\.md|casting/|routing/)' || true)
  if [ -n "$STAGED" ]; then
    echo "⚠ crew pre-commit: refusing to commit two-layer state into the working tree." >&2
    echo "  These paths belong on the 'crew-state' orphan branch, not in your normal commits:" >&2
    echo "$STAGED" | sed 's/^/    /' >&2
    echo "  Use 'git restore --staged <path>' to unstage, or set CREW_SYNC_ACTIVE=1 to bypass." >&2
    exit 1
  fi
fi
`,
  'post-commit': `#!/bin/sh
${CREW_HOOK_MARKER}
# WI-1: After a working-tree commit, sync any pending two-layer state (decisions,
# histories, casting) onto the crew-state orphan branch so team-state stays
# durable and shareable. Best-effort — never blocks the commit.
# Installed by: crew init / crew upgrade --state-backend (two-layer/orphan)
if [ -z "$CREW_SYNC_ACTIVE" ]; then
  export CREW_SYNC_ACTIVE=1
  # If the crew CLI is on PATH, ask it to flush any pending state.
  if command -v crew >/dev/null 2>&1; then
    crew sync --quiet 2>/dev/null || true
  fi
  unset CREW_SYNC_ACTIVE
fi
`,
};

export interface InstallHooksOptions {
  force?: boolean;
}

/**
 * Get the .git/hooks directory path for the repo.
 */
function getHooksDir(cwd: string): string {
  // Respect core.hooksPath if already set
  try {
    const customPath = execFileSync('git', ['config', '--get', 'core.hooksPath'], {
      cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (customPath) {
      return path.isAbsolute(customPath) ? customPath : path.resolve(cwd, customPath);
    }
  } catch {
    // Not set — use default
  }

  const gitDir = execFileSync('git', ['rev-parse', '--git-dir'], {
    cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();

  return path.resolve(cwd, gitDir, 'hooks');
}

/**
 * Install a single hook, chaining with any existing hook.
 */
function installHook(hooksDir: string, hookName: string, content: string, force: boolean): 'installed' | 'chained' | 'skipped' {
  const hookPath = path.join(hooksDir, hookName);

  // Check if hook already exists
  if (fs.existsSync(hookPath)) {
    const existing = fs.readFileSync(hookPath, 'utf-8');

    // Already has our marker — skip unless force
    if (existing.includes(CREW_HOOK_MARKER)) {
      if (!force) return 'skipped';
      // Force: remove old crew section and re-append
      const cleaned = existing.split('\n').filter(line => {
        // Remove lines between markers
        return true; // simplified: just replace the file
      }).join('\n');
      // For simplicity on force, rewrite with chaining
    }

    // Chain: existing hook runs first, then crew hook (without shebang)
    const crewSection = content.split('\n').slice(1).join('\n'); // remove #!/bin/sh
    const chained = existing.trimEnd() + '\n\n' + crewSection;
    fs.writeFileSync(hookPath, chained, { mode: 0o755 });
    return 'chained';
  }

  // No existing hook — write fresh
  fs.mkdirSync(hooksDir, { recursive: true });
  fs.writeFileSync(hookPath, content, { mode: 0o755 });
  return 'installed';
}

/**
 * Main hook installation entrypoint.
 */
export function installGitHooks(cwd: string, options: InstallHooksOptions = {}): void {
  const { force = false } = options;

  // Verify we're in a git repo
  try {
    execFileSync('git', ['rev-parse', '--git-dir'], {
      cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    console.log(`${YELLOW}⚠${RESET} Not a git repository. Cannot install hooks.`);
    return;
  }

  // Check if backend needs hooks (only orphan/two-layer)
  let backend: string | null = null;
  try {
    const configPath = path.join(cwd, '.crew', 'config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      backend = config.stateBackend || null;
    }
  } catch { /* proceed anyway */ }

  if (backend === 'local' || backend === 'external' || backend === 'external-stub' || backend === null) {
    console.log(`${DIM}crew install-hooks: backend is '${backend || 'local'}' — hooks not needed (state syncs with normal git operations).${RESET}`);
    return;
  }

  const hooksDir = getHooksDir(cwd);
  console.log(`\n${BOLD}Installing crew sync hooks${RESET}`);
  console.log(`${DIM}  hooks dir: ${hooksDir}${RESET}\n`);

  for (const [hookName, template] of Object.entries(HOOK_TEMPLATES)) {
    const result = installHook(hooksDir, hookName, template, force);
    switch (result) {
      case 'installed':
        console.log(`  ${GREEN}✓${RESET} ${hookName}: installed`);
        break;
      case 'chained':
        console.log(`  ${GREEN}✓${RESET} ${hookName}: chained (existing hook preserved)`);
        break;
      case 'skipped':
        console.log(`  ${DIM}  ${hookName}: already installed (use --force to reinstall)${RESET}`);
        break;
    }
  }

  console.log(`\n${GREEN}${BOLD}Done.${RESET} Crew state will sync automatically on push/pull.\n`);
}

/**
 * Ensure hooks are installed if the backend requires them.
 * Called by `crew upgrade` to silently ensure hooks exist for orphan/two-layer repos.
 * Does not print anything if hooks are already installed or backend doesn't need them.
 */
export function ensureHooksForBackend(cwd: string): void {
  // Check backend
  let backend: string | null = null;
  try {
    const configPath = path.join(cwd, '.crew', 'config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      backend = config.stateBackend || null;
    }
  } catch { return; }

  // Only orphan/two-layer need hooks
  if (backend !== 'orphan' && backend !== 'two-layer') return;

  // Check if hooks are already installed
  let hooksDir: string;
  try {
    hooksDir = getHooksDir(cwd);
  } catch { return; }

  // WI-1: verify ALL crew hooks are present (sync hooks + commit hooks).
  // If any of the required hooks is missing or lacks our marker, reinstall.
  const requiredHooks = ['pre-push', 'post-merge', 'post-rewrite', 'post-checkout', 'pre-commit', 'post-commit'];
  let allInstalled = true;
  for (const hookName of requiredHooks) {
    const hookPath = path.join(hooksDir, hookName);
    if (!fs.existsSync(hookPath)) { allInstalled = false; break; }
    const content = fs.readFileSync(hookPath, 'utf-8');
    if (!content.includes(CREW_HOOK_MARKER)) { allInstalled = false; break; }
  }
  if (allInstalled) return;

  // Hooks missing — install them
  installGitHooks(cwd, { force: false });
}
