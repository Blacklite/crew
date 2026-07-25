/**
 * Init command implementation — uses SDK
 * Scaffolds a new Crew project with templates, workflows, and directory structure
 */

import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { FSStorageProvider } from '@blacklite/crew-sdk';
import { detectCrewDir, resolveWorktreeMainCheckout } from './detect-crew-dir.js';
import { success, BOLD, RESET, YELLOW, GREEN, DIM } from './output.js';
import { fatal } from './errors.js';
import { detectProjectType } from './project-type.js';
import { getPackageVersion, stampVersion } from './version.js';
import { initCrew as sdkInitCrew, cleanupOrphanInitPrompt, ensurePersonalCrewDir, resolveGlobalCrewPath, resolvePersonalCrewDir, clearResolveCrewCache, type InitOptions } from '@blacklite/crew-sdk';
import { installGitHooks } from '../commands/install-hooks.js';
import { liftInitMutableStateOntoOrphan } from '../commands/migrate-backend.js';
import { resolveCrewStateMcpSpec } from './mcp-spec.js';
import { describeMcpSpec } from './upgrade.js';
import { ensureCrewStateMcpInRoot, tombstoneStaleCrewStateInProjectMcp } from './mcp-root.js';
import {
  readTeamMd,
  writeTeamMd,
  hasCopilot,
  insertCopilotSection,
} from './team-md.js';

const storage = new FSStorageProvider();

const CYAN = '\x1b[36m';

/**
 * Detect if the target directory is inside a parent git repo.
 * Returns the normalized git root path if a parent repo is detected,
 * or null if dest IS the git root or no git repo exists.
 */
export function detectParentGitRepo(dest: string): string | null {
  try {
    const gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: dest, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim().replace(/\//g, path.sep);
    const normalDest = path.resolve(dest);
    const normalGitRoot = path.resolve(gitRoot);
    if (normalDest.toLowerCase() !== normalGitRoot.toLowerCase()) {
      return normalGitRoot;
    }
  } catch {
    // No git available or not in a git repo
  }
  return null;
}

/** True when animations should be suppressed (NO_COLOR, dumb term, non-TTY). */
export function isInitNoColor(): boolean {
  return (
    (process.env['NO_COLOR'] != null && process.env['NO_COLOR'] !== '') ||
    process.env['TERM'] === 'dumb' ||
    !process.stdout.isTTY
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Typewriter effect — falls back to instant print when animations disabled. */
export async function typewrite(text: string, charMs: number = 8): Promise<void> {
  if (isInitNoColor()) {
    process.stdout.write(text + '\n');
    return;
  }
  for (const char of text) {
    process.stdout.write(char);
    await sleep(charMs);
  }
  process.stdout.write('\n');
}

/** Staggered list reveal — each line appears with a short delay. */
async function revealLines(lines: string[], delayMs: number = 30): Promise<void> {
  for (const line of lines) {
    if (!isInitNoColor()) await sleep(delayMs);
    console.log(line);
  }
}

/** The structures that init creates, for the ceremony summary. */
const INIT_LANDMARKS = [
  { emoji: '📁', label: 'Team workspace' },
  { emoji: '📋', label: 'Skills & ceremonies' },
  { emoji: '🔧', label: 'Workflows & CI' },
  { emoji: '🧠', label: 'Identity & wisdom' },
  { emoji: '🤖', label: 'Copilot agent prompt' },
];

/**
 * Show deprecation warning for .ai-team/ directory
 */
function showDeprecationWarning(): void {
  console.log();
  console.log(`${YELLOW}⚠️  DEPRECATION: .ai-team/ is deprecated and will be removed in v1.0.0${RESET}`);
  console.log(`${YELLOW}    Run 'npx @blacklite/crew-cli upgrade --migrate-directory' to migrate to .crew/${RESET}`);
  console.log(`${YELLOW}    Details: https://github.com/Blacklite/crew/issues/101${RESET}`);
  console.log();
}

/**
 * Options for the init command.
 */
export interface RunInitOptions {
  /** Project description prompt — stored for REPL auto-casting. */
  prompt?: string;
  /** If true, disable extraction from consult sessions (read-only consultations) */
  extractionDisabled?: boolean;
  /** If false, skip GitHub workflow installation (default: true) */
  includeWorkflows?: boolean;
  /** If true, generate crew.config.ts with SDK builder syntax (default: false) */
  sdk?: boolean;
  /** If true, use built-in base roles instead of fictional universe casting (default: false) */
  roles?: boolean;
  /** If true, this is a global (personal crew) init — bootstrap personal-crew/ dir */
  isGlobal?: boolean;
  /** State backend to configure at init time (local, orphan, two-layer) */
  stateBackend?: string;
  /** If true, write MCP server config into crew.agent.md frontmatter instead of .copilot/mcp-config.json */
  mcpFrontmatter?: boolean;
}

/**
 * Main init command handler
 */
export async function runInit(dest: string, options: RunInitOptions = {}): Promise<void> {
  const version = getPackageVersion();

  console.log();
  await typewrite(`${DIM}Let's build your team.${RESET}`, 8);
  console.log();

  // Detect project type
  const projectType = detectProjectType(dest);

  // ── Monorepo / subfolder detection ───────────────────────────────
  // Copilot resolves .github/agents/ relative to the git root.
  // If CWD is a subfolder of a larger repo (monorepo), we place
  // crew.agent.md at the git root and .crew/ in the subfolder.
  // Never run `git init` — it creates broken nested repos (#939).
  let agentFileRoot = dest; // default: place agent file relative to dest
  const parentGitRoot = detectParentGitRepo(dest);
  if (parentGitRoot) {
    console.log();
    console.log(`${CYAN}${BOLD}📦 Monorepo detected${RESET}`);
    console.log(`${DIM}   Git root:  ${parentGitRoot}${RESET}`);
    console.log(`${DIM}   You're in: ${path.resolve(dest)}${RESET}`);
    console.log();
    console.log(`${DIM}crew.agent.md → git root (.github/agents/)${RESET}`);
    console.log(`${DIM}.crew/        → here (${path.basename(path.resolve(dest))}/)${RESET}`);
    console.log();
    // Place the agent file at the git root so Copilot can find it.
    // Team state (.crew/) stays in cwd — resolved via cwd at runtime.
    agentFileRoot = parentGitRoot;
  }

  // Detect crew directory
  const crewInfo = detectCrewDir(dest);

  // ── Worktree guard ────────────────────────────────────────────────
  // Prevent silently scaffolding a duplicate .crew/ when running init
  // from a git worktree that already has .crew/ in the main checkout.
  const mainCheckout = resolveWorktreeMainCheckout(dest);
  if (mainCheckout) {
    const mainCrewDir = path.join(mainCheckout, '.crew');
    if (storage.existsSync(mainCrewDir)) {
      console.log();
      console.log(`${YELLOW}${BOLD}⚠  Git worktree detected${RESET}`);
      console.log(`${YELLOW}   Main checkout: ${mainCheckout}${RESET}`);
      console.log(`${YELLOW}   .crew/ already exists there.${RESET}`);
      console.log();
      console.log(`  ${BOLD}[s]${RESET} Use shared .crew/ from main checkout ${DIM}(recommended)${RESET}`);
      console.log(`  ${BOLD}[l]${RESET} Create a worktree-local .crew/ in this branch`);
      console.log();

      let useShared = true;
      if (process.stdin.isTTY) {
        const { createInterface } = await import('node:readline/promises');
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        try {
          const answer = (await rl.question(`  Strategy [s/l, default: s]: `)).trim().toLowerCase();
          useShared = answer !== 'l' && answer !== 'local';
        } finally {
          rl.close();
        }
      } else {
        console.log(`  ${DIM}Non-interactive mode — defaulting to shared strategy.${RESET}`);
      }

      if (useShared) {
        console.log();
        console.log(`${GREEN}${BOLD}✓${RESET} Using shared .crew/ from ${mainCheckout}`);
        console.log(`${DIM}  No changes made. Run ${CYAN}${BOLD}copilot --agent crew${RESET}${DIM} commands from the main checkout.${RESET}`);
        console.log();
        return;
      }

      // Local strategy: fall through to scaffold .crew/ in this worktree
      console.log();
      console.log(`${GREEN}${BOLD}→${RESET} Creating worktree-local .crew/ in ${dest}`);
      console.log();
    }
  }

  // Show deprecation warning if using .ai-team/
  if (crewInfo.isLegacy) {
    showDeprecationWarning();
  }

  // Build SDK options
  const initOptions: InitOptions = {
    teamRoot: dest,
    agentFileRoot,
    projectName: path.basename(dest) || 'my-project',
    agents: [
      {
        name: 'scribe',
        role: 'scribe',
        displayName: 'Scribe',
      },
      {
        name: 'ralph',
        role: 'ralph',
        displayName: 'Ralph',
      },
      {
        name: 'Rai',
        role: 'Rai',
        displayName: 'Rai',
      },
      {
        name: 'fact-checker',
        role: 'fact-checker',
        displayName: 'Fact Checker',
      }
    ],
    configFormat: options.sdk ? 'sdk' : 'markdown',
    skipExisting: true,
    includeWorkflows: options.includeWorkflows !== false,
    includeTemplates: true,
    includeMcpConfig: true,
    mcpConfigMode: options.mcpFrontmatter ? 'agent-frontmatter' : 'copilot-file',
    projectType: projectType as any,
    version,
    prompt: options.prompt,
    extractionDisabled: options.extractionDisabled,
    roles: options.roles,
    stateBackend: options.stateBackend,
  };

  // Handle SIGINT to cleanup orphan .init-prompt
  const crewDir = crewInfo.path;
  const sigintHandler = async () => {
    await cleanupOrphanInitPrompt(crewDir);
    process.exit(130);
  };
  process.on('SIGINT', sigintHandler);

  // Run SDK init — the CLI init is a thin ceremony wrapper around sdkInitCrew(),
  // which handles all file scaffolding, template expansion, and directory creation.
  // This separation allows the SDK to be used headlessly (e.g. in tests or CI)
  // while the CLI adds interactive UX (typewriter, celebrations, worktree guard).
  let result;
  try {
    result = await sdkInitCrew(initOptions);
  } catch (err: unknown) {
    process.off('SIGINT', sigintHandler);
    const message = err instanceof Error ? err.message : String(err);
    fatal(`Failed to initialize crew: ${message}`);
    return; // Unreachable but makes TS happy
  }

  process.off('SIGINT', sigintHandler);

  // Init just created `.crew/` (and possibly `.github/agents/`) on disk.
  // Any subsequent code in this process that calls resolveCrew()/findCrewDir()
  // would otherwise be served the cached "not found" result from before init
  // ran. Drop the resolution cache so the new directory is observed
  // immediately instead of after the 5-second TTL.
  clearResolveCrewCache();

  // ── Personal crew linking ─────────────────────────────────────────
  // When a personal crew directory exists and this is a repo init (not global),
  // set teamRoot in config.json to point to the global crew root that contains
  // `.crew/`. This enables "remote mode" resolution so the project inherits
  // team identity from the personal crew. (See #984, #1010)
  if (!options.isGlobal) {
    const personalDir = resolvePersonalCrewDir();
    if (personalDir) {
      const configPath = path.join(crewDir, 'config.json');
      let config: Record<string, unknown> = {};
      try {
        const raw = storage.readSync(configPath);
        if (raw) config = JSON.parse(raw);
      } catch { /* start fresh */ }
      if (!config['teamRoot']) {
        config['teamRoot'] = resolveGlobalCrewPath();
        storage.writeSync(configPath, JSON.stringify(config, null, 2) + '\n');
      }
    }
  }

  // Ensure version is fully stamped in crew.agent.md
  const agentPath = path.join(agentFileRoot, '.github', 'agents', 'crew.agent.md');
  if (storage.existsSync(agentPath)) {
    stampVersion(agentPath, version);
  }

  // Persist --roles flag for the REPL to pick up during casting
  if (options.roles) {
    const rolesMarker = path.join(crewDir, '.init-roles');
    storage.writeSync(rolesMarker, '1');
    success(`base roles enabled — team will use built-in role catalog`);
  }

  // Configure state backend if specified at init time
  if (options.stateBackend) {
    const validBackends = ['local', 'orphan', 'two-layer', 'external', 'external-stub'];
    if (validBackends.includes(options.stateBackend)) {
      // 'external' is the legacy name for the 'external-stub' placeholder —
      // write the canonical name so configs don't trip the deprecation warning.
      const backendValue = options.stateBackend === 'external' ? 'external-stub' : options.stateBackend;
      const configPath = path.join(crewDir, 'config.json');
      let config: Record<string, unknown> = {};
      try {
        const raw = storage.readSync(configPath);
        if (raw) config = JSON.parse(raw);
      } catch { /* start fresh */ }
      config['stateBackend'] = backendValue;
      storage.writeSync(configPath, JSON.stringify(config, null, 2) + '\n');
      success(`state backend: ${backendValue}`);

      // Auto-create orphan branch for orphan/two-layer backends
      // Uses git plumbing (mktree + commit-tree + update-ref) so the working tree is never touched.
      if (options.stateBackend === 'orphan' || options.stateBackend === 'two-layer') {
        try {
          execFileSync('git', ['rev-parse', '--verify', 'refs/heads/crew-state'], {
            cwd: dest, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
          });
          success(`crew-state branch already exists`);
        } catch {
          try {
            // Seed a README blob so the branch isn't completely empty
            const readmeContent = '# Crew State\n\nThis orphan branch stores mutable crew state.\nIt is managed automatically and should not be edited by hand.\n';
            const blobHash = execFileSync('git', ['hash-object', '-w', '--stdin'], {
              cwd: dest, encoding: 'utf-8', input: readmeContent, stdio: ['pipe', 'pipe', 'pipe'],
            }).trim();
            // Build a tree containing the README
            const treeInput = `100644 blob ${blobHash}\tREADME.md\n`;
            const treeHash = execFileSync('git', ['mktree'], {
              cwd: dest, encoding: 'utf-8', input: treeInput, stdio: ['pipe', 'pipe', 'pipe'],
            }).trim();
            // Create the root commit (no parent → orphan)
            const commitHash = execFileSync('git', ['commit-tree', treeHash, '-m', 'init: crew-state orphan branch'], {
              cwd: dest, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
            }).trim();
            // Point the branch ref at the new commit
            execFileSync('git', ['update-ref', 'refs/heads/crew-state', commitHash], {
              cwd: dest, stdio: ['pipe', 'pipe', 'pipe'],
            });
            success(`crew-state orphan branch created (working tree untouched)`);
          } catch (err) {
            console.warn(`${YELLOW}⚠ Could not create crew-state branch: ${err instanceof Error ? err.message : err}${RESET}`);
            console.warn(`${YELLOW}  The ${options.stateBackend} backend will auto-create it on first write.${RESET}`);
          }
        }

        // Install git hooks for automatic state sync on push/pull
        installGitHooks(dest, { force: false });

        // INSIDER3-INIT-LEAK fix: the SDK already wrote decisions.md and
        // agents/<n>/history.md into the working tree (it had no knowledge of
        // the backend choice at the time). Lift those mutable files onto the
        // crew-state orphan branch and remove the working-tree copies so the
        // backend is the single source of truth post-init.
        try {
          const lifted = liftInitMutableStateOntoOrphan(dest);
          if (lifted.length > 0) {
            success(`migrated ${lifted.length} mutable state file(s) onto crew-state branch (removed from working tree)`);
          }
        } catch (err) {
          console.warn(`${YELLOW}⚠ Could not lift mutable state onto crew-state branch: ${err instanceof Error ? err.message : err}${RESET}`);
        }

        // GAP-2 fix: SDK init skips .copilot/mcp-config.json when it already
        // exists (e.g. partially-crewified repo or pre-existing Copilot setup),
        // leaving the bridge unwired. Force-insert/pin the crew_state entry so
        // the MCP server is reachable regardless of pre-existing config.
        // iter-8: write crew_state to repo-root `.mcp.json` (auto-loaded by
        // Copilot CLI ≥1.0.59, which walks up from cwd to git root finding
        // .mcp.json files — see sdk/index.js loader) and tombstone any
        // stale project-level entry left by the SDK init writer in
        // `.copilot/mcp-config.json`. No HOME modifications.
        try {
          const mcpSpec = await resolveCrewStateMcpSpec(getPackageVersion());
          const rootResult = ensureCrewStateMcpInRoot(dest, getPackageVersion(), mcpSpec);
          if (rootResult.written) {
            success(`installed crew_state MCP server to .mcp.json (${describeMcpSpec(mcpSpec)}) — Copilot CLI will auto-load on next invocation`);
            console.log(`${DIM}  to remove later: edit ${rootResult.path} and delete crew_state${RESET}`);
          }
          const tomb = tombstoneStaleCrewStateInProjectMcp(dest);
          if (tomb.removed) {
            success(`removed stale crew_state from ${tomb.path} (now lives in .mcp.json)`);
          }
        } catch (err) {
          console.warn(`${YELLOW}⚠ Could not install crew_state MCP entry in .mcp.json: ${err instanceof Error ? err.message : err}${RESET}`);
        }
      }
    } else {
      console.warn(`${YELLOW}⚠ Unknown state backend "${options.stateBackend}". Using default (local).${RESET}`);
    }
  }

  // iter-8: unconditionally mirror repo-root `.mcp.json` write + tombstone
  // for vanilla `crew init` (no --state-backend flag) so the crew_state
  // MCP entry is reachable regardless of init path. No HOME modifications.
  try {
    const mcpSpec = await resolveCrewStateMcpSpec(version);
    const rootResult = ensureCrewStateMcpInRoot(dest, version, mcpSpec);
    if (rootResult.written) {
      success(`installed crew_state MCP server to .mcp.json (${describeMcpSpec(mcpSpec)}) — Copilot CLI will auto-load on next invocation`);
    }
    // iter-8: do NOT write to ~/.copilot/mcp-config.json. The repo-root
    // .mcp.json write above is sufficient for Copilot CLI ≥1.0.59 (which
    // walks up from cwd to git root looking for .mcp.json) AND for
    // `copilot -p` invocations launched from the project root. Users who
    // launch `copilot -p` from outside the project root should use
    // `--additional-mcp-config @.mcp.json` (already documented at the end
    // of this command). See Blacklite/crew#1296.
    const tomb = tombstoneStaleCrewStateInProjectMcp(dest);
    if (tomb.removed) {
      success(`removed stale crew_state from ${tomb.path} (now lives in .mcp.json)`);
    }
  } catch {
    // best-effort: .mcp.json write failure does not block init
  }

  // Report .init-prompt storage
  if (options.prompt) {
    success(`.init-prompt stored — team will be cast when you run ${CYAN}${BOLD}copilot --agent crew${RESET}`);
  }

  // Report created files
  for (const file of result.createdFiles) {
    // Files are already relative to teamRoot, just display as-is
    success(file);
  }

  // Report skipped files
  for (const file of result.skippedFiles) {
    // Files are already relative to teamRoot, just display as-is
    console.log(`${DIM}${file} already exists — skipping${RESET}`);
  }

  // ── Copilot agent prompt ───────────────────────────────────────────
  // Ask if the user wants to add @copilot as an autonomous team member.
  // This enables .github/copilot-instructions.md and adds Coding Agent
  // to the team roster, allowing crew-labeled issues to be auto-assigned.
  const teamContent = readTeamMd(crewDir);
  if (!hasCopilot(teamContent)) {
    if (process.stdin.isTTY) {
      const { createInterface } = await import('node:readline/promises');
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        console.log();
        const answer = (await rl.question(`  Add ${BOLD}@copilot${RESET} as an autonomous team member? [Y/n]: `)).trim().toLowerCase();
        if (answer === '' || answer === 'y' || answer === 'yes') {
          const updated = insertCopilotSection(teamContent, false);
          writeTeamMd(crewDir, updated);
          success('Added @copilot (Coding Agent) to team roster');

          // Copy copilot-instructions.md from templates
          const currentFileUrl = new URL(import.meta.url);
          const currentFilePath = currentFileUrl.pathname.startsWith('/') && process.platform === 'win32'
            ? currentFileUrl.pathname.substring(1)
            : currentFileUrl.pathname;
          const templatesSrc = path.resolve(path.dirname(currentFilePath), '..', '..', '..', 'templates');
          const instructionsSrc = path.join(templatesSrc, 'copilot-instructions.md');
          const instructionsDest = path.join(dest, '.github', 'copilot-instructions.md');

          if (storage.existsSync(instructionsSrc) && !storage.existsSync(instructionsDest)) {
            storage.mkdirSync(path.dirname(instructionsDest), { recursive: true });
            storage.copySync(instructionsSrc, instructionsDest);
            success('.github/copilot-instructions.md');
          }
        } else {
          console.log(`${DIM}  Skipped — add later with: crew copilot enable${RESET}`);
        }
      } finally {
        rl.close();
      }
    } else {
      console.log(`${DIM}  Non-interactive mode — skipping @copilot setup. Add later with: crew copilot enable${RESET}`);
    }
  }

  // ── Celebration ceremony ──────────────────────────────────────────
  console.log();
  await typewrite(`${CYAN}${BOLD}◆ CREW${RESET}`, 10);
  if (!isInitNoColor()) await sleep(50);
  console.log();

  await revealLines(
    INIT_LANDMARKS.map(l => `  ${l.emoji}  ${l.label}`),
    30,
  );

  if (!isInitNoColor()) await sleep(80);
  console.log();
  console.log(`${GREEN}${BOLD}Crew initialized.${RESET} Run ${CYAN}${BOLD}copilot --agent crew${RESET} and tell it what you're building.`);
  console.log();
  console.log(`${DIM}Tip: for non-interactive scripts that need crew_state tools, add to package.json:${RESET}`);
  console.log(`${DIM}  "crew:copilot": "copilot --agent crew --additional-mcp-config @.mcp.json"${RESET}`);
  console.log();

  // ── Personal crew bridge ───────────────────────────────────────────
  if (options.isGlobal) {
    // Global init: ensure personal-crew/ directory exists alongside .crew/
    const personalDir = ensurePersonalCrewDir();
    console.log(`${GREEN}${BOLD}✓${RESET} Personal crew initialized at ${DIM}${personalDir}${RESET}`);
    console.log(`${DIM}  Add agents with: crew personal add <name> --role <role>${RESET}`);
    console.log();
  } else {
    // Repo init: inform user if personal crew is available
    const personalDir = resolvePersonalCrewDir();
    if (personalDir) {
      console.log(`${GREEN}${BOLD}✓${RESET} Personal crew detected — your personal agents will be available here.`);
      console.log();
    }
  }

  if (crewInfo.isLegacy) {
    showDeprecationWarning();
  }
}
