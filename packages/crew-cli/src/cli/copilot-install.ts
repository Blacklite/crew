/**
 * In-Copilot Installation Path (M4-6, Issue #106)
 *
 * Detects the Copilot runtime environment and provides
 * platform-specific installation + scaffolding instructions.
 * Wires into initCrew() from M2-6 for project creation.
 *
 * @module cli/copilot-install
 */

import { initCrew } from '@blacklite/crew-sdk/config';
import type { InitOptions, InitResult } from '@blacklite/crew-sdk/config';

// ============================================================================
// Types
// ============================================================================

/** Recognised Copilot environments. */
export type CopilotEnvironment = 'cli' | 'vscode' | 'web' | 'unknown';

/** Configuration for in-Copilot installation. */
export interface InstallConfig {
  /** Project name */
  projectName?: string;
  /** Project description */
  projectDescription?: string;
  /** Agent names to scaffold */
  agents?: string[];
  /** Config format */
  configFormat?: 'typescript' | 'json';
}

/** Result of an in-Copilot installation. */
export interface CopilotInstallResult {
  /** Whether the installation succeeded */
  success: boolean;
  /** Detected environment */
  environment: CopilotEnvironment;
  /** Files created during installation */
  createdFiles: string[];
  /** Human-readable installation instructions that were applied */
  instructions: string[];
}

/** Single install instruction step. */
export interface InstallStep {
  /** Step description */
  description: string;
  /** Shell command to run (if applicable) */
  command?: string;
}

// ============================================================================
// Environment Detection
// ============================================================================

/** Indicators used for environment detection. */
export interface EnvironmentIndicators {
  env: Record<string, string | undefined>;
  argv: string[];
}

/**
 * Detect which Copilot environment is active.
 *
 * Heuristics (checked in order):
 * 1. `VSCODE_PID` or `VSCODE_IPC_HOOK` → vscode
 * 2. `CODESPACES` or `GITHUB_CODESPACE_TOKEN` → web
 * 3. `COPILOT_CLI` env var → cli
 * 4. `--copilot-cli` argv flag → cli
 * 5. Otherwise → unknown
 */
export function detectCopilotEnvironment(
  indicators?: EnvironmentIndicators,
): CopilotEnvironment {
  const env = indicators?.env ?? process.env;
  const argv = indicators?.argv ?? process.argv;

  if (env['VSCODE_PID'] || env['VSCODE_IPC_HOOK']) {
    return 'vscode';
  }
  if (env['CODESPACES'] === 'true' || env['GITHUB_CODESPACE_TOKEN']) {
    return 'web';
  }
  if (env['COPILOT_CLI'] || argv.includes('--copilot-cli')) {
    return 'cli';
  }
  return 'unknown';
}

// ============================================================================
// Install Instructions
// ============================================================================

/**
 * Return platform-specific install steps for a detected environment.
 */
export function getInstallInstructions(env: CopilotEnvironment): InstallStep[] {
  switch (env) {
    case 'cli':
      return [
        { description: 'Install the Crew SDK globally', command: 'npm install -g @blacklite/crew' },
        { description: 'Initialise a new Crew project', command: 'npx create-crew' },
        { description: 'Start the Crew orchestrator', command: 'crew start' },
      ];
    case 'vscode':
      return [
        { description: 'Install Crew SDK as a project dependency', command: 'npm install @blacklite/crew' },
        { description: 'Run Crew init via the VS Code terminal', command: 'npx create-crew' },
        { description: 'Reload the VS Code window to activate Crew agents' },
      ];
    case 'web':
      return [
        { description: 'Install Crew SDK in the Codespace', command: 'npm install @blacklite/crew' },
        { description: 'Initialise Crew scaffolding', command: 'npx create-crew' },
        { description: 'Crew agents are available in the Codespace Copilot Chat' },
      ];
    case 'unknown':
    default:
      return [
        { description: 'Install Node.js 20+ if not already installed' },
        { description: 'Install the Crew SDK', command: 'npm install @blacklite/crew' },
        { description: 'Initialise a new Crew project', command: 'npx create-crew' },
      ];
  }
}

// ============================================================================
// In-Copilot Install
// ============================================================================

/**
 * Run a full "install Crew from inside Copilot" flow.
 *
 * Generates `.crew/` scaffolding via initCrew() from M2-6
 * and returns environment-aware instructions.
 *
 * @param env - Detected Copilot environment
 * @param projectDir - Root directory of the project
 * @param config - Optional install configuration
 * @returns CopilotInstallResult
 */
export async function installFromCopilot(
  env: CopilotEnvironment,
  projectDir: string,
  config?: InstallConfig,
): Promise<CopilotInstallResult> {
  const projectName = config?.projectName ?? 'my-crew-project';
  const agents = (config?.agents ?? ['lead', 'developer']).map((name) => ({
    name,
    role: name,
  }));

  const initOptions: InitOptions = {
    teamRoot: projectDir,
    projectName,
    projectDescription: config?.projectDescription,
    agents,
    configFormat: config?.configFormat ?? (env === 'web' ? 'json' : 'typescript'),
  };

  let initResult: InitResult;
  try {
    initResult = await initCrew(initOptions);
  } catch (err) {
    return {
      success: false,
      environment: env,
      createdFiles: [],
      instructions: [`Installation failed: ${(err as Error).message}`],
    };
  }

  const instructions = getInstallInstructions(env).map((s) => s.description);

  return {
    success: true,
    environment: env,
    createdFiles: initResult.createdFiles,
    instructions,
  };
}
