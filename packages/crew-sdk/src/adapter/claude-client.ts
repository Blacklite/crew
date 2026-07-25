/**
 * Crew SDK Claude Adapter
 *
 * Implements the same client/session surface as CrewClient (adapter/client.ts)
 * on top of the Claude Code CLI instead of the Copilot CLI. Sessions are
 * long-lived `claude` processes started in bidirectional stream-json mode
 * (`--input-format stream-json --output-format stream-json`), so one process
 * serves many turns exactly like a Copilot SDK session does.
 *
 * Event mapping (Claude stream-json → Crew short event names):
 *   stream_event/content_block_delta(text_delta)      → message_delta { delta }
 *   stream_event/content_block_delta(thinking_delta)  → reasoning_delta { delta }
 *   assistant (full message)                          → message { content }
 *   result                                            → usage { inputTokens, outputTokens, model } then idle
 *   process/parse failure                             → error { message }
 *
 * Known limitations vs the Copilot adapter:
 *  - In-process `tools` handlers are not supported (the Claude CLI runs out of
 *    process). Register tools as MCP servers instead — Crew's own state tools
 *    already flow through `.mcp.json`, which Claude Code auto-loads.
 *  - `onPermissionRequest` is not consulted; sessions run with a configurable
 *    permission mode (default `bypassPermissions`, matching the `--yolo`
 *    behavior used for Copilot spawns).
 *
 * @module adapter/claude-client
 */

import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { trace, SpanStatusCode } from '../runtime/otel-api.js';
import { recordSessionCreated, recordSessionClosed, recordSessionError, recordTokenUsage } from '../runtime/otel-metrics.js';
import { estimateCost, MODEL_CATALOG } from '../config/models.js';
import type { EventBus } from '../runtime/event-bus.js';
import type { UsageEvent } from '../runtime/streaming.js';
import type {
  CrewSessionConfig,
  CrewSession,
  CrewSessionEvent,
  CrewSessionEventHandler,
  CrewSessionEventType,
  CrewSessionMetadata,
  CrewGetAuthStatusResponse,
  CrewGetStatusResponse,
  CrewModelInfo,
  CrewMessageOptions,
  CrewClientEventType,
  CrewClientEvent,
  CrewClientEventHandler,
  CrewMCPServerConfig,
} from './types.js';
import type { CrewConnectionState } from './client.js';

const tracer = trace.getTracer('crew-sdk');

/** Permission modes accepted by the Claude Code CLI. */
export type ClaudePermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';

/**
 * Options for creating a ClaudeClient.
 * Mirrors CrewClientOptions where the concepts translate.
 */
export interface ClaudeClientOptions {
  /** Path to the Claude Code CLI executable. @default "claude" */
  cliPath?: string;
  /** Additional arguments appended to every `claude` spawn. */
  cliArgs?: string[];
  /** Working directory for sessions. @default process.cwd() */
  cwd?: string;
  /** Environment variables for the CLI process. @default process.env */
  env?: Record<string, string>;
  /** Default model for sessions that don't specify one. */
  model?: string;
  /**
   * Permission mode passed to every session.
   * @default "bypassPermissions" — Crew sessions are autonomous, matching the
   * `--yolo` flag Crew already passes to Copilot CLI spawns.
   */
  permissionMode?: ClaudePermissionMode;
  /** Optional EventBus for telemetry auto-wiring (same as CrewClientOptions). */
  eventBus?: EventBus;
  /** Idle timeout for sendAndWait, in milliseconds. @default 600000 */
  defaultTimeoutMs?: number;
}

interface PendingTurn {
  resolve: (finalText: string | undefined) => void;
  reject: (err: Error) => void;
  timer?: NodeJS.Timeout;
}

/**
 * A Crew session backed by a long-lived `claude` process in
 * bidirectional stream-json mode.
 */
class ClaudeSessionAdapter implements CrewSession {
  private readonly proc: ChildProcessWithoutNullStreams;
  private readonly handlers = new Map<string, Set<CrewSessionEventHandler>>();
  private pending: PendingTurn | null = null;
  private claudeSessionId: string | undefined;
  private readonly requestedId: string | undefined;
  private lastAssistantText = '';
  private closed = false;
  private readonly messages: unknown[] = [];

  constructor(proc: ChildProcessWithoutNullStreams, requestedSessionId?: string) {
    this.proc = proc;
    this.requestedId = requestedSessionId;

    const rl = createInterface({ input: proc.stdout });
    rl.on('line', (line) => this.handleLine(line));

    let stderrTail = '';
    proc.stderr.on('data', (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-4000);
    });

    proc.on('error', (err) => {
      this.emit({ type: 'error', message: err.message });
      this.failPending(new Error(`Claude CLI process error: ${err.message}`));
    });

    proc.on('exit', (code) => {
      if (!this.closed && code !== 0 && code !== null) {
        const msg = `Claude CLI exited with code ${code}${stderrTail ? `: ${stderrTail.trim()}` : ''}`;
        this.emit({ type: 'error', message: msg });
        this.failPending(new Error(msg));
      }
    });
  }

  get sessionId(): string {
    return this.claudeSessionId ?? this.requestedId ?? 'pending';
  }

  private emit(event: CrewSessionEvent): void {
    const set = this.handlers.get(event.type);
    if (set) {
      for (const handler of set) {
        try {
          handler(event);
        } catch {
          // Listener errors must not break stream processing
        }
      }
    }
  }

  private failPending(err: Error): void {
    if (this.pending) {
      const p = this.pending;
      this.pending = null;
      if (p.timer) clearTimeout(p.timer);
      p.reject(err);
    }
  }

  private handleLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    let event: Record<string, unknown>;
    try {
      event = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      return; // Non-JSON noise on stdout — ignore
    }

    const type = event['type'];

    if (type === 'system') {
      if (event['subtype'] === 'init' && typeof event['session_id'] === 'string') {
        this.claudeSessionId = event['session_id'];
      }
      return;
    }

    if (type === 'stream_event') {
      const inner = event['event'] as Record<string, unknown> | undefined;
      if (inner?.['type'] === 'content_block_delta') {
        const delta = inner['delta'] as Record<string, unknown> | undefined;
        if (delta?.['type'] === 'text_delta' && typeof delta['text'] === 'string') {
          this.emit({ type: 'message_delta', delta: delta['text'] });
        } else if (delta?.['type'] === 'thinking_delta' && typeof delta['thinking'] === 'string') {
          this.emit({ type: 'reasoning_delta', delta: delta['thinking'] });
        }
      }
      return;
    }

    if (type === 'assistant') {
      const message = event['message'] as Record<string, unknown> | undefined;
      const content = Array.isArray(message?.['content']) ? (message?.['content'] as Array<Record<string, unknown>>) : [];
      const text = content
        .filter(block => block['type'] === 'text' && typeof block['text'] === 'string')
        .map(block => block['text'] as string)
        .join('');
      if (text) {
        this.lastAssistantText = text;
        this.messages.push(message);
        this.emit({ type: 'message', content: text });
      }
      return;
    }

    if (type === 'result') {
      const usage = event['usage'] as Record<string, unknown> | undefined;
      const modelUsage = event['modelUsage'] as Record<string, unknown> | undefined;
      const model = modelUsage ? Object.keys(modelUsage)[0] ?? 'claude' : 'claude';
      const inputTokens = typeof usage?.['input_tokens'] === 'number' ? usage['input_tokens'] : 0;
      const outputTokens = typeof usage?.['output_tokens'] === 'number' ? usage['output_tokens'] : 0;
      this.emit({ type: 'usage', inputTokens, outputTokens, model });
      this.emit({ type: 'idle' });

      const isError = event['is_error'] === true || event['subtype'] !== 'success';
      const finalText = typeof event['result'] === 'string' ? event['result'] : this.lastAssistantText || undefined;
      if (this.pending) {
        const p = this.pending;
        this.pending = null;
        if (p.timer) clearTimeout(p.timer);
        if (isError) {
          p.reject(new Error(finalText ?? `Claude turn failed (${String(event['subtype'])})`));
        } else {
          p.resolve(finalText);
        }
      }
      return;
    }
  }

  private writeUserMessage(prompt: string): void {
    const envelope = {
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'text', text: prompt }],
      },
    };
    this.proc.stdin.write(JSON.stringify(envelope) + '\n');
  }

  private buildPrompt(options: CrewMessageOptions): string {
    let prompt = options.prompt;
    // The Claude CLI has no attachment envelope in stream-json input;
    // surface attachments as @-mentions, which Claude Code resolves itself.
    if (options.attachments?.length) {
      const refs = options.attachments
        .map(att => ('path' in att ? `@${att.path}` : `@${att.filePath}`))
        .join(' ');
      prompt += `\n\n${refs}`;
    }
    return prompt;
  }

  private startTurn(options: CrewMessageOptions, timeout?: number): Promise<string | undefined> {
    if (this.closed) {
      return Promise.reject(new Error('Session is closed'));
    }
    if (this.pending) {
      return Promise.reject(new Error('A turn is already in flight for this session'));
    }
    return new Promise<string | undefined>((resolve, reject) => {
      this.pending = { resolve, reject };
      if (timeout && timeout > 0) {
        this.pending.timer = setTimeout(() => {
          if (this.pending) {
            const p = this.pending;
            this.pending = null;
            p.reject(new Error(`Claude turn timed out after ${timeout}ms`));
          }
        }, timeout);
      }
      this.lastAssistantText = '';
      this.writeUserMessage(this.buildPrompt(options));
    });
  }

  async sendMessage(options: CrewMessageOptions): Promise<void> {
    await this.startTurn(options);
  }

  async sendAndWait(options: CrewMessageOptions, timeout?: number): Promise<unknown> {
    return await this.startTurn(options, timeout ?? 600_000);
  }

  async abort(): Promise<void> {
    // No in-band abort in stream-json mode — terminate the process.
    this.failPending(new Error('Turn aborted'));
    this.proc.kill('SIGINT');
  }

  async getMessages(): Promise<unknown[]> {
    return [...this.messages];
  }

  on(eventType: CrewSessionEventType, handler: CrewSessionEventHandler): void {
    let set = this.handlers.get(eventType);
    if (!set) {
      set = new Set();
      this.handlers.set(eventType, set);
    }
    set.add(handler);
  }

  off(eventType: CrewSessionEventType, handler: CrewSessionEventHandler): void {
    this.handlers.get(eventType)?.delete(handler);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.failPending(new Error('Session closed'));
    try {
      this.proc.stdin.end();
    } catch {
      // stdin may already be closed
    }
    // Give the CLI a moment to flush and exit, then force-kill.
    await new Promise<void>((resolve) => {
      const killTimer = setTimeout(() => {
        try { this.proc.kill('SIGKILL'); } catch { /* already gone */ }
        resolve();
      }, 3000);
      this.proc.once('exit', () => {
        clearTimeout(killTimer);
        resolve();
      });
    });
    this.handlers.clear();
  }
}

/**
 * ClaudeClient — drop-in alternative to CrewClient backed by Claude Code.
 *
 * Implements the same public surface as CrewClient so callers can hold
 * either behind the AgentRuntimeClient interface (see adapter/harness.ts).
 *
 * @example
 * ```typescript
 * const client = new ClaudeClient();
 * await client.connect();
 * const session = await client.createSession({ model: "claude-sonnet-4-5" });
 * await client.sendMessage(session, { prompt: "hello" });
 * ```
 */
export class ClaudeClient {
  private state: CrewConnectionState = 'disconnected';
  private readonly options: Required<Pick<ClaudeClientOptions, 'cliPath' | 'cwd' | 'permissionMode' | 'defaultTimeoutMs'>> & ClaudeClientOptions;
  private cliVersion: string | undefined;
  private readonly sessions = new Map<string, ClaudeSessionAdapter>();
  private readonly lifecycleHandlers = new Set<CrewClientEventHandler>();

  constructor(options: ClaudeClientOptions = {}) {
    this.options = {
      ...options,
      cliPath: options.cliPath ?? 'claude',
      cwd: options.cwd ?? process.cwd(),
      permissionMode: options.permissionMode ?? 'bypassPermissions',
      defaultTimeoutMs: options.defaultTimeoutMs ?? 600_000,
    };
  }

  getState(): CrewConnectionState {
    return this.state;
  }

  isConnected(): boolean {
    return this.state === 'connected';
  }

  /**
   * Verify the Claude Code CLI is installed and runnable.
   * There is no persistent server process — each session owns its process —
   * so "connect" is a preflight check, not a socket.
   */
  async connect(): Promise<void> {
    if (this.state === 'connected') return;
    const span = tracer.startSpan('crew.claude.connect');
    this.state = 'connecting';
    try {
      const result = spawnSync(this.options.cliPath, ['--version'], {
        encoding: 'utf-8',
        timeout: 15_000,
        env: this.options.env ?? (process.env as Record<string, string>),
        shell: process.platform === 'win32',
      });
      if (result.error || result.status !== 0) {
        throw new Error(
          `Claude Code CLI not found or not runnable (\`${this.options.cliPath} --version\` failed). ` +
          `Install it with: npm install -g @anthropic-ai/claude-code`
        );
      }
      this.cliVersion = result.stdout.trim();
      this.state = 'connected';
    } catch (err) {
      this.state = 'error';
      span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
      throw err;
    } finally {
      span.end();
    }
  }

  async disconnect(): Promise<Error[]> {
    const errors: Error[] = [];
    for (const [id, session] of this.sessions) {
      try {
        await session.close();
      } catch (err) {
        errors.push(err instanceof Error ? err : new Error(String(err)));
      }
      this.sessions.delete(id);
    }
    this.state = 'disconnected';
    return errors;
  }

  async forceDisconnect(): Promise<void> {
    await this.disconnect();
  }

  private buildArgs(config: CrewSessionConfig, resumeSessionId?: string): string[] {
    const args = [
      '-p',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--include-partial-messages',
      '--verbose',
      '--permission-mode', this.options.permissionMode,
    ];

    if (resumeSessionId) {
      args.push('--resume', resumeSessionId);
    } else if (config.sessionId) {
      args.push('--session-id', config.sessionId);
    }

    const model = config.model ?? this.options.model;
    if (model) {
      args.push('--model', model);
    }

    if (config.systemMessage) {
      if (config.systemMessage.mode === 'replace') {
        args.push('--system-prompt', config.systemMessage.content);
      } else if (config.systemMessage.content) {
        args.push('--append-system-prompt', config.systemMessage.content);
      }
    }

    if (config.availableTools?.length) {
      args.push('--allowedTools', config.availableTools.join(','));
    } else if (config.excludedTools?.length) {
      args.push('--disallowedTools', config.excludedTools.join(','));
    }

    if (config.mcpServers && Object.keys(config.mcpServers).length > 0) {
      args.push('--mcp-config', this.writeMcpConfig(config.mcpServers));
    }

    if (this.options.cliArgs?.length) {
      args.push(...this.options.cliArgs);
    }

    return args;
  }

  /** Write session-scoped MCP servers to a temp file for --mcp-config. */
  private writeMcpConfig(servers: Record<string, CrewMCPServerConfig>): string {
    const mcpServers: Record<string, unknown> = {};
    for (const [name, server] of Object.entries(servers)) {
      if ('url' in server) {
        mcpServers[name] = { type: server.type, url: server.url, headers: server.headers };
      } else {
        mcpServers[name] = { command: server.command, args: server.args, env: server.env };
      }
    }
    const dir = mkdtempSync(join(tmpdir(), 'crew-claude-mcp-'));
    const file = join(dir, 'mcp-config.json');
    writeFileSync(file, JSON.stringify({ mcpServers }, null, 2));
    return file;
  }

  async createSession(config: CrewSessionConfig = {}): Promise<CrewSession> {
    const span = tracer.startSpan('crew.claude.session.create');
    try {
      if (!this.isConnected()) {
        await this.connect();
      }

      if (config.tools?.length) {
        console.warn(
          '[crew] In-process tools are not supported by the Claude harness — ' +
          'expose them as an MCP server instead (see .mcp.json).'
        );
      }

      const args = this.buildArgs(config);
      const proc = spawn(this.options.cliPath, args, {
        cwd: config.workingDirectory ?? this.options.cwd,
        env: this.options.env ?? (process.env as Record<string, string>),
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
      }) as ChildProcessWithoutNullStreams;

      const session = new ClaudeSessionAdapter(proc, config.sessionId);
      recordSessionCreated();

      // Track for lifecycle + disconnect cleanup once the real ID arrives.
      const registerWhenIdle = (event: CrewSessionEvent): void => {
        if (event.type === 'idle' || event.type === 'usage') {
          this.sessions.set(session.sessionId, session);
          session.off('idle', registerWhenIdle);
          this.emitLifecycle({ type: 'session.created', sessionId: session.sessionId });
        }
      };
      session.on('idle', registerWhenIdle);

      if (this.options.eventBus) {
        const bus = this.options.eventBus;
        session.on('usage', (event: CrewSessionEvent) => {
          const inputTokens = typeof event['inputTokens'] === 'number' ? event['inputTokens'] : 0;
          const outputTokens = typeof event['outputTokens'] === 'number' ? event['outputTokens'] : 0;
          const model = typeof event['model'] === 'string' ? event['model'] : 'unknown';
          void bus.emit({
            type: 'session:message',
            sessionId: session.sessionId,
            payload: {
              inputTokens,
              outputTokens,
              model,
              estimatedCost: estimateCost(model, inputTokens, outputTokens),
            },
            timestamp: new Date(),
          });
        });
      }

      return session;
    } catch (err) {
      recordSessionError();
      span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
      throw err;
    } finally {
      span.end();
    }
  }

  async resumeSession(sessionId: string, config: CrewSessionConfig = {}): Promise<CrewSession> {
    if (!this.isConnected()) {
      await this.connect();
    }
    const args = this.buildArgs(config, sessionId);
    const proc = spawn(this.options.cliPath, args, {
      cwd: config.workingDirectory ?? this.options.cwd,
      env: this.options.env ?? (process.env as Record<string, string>),
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    }) as ChildProcessWithoutNullStreams;
    const session = new ClaudeSessionAdapter(proc, sessionId);
    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * List sessions this client created in-process.
   * The Claude CLI keeps its own on-disk history but exposes no list API;
   * only sessions from this client instance are reported.
   */
  async listSessions(): Promise<CrewSessionMetadata[]> {
    const now = new Date();
    return [...this.sessions.keys()].map(sessionId => ({
      sessionId,
      startTime: now,
      modifiedTime: now,
      isRemote: false,
    }));
  }

  async deleteSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      await session.close();
      this.sessions.delete(sessionId);
      recordSessionClosed();
      this.emitLifecycle({ type: 'session.deleted', sessionId });
    }
  }

  async getLastSessionId(): Promise<string | undefined> {
    const ids = [...this.sessions.keys()];
    return ids[ids.length - 1];
  }

  async ping(message?: string): Promise<{ message: string; timestamp: string; protocolVersion?: number }> {
    if (!this.isConnected()) {
      await this.connect();
    }
    return { message: message ?? 'pong', timestamp: new Date().toISOString() };
  }

  async getStatus(): Promise<CrewGetStatusResponse> {
    if (!this.isConnected()) {
      await this.connect();
    }
    return { version: this.cliVersion ?? 'unknown', protocolVersion: 1 };
  }

  /**
   * Report auth status. The Claude CLI manages its own credentials
   * (`claude setup-token`, ANTHROPIC_API_KEY, or claude.ai login); an API key
   * in the environment is reported as env auth, otherwise logged-in user auth
   * is assumed and verified lazily on first session.
   */
  async getAuthStatus(): Promise<CrewGetAuthStatusResponse> {
    const env = this.options.env ?? (process.env as Record<string, string>);
    if (env['ANTHROPIC_API_KEY']) {
      return { isAuthenticated: true, authType: 'api-key', host: 'api.anthropic.com' };
    }
    return { isAuthenticated: true, authType: 'user', statusMessage: 'Using Claude Code login (verified on first session)' };
  }

  /** List Claude models from the static Crew model catalog. */
  async listModels(): Promise<CrewModelInfo[]> {
    return MODEL_CATALOG
      .filter(m => m.family === 'claude')
      .map((m): CrewModelInfo => ({
        id: m.id,
        name: m.id,
        capabilities: {
          supports: { vision: m.vision ?? false, reasoningEffort: false },
          limits: { max_context_window_tokens: 200_000 },
        },
      }));
  }

  /** Parity with CrewClient.sendMessage — spans + token metrics. */
  async sendMessage(session: CrewSession, options: CrewMessageOptions): Promise<void> {
    const span = tracer.startSpan('crew.claude.session.message');
    span.setAttribute('session.id', session.sessionId);
    span.setAttribute('prompt.length', options.prompt.length);

    let inputTokens = 0;
    let outputTokens = 0;
    let model = 'unknown';
    const usageListener = (event: CrewSessionEvent): void => {
      if (event.type === 'usage') {
        inputTokens = typeof event['inputTokens'] === 'number' ? event['inputTokens'] : 0;
        outputTokens = typeof event['outputTokens'] === 'number' ? event['outputTokens'] : 0;
        model = typeof event['model'] === 'string' ? event['model'] : 'unknown';
      }
    };
    session.on('usage', usageListener);

    try {
      await session.sendMessage(options);
      if (inputTokens > 0 || outputTokens > 0) {
        const usageEvent: UsageEvent = {
          type: 'usage',
          sessionId: session.sessionId,
          model,
          inputTokens,
          outputTokens,
          estimatedCost: estimateCost(model, inputTokens, outputTokens),
          timestamp: new Date(),
        };
        recordTokenUsage(usageEvent);
      }
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
      throw err;
    } finally {
      span.end();
      try { session.off('usage', usageListener); } catch { /* ignore */ }
    }
  }

  async sendAndWait(session: CrewSession, options: CrewMessageOptions, timeout?: number): Promise<unknown> {
    if (!session.sendAndWait) {
      throw new Error('Session does not support sendAndWait()');
    }
    return await session.sendAndWait(options, timeout ?? this.options.defaultTimeoutMs);
  }

  async closeSession(sessionId: string): Promise<void> {
    await this.deleteSession(sessionId);
  }

  private emitLifecycle(event: CrewClientEvent): void {
    for (const handler of this.lifecycleHandlers) {
      try {
        handler(event);
      } catch {
        // listener errors are non-fatal
      }
    }
  }

  on<K extends CrewClientEventType>(eventType: K, handler: (event: CrewClientEvent & { type: K }) => void): () => void;
  on(handler: CrewClientEventHandler): () => void;
  on(
    eventTypeOrHandler: CrewClientEventType | CrewClientEventHandler,
    handler?: (event: CrewClientEvent) => void
  ): () => void {
    const wrapped: CrewClientEventHandler = typeof eventTypeOrHandler === 'string' && handler
      ? (event) => { if (event.type === eventTypeOrHandler) handler(event); }
      : (eventTypeOrHandler as CrewClientEventHandler);
    this.lifecycleHandlers.add(wrapped);
    return () => this.lifecycleHandlers.delete(wrapped);
  }
}
