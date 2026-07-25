# Crew in VS Code

> ⚠️ **Experimental** — Crew is alpha software. APIs, commands, and behavior may change between releases.


Crew is fully supported in VS Code (v0.4.0+). Your team runs identically to the CLI, with the same `.crew/` state, same agents, same decisions — but with VS Code-specific tooling and constraints.

This guide covers what's different, what's the same, and when to use CLI vs VS Code.

---

## Getting Started

### Prerequisites

- **VS Code** — Latest version
- **GitHub Copilot extension** — `GitHub.copilot` (installed, authenticated)
- **Workspace trust** — Your workspace must be trusted (VS Code security)
- **Node.js 20+ (LTS)** — If running CLI to initialize Crew
- **Crew installed** — Either in the repo already (from CLI), or initialized fresh via agent selection

### Initial Setup

**Option A: Initialize with CLI (recommended)**

```bash
npm install -g @blacklite/crew-cli
```

Creates `.github/agents/crew.agent.md` and `.crew/templates/`. Then open VS Code and select **Crew** from the agent picker.

**Option B: Fresh in VS Code**

Open Copilot in VS Code, select **Crew** from `/agents`. Crew detects it's running in VS Code and bootstraps normally. The `.crew/` directory is created on first run.

---

## How It Works

Crew detects VS Code automatically and adapts its spawning mechanism:

- **In CLI:** Uses `task` tool with full control (model selection, agent type, background mode)
- **In VS Code:** Uses `runSubagent` for **parallel synchronous execution**

When you assign work to an agent, the coordinator spawns that agent as a sub-agent in VS Code. Multiple sub-agents spawn in **the same turn** run in **parallel**. Each completes, then you get all results at once — no intermediate "launch table" feedback like CLI shows.

---

## What's Different from CLI

### No Per-Spawn Model Selection

VS Code accepts the session model (your Copilot model picker). No per-spawn dynamic selection. Cost optimization deferred — use Haiku via model picker for cheaper runs.

### Sub-Agents Run Sync (But Parallel)

Agents launch in the same turn and run in parallel, but block as a group. Results arrive all at once — no launch table or `read_agent` polling.

### SQL Tool Not Available

SQL unavailable in VS Code agents. Workflows needing SQL should live in CLI, or use file-based state (JSON in `.crew/state/`).

### File Writes May Prompt for Approval

VS Code security feature: approve file modifications once with "Always allow in this workspace".

---

## What's the Same

### Same `.crew/` State

Initialize in CLI, use in VS Code, or vice versa. Team roster, decisions, histories are identical across both.

### Same Team, Same Skills

Charters, histories, agent roles persist. Decisions made in CLI are visible in VS Code.

### Parallel Execution Works

Multiple agents in one turn → all run in parallel. Equivalent throughput to CLI background mode.

### Full File Access (Workspace-Scoped)

Read/write your entire workspace and `.crew/` directory. Cannot reach outside workspace.

### MCP Tools Inherited

If workspace has MCP servers configured, sub-agents inherit them (GitHub MCP, semantic search, terminal).

---

## Tips

Use single-root workspaces (multi-root has path resolution bugs).

Accept file modification approval once — subsequent writes are automatic.

For initial setup, heavy parallel work (5+ agents), SQL workflows, or cost optimization (per-spawn model selection) → use CLI.

Check the model picker at top of chat if agents seem slow or expensive — switch to Haiku for cost savings.

---

## Known Limitations

- **JetBrains IDEs** — Untested. Agent spawning mechanism undocumented.
- **GitHub.com (web)** — Untested. Copilot Chat on GitHub.com doesn't support Crew.
- **Custom agent model selection** — Phase 2 future feature.

See [Getting Started](../get-started/first-session.md) for your first VS Code session.

---

## Extension Developer Guide

If you're building a VS Code extension that integrates with Crew, follow these patterns.

### Detect Client Mode

```typescript
const isVSCodeMode = process.env.CREW_CLIENT === 'vscode';

if (!isVSCodeMode) {
  console.warn('CrewUI should only run in VS Code');
  return;
}
```

### Import SDK Safely

**DO:** Import specific types and functions

```typescript
import type { CastMember, AgentCharter } from '@blacklite/crew-sdk';
import { loadConfig, resolveCrew } from '@blacklite/crew-sdk';
```

**DON'T:** Import the CLI entry point — this will call `process.exit()` and crash your extension.

### Load Configuration

```typescript
import { loadConfig, resolveCrew } from '@blacklite/crew-sdk';

try {
  const crewPath = resolveCrew(workspaceRoot);
  const config = await loadConfig(crewPath);
  console.log('Crew loaded:', config.team.name);
} catch (err) {
  console.warn('Crew not found:', err.message);
  return;
}
```

### Spawn Agents

```typescript
import { CrewCoordinator } from '@blacklite/crew-sdk';

const coordinator = new CrewCoordinator({ teamRoot: crewPath });
await coordinator.initialize();

const decision = await coordinator.route('refactor this function');
await coordinator.execute(decision, 'refactor this function');
```

### Stream Responses

```typescript
import { startStreaming } from '@blacklite/crew-sdk';

const stream = await startStreaming(agentResponse);
for await (const chunk of stream) {
  vscodePanel.append(chunk);
}
```

### Handle Errors Gracefully

```typescript
try {
  const result = await coordinator.route(userTask);
} catch (err) {
  vscode.window.showErrorMessage(`Crew error: ${err.message}`);
}
```

Never call `process.exit()` in an extension — it crashes VS Code.

### Pass Editor Context

```typescript
const editor = vscode.window.activeTextEditor;

const decision = await coordinator.route(userTask, {
  fileContent: editor.document.getText(),
  fileName: editor.document.fileName,
  selection: editor.selection,
  language: editor.document.languageId,
});
```

---

## See Also

- [Getting Started](../get-started/installation.md) — Installation and setup guide
- [Parallel Execution](parallel-execution.md) — How Crewron fan-outs agents
- [Model Selection](model-selection.md) — Cost-first routing strategy
- [Interactive Shell](../guide/shell.md) — Shell commands and features
- [SDK API Reference](../reference/api-reference.md) — Full SDK type and function reference
