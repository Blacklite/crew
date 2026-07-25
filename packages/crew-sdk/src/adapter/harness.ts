/**
 * Crew Harness Abstraction
 *
 * Crew can run its agent sessions on either of two harnesses:
 *  - "copilot" — GitHub Copilot CLI via @github/copilot-sdk (CrewClient)
 *  - "claude"  — Claude Code CLI in stream-json mode (ClaudeClient)
 *
 * Every component that creates sessions should go through
 * {@link createAgentClient} with a harness resolved by {@link resolveHarness}
 * instead of constructing CrewClient directly.
 *
 * Resolution order (first match wins):
 *   1. explicit option (CLI flag `--harness`, config field, API argument)
 *   2. CREW_HARNESS environment variable
 *   3. `harness` field in `.crew/config.json`
 *   4. default: "copilot"
 *
 * @module adapter/harness
 */

import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { CrewClient, type CrewClientOptions } from './client.js';
import { ClaudeClient, type ClaudeClientOptions } from './claude-client.js';
import type {
  CrewSession,
  CrewSessionConfig,
  CrewSessionMetadata,
  CrewGetAuthStatusResponse,
  CrewGetStatusResponse,
  CrewModelInfo,
  CrewMessageOptions,
} from './types.js';

/** The agent harness that executes Crew sessions. */
export type CrewHarness = 'copilot' | 'claude';

/** All valid harness identifiers. */
export const VALID_HARNESSES = ['copilot', 'claude'] as const satisfies readonly CrewHarness[];

/**
 * The common client surface shared by CrewClient (Copilot) and ClaudeClient.
 * Both implement it structurally; consumers should depend on this interface.
 */
export interface AgentRuntimeClient {
  connect(): Promise<void>;
  disconnect(): Promise<Error[]>;
  isConnected(): boolean;
  createSession(config?: CrewSessionConfig): Promise<CrewSession>;
  resumeSession(sessionId: string, config?: CrewSessionConfig): Promise<CrewSession>;
  listSessions(): Promise<CrewSessionMetadata[]>;
  deleteSession(sessionId: string): Promise<void>;
  getStatus(): Promise<CrewGetStatusResponse>;
  getAuthStatus(): Promise<CrewGetAuthStatusResponse>;
  listModels(): Promise<CrewModelInfo[]>;
  sendMessage(session: CrewSession, options: CrewMessageOptions): Promise<void>;
  sendAndWait(session: CrewSession, options: CrewMessageOptions, timeout?: number): Promise<unknown>;
  closeSession(sessionId: string): Promise<void>;
}

/** Type guard for harness identifiers. */
export function isCrewHarness(value: unknown): value is CrewHarness {
  return typeof value === 'string' && (VALID_HARNESSES as readonly string[]).includes(value);
}

/** Options for {@link resolveHarness}. */
export interface ResolveHarnessOptions {
  /** Explicit harness (CLI flag / API argument) — wins over everything. */
  explicit?: string;
  /** Team root containing `.crew/config.json` (for the config fallback). */
  teamRoot?: string;
  /** Environment to consult. @default process.env */
  env?: Record<string, string | undefined>;
}

/**
 * Resolve which harness to use.
 * Invalid values are ignored (fall through to the next source) so a typo in
 * an env var degrades to the default rather than crashing.
 */
export function resolveHarness(options: ResolveHarnessOptions = {}): CrewHarness {
  if (isCrewHarness(options.explicit)) {
    return options.explicit;
  }

  const env = options.env ?? process.env;
  const fromEnv = env['CREW_HARNESS'];
  if (isCrewHarness(fromEnv)) {
    return fromEnv;
  }

  if (options.teamRoot) {
    try {
      const raw = readFileSync(join(options.teamRoot, '.crew', 'config.json'), 'utf-8');
      const config = JSON.parse(raw) as Record<string, unknown>;
      if (isCrewHarness(config['harness'])) {
        return config['harness'];
      }
    } catch {
      // No config or unreadable — fall through to default
    }
  }

  return 'copilot';
}

/** Options for {@link createAgentClient}. */
export interface CreateAgentClientOptions {
  /** Harness to use. When omitted, resolved via {@link resolveHarness}. */
  harness?: CrewHarness;
  /** Team root, used for harness resolution when `harness` is omitted. */
  teamRoot?: string;
  /** Options forwarded to CrewClient when the harness is "copilot". */
  copilot?: CrewClientOptions;
  /** Options forwarded to ClaudeClient when the harness is "claude". */
  claude?: ClaudeClientOptions;
}

/**
 * Create the runtime client for the resolved harness.
 *
 * @example
 * ```typescript
 * const client = createAgentClient({ teamRoot: process.cwd() });
 * const session = await client.createSession({ model: 'claude-sonnet-4.5' });
 * ```
 */
export function createAgentClient(options: CreateAgentClientOptions = {}): AgentRuntimeClient {
  const harness = options.harness ?? resolveHarness({ teamRoot: options.teamRoot });
  if (harness === 'claude') {
    return new ClaudeClient({
      cwd: options.teamRoot,
      ...options.claude,
    });
  }
  return new CrewClient({
    cwd: options.teamRoot,
    ...options.copilot,
  });
}

/**
 * The shell command a given harness uses for one-shot prompts
 * (`copilot -p` / `claude -p`) — used by loop/watch style automation.
 */
export function harnessCommand(harness: CrewHarness): string {
  return harness === 'claude' ? 'claude' : 'copilot';
}
