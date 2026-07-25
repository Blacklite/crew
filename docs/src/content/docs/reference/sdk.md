# SDK Reference

> ⚠️ **Experimental** — Crew is alpha software. APIs, commands, and behavior may change between releases.

Complete reference for `@blacklite/crew-sdk` — the programmatic API for Crew.

> **See also:** [API Reference](api-reference.md) — Complete auto-generated reference with full type signatures for all exports.

```bash
npm install @blacklite/crew-sdk
```

All imports work from the barrel export:

```typescript
import { resolveCrew, loadConfig, CrewCoordinator, defineTool } from '@blacklite/crew-sdk';
```

---

## Resolution

Find `.crew/` directories on disk.

| Function | Description |
|----------|-------------|
| `resolveCrew(startPath?)` | Find `.crew/` walking up from `startPath` (throws if not found) |
| `resolveGlobalCrewPath()` | Get personal crew directory path (platform-specific) |
| `ensureCrewPath(startPath?)` | Like `resolveCrew`, but creates `.crew/` if missing |

```typescript
const crewPath = resolveCrew();                // '/home/user/project/.crew'
const globalPath = resolveGlobalCrewPath();      // Platform-specific: ~/.config/crew/ (Linux), ~/Library/Application Support/crew/ (macOS), %APPDATA%\crew\ (Windows)
const safePath = ensureCrewPath();               // Creates if needed
```

---

## Configuration

### `loadConfig(crewPath): Promise<ConfigLoadResult>`

Load and validate Crew configuration asynchronously.

```typescript
const config = await loadConfig('./.crew');
config.team.name;           // Team name
Object.keys(config.agents); // Agent names
config.routing.workTypes;   // Routing rules
```

### `loadConfigSync(crewPath): ConfigLoadResult`

Synchronous version for scripts and CLI tools.

### `defineConfig(partial): CrewConfig`

Create a typed config with defaults and editor autocomplete:

```typescript
// crew.config.ts
import { defineConfig } from '@blacklite/crew-sdk';

export default defineConfig({
  team: { name: 'my-crew', root: '.crew' },
  agents: {
    backend: { model: 'claude-sonnet-4', tools: ['route', 'memory', 'decision'] },
  },
  routing: {
    workTypes: [
      { pattern: /\bAPI|backend\b/i, targets: ['backend'], tier: 'standard' },
    ],
  },
  models: {
    default: 'claude-sonnet-4',
    fallbackChains: {
      premium: ['claude-opus-4', 'gpt-4.1'],
      standard: ['claude-sonnet-4', 'gpt-4.1'],
      fast: ['claude-haiku-3.5', 'gpt-4.1-mini'],
    },
  },
});
```

### Key Types

```typescript
interface ConfigLoadResult {
  team: { name: string; root: string; description?: string };
  agents?: Record<string, AgentConfig>;
  routing?: RoutingConfig;
  models?: ModelConfig;
}

interface AgentConfig {
  role: string;
  model?: string;
  tools?: string[];
  status?: 'active' | 'inactive';
}
```

---

## Builder Functions (SDK-First Mode)

Type-safe team configuration with runtime validation. Each builder accepts a config object, validates it, and returns the typed value.

> **New in Phase 1** — SDK-First Mode lets you define teams in TypeScript instead of manually maintaining markdown. Run `crew build` to generate `.crew/` files.

See [SDK-First Mode Guide](../sdk-first-mode.md) for comprehensive documentation and examples.

### `defineTeam(config): TeamDefinition`

Define team metadata, members, and project context.

```typescript
const team = defineTeam({
  name: 'Platform Crew',
  description: 'Full-stack engineering team',
  projectContext: 'React/Node monorepo, TypeScript strict mode',
  members: ['@edie', '@mcmanus', '@fenster'],
});
```

**Type:**

```typescript
interface TeamDefinition {
  readonly name: string;
  readonly description?: string;
  readonly projectContext?: string;
  readonly members: readonly string[];
}
```

---

### `defineAgent(config): AgentDefinition`

Define a single agent with role, tools, model, and capabilities.

```typescript
const edie = defineAgent({
  name: 'edie',
  role: 'TypeScript Engineer',
  model: 'claude-sonnet-4',
  tools: ['grep', 'edit', 'powershell', 'view'],
  capabilities: [
    { name: 'type-system', level: 'expert' },
    { name: 'testing', level: 'proficient' },
  ],
  status: 'active',
});
```

**Type:**

```typescript
interface AgentDefinition {
  readonly name: string;
  readonly role: string;
  readonly charter?: string;
  readonly model?: string;
  readonly tools?: readonly string[];
  readonly capabilities?: readonly AgentCapability[];
  readonly status?: 'active' | 'inactive' | 'retired';
}

interface AgentCapability {
  readonly name: string;
  readonly level: 'expert' | 'proficient' | 'basic';
}
```

---

### `defineRouting(config): RoutingDefinition`

Define routing rules with pattern matching and tier assignment.

```typescript
const routing = defineRouting({
  rules: [
    { pattern: 'feature-*', agents: ['@edie'], tier: 'standard' },
    { pattern: 'docs-*', agents: ['@mcmanus'], tier: 'lightweight' },
  ],
  defaultAgent: '@coordinator',
  fallback: 'coordinator',
});
```

**Type:**

```typescript
interface RoutingDefinition {
  readonly rules: readonly RoutingRule[];
  readonly defaultAgent?: string;
  readonly fallback?: 'ask' | 'default-agent' | 'coordinator';
}

interface RoutingRule {
  readonly pattern: string;
  readonly agents: readonly string[];
  readonly tier?: 'direct' | 'lightweight' | 'standard' | 'full';
  readonly priority?: number;
}
```

---

### `defineCeremony(config): CeremonyDefinition`

Define ceremonies (standups, retros, etc.) with schedule and participants.

```typescript
const standup = defineCeremony({
  name: 'standup',
  trigger: 'schedule',
  schedule: '0 9 * * 1-5',
  participants: ['@edie', '@mcmanus'],
  agenda: 'Yesterday / Today / Blockers',
});
```

**Type:**

```typescript
interface CeremonyDefinition {
  readonly name: string;
  readonly trigger?: string;
  readonly schedule?: string;
  readonly participants?: readonly string[];
  readonly agenda?: string;
  readonly hooks?: readonly string[];
}
```

---

### `defineHooks(config): HooksDefinition`

Define governance hooks — write paths, blocked commands, PII scrubbing.

```typescript
const hooks = defineHooks({
  allowedWritePaths: ['src/**', 'test/**', '.crew/**'],
  blockedCommands: ['rm -rf /', 'DROP TABLE'],
  maxAskUser: 3,
  scrubPii: true,
  reviewerLockout: true,
});
```

**Type:**

```typescript
interface HooksDefinition {
  readonly allowedWritePaths?: readonly string[];
  readonly blockedCommands?: readonly string[];
  readonly maxAskUser?: number;
  readonly scrubPii?: boolean;
  readonly reviewerLockout?: boolean;
}
```

---

### `defineCasting(config): CastingDefinition`

Define casting configuration — universe allowlists and overflow behavior.

```typescript
const casting = defineCasting({
  allowlistUniverses: ['The Usual Suspects', 'Breaking Bad'],
  overflowStrategy: 'generic',
  capacity: { 'The Usual Suspects': 8 },
});
```

**Type:**

```typescript
interface CastingDefinition {
  readonly allowlistUniverses?: readonly string[];
  readonly overflowStrategy?: 'reject' | 'generic' | 'rotate';
  readonly capacity?: Readonly<Record<string, number>>;
}
```

---

### `defineTelemetry(config): TelemetryDefinition`

Define OpenTelemetry configuration for observability.

```typescript
const telemetry = defineTelemetry({
  enabled: true,
  endpoint: 'http://localhost:4317',
  serviceName: 'crew-prod',
  sampleRate: 1.0,
  aspireDefaults: true,
});
```

**Type:**

```typescript
interface TelemetryDefinition {
  readonly enabled?: boolean;
  readonly endpoint?: string;
  readonly serviceName?: string;
  readonly sampleRate?: number;
  readonly aspireDefaults?: boolean;
}
```

---

### `defineCrew(config): CrewSDKConfig`

Compose all builders into a single SDK config.

```typescript
export default defineCrew({
  version: '1.0.0',
  team: defineTeam({ /* ... */ }),
  agents: [defineAgent({ /* ... */ })],
  routing: defineRouting({ /* ... */ }),
});
```

**Type:**

```typescript
interface CrewSDKConfig {
  readonly version?: string;
  readonly team: TeamDefinition;
  readonly agents: readonly AgentDefinition[];
  readonly routing?: RoutingDefinition;
  readonly ceremonies?: readonly CeremonyDefinition[];
  readonly hooks?: HooksDefinition;
  readonly casting?: CastingDefinition;
  readonly telemetry?: TelemetryDefinition;
}
```

---

## CrewClient

Wraps `@github/copilot-sdk` with lifecycle management and auto-reconnection.

```typescript
import { CrewClient } from '@blacklite/crew-sdk';

const client = new CrewClient({
  port: 3000,
  auth: { token: process.env.COPILOT_TOKEN },
  reconnection: { maxRetries: 5, backoffMs: 1000 },
});

await client.connect();
```

**Connection states:** `disconnected → connecting → connected → reconnecting → error`

### CrewClientWithPool

Production-ready client composing `CrewClient`, `SessionPool`, and `EventBus`:

```typescript
import { CrewClientWithPool } from '@blacklite/crew-sdk';

const crew = new CrewClientWithPool({
  client: clientOptions,
  pool: { maxConcurrent: 10, idleTimeout: 60_000 },
});

const session = await crew.createSession({ agent: 'backend' });
const response = await session.sendMessage('Implement the /users endpoint');
await session.destroy();
```

**Session states:** `creating → active → idle → error → destroyed`

---

## Coordinator

Central routing and orchestration engine.

### `CrewCoordinator`

```typescript
import { CrewCoordinator } from '@blacklite/crew-sdk';

const coordinator = new CrewCoordinator({ teamRoot: './.crew', enableParallel: true });
await coordinator.initialize();

const decision = await coordinator.route('refactor the API');
// decision.tier:      'direct' | 'lightweight' | 'standard' | 'full'
// decision.agents:    ['backend', 'tester']
// decision.parallel:  true
// decision.rationale: 'Backend refactor with test coverage'

await coordinator.execute(decision, 'refactor the API');
await coordinator.shutdown();
```

### `selectResponseTier(context): TierName`

```typescript
const tier = selectResponseTier({ complexity: 'high', budget: 10, userTeam: true });
// → 'standard' or 'full'
```

### `getTier(name): TierDefinition`

```typescript
const tier = getTier('standard');
tier.maxAgents;     // Max parallel agents
tier.defaultModel;  // Default model
tier.toolset;       // Available tools
```

---

## Event Handling

Typed pub/sub for session lifecycle events:

```typescript
crew.events.on('session.created', (event) => {
  console.log(`Session ${event.sessionId} started`);
});

crew.events.on('session.status_changed', (event) => {
  if (event.payload.status === 'error') { /* handle */ }
});
```

**Events:** `session.created`, `session.destroyed`, `session.status_changed`, tool execution events.

---

## Tools & Hooks

### `defineTool<TArgs>(config): CrewTool<TArgs>`

```typescript
import { defineTool } from '@blacklite/crew-sdk';

const myTool = defineTool<{ query: string }>({
  name: 'search_docs',
  description: 'Search project documentation',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query'],
  },
  handler: async (args) => ({
    textResultForLlm: `Found results for "${args.query}"`,
    resultType: 'success',
  }),
});
```

### `ToolRegistry`

```typescript
import { ToolRegistry } from '@blacklite/crew-sdk/tools';
import type { FanOutDependencies } from '@blacklite/crew-sdk/coordinator';

const registry = new ToolRegistry('./.crew');
registry.getTools();                                    // All tools
registry.getToolsForAgent(['crew_route', 'crew_decide']); // Agent-specific
registry.getTool('crew_route');                         // Single lookup
```

**Constructor:** `new ToolRegistry(crewRoot?, sessionPoolGetter?, storage?, state?, fanOutDepsGetter?)`

- `fanOutDepsGetter` — Required for `crew_route` to create sessions via `spawnParallel`. Returns a `FanOutDependencies` object (from `@blacklite/crew-sdk/coordinator`). Without it, `crew_route` returns `error: 'fan-out-deps-unavailable'`.
- `state` — When provided, `crew_route` validates that the target agent exists in the roster before spawning.

**Built-in tools:**

| Tool | Purpose |
|------|---------|
| `crew_route` | Route a task to another agent (requires `fanOutDepsGetter`) |
| `crew_decide` | Write decisions to the inbox |
| `crew_memory` | Append to agent history |
| `crew_status` | Query session pool state |
| `crew_skill` | Read/write agent skills |

### HookPipeline

Intercept tool calls before (`PreToolUseHook`) and after (`PostToolUseHook`) execution:

```typescript
import { HookPipeline, type PreToolUseHook } from '@blacklite/crew-sdk';

const auditHook: PreToolUseHook = async (toolName, params, context) => {
  console.log(`Agent ${context.agentId} calling ${toolName}`);
  return { action: 'allow' };
};

const pipeline = new HookPipeline();
pipeline.addPreHook(auditHook);
```

**Hook actions:** `allow`, `block`, `modify`

**Built-in policies:** ReviewerLockout, File Guards, Shell Restrictions, Rate Limits, PII Filters.

---

## Agents & Casting

### `onboardAgent(options): Promise<OnboardResult>`

```typescript
const result = await onboardAgent({
  teamRoot: './.crew',
  agentName: 'data-analyst',
  role: 'backend',
  displayName: 'Dana — Data Analyst',
  projectContext: 'A recipe sharing app',
});
// result.agentDir, result.charterPath, result.historyPath
```

### `CastingEngine`

```typescript
import { CastingEngine } from '@blacklite/crew-sdk';

const engine = new CastingEngine({ universes: ['The Wire'], activeUniverse: 'The Wire' });
const members = await engine.castTeam([
  { role: 'lead', title: 'Lead Developer' },
  { role: 'backend', title: 'Backend Engineer' },
]);
// members[0].name → 'Stringer', members[0].universe → 'The Wire'
```

---

## Runtime Constants

```typescript
import { MODELS, TIMEOUTS, AGENT_ROLES } from '@blacklite/crew-sdk';

MODELS.premium;  // ['claude-opus-4.6', 'gpt-5.2', ...]
MODELS.standard; // ['claude-sonnet-4.5', 'gpt-5.1', ...]
MODELS.fast;     // ['claude-haiku-4.5', 'gpt-5-mini', ...]

TIMEOUTS.agentInitMs;        // 30000
TIMEOUTS.agentExecuteMs;     // 300000
TIMEOUTS.coordinatorRouteMs; // 5000
```

---

## Upstream Inheritance

Share skills, decisions, and routing across teams.

```typescript
import { readUpstreamConfig, resolveUpstreams, buildInheritedContextBlock } from '@blacklite/crew-sdk';

const config = await readUpstreamConfig('./.crew');
const resolved = await resolveUpstreams(config, './.crew');
const contextBlock = buildInheritedContextBlock(resolved);
```

**Upstream types:** `local`, `git`, `export`

---

## Observability (OpenTelemetry)

### Quick Setup

```typescript
import { initCrewTelemetry } from '@blacklite/crew-sdk';

const telemetry = await initCrewTelemetry({
  endpoint: 'http://localhost:4318',
  serviceName: 'my-crew',
  eventBus: myEventBus,
});

// ... run agents ...
await telemetry.shutdown();
```

### Low-Level Control

```typescript
import { initializeOTel, shutdownOTel, getTracer, getMeter } from '@blacklite/crew-sdk';

await initializeOTel({ endpoint: 'http://localhost:4318' });

const tracer = getTracer('my-component');
const span = tracer.startSpan('my-work');
// ... do work ...
span.end();

const meter = getMeter('my-component');
const counter = meter.createCounter('requests_total');
counter.add(1);

await shutdownOTel();
```

---

## Error Classes

All errors extend `CrewError` with severity, category, and recoverability:

| Error | When |
|-------|------|
| `SDKConnectionError` | Connection failures (retryable) |
| `AuthenticationError` | Bad credentials (fatal) |
| `SessionLifecycleError` | Session state transitions |
| `ToolExecutionError` | Tool call failures |
| `ModelAPIError` | Model unavailable or rate limited |
| `ConfigurationError` | Invalid config (includes field + reason) |
| `RateLimitError` | Too many requests |
| `ValidationError` | Schema validation failures |

---

## Exports at a Glance

| Export | Type | Module |
|--------|------|--------|
| `resolveCrew` | function | resolution |
| `resolveGlobalCrewPath` | function | resolution |
| `ensureCrewPath` | function | resolution |
| `MODELS` | constant | runtime/constants |
| `TIMEOUTS` | constant | runtime/constants |
| `AGENT_ROLES` | constant | runtime/constants |
| `loadConfig` / `loadConfigSync` | function | config |
| `onboardAgent` | function | agents |
| `CastingEngine` / `CastingHistory` | class | casting |
| `CrewCoordinator` | class | coordinator |
| `selectResponseTier` / `getTier` | function | coordinator |
| `defineTool` / `ToolRegistry` | function/class | tools |
| `initializeOTel` / `shutdownOTel` | function | runtime/otel |
| `getTracer` / `getMeter` | function | runtime/otel |
| `initCrewTelemetry` | function | runtime/otel-init |

---

## See Also

- [CLI Reference](./cli.md) — Shell commands and config files
- [Recipes & Advanced Scenarios](../cookbook/recipes.md) — Prompt-driven cookbook
