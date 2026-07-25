#!/usr/bin/env node

/**
 * Crew CLI — entry point for command-line invocation.
 * Separated from src/index.ts so library consumers can import
 * the SDK without triggering CLI argument parsing or process.exit().
 *
 * SDK library exports live in src/index.ts (dist/index.js).
 */

process.env.NODE_NO_WARNINGS = '1';

// Suppress ExperimentalWarning (e.g. node:sqlite) from leaking to terminal.
// process.env.NODE_NO_WARNINGS only works when set BEFORE process starts;
// this runtime hook catches warnings emitted during dynamic imports below.
const _origEmit = process.emit;
process.emit = function (evt: string, ...args: unknown[]) {
  if (evt === 'warning' && (args[0] as { name?: string })?.name === 'ExperimentalWarning') {
    return false;
  }
  return _origEmit.apply(this, [evt, ...args] as Parameters<typeof _origEmit>);
};

// Runtime ESM Import Patcher for @github/copilot-sdk (#265)
// ---------------------------------------------------------
// Patch broken ESM import in @github/copilot-sdk@0.1.32 at runtime before
// Node's module loader attempts resolution.
//
// Root cause: copilot-sdk's session.js imports 'vscode-jsonrpc/node' without
// .js extension, violating Node 24+ strict ESM resolution requirements.
//
// Why runtime patch?: NPX caches packages in ~/.npm/_cacache and skips
// postinstall scripts on cache hits (documented npm behavior). The install-time
// patch in scripts/patch-esm-imports.mjs never runs on npx cache hits, causing
// ERR_MODULE_NOT_FOUND crashes on Node 24+.
//
// This runtime patch intercepts Module._resolveFilename before any imports
// trigger copilot-sdk loading, rewriting the broken import to include .js.
// Works everywhere: npx (cache hit/miss), global install, CI/CD.
//
// Upstream issue: https://github.com/github/copilot-sdk/issues/707
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Module = require('node:module');

const _origResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request: string, parent: unknown, isMain: boolean, options?: unknown) {
  // Intercept the broken import: 'vscode-jsonrpc/node' → 'vscode-jsonrpc/node.js'
  if (request === 'vscode-jsonrpc/node') {
    request = 'vscode-jsonrpc/node.js';
  }
  return _origResolveFilename.call(this, request, parent, isMain, options);
};

// Pre-flight: require Node.js ≥22.5.0 for node:sqlite (#214, #502).
// node:sqlite is used by the Copilot SDK for session storage.
// Fail fast with a clear message rather than letting users hit a cryptic
// ERR_UNKNOWN_BUILTIN_MODULE crash when the SDK loads.
{
  const parts = process.versions.node.split('.').map(Number);
  const major = parts[0] ?? 0;
  const minor = parts[1] ?? 0;
  if (major < 22 || (major === 22 && minor < 5)) {
    console.error(
      `✗ Crew requires Node.js ≥22.5.0 (you have v${process.versions.node}).\n` +
      `  node:sqlite (required by the Copilot SDK for session storage) was added in Node 22.5.0.\n` +
      `  Upgrade at: https://nodejs.org/en/download\n`,
    );
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Top-level signal handlers — safety net for clean exit on Ctrl+C / SIGTERM.
// Individual commands (shell, watch, aspire, rc) register their own handlers
// that run first; these ensure the process never hangs if a command doesn't.
// ---------------------------------------------------------------------------
let _exitingOnSignal = false;
function _handleTopLevelSignal(signal: 'SIGINT' | 'SIGTERM'): void {
  const code = signal === 'SIGINT' ? 130 : 143;
  if (_exitingOnSignal) {
    // Second signal — force exit immediately
    process.exit(code);
  }
  _exitingOnSignal = true;
  // Allow in-flight cleanup handlers a brief window, then force exit
  setTimeout(() => process.exit(code), 3_000).unref();
}
process.on('SIGINT', () => _handleTopLevelSignal('SIGINT'));
process.on('SIGTERM', () => _handleTopLevelSignal('SIGTERM'));

import { FSStorageProvider, resolveCrewState } from '@blacklite/crew-sdk';
import type { CrewStateContext, StateBackendType } from '@blacklite/crew-sdk';
import path from 'node:path';
import { fatal, CrewError } from './cli/core/errors.js';
import { BOLD, RESET, DIM, RED, GREEN, YELLOW } from './cli/core/output.js';
import { runInit } from './cli/core/init.js';
import { runCost } from './cli/commands/cost.js';
import { getPackageVersion } from './cli/core/version.js';
import { printCommandHelp, printGenericCommandHelp } from './cli/core/command-help.js';

// Lazy-load crew-sdk to avoid triggering @github/copilot-sdk import on Node 24+
// (Issue: copilot-sdk has broken ESM imports - vscode-jsonrpc/node without .js extension)
const lazyCrewSdk = () => import('@blacklite/crew-sdk');
const lazyRunShell = () => import('./cli/shell/index.js');

// Use local version resolver instead of importing VERSION from crew-sdk
const VERSION = getPackageVersion();

/**
 * Return the starting directory for crew resolution.
 * Respects --team-root / CREW_TEAM_ROOT env var so that subprocesses
 * (e.g. Copilot CLI bang commands) can locate .crew/ even when their
 * working directory differs from the interactive shell. (#734)
 */
function getCrewStartDir(): string {
  return process.env['CREW_TEAM_ROOT'] || process.cwd();
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  // --team-root flag: override team root for resolution
  const teamRootIdx = args.indexOf('--team-root');
  if (teamRootIdx !== -1 && args[teamRootIdx + 1]) {
    process.env['CREW_TEAM_ROOT'] = args[teamRootIdx + 1]!;
    // Remove --team-root and its value from args
    args.splice(teamRootIdx, 2);
  }
  
  const hasGlobal = args.includes('--global');
  // --economy activates economy mode for this session (sets env var for spawner)
  const hasEconomy = args.includes('--economy');
  if (hasEconomy) {
    process.env['CREW_ECONOMY_MODE'] = '1';
  }
  const rawCmd = args[0];
  const cmd = rawCmd?.trim() || '';

  // --version / -v / version
  // Investigated: routing is correct — cmd matches 'version' directly.
  // "Unknown command: version" reports may be shell-specific (e.g. alias/wrapper
  // prepending flags so args[0] is no longer 'version'). No intercepting router found.
  if (cmd === '--version' || cmd === '-v' || cmd === 'version') {
    console.log(VERSION);
    return;
  }

  // --help / -h / help
  if (cmd === '--help' || cmd === '-h' || cmd === 'help') {
    console.log(`\n${BOLD}crew${RESET} v${VERSION} — Add an AI agent team to any project\n`);
    console.log(`Usage: crew [command] [options]\n`);
    console.log(`Commands:`);
    console.log(`  ${BOLD}(default)${RESET}  Launch interactive shell (no args)`);
    console.log(`             Flags: --global (init in personal crew directory)`);
    console.log(`  ${BOLD}init${RESET}       Initialize Crew (markdown-only, default)`);
    console.log(`             Flags: --sdk (SDK builder syntax)`);
    console.log(`                    --roles (use base roles)`);
    console.log(`                    --global (personal crew dir)`);
    console.log(`                    --no-workflows (skip CI setup)`);
    console.log(`                    --preset <name> (apply a preset after init)`);
    console.log(`                    --state-backend <type> (local|orphan|two-layer)`);
    console.log(`             Usage: init --mode remote <team-repo-path>`);
    console.log(`             Creates .crew/config.json pointing to an external team root`);
    console.log(`  ${BOLD}upgrade${RESET}    Update Crew-owned files to latest version`);
    console.log(`             Overwrites: crew.agent.md, templates dir (.crew/templates/)`);
    console.log(`             Never touches: .crew/ or .ai-team/ (your team state)`);
    console.log(`             Flags: --global (upgrade personal crew)`);
    console.log(`                    --migrate-directory (rename .ai-team/ → .crew/)`);
    console.log(`                    --state-backend <type> (migrate to orphan|two-layer)`);
    console.log(`  ${BOLD}update-check${RESET} Report cached CLI update status (for tooling/CI)`);
    console.log(`             Flags: --json (structured output), --refresh (bypass cache)`);
    console.log(`  ${BOLD}migrate${RESET}    Convert between markdown and SDK-First crew formats`);
    console.log(`             Flags: --to sdk|markdown, --from ai-team, --dry-run`);
    console.log(`  ${BOLD}sync${RESET}       Sync crew-state branch(es) with remote (push/pull/both)`);
    console.log(`             Flags: --push, --pull, --remote <name>, --quiet`);
    console.log(`             No-op for local/worktree backends. Invoked by git hooks.`);
    console.log(`  ${BOLD}status${RESET}     Show which crew is active and why`);
    console.log(`  ${BOLD}roles${RESET}      List built-in Crew roles`);
    console.log(`             Usage: roles [--category <name>] [--search <query>]`);
    console.log(`  ${BOLD}cost${RESET}       Report token usage from orchestration logs`);
    console.log(`             Flags: --all, --agent <name>`);
    console.log(`  ${BOLD}triage${RESET}     Scan for work and categorize issues`);
    console.log(`             Usage: triage [--interval <minutes>] [--execute]`);
    console.log(`             Default: checks every 10 minutes (Ctrl+C to stop)`);
    console.log(`             Core flags:`);
    console.log(`                    --execute (spawn agents to work on issues)`);
    console.log(`                    --copilot-flags "..." (extra copilot CLI flags)`);
    console.log(`                    --max-concurrent N (parallel issue limit, default 1)`);
    console.log(`                    --timeout N (max minutes per issue, default 30)`);
    console.log(`             Capabilities (opt-in via --<name> or config.json):`);
    console.log(`                    --self-pull       git fetch/pull at round start`);
    console.log(`                    --board           project board lifecycle + reconciliation`);
    console.log(`                    --board-project N project number (default 1)`);
    console.log(`                    --monitor-teams   scan Teams for actionable messages`);
    console.log(`                    --monitor-email   scan email for actionable items`);
    console.log(`                    --two-pass        lightweight list then hydrate actionable`);
    console.log(`                    --wave-dispatch   wave-based parallel sub-task dispatch`);
    console.log(`                    --retro           enforce retrospective checks`);
    console.log(`                    --decision-hygiene auto-merge decision inbox`);
    console.log(`             Disable: --no-<capability> overrides config.json`);
    console.log(`             Logging: --log-file <path> tee output to file with timestamps`);
    console.log(`  ${BOLD}loop${RESET}       Prompt-driven continuous work loop`);
    console.log(`             Usage: loop [--init] [--file <path>] [--interval <min>]`);
    console.log(`             Reads loop.md and runs it each cycle (no issues needed)`);
    console.log(`             Flags: --init (generate boilerplate loop.md)`);
    console.log(`                    --file <path> (custom loop file)`);
    console.log(`                    --monitor-email, --monitor-teams (add monitoring)`);
    console.log(`  ${BOLD}cast${RESET}       Show current session cast (project + personal agents)`);
    console.log(`             Usage: cast [--name <name>] [--role <role>] (alias: hire)`);
    console.log(`  ${BOLD}copilot${RESET}    Add/remove the Copilot coding agent (@copilot)`);
    console.log(`             Usage: copilot [--off] [--auto-assign]`);
    console.log(`  ${BOLD}plugin${RESET}     Manage plugin marketplaces`);
    console.log(`             Usage: plugin marketplace add|remove|list|browse`);
    console.log(`  ${BOLD}export${RESET}     Export crew to a portable JSON snapshot`);
    console.log(`             Default: crew-export.json (use --out <path> to override)`);
    console.log(`  ${BOLD}import${RESET}     Import crew from an export file`);
    console.log(`             Usage: import <file> [--force]`);
    console.log(`  ${BOLD}scrub-emails${RESET}  Remove email addresses from Crew state files`);
    console.log(`             Usage: scrub-emails [directory] (default: .ai-team/)`);
    console.log(`  ${BOLD}start${RESET}      Start Copilot with remote access from phone/browser`);
    console.log(`             Usage: start [--tunnel] [--port <n>] [--command <cmd>]`);
    console.log(`                    [copilot flags...]`);
    console.log(`             Examples: start --tunnel --yolo`);
    console.log(`                       start --tunnel --model claude-sonnet-4.6`);
    console.log(`                       start --tunnel --command "gh copilot"`);
    console.log(`  ${BOLD}nap${RESET}        Context hygiene (compress, prune, archive .crew/ state)`);
    console.log(`             Usage: nap [--deep] [--dry-run]`);
    console.log(`             Flags: --deep (thorough cleanup), --dry-run (preview only)`);
    console.log(`  ${BOLD}memory${RESET}     Governed memory operations`);
    console.log(`             Usage: memory write --content "..." --class LOCAL`);
    console.log(`             Diagnostics: --log-level info|debug or --verbose`);
    console.log(`  ${BOLD}state-mcp${RESET}  MCP bridge exposing Crew runtime state tools`);
    console.log(`  ${BOLD}doctor${RESET}     Validate crew setup (check files, config, health)`);
    console.log(`  ${BOLD}consult${RESET}    Enter consult mode with your personal crew`);
    console.log(`             Flags: --status, --check`);
    console.log(`  ${BOLD}extract${RESET}    Extract learnings from consult mode session`);
    console.log(`             Flags: --dry-run, --clean, --yes, --accept-risks`);
    console.log(`  ${BOLD}subcrews${RESET}  Manage Crew SubCrews (multi-Codespace scaling)`);
    console.log(`             Usage: subcrews <list|status|activate <name>>`);
    console.log(`             Aliases: workstreams, streams (deprecated)`);
    console.log(`  ${BOLD}link${RESET}       Link project to a remote team root`);
    console.log(`             Usage: link <team-repo-path>`);
    console.log(`  ${BOLD}externalize${RESET}  Move local crew state to an external team root`);
    console.log(`  ${BOLD}internalize${RESET}  Pull an external team root back into the project`);
    console.log(`  ${BOLD}build${RESET}      Compile crew.config.ts into .crew/ markdown`);
    console.log(`             Flags: --check (validate only), --dry-run (preview)`);
    console.log(`                    --watch (rebuild on change)`);
    console.log(`  ${BOLD}aspire${RESET}     Launch Aspire dashboard for observability`);
    console.log(`             Flags: --docker (force Docker), --port <n> (dashboard port)`);
    console.log(`  ${BOLD}schedule${RESET}   Manage scheduled tasks`);
    console.log(`             Usage: schedule list | run <id> | init | status`);
    console.log(`  ${BOLD}personal${RESET}   Manage your personal crew (ambient agents)`);
    console.log(`             Usage: personal init | list | add <name>`);
    console.log(`                    --role <role> | remove <name>`);
    console.log(`  ${BOLD}preset${RESET}     Manage crew presets (curated agent collections)`);
    console.log(`             Usage: preset list | show <name>`);
    console.log(`                    apply <name> [--force] | save <name>`);
    console.log(`                    init [--remote]`);
    console.log(`  ${BOLD}rc${RESET}         Start Remote Control bridge (phone/browser → Copilot)`);
    console.log(`             Usage: rc [--tunnel] [--port <n>] [--path <dir>]`);
    console.log(`  ${BOLD}copilot-bridge${RESET}  Check Copilot ACP stdio compatibility`);
    console.log(`  ${BOLD}init-remote${RESET}    Link project to remote team root (shorthand)`);
    console.log(`             Usage: init-remote <team-repo-path>`);
    console.log(`  ${BOLD}rc-tunnel${RESET}      Check devtunnel CLI availability`);
    console.log(`  ${BOLD}discover${RESET}   List known crews and their capabilities`);
    console.log(`  ${BOLD}delegate${RESET}   Create work in another crew`);
    console.log(`             Usage: delegate <crew-name> <description>`);
    console.log(`  ${BOLD}registry${RESET}   Manage peer crews for cross-crew discovery (no inheritance)`);
    console.log(`             Usage: registry add <name> <path>`);
    console.log(`                    registry list`);
    console.log(`                    registry remove <name>`);
    console.log(`  ${BOLD}upstream${RESET}    Manage upstream Crew sources`);
    console.log(`             Usage: upstream add <source> [--name <n>] [--ref <branch>]`);
    console.log(`                    upstream remove <name>`);
    console.log(`                    upstream list`);
    console.log(`                    upstream sync [name]`);
    console.log(`  ${BOLD}economy${RESET}    Toggle economy mode (cost-conscious model selection)`);
    console.log(`             Usage: economy [on|off]`);
    console.log(`  ${BOLD}externalize${RESET}  Move .crew/ state out of the working tree`);
    console.log(`             Stores state in platform-local storage`);
    console.log(`             Flags: --key <name> (explicit project key)`);
    console.log(`  ${BOLD}internalize${RESET}  Restore externalized state into the working tree`);

    console.log(`  ${BOLD}version${RESET}    Print installed version`);
    console.log(`  ${BOLD}help${RESET}       Show this help message`);
    console.log(`\nFlags:`);
    console.log(`  ${BOLD}--version, -v${RESET}  Print version`);
    console.log(`  ${BOLD}--help, -h${RESET}     Show help`);
    console.log(`  ${BOLD}--global${RESET}       Use personal (global) crew path (for init, upgrade)`);
    console.log(`  ${BOLD}--economy${RESET}      Activate economy mode for this session (cheaper models)`);
    console.log(`  ${BOLD}--team-root${RESET}    Override team root path for resolution`);
    console.log(`\nInstallation:`);
    console.log(`  npm install --save-dev @blacklite/crew-cli`);
    console.log(`  npm install --save-dev @blacklite/crew-cli@insider\n`);
    return;
  }

  // --help / -h on a subcommand → print command-specific help and exit.
  // Without this intercept the flag was silently dropped and the command
  // would execute for real (sometimes with destructive side effects, e.g.
  // `crew init --help` scaffolding files, or `crew triage --help` starting
  // the polling loop). See #1201.
  if (
    cmd &&
    cmd !== 'help' &&
    cmd !== '--help' &&
    cmd !== '-h' &&
    cmd !== 'version' &&
    cmd !== '--version' &&
    cmd !== '-v' &&
    (args.includes('--help') || args.includes('-h'))
  ) {
    if (!printCommandHelp(cmd, VERSION)) {
      printGenericCommandHelp(cmd);
    }
    return;
  }

  // No args → launch interactive shell; whitespace-only arg → show help
  if (rawCmd === undefined) {
    // Fire-and-forget update check — non-blocking, never delays shell startup
    import('./cli/self-update.js').then(m => m.notifyIfUpdateAvailable(VERSION)).catch(() => {});
    const { runShell } = await lazyRunShell();
    await runShell();
    return;
  }
  if (!cmd) {
    // Whitespace-only arg — show help and exit cleanly
    console.log(`\n${BOLD}crew${RESET} v${VERSION} — Add an AI agent team to any project\n`);
    console.log(`Usage: crew [command] [options]`);
    console.log(`Run 'crew help' for the full command list.\n`);
    return;
  }

  // Route subcommands
  if (cmd === 'init') {
    const modeIdx = args.indexOf('--mode');
    const mode = (modeIdx !== -1 && args[modeIdx + 1]) ? args[modeIdx + 1] : undefined;

    if (mode === 'remote') {
      const teamPath = args[modeIdx + 2];
      if (!teamPath) {
        fatal('Usage: crew init --mode remote <team-repo-path>');
      }
      const { writeRemoteConfig } = await import('./cli/commands/init-remote.js');
      const dest = process.cwd();
      writeRemoteConfig(dest, teamPath);
      await runInit(dest);
      return;
    }

    const sdkMod = hasGlobal ? await lazyCrewSdk() : null;
    const dest = hasGlobal ? sdkMod!.resolveGlobalCrewPath() : process.cwd();
    const noWorkflows = args.includes('--no-workflows');
    const mcpFrontmatter = args.includes('--mcp-frontmatter');
    const sdk = args.includes('--sdk');
    const roles = args.includes('--roles');
    const presetIdx = args.indexOf('--preset');
    const presetName = (presetIdx !== -1 && args[presetIdx + 1]) ? args[presetIdx + 1] : undefined;
    // Parse --state-backend flag for init
    const sbIdx = args.indexOf('--state-backend');
    const initStateBackend = (sbIdx !== -1 && args[sbIdx + 1]) ? args[sbIdx + 1] : undefined;
    // Global init: suppress workflows (no GitHub CI in ~/.config/crew/) and bootstrap personal crew
    runInit(dest, { includeWorkflows: !noWorkflows && !hasGlobal, sdk, roles, isGlobal: hasGlobal, stateBackend: initStateBackend, mcpFrontmatter }).then(async () => {
      if (presetName) {
        const { seedBuiltinPresets, applyPreset } = await import('@blacklite/crew-sdk/presets');
        const { resolvePresetsDir, ensureCrewHome } = await import('@blacklite/crew-sdk/resolution');
        const nodePath = await import('node:path');

        // Auto-initialize crew home + presets if they don't exist yet
        if (!resolvePresetsDir()) {
          console.log(`\n⚙️  No presets found — setting up crew home...`);
          ensureCrewHome();
          seedBuiltinPresets();
          console.log(`✅ Crew home initialized at ${ensureCrewHome()}`);
          console.log(`   Built-in presets ready. Run 'crew preset init --remote' to back with a GitHub repo.\n`);
        } else {
          seedBuiltinPresets();
        }

        const targetAgentsDir = nodePath.join(dest, '.crew', 'agents');
        const results = applyPreset(presetName, targetAgentsDir);
        const installed = results.filter(r => r.status === 'installed');
        const skipped = results.filter(r => r.status === 'skipped');
        const errors = results.filter(r => r.status === 'error');
        if (installed.length > 0) {
          console.log(`✅ Applied preset '${presetName}': ${installed.length} agents installed`);
        }
        if (skipped.length > 0) {
          console.log(`   ${skipped.length} agents skipped (already exist)`);
        }
        if (errors.length > 0 && installed.length === 0) {
          console.error(`❌ Preset '${presetName}' not found. Run 'crew preset list' to see available presets.`);
        }
      }
    }).catch(err => {
      fatal(err.message);
    });
    return;
  }

  if (cmd === 'upgrade') {
    const { runUpgrade, selfUpgradeCli } = await import('./cli/core/upgrade.js');
    const { migrateDirectory } = await import('./cli/core/migrate-directory.js');
    
    const migrateDir = args.includes('--migrate-directory');
    const selfUpgrade = args.includes('--self');
    const forceUpgrade = args.includes('--force');
    const insider = args.includes('--insider');
    const dryRun = args.includes('--dry-run');
    const dest = hasGlobal ? (await lazyCrewSdk()).resolveGlobalCrewPath() : getCrewStartDir();

    // Parse --state-backend for backend migration
    const sbIdx = args.indexOf('--state-backend');
    const upgradeStateBackend = (sbIdx !== -1 && args[sbIdx + 1]) ? args[sbIdx + 1] : undefined;
    
    // Warn when --insider is used without --self (it has no effect on project upgrades)
    if (insider && !selfUpgrade) {
      console.warn('⚠️ --insider only applies with --self (crew upgrade --self --insider). Ignoring.');
    }

    // Handle --migrate-directory flag
    if (migrateDir) {
      await migrateDirectory(dest);
      // Continue with regular upgrade after migration
    }
    
    // Handle --self: upgrade the CLI package itself.
    //
    // UPGRADE-EPERM-FALSE-SUCCESS fix (iter-2): surface a failed self-upgrade
    // instead of printing "✅ Upgraded" after a warning.
    //
    // Iter-4 hardening: when BOTH --self and --state-backend are passed and
    // the self-upgrade fails (e.g. EPERM on a globally-installed CLI that
    // can't be replaced by the current user), still run the state-backend
    // migration. The two operations are independent — failing the npm
    // install must not block the user from upgrading their existing project's
    // on-disk state layout. Failures are tracked and we exit non-zero at the
    // end if either step failed.
    let selfUpgradeFailed: string | null = null;
    if (selfUpgrade) {
      try {
        await selfUpgradeCli({ insider, force: forceUpgrade });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        selfUpgradeFailed = msg;
        if (upgradeStateBackend) {
          // Defer the failure: still attempt the state-backend migration so
          // the user gets at least one of the two operations they asked for.
          console.error(`⚠️ Self-upgrade failed: ${msg}`);
          console.error('   Continuing with --state-backend migration. Self-upgrade can be retried separately.');
        } else {
          console.error(`❌ Self-upgrade failed: ${msg}`);
          process.exit(1);
        }
      }
      if (!selfUpgradeFailed && !upgradeStateBackend) {
        console.log('✅ Upgraded. Please restart your terminal for changes to take effect.');
        return;
      }
      if (!selfUpgradeFailed) {
        console.log('✅ Self-upgrade complete. Running --state-backend migration next…');
      }
    }

    // Run upgrade (skip when --self was successful AND no state-backend asked —
    // that case returned above). Otherwise we always run a project upgrade so
    // hooks/templates are refreshed alongside the backend migration.
    if (!selfUpgrade || upgradeStateBackend) {
      await runUpgrade(dest, {
        migrateDirectory: migrateDir,
        self: selfUpgrade,
        force: forceUpgrade,
        dryRun,
      });
    }

    // Handle --state-backend: migrate backend after upgrade
    if (upgradeStateBackend) {
      const { migrateStateBackend } = await import('./cli/commands/migrate-backend.js');
      try {
        await migrateStateBackend(dest, upgradeStateBackend);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`❌ State-backend migration failed: ${msg}`);
        process.exit(1);
      }
    } else {
      // Ensure hooks are installed for existing orphan/two-layer backends
      const { ensureHooksForBackend } = await import('./cli/commands/install-hooks.js');
      ensureHooksForBackend(dest);
    }

    if (selfUpgradeFailed) {
      // Partial success — state-backend migration completed but self-upgrade
      // did not. Exit non-zero so callers (CI, wrapper scripts) can detect it.
      console.error(`❌ Self-upgrade failed earlier: ${selfUpgradeFailed}`);
      console.error('   The project upgrade and state-backend migration succeeded; retry the self-upgrade manually.');
      process.exit(1);
    }

    return;
  }

  if (cmd === 'update-check') {
    const { runUpdateCheckCommand } = await import('./cli/commands/update-check.js');
    const exitCode = await runUpdateCheckCommand(args.slice(1));
    process.exit(exitCode);
  }

  if (cmd === 'memory') {
    const { runMemoryCommand } = await import('./cli/commands/memory.js');
    await runMemoryCommand(getCrewStartDir(), args.slice(1));
    return;
  }

  if (cmd === 'state-mcp') {
    const { runStateMcp } = await import('./cli/commands/state-mcp.js');
    await runStateMcp(getCrewStartDir());
    return;
  }

  if (cmd === 'sync') {
    const { runSync } = await import('./cli/commands/sync.js');
    const quiet = args.includes('--quiet');
    const remoteIdx = args.indexOf('--remote');
    const remote = (remoteIdx !== -1 && args[remoteIdx + 1]) ? args[remoteIdx + 1] : undefined;
    let direction: 'push' | 'pull' | 'both' = 'both';
    if (args.includes('--push') && !args.includes('--pull')) direction = 'push';
    else if (args.includes('--pull') && !args.includes('--push')) direction = 'pull';
    try {
      await runSync({ direction, remote, cwd: getCrewStartDir(), quiet });
    } catch (err: unknown) {
      if (!quiet) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`crew sync failed: ${msg}`);
      }
      process.exit(1);
    }
    return;
  }

  if (cmd === 'migrate') {
    const { runMigrate } = await import('./cli/commands/migrate.js');
    const toIdx = args.indexOf('--to');
    const to = (toIdx !== -1 && args[toIdx + 1]) ? args[toIdx + 1] as 'sdk' | 'markdown' : undefined;
    const fromIdx = args.indexOf('--from');
    const from = (fromIdx !== -1 && args[fromIdx + 1]) ? args[fromIdx + 1] : undefined;
    const dryRun = args.includes('--dry-run');
    await runMigrate(getCrewStartDir(), { to, from: from as 'ai-team' | undefined, dryRun });
    return;
  }

  // --health flag: show watch instance status and exit
  if (cmd === 'watch' && args.includes('--health')) {
    const { getWatchHealth } = await import('./cli/commands/watch/health.js');
    console.log(getWatchHealth(getCrewStartDir()));
    return;
  }

  if (cmd === 'triage' || cmd === 'watch') {
    const { runWatch, loadWatchConfig, createDefaultRegistry } = await import('./cli/commands/watch/index.js');

    // Parse core flags
    const intervalIdx = args.indexOf('--interval');
    const interval = (intervalIdx !== -1 && args[intervalIdx + 1])
      ? parseInt(args[intervalIdx + 1]!, 10)
      : undefined;

    const execute = args.includes('--execute') ? true : undefined;

    const verbose = args.includes('--verbose') || args.includes('-v');

    const copilotFlagsIdx = args.indexOf('--copilot-flags');
    const copilotFlags = (copilotFlagsIdx !== -1 && args[copilotFlagsIdx + 1])
      ? args[copilotFlagsIdx + 1]
      : undefined;

    const agentCmdIdx = args.indexOf('--agent-cmd');
    const agentCmd = (agentCmdIdx !== -1 && args[agentCmdIdx + 1])
      ? args[agentCmdIdx + 1]
      : undefined;

    // --harness runtime validation: copilot (default) or claude
    const harnessIdx = args.indexOf('--harness');
    const rawHarness = (harnessIdx !== -1 && args[harnessIdx + 1])
      ? args[harnessIdx + 1]
      : undefined;
    if (rawHarness && rawHarness !== 'copilot' && rawHarness !== 'claude') {
      console.error(`⚠️ Invalid --harness "${rawHarness}". Valid: copilot, claude.`);
      process.exit(1);
    }
    const harness = rawHarness as 'copilot' | 'claude' | undefined;

    const maxConcurrentIdx = args.indexOf('--max-concurrent');
    const maxConcurrent = (maxConcurrentIdx !== -1 && args[maxConcurrentIdx + 1])
      ? parseInt(args[maxConcurrentIdx + 1]!, 10)
      : undefined;

    const timeoutIdx = args.indexOf('--timeout');
    const timeout = (timeoutIdx !== -1 && args[timeoutIdx + 1])
      ? parseInt(args[timeoutIdx + 1]!, 10)
      : undefined;

    // --dispatch-mode runtime validation: rejects invalid values with a clear error message
    const dispatchModeIdx = args.indexOf('--dispatch-mode');
    const rawDispatchMode = (dispatchModeIdx !== -1 && args[dispatchModeIdx + 1])
      ? args[dispatchModeIdx + 1]
      : undefined;
    const validModes = ['task', 'fleet', 'hybrid'] as const;
    const dispatchMode = rawDispatchMode && validModes.includes(rawDispatchMode as any)
      ? rawDispatchMode as 'fleet' | 'task' | 'hybrid'
      : rawDispatchMode
        ? (console.error(`⚠️ Invalid --dispatch-mode "${rawDispatchMode}". Valid: task, fleet, hybrid. Defaulting to task.`), undefined)
        : undefined;

    const logFileIdx = args.indexOf('--log-file');
    const logFile = (logFileIdx !== -1 && args[logFileIdx + 1])
      ? args[logFileIdx + 1]
      : undefined;

    const authUserIdx = args.indexOf('--auth-user');
    const authUser = (authUserIdx !== -1 && args[authUserIdx + 1])
      ? args[authUserIdx + 1]
      : undefined;

    // --notify-level runtime validation
    const notifyLevelIdx = args.indexOf('--notify-level');
    const rawNotifyLevel = (notifyLevelIdx !== -1 && args[notifyLevelIdx + 1])
      ? args[notifyLevelIdx + 1]
      : undefined;
    const validNotifyLevels = ['all', 'important', 'none'] as const;
    const notifyLevel = rawNotifyLevel && (validNotifyLevels as readonly string[]).includes(rawNotifyLevel)
      ? rawNotifyLevel as typeof validNotifyLevels[number]
      : rawNotifyLevel
        ? (console.error(`\u26a0\ufe0f Invalid --notify-level "${rawNotifyLevel}". Valid: all, important, none.`), undefined)
        : undefined;

    const overnightStartIdx = args.indexOf('--overnight-start');
    const overnightStart = (overnightStartIdx !== -1 && args[overnightStartIdx + 1])
      ? args[overnightStartIdx + 1]
      : undefined;

    const overnightEndIdx = args.indexOf('--overnight-end');
    const overnightEnd = (overnightEndIdx !== -1 && args[overnightEndIdx + 1])
      ? args[overnightEndIdx + 1]
      : undefined;

    const sentinelFileIdx = args.indexOf('--sentinel-file');
    const sentinelFile = (sentinelFileIdx !== -1 && args[sentinelFileIdx + 1])
      ? args[sentinelFileIdx + 1]
      : undefined;

    // --state-backend runtime validation: reject invalid values upfront
    const stateBackendIdx = args.indexOf('--state-backend');
    const rawStateBackend = (stateBackendIdx !== -1 && args[stateBackendIdx + 1])
      ? args[stateBackendIdx + 1]
      : undefined;
    const validBackends = ['local', 'orphan', 'two-layer', 'external', 'external-stub'] as const;
    if (rawStateBackend && !(validBackends as readonly string[]).includes(rawStateBackend)) {
      console.error(`\u26a0\ufe0f Invalid --state-backend "${rawStateBackend}". Valid: ${validBackends.join(', ')}.`);
      process.exit(1);
    }
    // Legacy 'external' is normalized (with a deprecation warning) inside resolveStateBackend.
    const mappedBackend = rawStateBackend as StateBackendType | undefined;

    // Resolve the full state context (paths + backend) once at entry.
    // Commands can thread this through instead of re-resolving independently.
    const stateContext: CrewStateContext | null = resolveCrewState(getCrewStartDir(), mappedBackend);

    // Build capability overrides from CLI flags and --no-{cap} flags
    const capabilities: Record<string, boolean | Record<string, unknown>> = {};
    const registry = createDefaultRegistry();
    for (const cap of registry.all()) {
      if (args.includes(`--${cap.name}`)) capabilities[cap.name] = true;
      if (args.includes(`--no-${cap.name}`)) capabilities[cap.name] = false;
    }

    // Legacy flag compat: --board-project sets board sub-option
    const boardProjectIdx = args.indexOf('--board-project');
    if (boardProjectIdx !== -1 && args[boardProjectIdx + 1]) {
      const existing = capabilities['board'];
      capabilities['board'] = typeof existing === 'object' && existing !== null
        ? { ...existing, projectNumber: parseInt(args[boardProjectIdx + 1]!, 10) }
        : { projectNumber: parseInt(args[boardProjectIdx + 1]!, 10) };
    }

    // --board-owner sets the project owner (org or user login)
    const boardOwnerIdx = args.indexOf('--board-owner');
    if (boardOwnerIdx !== -1 && args[boardOwnerIdx + 1]) {
      const existing = capabilities['board'];
      capabilities['board'] = typeof existing === 'object' && existing !== null
        ? { ...existing, owner: args[boardOwnerIdx + 1]! }
        : { owner: args[boardOwnerIdx + 1]! };
    }

    // Load config: .crew/config.json merged with CLI overrides
    const config = loadWatchConfig(getCrewStartDir(), {
      interval,
      execute,
      maxConcurrent,
      timeout,
      copilotFlags,
      agentCmd,
      harness,
      verbose,
      dispatchMode,
      logFile,
      authUser,
      notifyLevel,
      overnightStart,
      overnightEnd,
      sentinelFile,
      stateBackend: mappedBackend,
      stateContext,
      capabilities: Object.keys(capabilities).length > 0 ? capabilities : undefined,
    });

    // After parsing all flags, check for positional args that look like prompts.
    // Skip values that follow known value-flags (e.g. "--interval 5" → "5" is not positional).
    const knownValueFlags = new Set([
      '--interval', '--copilot-flags', '--agent-cmd', '--harness', '--max-concurrent', '--timeout', '--board-project', '--board-owner', '--auth-user',
      '--dispatch-mode', '--log-file', '--notify-level', '--overnight-start', '--overnight-end', '--sentinel-file', '--state-backend',
    ]);
    const watchArgStart = args.indexOf(cmd) + 1;
    const watchArgs = args.slice(watchArgStart);
    const positionalArgs: string[] = [];
    for (let i = 0; i < watchArgs.length; i++) {
      const arg = watchArgs[i]!;
      if (knownValueFlags.has(arg)) { i++; continue; }
      if (arg.startsWith('-')) continue;
      positionalArgs.push(arg);
    }
    if (positionalArgs.length > 0 && config.verbose) {
      console.log(`[verbose] ⚠️ Positional args ignored by watch: "${positionalArgs.join(' ')}". Use --execute to process issues.`);
    }

    await runWatch(getCrewStartDir(), config);
    return;
  }

  if (cmd === 'loop') {
    const { runLoop, generateLoopFile } = await import('./cli/commands/loop.js');

    // --init: scaffold a boilerplate loop.md
    if (args.includes('--init')) {
      const fileIdx = args.indexOf('--file');
      const filePath = (fileIdx !== -1 && args[fileIdx + 1]) ? args[fileIdx + 1]! : 'loop.md';
      const { FSStorageProvider } = await import('@blacklite/crew-sdk');
      const storage = new FSStorageProvider();
      const pathMod = await import('node:path');
      const absPath = pathMod.default.resolve(getCrewStartDir(), filePath);
      if (storage.existsSync(absPath)) {
        console.log(`⚠️  ${filePath} already exists. Remove it first to regenerate.`);
      } else {
        storage.writeSync(absPath, generateLoopFile());
        console.log(`✅ Created ${filePath} — open it and set \`configured: true\` to activate.`);
      }
      return;
    }

    // Parse flags
    const fileIdx = args.indexOf('--file');
    const filePath = (fileIdx !== -1 && args[fileIdx + 1]) ? args[fileIdx + 1] : undefined;

    const intervalIdx = args.indexOf('--interval');
    const interval = (intervalIdx !== -1 && args[intervalIdx + 1])
      ? parseInt(args[intervalIdx + 1]!, 10)
      : undefined;

    const timeoutIdx = args.indexOf('--timeout');
    const timeout = (timeoutIdx !== -1 && args[timeoutIdx + 1])
      ? parseInt(args[timeoutIdx + 1]!, 10)
      : undefined;

    const copilotFlagsIdx = args.indexOf('--copilot-flags');
    const copilotFlags = (copilotFlagsIdx !== -1 && args[copilotFlagsIdx + 1])
      ? args[copilotFlagsIdx + 1]
      : undefined;

    const agentCmdIdx = args.indexOf('--agent-cmd');
    const agentCmd = (agentCmdIdx !== -1 && args[agentCmdIdx + 1])
      ? args[agentCmdIdx + 1]
      : undefined;

    const loopHarnessIdx = args.indexOf('--harness');
    const rawLoopHarness = (loopHarnessIdx !== -1 && args[loopHarnessIdx + 1])
      ? args[loopHarnessIdx + 1]
      : undefined;
    if (rawLoopHarness && rawLoopHarness !== 'copilot' && rawLoopHarness !== 'claude') {
      console.error(`⚠️ Invalid --harness "${rawLoopHarness}". Valid: copilot, claude.`);
      process.exit(1);
    }
    const loopHarness = rawLoopHarness as 'copilot' | 'claude' | undefined;

    // Capability flags
    const { createDefaultRegistry: createReg } = await import('./cli/commands/watch/index.js');
    const reg = createReg();
    const capabilities: Record<string, boolean | Record<string, unknown>> = {};
    for (const cap of reg.all()) {
      if (args.includes(`--${cap.name}`)) capabilities[cap.name] = true;
      if (args.includes(`--no-${cap.name}`)) capabilities[cap.name] = false;
    }

    await runLoop(getCrewStartDir(), {
      filePath,
      interval,
      timeout,
      copilotFlags,
      agentCmd,
      harness: loopHarness,
      capabilities,
    });
    return;
  }

  if (cmd === 'cast' || cmd === 'hire') {
    const nameIdx = args.indexOf('--name');
    const name = (nameIdx !== -1 && args[nameIdx + 1]) ? args[nameIdx + 1] : undefined;
    const roleIdx = args.indexOf('--role');
    const role = (roleIdx !== -1 && args[roleIdx + 1]) ? args[roleIdx + 1] : undefined;

    // `crew cast` with no wizard flags shows the roster; `crew hire` always runs the wizard
    if (cmd === 'cast' && !name && !role) {
      const { runCast } = await import('./cli/commands/cast.js');
      await runCast(getCrewStartDir());
      return;
    }

    console.log('🎬 Crew cast — team creation wizard starting... (full implementation pending)');
    if (name) {
      console.log(`   Name: ${name}`);
    }
    if (role) {
      console.log(`   Role: ${role}`);
    }
    return;
  }

  if (cmd === 'export') {
    const { runExport } = await import('./cli/commands/export.js');
    const outIdx = args.indexOf('--out');
    const outPath = (outIdx !== -1 && args[outIdx + 1]) ? args[outIdx + 1] : undefined;
    const repoIdx = args.indexOf('--repo');
    const repoArg = (repoIdx !== -1 && args[repoIdx + 1]) ? args[repoIdx + 1] : undefined;
    const branchIdx = args.indexOf('--branch');
    const branchArg = (branchIdx !== -1 && args[branchIdx + 1]) ? args[branchIdx + 1] : undefined;
    const repoOptions = repoArg ? { repo: repoArg, branch: branchArg } : undefined;
    await runExport(getCrewStartDir(), outPath, repoOptions);
    return;
  }

  if (cmd === 'import') {
    const { runImport } = await import('./cli/commands/import.js');
    const repoIdx = args.indexOf('--repo');
    const repoArg = (repoIdx !== -1 && args[repoIdx + 1]) ? args[repoIdx + 1] : undefined;
    const branchIdx = args.indexOf('--branch');
    const branchArg = (branchIdx !== -1 && args[branchIdx + 1]) ? args[branchIdx + 1] : undefined;
    const hasForce = args.includes('--force');
    if (repoArg) {
      const repoOptions = { repo: repoArg, branch: branchArg };
      await runImport(getCrewStartDir(), '', hasForce, repoOptions);
    } else {
      const importFile = args[1];
      if (!importFile) {
        fatal('Usage: crew import <file> [--force] or crew import --repo owner/repo [--branch branch] [--force]');
      }
      await runImport(getCrewStartDir(), importFile, hasForce);
    }
    return;
  }

  if (cmd === 'plugin') {
    const { runPlugin } = await import('./cli/commands/plugin.js');
    await runPlugin(getCrewStartDir(), args.slice(1));
    return;
  }

  if (cmd === 'copilot') {
    const { runCopilot } = await import('./cli/commands/copilot.js');
    const isOff = args.includes('--off');
    const autoAssign = args.includes('--auto-assign');
    await runCopilot(getCrewStartDir(), { off: isOff, autoAssign });
    return;
  }

  if (cmd === 'scrub-emails') {
    const { scrubEmails } = await import('./cli/core/email-scrub.js');
    const targetDir = args[1] || '.ai-team';
    const count = await scrubEmails(targetDir);
    if (count > 0) {
      console.log(`Scrubbed ${count} email address(es).`);
    } else {
      console.log('No email addresses found.');
    }
    return;
  }

  if (cmd === 'status') {
    const sdk = await lazyCrewSdk();
    const repoCrew = sdk.resolveCrew(getCrewStartDir());
    const globalPath = sdk.resolveGlobalCrewPath();
    const globalCrewDir = path.join(globalPath, '.crew');
    const storage = new FSStorageProvider();
    const globalExists = await storage.exists(globalCrewDir);

    console.log(`\n${BOLD}Crew Status${RESET}\n`);

    if (repoCrew) {
      console.log(`  Active crew: ${BOLD}repo${RESET}`);
      console.log(`  Path:         ${repoCrew}`);
      console.log(`  Reason:       Found .crew/ in repository tree`);
    } else if (globalExists) {
      console.log(`  Active crew: ${BOLD}personal (global)${RESET}`);
      console.log(`  Path:         ${globalCrewDir}`);
      console.log(`  Reason:       No repo .crew/ found; personal crew exists at global path`);
    } else {
      console.log(`  Active crew: ${DIM}none${RESET}`);
      console.log(`  Reason:       No .crew/ found in repo tree or at global path`);
    }

    console.log();
    console.log(`  ${DIM}Repo resolution:   ${repoCrew ?? 'not found'}${RESET}`);
    console.log(`  ${DIM}Global path:       ${globalPath}${RESET}`);
    console.log(`  ${DIM}Global crew:      ${globalExists ? globalCrewDir : 'not initialized'}${RESET}`);
    console.log();

    return;
  }

  if (cmd === 'roles') {
    const { runRoles } = await import('./cli/commands/roles.js');
    await runRoles(args.slice(1));
    return;
  }

  if (cmd === 'cost') {
    const sdk = await lazyCrewSdk();
    const localCrew = sdk.resolveCrew(getCrewStartDir());
    const globalPath = sdk.resolveGlobalCrewPath();
    const globalCrewDir = path.join(globalPath, '.crew');
    const storage = new FSStorageProvider();
    const teamRoot = localCrew
      ? path.resolve(localCrew, '..')
      : (await storage.exists(globalCrewDir) ? globalPath : null);

    if (!teamRoot) {
      fatal('No crew found. Run "crew init" first.');
    }

    await runCost(args.slice(1), teamRoot);
    return;
  }

  if (cmd === 'build') {
    const { runBuild } = await import('./cli/commands/build.js');
    const hasCheck = args.includes('--check');
    const hasDryRun = args.includes('--dry-run');
    const hasWatch = args.includes('--watch');
    await runBuild(getCrewStartDir(), { check: hasCheck, dryRun: hasDryRun, watch: hasWatch });
    return;
  }

  if (cmd === 'subcrews' || cmd === 'workstreams' || cmd === 'streams') {
    const { runSubCrews } = await import('./cli/commands/streams.js');
    await runSubCrews(getCrewStartDir(), args.slice(1));
    return;
  }

  if (cmd === 'start') {
    console.log(`\n${YELLOW}⚠ DEPRECATED:${RESET} "crew start" is deprecated and will be removed in a future release.`);
    console.log(`  Use the GitHub Copilot CLI directly: ${BOLD}gh copilot${RESET}\n`);
    const { runStart } = await import('./cli/commands/start.js');
    const hasTunnel = args.includes('--tunnel');
    const portIdx = args.indexOf('--port');
    const port = (portIdx !== -1 && args[portIdx + 1]) ? parseInt(args[portIdx + 1]!, 10) : 0;
    // Collect all remaining args to pass through to copilot
    const cmdIdx = args.indexOf('--command');
    const customCmd = (cmdIdx !== -1 && args[cmdIdx + 1]) ? args[cmdIdx + 1] : undefined;
    const crewFlags = ['start', '--tunnel', '--port', port.toString(), '--command', customCmd || ''].filter(Boolean);
    const copilotArgs = args.slice(1).filter(a => !crewFlags.includes(a));
    await runStart(getCrewStartDir(), { tunnel: hasTunnel, port, copilotArgs, command: customCmd });
    return;
  }

  if (cmd === 'nap') {
    const { runNap, formatNapReport } = await import('./cli/core/nap.js');
    const sdk = await lazyCrewSdk();
    const startDir = getCrewStartDir();
    // resolveCrew() returns the .crew/ directory itself — use it directly (#207)
    const crewDir = sdk.resolveCrew(startDir);
    if (!crewDir) {
      fatal(`No crew found (searched from ${startDir}). Run "crew init" first, or use --team-root to specify the project directory.`);
    }
    const deep = args.includes('--deep');
    const dryRun = args.includes('--dry-run');
    const result = await runNap({ crewDir, deep, dryRun });
    console.log(formatNapReport(result, !!process.env['NO_COLOR']));
    return;
  }

  if (cmd === 'doctor') {
    const { doctorCommand } = await import('./cli/commands/doctor.js');
    await doctorCommand();
    return;
  }

  if (cmd === 'consult') {
    const { runConsult } = await import('./cli/commands/consult.js');
    await runConsult(getCrewStartDir(), args.slice(1));
    return;
  }

  if (cmd === 'extract') {
    const { runExtract } = await import('./cli/commands/extract.js');
    await runExtract(getCrewStartDir(), args.slice(1));
    return;
  }

  if (cmd === 'aspire') {
    const { runAspire } = await import('./cli/commands/aspire.js');
    const useDocker = args.includes('--docker');
    const portIdx = args.indexOf('--port');
    const port = (portIdx !== -1 && args[portIdx + 1]) ? parseInt(args[portIdx + 1]!, 10) : undefined;
    await runAspire({ docker: useDocker, port });
    return;
  }

  if (cmd === 'link') {
    const { runLink } = await import('./cli/commands/link.js');
    const teamPath = args[1];
    if (!teamPath) {
      fatal('Usage: crew link <team-repo-path>');
    }
    runLink(getCrewStartDir(), teamPath);
    return;
  }

  if (cmd === 'externalize') {
    const { runExternalize } = await import('./cli/commands/externalize.js');
    const rawKey = args.includes('--key') ? args[args.indexOf('--key') + 1] : undefined;
    const projectKey = rawKey ? rawKey.replace(/[\/\\\.]/g, '_') : undefined;
    runExternalize(process.cwd(), projectKey);
    return;
  }

  if (cmd === 'internalize') {
    const { runInternalize } = await import('./cli/commands/externalize.js');
    runInternalize(process.cwd());
    return;
  }

  if (cmd === 'rc' || cmd === 'remote-control') {
    console.log(`\n${YELLOW}⚠ DEPRECATED:${RESET} "crew rc" is deprecated and will be removed in a future release.`);
    console.log(`  Use the GitHub Copilot CLI directly: ${BOLD}gh copilot${RESET}\n`);
    const { runRC } = await import('./cli/commands/rc.js');
    const hasTunnel = args.includes('--tunnel');
    const portIdx = args.indexOf('--port');
    const port = (portIdx !== -1 && args[portIdx + 1]) ? parseInt(args[portIdx + 1]!, 10) : 0;
    const pathIdx = args.indexOf('--path');
    const rcPath = (pathIdx !== -1 && args[pathIdx + 1]) ? args[pathIdx + 1] : undefined;
    await runRC(rcPath || getCrewStartDir(), { tunnel: hasTunnel, port });
    return;
  }

  if (cmd === 'copilot-bridge') {
    const { CopilotBridge } = await import('./cli/commands/copilot-bridge.js');
    const result = await CopilotBridge.checkCompatibility();
    if (result.compatible) {
      console.log(`${GREEN}✓${RESET} ${result.message}`);
    } else {
      console.log(`${YELLOW}⚠${RESET} ${result.message}`);
    }
    return;
  }

  if (cmd === 'init-remote') {
    const { writeRemoteConfig } = await import('./cli/commands/init-remote.js');
    const teamPath = args[1];
    if (!teamPath) {
      fatal('Usage: crew init-remote <team-repo-path>');
    }
    const dest = process.cwd();
    writeRemoteConfig(dest, teamPath);
    await runInit(dest);
    return;
  }

  if (cmd === 'rc-tunnel') {
    const { isDevtunnelAvailable } = await import('./cli/commands/rc-tunnel.js');
    if (isDevtunnelAvailable()) {
      console.log(`${GREEN}✓${RESET} devtunnel CLI is available`);
    } else {
      console.log(`${YELLOW}⚠${RESET} devtunnel CLI not found. Install with: winget install Microsoft.devtunnel`);
    }
    return;
  }

  if (cmd === 'schedule') {
    const { runSchedule } = await import('./cli/commands/schedule.js');
    const subcommand = args[1] || 'list';
    await runSchedule(getCrewStartDir(), subcommand, args.slice(2));
    return;
  }

  if (cmd === 'personal') {
    const { runPersonal } = await import('./cli/commands/personal.js');
    const subcommand = args[1] || 'list';
    await runPersonal(getCrewStartDir(), subcommand, args.slice(2));
    return;
  }

  if (cmd === 'preset') {
    const { runPreset } = await import('./cli/commands/preset.js');
    const subcommand = args[1] || 'list';
    await runPreset(getCrewStartDir(), subcommand, args.slice(2));
    return;
  }

  if (cmd === 'skill') {
    const { runSkill } = await import('./cli/commands/skill.js');
    await runSkill(getCrewStartDir(), args.slice(1));
    return;
  }

  if (cmd === 'upstream') {
    const { upstreamCommand } = await import('./cli/commands/upstream.js');
    await upstreamCommand(args.slice(1));
    return;
  }

  if (cmd === 'discover') {
    const { discoverCommand } = await import('./cli/commands/cross-crew.js');
    await discoverCommand();
    return;
  }

  if (cmd === 'delegate') {
    const { delegateCommand } = await import('./cli/commands/cross-crew.js');
    await delegateCommand(args.slice(1));
    return;
  }

  if (cmd === 'registry') {
    const { registryCommand } = await import('./cli/commands/cross-crew.js');
    await registryCommand(args.slice(1));
    return;
  }

  if (cmd === 'economy') {
    const { runEconomy } = await import('./cli/commands/economy.js');
    await runEconomy(getCrewStartDir(), args.slice(1));
    return;
  }

  if (cmd === 'notes') {
    const { runNotes } = await import('./cli/commands/notes.js');
    await runNotes(getCrewStartDir(), args.slice(1));
    return;
  }

  if (cmd === 'config') {
    const { runConfig } = await import('./cli/commands/config.js');
    await runConfig(getCrewStartDir(), args.slice(1));
    return;
  }

  // Unknown command
  fatal(`Unknown command: ${cmd}\n       Run 'crew doctor' to check your setup, or 'crew help' for usage information.`);
}

main().catch(err => {
  if (err instanceof CrewError) {
    console.error(`${RED}✗${RESET} ${err.message}`);
  } else {
    console.error(err);
  }
  process.exit(1);
});



