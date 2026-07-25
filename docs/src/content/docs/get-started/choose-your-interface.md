# Choose your interface

> ⚠️ **Experimental** — Crew is alpha software. APIs, commands, and behavior may change between releases.


Crew works across multiple interfaces. Pick the one that fits your workflow.

---

## Try this:

```bash
# Day-to-day work with your crew
copilot --agent crew

# Setup and diagnostics
crew init
crew doctor
```

---

## What are the ways to use Crew?

Crew runs in multiple modes and across multiple platforms:

### GitHub Copilot CLI (`copilot` command)

The conversational terminal interface. Powered by the GitHub Copilot CLI, this is the recommended way to work with Crew day-to-day.

```bash
copilot --agent crew
```

Reads `.crew/` and uses `crew.agent.md` to coordinate your team. Full feature set — sub-agent spawning, per-spawn model selection, background execution, SQL tools, parallel fan-out.

### VS Code (GitHub Copilot in the editor)

Crew works identically in VS Code through GitHub Copilot. Same `.crew/` directory, same agents, same decisions. Full file access, parallel execution, MCP tool inheritance. See [Crew in VS Code](../features/vscode.md) for details.

### Crew CLI (`crew` command)

The Crew CLI provides setup, diagnostics, and automation commands. Not conversational — use this for installation, validation, and operational tasks.

```bash
# Setup
crew init

# Validation
crew doctor

# Monitoring
crew watch

# Observability
crew aspire
```

See [CLI Reference](../reference/cli.md) for all commands.

### Interactive shell (`crew start` / `crew shell`)

> ⚠️ **Deprecated:** The interactive shell is no longer recommended. Use [GitHub Copilot CLI](https://docs.github.com/en/copilot/github-copilot-in-the-cli) instead for a richer agent experience.
>
> ```bash
> copilot --agent crew
> ```

REPL mode for conversational interaction directly via the Crew CLI. Enter `crew` with no arguments to start a persistent shell session.

### SDK (`@blacklite/crew-sdk`)

Programmatic access for building tools on top of Crew. Typed APIs, routing config, agent lifecycle hooks.

```bash
npm install @blacklite/crew-sdk
```

```typescript
import { resolveCrew, loadConfig, CrewCoordinator } from '@blacklite/crew-sdk';
```

See [SDK Reference](../reference/sdk.md) for the complete API.

### Copilot Coding Agent (`@copilot`)

Autonomous GitHub bot that picks up labeled issues and opens draft PRs. Works across your entire organization without human intervention. Issue gets labeled → agent picks it up → PR gets opened → human reviews.

See [Copilot Coding Agent](../features/copilot-coding-agent.md) for setup.

---

## Which should I use?

| You want to... | Use | Why |
|----------------|-----|-----|
| **Work with your crew day-to-day** | **GitHub Copilot CLI** or **VS Code** | Conversational interface, full agent spawning, parallel execution. Most natural way to collaborate with your team. |
| **Set up Crew in a new repo** | **Crew CLI** (`crew init`) | One command initializes `.crew/` directory and all configuration. |
| **Check if Crew is working** | **Crew CLI** (`crew doctor`) | Validates directory structure, agents, configuration integrity. |
| **Monitor work 24/7** | **Crew CLI** (`crew watch`) | Persistent polling for new issues, auto-triage, agent assignment. |
| **View OpenTelemetry traces** | **Crew CLI** (`crew aspire`) | Launches Aspire dashboard for observability. |
| **Process issues autonomously** | **Copilot Coding Agent** | GitHub Actions workflow watches for labeled issues and dispatches `@copilot`. |
| **Build tools on top of Crew** | **SDK** | Typed APIs, configuration loading, agent lifecycle hooks. |

---

## Feature availability matrix

Not every feature works everywhere. Here's what's available where:

| Feature | GitHub Copilot CLI | VS Code | Crew CLI | Interactive shell | SDK |
|---------|:------------------:|:-------:|:---------:|:--------:|:---:|
| Agent spawning | ✅ | ✅ | ✅ | ⚠️ (deprecated) | ✅ |
| Ralph / work monitoring | ✅ | ✅ | ✅ (`crew watch`) | ❌ | ✅ |
| Per-spawn model selection | ✅ | ⚠️ (session model only) | ✅ | ❌ | ✅ |
| Background execution | ✅ | ⚠️ (parallel sync) | ✅ | ❌ | ✅ |
| SQL tool | ✅ | ❌ | ✅ | ❌ | ✅ |
| Aspire dashboard | ❌ | ❌ | ✅ | ❌ | ❌ |
| `crew doctor` diagnostics | ❌ | ❌ | ✅ | ❌ | ✅ |
| Issue assignment to `@copilot` | ❌ | ❌ | ✅ (setup) | ❌ | ❌ |

**Legend:**
- ✅ Fully supported
- ⚠️ Limited or constrained
- ❌ Not available

For a detailed breakdown of VS Code constraints and CLI parity, see [Client Compatibility Matrix](../scenarios/client-compatibility.md).

---

## Common workflows

### "I use GitHub Copilot CLI for everything"

```bash
# Terminal 1: Work with Crew
copilot --agent crew

# Let Crew call `crew` commands when needed (doctor, watch, aspire)
```

This is the recommended workflow. The CLI automatically invokes Crew CLI commands when needed.

### "I run crew watch in one terminal and use GitHub Copilot CLI in another"

```bash
# Terminal 1: Monitoring (persistent)
crew watch --interval 10

# Terminal 2: Work with Crew
copilot --agent crew
```

Keep Ralph monitoring issues in the background while you work conversationally.

### "I use VS Code with Copilot for coding and Crew CLI for setup"

```bash
# One-time setup
crew init
crew doctor

# Open VS Code, select Crew from agent picker
# Same .crew/ directory, same team
```

Initialize with CLI, work in VS Code.

---

## See also

- [Installation](installation.md) — Install Crew CLI, SDK, or use in VS Code
- [First Session](first-session.md) — Get started with your first Crew conversation
- [Client Compatibility Matrix](../scenarios/client-compatibility.md) — Full feature comparison across platforms
- [CLI Reference](../reference/cli.md) — All Crew CLI commands
- [Crew in VS Code](../features/vscode.md) — VS Code-specific guidance
- [SDK Reference](../reference/sdk.md) — Programmatic API
