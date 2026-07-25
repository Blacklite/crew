/**
 * Helpers for spawning the Claude Code CLI from crew-managed code paths.
 *
 * Mirror of copilot-invocation.ts for the Claude harness. Claude Code
 * auto-loads the repo-root `.mcp.json` in interactive mode, but project MCP
 * servers require approval that non-interactive (`-p`) runs cannot prompt
 * for. So, like the Copilot `--yolo --additional-mcp-config` workaround,
 * every crew-internal `claude` spawn:
 *   1. passes `--permission-mode bypassPermissions` — suppresses per-tool
 *      consent prompts that would block non-interactive automation, and
 *   2. passes `--mcp-config <abs-path>` when `.mcp.json` exists at teamRoot —
 *      explicitly loads the project's MCP servers so `crew_state_*` tools
 *      register for that session.
 *
 * We only inject when the command being spawned is the bare `claude` binary
 * (i.e. the user did not override via `--agent-cmd`).
 */

import path from 'node:path';
import { existsSync } from 'node:fs';

/**
 * Build the extra CLI args needed to make a non-interactive (`-p`) Claude
 * Code spawn load this project's `.mcp.json` and run unattended.
 *
 * Returns `['--permission-mode', 'bypassPermissions']` always, plus
 * `['--mcp-config', <abs-path>]` when `.mcp.json` exists under `teamRoot`.
 * Returns `[]` when `cmd` is not the bare `claude` binary.
 */
export function buildClaudeInvocationArgs(cmd: string, teamRoot: string | undefined): string[] {
  if (cmd !== 'claude') return [];
  const args = ['--permission-mode', 'bypassPermissions'];
  if (teamRoot) {
    const configPath = path.join(teamRoot, '.mcp.json');
    try {
      if (existsSync(configPath)) {
        args.push('--mcp-config', configPath);
      } else {
        console.warn(
          `[crew] ⚠  .mcp.json not found at ${configPath}. ` +
            `Run \`crew init\` or \`crew upgrade\` to create it. ` +
            `crew_state_* tools will NOT be available in this session.`,
        );
      }
    } catch {
      // best-effort — permission mode alone still applies
    }
  }
  return args;
}

/**
 * Prepend the Claude invocation args to `args`. Returns the full argv list
 * to pass to spawn/execFile for the given cmd. Injection slots these flags
 * BEFORE other args so positional `-p <prompt>` still works correctly.
 *
 * If `--permission-mode` or `--dangerously-skip-permissions` is already
 * present in `args`, the caller's choice wins and the default permission
 * mode is not injected (the MCP config flag still is).
 */
export function withClaudeInvocationArgs(
  cmd: string,
  args: string[],
  teamRoot: string | undefined,
): string[] {
  const extra = buildClaudeInvocationArgs(cmd, teamRoot);
  if (extra.length === 0) return args;
  const callerSetPermissions = args.includes('--permission-mode') || args.includes('--dangerously-skip-permissions');
  const filtered = callerSetPermissions
    ? extra.filter((a, i) => !(a === '--permission-mode' || (i > 0 && extra[i - 1] === '--permission-mode')))
    : extra;
  return [...filtered, ...args];
}
