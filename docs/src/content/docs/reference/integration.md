# SDK Integration Guide

> ⚠️ **Experimental** — Crew is alpha software. APIs, commands, and behavior may change between releases.

This guide covers connecting to the Copilot SDK via Crew's adapter layer, managing sessions, handling events, and recovering from errors.

---

## CrewClient Setup

`CrewClient` wraps `@github/copilot-sdk` with lifecycle management and auto-reconnection:

```typescript
import { CrewClient } from '@blacklite/crew-sdk';

const client = new CrewClient({
  port: 3000,
  auth: { token: process.env.COPILOT_TOKEN },
  reconnection: { maxRetries: 5, backoffMs: 1000 },
});

await client.connect();
```

The client tracks connection state via `CrewConnectionState`: `disconnected → connecting → connected → reconnecting → error`. Auto-reconnection uses exponential backoff with jitter.

---

## Session Management

Use `CrewClientWithPool` for production workloads — it composes `CrewClient`, `SessionPool`, and `EventBus`:

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

`SessionPool` enforces concurrency limits, runs health checks, and reaps idle sessions automatically. `SessionStatus` tracks each session through `creating → active → idle → error → destroyed`.

---

## Event Handling

`EventBus` provides typed pub/sub for session lifecycle events:

```typescript
crew.events.on('session.created', (event) => {
  console.log(`Session ${event.sessionId} started`);
});

crew.events.on('session.status_changed', (event) => {
  if (event.payload.status === 'error') {
    // handle degraded session
  }
});
```

Events include `session.created`, `session.destroyed`, `session.status_changed`, and tool execution events.

---

## Error Handling

All SDK errors are wrapped in `CrewError` subtypes with severity, category, and recoverability:

```typescript
try {
  await client.connect();
} catch (err) {
  if (err instanceof SDKConnectionError) {
    // Retryable — client will auto-reconnect
  } else if (err instanceof AuthenticationError) {
    // Fatal — check credentials
  }
}
```

Error classes:

| Class | Description |
|-------|-------------|
| `SDKConnectionError` | Connection failures (retryable) |
| `SessionLifecycleError` | Session create/destroy issues |
| `ToolExecutionError` | Tool handler failures |
| `ModelAPIError` | Model API call failures |
| `ConfigurationError` | Invalid configuration |
| `AuthenticationError` | Auth failures (fatal) |
| `RateLimitError` | Rate limit exceeded |
| `RuntimeError` | General runtime errors |
| `ValidationError` | Input validation failures |

Use `ErrorFactory` to wrap raw SDK errors with Crew context.

---

## Telemetry

`TelemetryCollector` tracks operation latency and error rates. `HealthMonitor` runs periodic connection checks returning `HealthCheckResult` with status (`healthy | degraded | unhealthy`) and response time.

---

## See Also

- [SDK API Reference](api-reference.md) — Full type and function reference
- [Tools & Hooks](tools-and-hooks.md) — Custom tools and hook pipeline
- [SDK Reference](sdk.md) — Quick reference
