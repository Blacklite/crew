# Crew.Agents.AI

> **Preview package.** `Crew.Agents.AI` is a preview NuGet package for early adopters. It multi-targets `net8.0`, `net9.0`, and `net10.0`, and depends on preview Microsoft Agent Framework / GitHub Copilot SDK packages, so APIs may change before a stable release.

## What it does

`Crew.Agents.AI` exposes a Crew team as a Microsoft Agent Framework `AIAgent`. `CrewAgent` composes the Crew CLI through the GitHub Copilot SDK, delegates MAF sessions/runs/streaming to the inner Copilot agent, and gives .NET consumers a DI-friendly wrapper instead of hand-rolling CLI process setup.

Public surface in this preview:

- `CrewAgent` — sealed `AIAgent` wrapper over the Copilot-backed inner agent. Supports both non-streaming and streaming via `RunStreamingAsync`.
- `CrewAgentOptions` — team root, CLI path/args, environment, token, logging, instruction settings, and a `ConfigureCopilotClient` delegate for advanced SDK customization.
- `CrewConnectionFactory` — parses PATH or `crew://` connection strings into options.
- `CrewServiceCollectionExtensions` — registers `CrewAgent` and base `AIAgent` in DI, with standard and keyed overloads.

Repository: <https://github.com/Blacklite/crew>

## Install

```bash
dotnet add package Crew.Agents.AI --prerelease
```

If you are consuming the PR before publish, pack it locally and add the generated package source:

```bash
dotnet pack src/Crew.Agents.AI/Crew.Agents.AI.csproj -c Release -o nupkgs
dotnet add package Crew.Agents.AI --prerelease --source ./nupkgs
```

## Prerequisites

- .NET 10 SDK.
- GitHub Copilot CLI available on `PATH` (`copilot --version`).
- Crew CLI and an initialized Crew team root; see the [Crew CLI repo](https://github.com/Blacklite/crew).
- GitHub Copilot authentication through the signed-in user. The quickstart below does not require an app key or environment variable.

## Five-line quickstart

```csharp
using Microsoft.Agents.AI;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Crew.Agents.AI;

var builder = Host.CreateApplicationBuilder(args);
builder.Services.AddCrewAgent(o =>
{
    o.CrewFolderPath = @"C:\path\to\your\team-root";
});

using var host = builder.Build();
var crew = host.Services.GetRequiredService<AIAgent>();
var session = await crew.CreateSessionAsync();
var response = await crew.RunAsync("What can this Crew team do?", session);
Console.WriteLine(response.Text);
```

## Streaming

`CrewAgent` supports streaming via the MAF `RunStreamingAsync` method. The inner Copilot-backed agent streams response updates as they arrive from the CLI process:

```csharp
var crew = host.Services.GetRequiredService<CrewAgent>();
var session = await crew.CreateSessionAsync();

await foreach (var update in crew.RunStreamingAsync("Summarize the team.", session))
{
    Console.Write(update.Text);
}
```

## Keyed DI

Register multiple Crew teams in the same DI container using .NET 8+ keyed services:

```csharp
builder.Services.AddKeyedCrewAgent("research", o =>
{
    o.CrewFolderPath = @"C:\research-team";
});

builder.Services.AddKeyedCrewAgent("platform", o =>
{
    o.CrewFolderPath = @"C:\platform-team";
});

// Resolve in a minimal API endpoint:
app.MapGet("/ask-research", async ([FromKeyedServices("research")] CrewAgent agent) =>
{
    var session = await agent.CreateSessionAsync();
    var response = await agent.RunAsync("What's the latest?", session);
    return response.Text;
});
```

Keyed registrations include `AddKeyedCrewAgent` overloads for service key, optional connection-string name, and lifetime. Keyed and non-keyed registrations can coexist.

## Advanced: ConfigureCopilotClient (BYOK)

Use `ConfigureCopilotClient` to customize the underlying `CopilotClientOptions` after Crew applies its standard values. This is the extension point for injecting custom environment variables, providing a BYOK token, or tuning SDK settings:

```csharp
builder.Services.AddCrewAgent(o =>
{
    o.CrewFolderPath = @"C:\team";
    o.ConfigureCopilotClient = clientOpts =>
    {
        // Inject a BYOK token from your own credential store
        clientOpts.GitHubToken = myVault.GetSecret("copilot-token");

        // Add custom environment variables for the CLI process
        clientOpts.Environment = new Dictionary<string, string>
        {
            ["MY_CUSTOM_VAR"] = "value"
        };
    };
});
```

> **Routing guard:** Crew enforces a hard routing gate — if the delegate changes `Cwd`, `CliPath`, or `CliArgs`, the original values are restored and a warning is logged. Configure these via `CrewAgentOptions` instead.

## GitHub Copilot authentication

The default path mirrors the base GitHub Copilot SDK examples: leave `GitHubToken` and `GitHubTokenProvider` unset, then run with a locally signed-in GitHub Copilot user. For local development, sign in before running the app, for example with `gh auth login`, the Copilot CLI sign-in flow, or a Copilot-supported local sign-in that the SDK runtime can access.

The SDK documents the credential priority order in [Authenticate Copilot SDK](https://github.com/github/copilot-sdk/blob/main/docs/auth/authenticate.md) and the broader [authentication overview](https://github.com/github/copilot-sdk/blob/main/docs/auth/index.md). Explicit tokens and environment variables are supported by the SDK, but they are not required for the minimal happy path.

Use `GitHubTokenProvider` only when the host owns token retrieval, such as Key Vault, managed identity, or CI secret flow scenarios. Use `GitHubToken` only when you already have a Copilot-supported token in process and cannot use a provider callback. Use `ConfigureCopilotClient` when you need full control over the SDK's `CopilotClientOptions`, including BYOK token injection.

## Aspire / configuration path

`AddCrewAgent()` reads `ConnectionStrings:crew` through `IConfiguration.GetConnectionString("crew")`. In environment variables, use `ConnectionStrings__crew`.

Named registrations support both connection-string conventions:

| Style | Example | Looks up |
|---|---|---|
| **Aspire-style direct** (tried first) | `AddCrewAgent("research-crew")` | `ConnectionStrings:research-crew` |
| **Legacy prefixed fallback** | `AddCrewAgent("research")` | `ConnectionStrings:crew-research` |

So when an Aspire AppHost registers a Crew resource via `builder.AddCrew("research-crew", ...)` and a downstream project does `.WithReference(researchCrew)`, the consumer can resolve the agent with a single `builder.Services.AddKeyedCrewAgent("research-crew")` call — the SDK finds the Aspire-injected connection string automatically. Existing consumers using the prefixed form continue to work; the SDK tries the literal name first and falls back to `crew-{name}` if the direct lookup is empty.

Supported connection string forms:

```text
C:\path\to\team-root
crew://localhost?teamRoot=C%3A%5Cteam&cliPath=C%3A%5Ctools%5Ccopilot.exe&cliArgs=--yolo&env=KEY=value
```

Parsed URI query keys: `teamRoot`, `cliPath`, `cwd`, `cliArgs` (semicolon-separated), and `env` (`key=value;key2=value2`). Unknown URI host/protocol values are reserved for future use.

## Coordinator agent selection

`CrewAgent` exists to wrap a Crew coordinator team, so it passes `--agent crew` to the underlying `copilot.exe` child process by default. That tells the CLI to load `.github/agents/crew.agent.md` as the agent definition — which is what teaches the coordinator to eager-execute, fan out, and dispatch through the `task` tool. Without it, the CLI uses its built-in generic agent and the coordinator role-plays responses inline instead of spawning real subagents — producing SDK behavior that does NOT match running `copilot --agent crew` interactively against the same team root.

| Scenario | What the SDK does |
|---|---|
| Default — `crew.agent.md` exists | Auto-adds `--agent crew` |
| `crew.agent.md` not found at `.github/agents/` | Silently skips `--agent` (graceful degradation for not-yet-initialized teams; logs a Debug message) |
| Consumer sets `AgentFileName = "data"` (and file exists) | Auto-adds `--agent data` |
| Consumer sets `AgentFileName = null` | Skips `--agent` entirely |
| Consumer already supplied `--agent X` in `CliArgs` | Respects the explicit value; does not add a second `--agent` |

> SDK note: `SessionConfigBase.Agent` exists but looks up the name in the SDK's `CustomAgents` registry, NOT in `.github/agents/*.agent.md` files on disk. The CLI `--agent` flag is currently the only path that reads the on-disk agent definition.

## Subagent observability — first-class OpenTelemetry

`Crew.Agents.AI` emits one OpenTelemetry `Activity` per subagent dispatch out of the box. Hosts that subscribe to the activity source see one `crew.subagent {Name}` span per spawn, with the subagent name as a tag and timeline annotations (`crew.subagent.start`, `crew.subagent.message`, `crew.subagent.completed`, `crew.subagent.failed`) marking every state transition.

Two-line wiring is all that is required — no manual callback plumbing:

```csharp
using OpenTelemetry.Trace;
using Crew.Agents.AI;

builder.Services.AddOpenTelemetry()
    .WithTracing(t => t.AddSource(CrewAgentDiagnostics.ActivitySourceName));

builder.Services.AddCrewAgent(o => o.CrewFolderPath = @"C:\team");
```

When the coordinator's `task` tool spawns specialists, the host's tracer (Jaeger, Zipkin, Application Insights, or the Aspire dashboard's **Traces** view) shows one `crew.subagent` span per spawn, each tagged with `crew.subagent.name`, `crew.subagent.display_name`, `crew.subagent.sdk_agent_id`, and `crew.subagent.reply_preview` — plus timeline events for every lifecycle transition.

**Turning telemetry off.** Set `EmitSubagentActivities = false` to suppress Crew's built-in spans (for example, when you want to drive observability entirely from your own callback or avoid double-counting). The `OnSubagentTrace` callback continues to fire either way — it is the customization seam, independent of telemetry.

```csharp
builder.Services.AddCrewAgent(o =>
{
    o.CrewFolderPath = @"C:\team";
    o.EmitSubagentActivities = false;          // disable built-in OTel emission
    o.OnSubagentTrace = trace =>               // handle telemetry yourself
    {
        if (trace.Kind == CrewAgentTraceEventKind.SubagentStarted)
            MyMetrics.IncrementSpawn(trace.SubagentName!);
    };
});
```

## Key options

| Option | Purpose |
|---|---|
| `CrewFolderPath` | Crew team root; PATH connection strings set this and `Cwd`. |
| `CliPath` / `CliArgs` | Override the Copilot CLI executable and add extra CLI flags. |
| `Cwd` | Working directory for the Copilot CLI process; defaults to `CrewFolderPath`. |
| `Environment` | Additional environment variables for the CLI process. Excluded from JSON serialization; token-pattern keys are redacted in `ToString()`. |
| `GitHubToken` | Advanced direct token escape hatch; excluded from JSON serialization and redacted by `ToString()`. |
| `GitHubTokenProvider` | Advanced callback for secure token retrieval; wins over `GitHubToken`. |
| `ConfigureCopilotClient` | Advanced delegate for customizing `CopilotClientOptions`. Routing properties are guarded; see BYOK section. |
| `TraceEvents` | Enables verbose SDK logging and emits a startup warning when enabled. |
| `AgentName` | Display name for the resulting `AIAgent`; defaults to `Crew`. |
| `AgentFileName` | Name of the agent definition under `.github/agents/{name}.agent.md` to load via the CLI's `--agent` flag. Defaults to `"crew"`. Set to `null` to skip auto-injection; the file-existence check makes this safe to leave on for not-yet-initialized teams. |
| `Instructions` | Optional system instructions passed to the inner Copilot agent. |
| `EmitSubagentActivities` | Whether the SDK opens an OpenTelemetry `Activity` per subagent dispatch and annotates lifecycle events. Defaults to `true`. Set to `false` to handle telemetry from your own `OnSubagentTrace` callback. |
| `OnSubagentTrace` | Optional callback invoked for every typed `CrewAgentTraceEvent`. Independent of `EmitSubagentActivities` — both can be on simultaneously. |

## Security

- **Credential redaction:** `GitHubToken` and `Environment` values whose keys match `*TOKEN*`, `*KEY*`, `*SECRET*`, `*HMAC*`, `*PASSWORD*`, or `*CREDENTIAL*` are always redacted in `ToString()` output.
- **JSON safety:** `GitHubToken`, `GitHubTokenProvider`, `Environment`, and `ConfigureCopilotClient` are marked `[JsonIgnore]` and will not appear in JSON serialization output.
- **Routing guard:** The `ConfigureCopilotClient` delegate cannot change `Cwd`, `CliPath`, or `CliArgs` — changes are silently restored to prevent routing the agent to an unintended CLI process.
- **TraceEvents warning:** Enabling `TraceEvents` logs a startup warning because verbose SDK traces may include sensitive operational details.
- **Avoid hardcoded tokens:** Never embed tokens in source code. Use `GitHubTokenProvider` for production token retrieval from Key Vault, managed identity, or similar secure stores.

## Notes for v0.1-preview

- Default DI lifetime is scoped. An overload accepts any `ServiceLifetime`.
- DI registers both `CrewAgent` and base `AIAgent` (non-keyed). Keyed DI registers both `CrewAgent` and `AIAgent` under the same key.
- Multi-targeting and Aspire telemetry remain candidates for a later preview.
- The package does not validate that `CrewFolderPath` exists; consumers should validate their deployment paths.
- `TraceEvents` can log sensitive operational details. Keep it off unless debugging.

## Package contents

- `lib/net10.0/Crew.Agents.AI.dll`
- `lib/net10.0/Crew.Agents.AI.xml` for IntelliSense / API docs
- `README.md` for NuGet.org rendering
- `.nuspec` metadata with authors, tags, repository, and readme pointer
- `LICENSE` copied from the repository root

## Sample

A runnable console application is included at
`src/Crew.Agents.AI/samples/Crew.Agents.AI.Sample/`. It demonstrates the four
core integration patterns in one place: basic DI, keyed DI with multiple agents,
the `ConfigureCopilotClient` BYOK delegate, and streaming via `RunStreamingAsync`.

### Prerequisites

| Prerequisite | Notes |
|---|---|
| [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0) | `dotnet --version` should print `10.x.x` |
| GitHub Copilot CLI on `PATH` | Install from [github.com/github/copilot-cli](https://github.com/github/copilot-cli); verify with `copilot --version` |
| Crew CLI installed | Follow the install guide in the [Crew repository README](https://github.com/Blacklite/crew#readme) |
| Initialized Crew team root | Run `crew init` in a directory; this becomes your team root |
| GitHub Copilot authentication | Run `gh auth login` or `copilot auth login` once before running the sample |

Set the team root path before running:

```bash
# Linux / macOS
export CREW_TEAM_ROOT=/path/to/your/team-root

# Windows PowerShell
$env:CREW_TEAM_ROOT = "C:\path\to\your\team-root"
```

### Run

Run all four flows in sequence:

```bash
dotnet run --project src/Crew.Agents.AI/samples/Crew.Agents.AI.Sample/
```

Run a single flow (1–4):

```bash
dotnet run --project src/Crew.Agents.AI/samples/Crew.Agents.AI.Sample/ -- --flow=1
dotnet run --project src/Crew.Agents.AI/samples/Crew.Agents.AI.Sample/ -- --flow=2
dotnet run --project src/Crew.Agents.AI/samples/Crew.Agents.AI.Sample/ -- --flow=3
dotnet run --project src/Crew.Agents.AI/samples/Crew.Agents.AI.Sample/ -- --flow=4
```

### Flow walkthrough

**Flow 1 — Basic DI registration** — `AddCrewAgent` registers `CrewAgent` and the
base `AIAgent` interface. Resolves the agent from DI, creates a session, calls
`RunAsync`, and prints `AgentResponse.Text`.

**Flow 2 — Keyed DI (multiple agents)** — `AddKeyedCrewAgent` registers two agents
under keys `"alpha"` and `"beta"`. Resolution uses
`GetRequiredKeyedService<CrewAgent>("alpha")`.

**Flow 3 — BYOK / `ConfigureCopilotClient` delegate** — the delegate receives
`CopilotClientOptions` after Crew has applied its defaults. Inject a custom token
or environment variable. The routing gate prevents accidental redirection of
`Cwd`, `CliPath`, or `CliArgs` — configure those on `CrewAgentOptions` directly.

**Flow 4 — Streaming** — `RunStreamingAsync` returns
`IAsyncEnumerable<AgentResponseUpdate>`. Each `update.Text` fragment is written to
`Console.Write` without a newline for live token-by-token output.

### Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `GitHub Copilot CLI was not found on PATH` | `copilot` binary is missing or not on `PATH` | Install from [github.com/github/copilot-cli](https://github.com/github/copilot-cli); verify with `copilot --version` |
| `Authentication failed` / `401` | Copilot CLI is not signed in | Run `gh auth login` or `copilot auth login` |
| `CrewFolderPath does not exist` | `CREW_TEAM_ROOT` points to a non-existent path | Set `CREW_TEAM_ROOT` to an initialized Crew team directory |
| `The system cannot find the file specified` (Win32Exception) | Copilot CLI not found | Same as first row above |
| Build error: `Package Crew.Agents.AI not found` | Sample uses a project reference; ensure you run from the repo root | Run `dotnet build` from the repository root or pass `--project src/Crew.Agents.AI/samples/Crew.Agents.AI.Sample/` |

## See also

- Root repo: <https://github.com/Blacklite/crew>
- Microsoft Agent Framework: <https://github.com/microsoft/agents>
- GitHub Copilot SDK authentication: <https://github.com/github/copilot-sdk/blob/main/docs/auth/authenticate.md>
- GitHub Copilot CLI: <https://github.com/github/copilot-cli>
- Changelog: <https://github.com/Blacklite/crew/blob/main/CHANGELOG.md>

License: MIT.
