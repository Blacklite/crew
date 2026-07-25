# Crew — Product Guide

## What is Crew?

Crew gives you an AI development team through GitHub Copilot. You describe what you're building. Crew proposes a team of specialists — lead, frontend, backend, tester — that live in your repo as files. Each agent runs in its own context window, reads its own knowledge, and writes back what it learned. They persist across sessions, share decisions, and get better the more you use them.

It is not a chatbot wearing hats. Each team member is spawned as a real sub-agent with its own tools, its own memory, and its own area of expertise.

---

## Which CLI should I use?

**Use GitHub Copilot CLI for day-to-day work.** It's the recommended interface for interacting with your Crew — full agent spawning, model selection, and conversational access to all features.

**Use Crew CLI for setup and operations:**
- Initial setup: `crew init`
- Build from config: `crew build`
- Diagnostics: `crew doctor`
- Interactive shell: `crew shell` — **Deprecated** (use `copilot --agent crew`)
- Continuous triage: `crew triage --interval 10`
- Watch mode: `crew watch`
- Aspire dashboard: `crew aspire`
- Export/import: `crew export` and `crew import`
- Plugin management: `crew plugin install <name>`

**Common workflow:**
```bash
# Terminal 1: Run continuous triage (Crew CLI)
crew triage --interval 10

# Terminal 2: Work with your team (GitHub Copilot CLI)
gh copilot
> @crew what issues are ready to work?
```

Both CLIs read and write the same `.crew/` directory, so state stays synchronized. For more details, see [FAQ: Which CLI should I use?](guide/faq.md#which-cli-should-i-use) and [Client Compatibility Matrix](scenarios/client-compatibility.md).

---

## Supported platforms

Crew works across multiple interfaces — GitHub Copilot CLI, VS Code, Crew CLI, SDK, and the Copilot Coding Agent. Pick the one that fits your workflow:

- **GitHub Copilot CLI** — Day-to-day conversational work with your crew (recommended)
- **VS Code** — Same experience, editor-integrated
- **Crew CLI** — Setup, diagnostics, monitoring (`crew init`, `crew doctor`, `crew watch`)
- **SDK** — Build tools on top of Crew with `crew.config.ts`
- **Copilot Coding Agent** — Autonomous issue processing via `@copilot`

**Multi-platform support:** Crew also works with Azure DevOps (work items, PRs via `az boards`/`az repos`), GitLab Issues, and Microsoft Planner through pluggable platform adapters. See [Enterprise Platforms](features/enterprise-platforms.md) for details.

Not sure which to use? See [Choose your interface](get-started/choose-your-interface.md) for a complete comparison and decision tree.

---

## Installation

```bash
npm install -g @blacklite/crew-cli
```

**Requirements:**
- Node.js 20+ (LTS)
- GitHub Copilot (CLI, VS Code, Visual Studio, or Coding Agent)
- A git repository (Crew stores team state in `.crew/`)
- **`gh` CLI** — required for GitHub Issues, PRs, Ralph, and Project Boards ([install](https://cli.github.com/))

Running `crew init` creates the `.crew/` directory structure, copies `crew.agent.md` into `.github/agents/`, and installs GitHub Actions workflows into `.github/workflows/`. Your team is created at runtime when you first talk to Crew.

**Note:** When you select Crew from the agent picker, you'll see the version number in the name (e.g., "Crew (v0.8.25)"). This helps you confirm which version is installed.

### GitHub CLI authentication

Crew uses the `gh` CLI for all GitHub API operations — issues, PRs, labels, project boards, and Ralph's work monitoring. You must authenticate before using any of these features.

**Quick start:**

```bash
gh auth login
```

Choose **GitHub.com**, **HTTPS**, and authenticate with your browser or a Personal Access Token (PAT Classic).

**Verify it worked:**

```bash
gh auth status
```

**Additional scopes** — some features require scopes beyond the default:

| Feature | Required scope | Command |
|---------|---------------|---------|
| Issues, PRs, Ralph | `repo` (included by default) | — |
| Project Boards | `project` | `gh auth refresh -s project` |

The `gh auth refresh` command adds scopes to your existing token — it takes about 10 seconds and you only need to do it once.

**Troubleshooting:**

- **"gh: command not found"** — Install the GitHub CLI from https://cli.github.com/
- **"HTTP 401" or "authentication required"** — Run `gh auth login` to re-authenticate
- **Project board commands fail** — Run `gh auth refresh -s project` to add the `project` scope
- **"Resource not accessible by integration"** — Your token may lack the `repo` scope. Re-authenticate with a PAT Classic that has `repo` and `project` scopes

---

## How teams form (init mode)

When you open Copilot and select **Crew** for the first time in a repo, there's no team yet. Crew enters Init Mode:

1. **Crew identifies you** via `git config user.name` and uses your name in conversation.
2. **You describe your project** — language, stack, what it does.
3. **Crew casts a team** — agents get names from a single fictional universe (e.g., Apollo 13 / NASA Mission Control, The Usual Suspects, Ocean's Eleven). The universe is selected deterministically based on team size, project shape, and what's been used before. Names are persistent identifiers — they don't change the agent's behavior or voice.
4. **Crew proposes the team:**

```
🏗️  FLIGHT   — Lead          Scope, decisions, code review
⚛️  RETRO    — Frontend Dev  React, UI, components
🔧  GNC      — Backend Dev   APIs, database, services
🧪  TELMU    — Tester        Tests, quality, edge cases
📋  Scribe   — (silent)      Memory, decisions, session logs
```

5. **You confirm** — say "yes", adjust roles, add someone, or just give a task (which counts as implicit yes).

Crew then creates the `.crew/` directory structure with charters, histories, routing rules, casting state, and ceremony config. Each agent's `history.md` is seeded with your project description and tech stack so they have day-1 context.

### What gets created

```
.crew/
├── team.md                    # Roster — who's on the team
├── routing.md                 # Who handles what
├── ceremonies.md              # Team meeting definitions
├── decisions.md               # Shared brain — team decisions
├── decisions/inbox/           # Drop-box for parallel decision writes
├── casting/
│   ├── policy.json            # Universe allowlist and capacity
│   ├── registry.json          # Persistent agent name registry
│   └── history.json           # Universe usage history
├── agents/
│   ├── {name}/
│   │   ├── charter.md         # Identity, expertise, boundaries
│   │   └── history.md         # What they know about YOUR project
│   └── scribe/
│       └── charter.md         # Silent memory manager
├── skills/                    # Shared skill files (SKILL.md)
├── orchestration-log/         # Per-spawn log entries
└── log/                       # Session history
```

**Commit this folder.** Anyone who clones your repo gets the team — with all their accumulated knowledge.

---

## Talking to your team (routing)

How you phrase your message determines who works on it.

### Name an agent directly

```
> FLIGHT, fix the error handling in the API
```

Crew spawns FLIGHT specifically.

### Say "team" for parallel fan-out

```
> Team, build the login page
```

Crew spawns multiple agents simultaneously — frontend builds the UI, backend sets up endpoints, tester writes test cases from the spec, all at once.

### General requests

```
> Add input validation to the form
```

Crew checks `routing.md`, picks the best match, and may launch anticipatory agents (e.g., tester writes validation test cases while the implementer builds).

### Quick questions — no spawn

```
> What port does the server run on?
```

Crew answers directly without spawning an agent.

### Example prompts to try

| You say | What happens |
|---------|-------------|
| `"RETRO, set up the project structure"` | RETRO (Frontend) scaffolds the project |
| `"Team, build the user dashboard"` | Multiple agents launch in parallel |
| `"Where are we?"` | Crew gives a quick status from recent logs |
| `"Run a retro"` | Lead facilitates a retrospective ceremony |
| `"I need a DevOps person"` | A new agent joins, named from the same universe |
| `"Always use single quotes in TypeScript"` | Captured as a directive to `decisions.md` |

---

## Response modes

Crew automatically picks the right response speed based on your request complexity. Direct answers take seconds, full agent spawns take longer but deliver deeper reasoning and parallel work. You don't control the mode — Crew routes based on what the task needs.

→ [Full guide: Response Modes](features/response-modes.md)

---

## SDK-first mode

Define your team in TypeScript instead of maintaining markdown files manually. Write a `crew.config.ts` with type-safe builder functions, and `crew build` generates the `.crew/` governance markdown.

```typescript
import { defineCrew, defineTeam, defineAgent, defineRouting } from '@blacklite/crew-sdk';

export default defineCrew({
  team: defineTeam({
    name: 'Core Crew',
    description: 'The main engineering team',
    members: ['@edie', '@mcmanus'],
  }),
  agents: [
    defineAgent({
      name: 'edie',
      role: 'TypeScript Engineer',
      model: 'claude-sonnet-4',
      capabilities: [{ name: 'type-system', level: 'expert' }],
    }),
  ],
  routing: defineRouting({
    rules: [{ pattern: 'feature-*', agents: ['@edie'], tier: 'standard' }],
    defaultAgent: '@coordinator',
  }),
});
```

**Get started:**

```bash
crew init --sdk          # New project with SDK config
crew migrate --to sdk    # Convert existing .crew/ to TypeScript
crew build               # Generate .crew/ from config
crew build --check       # Validate in CI without writing
```

Builder functions: `defineTeam()`, `defineAgent()`, `defineRouting()`, `defineCeremony()`, `defineHooks()`, `defineCasting()`, `defineTelemetry()`, `defineSkill()`, `defineCrew()`.

→ [Full guide: SDK-First Mode](sdk-first-mode.md)

---

## Casting system

Crew names agents from fictional universes — Apollo 13 / NASA Mission Control (the default), The Usual Suspects, Breaking Bad, Star Trek, and others. The universe is selected deterministically based on team size and project shape.

Casting is **persistent** — once an agent receives a name, it keeps that name across sessions. The casting registry lives in `.crew/casting/registry.json`. You control which universes are available through a policy allowlist and can set per-universe capacity limits.

In SDK-first mode, configure casting with `defineCasting()`:

```typescript
defineCasting({
  allowlistUniverses: ['Apollo 13', 'Breaking Bad'],
  overflowStrategy: 'generic',
  capacity: { 'Apollo 13': 8 },
});
```

When a universe runs out of names, the overflow strategy determines what happens: `reject` (error), `generic` (use a functional name), or `rotate` (move to the next universe).

---

## Skills system

Skills are reusable knowledge patterns that agents load on demand. They live in `.copilot/skills/{name}/SKILL.md` and teach agents how to handle specific tasks — branching workflows, deployment strategies, testing patterns, or domain expertise.

Skills have a confidence lifecycle: `low` → `medium` → `high`, and track their source: `manual` (you wrote it), `observed` (agent saw a pattern), `earned` (validated through use), or `extracted` (imported from another project).

In SDK-first mode, define skills with `defineSkill()`:

```typescript
defineSkill({
  name: 'git-workflow',
  description: 'Crew branching model and PR conventions',
  domain: 'workflow',
  confidence: 'high',
  source: 'manual',
  content: `
    ## Patterns
    - Branch from dev: crew/{issue-number}-{slug}
    - PRs target dev, not main
  `,
});
```

Skills accumulate as you work. After a few sessions, your team has a knowledge base tailored to your codebase.

→ [Full guide: Skills](features/skills.md)

---

## Ceremonies

Ceremonies are structured team meetings. Crew ships with two default ceremonies — Design Review (triggers before multi-agent work) and Retrospective (triggers after failures). You can trigger ceremonies manually, create custom ones, or disable them. Configuration lives in `.crew/ceremonies.md`.

In SDK-first mode, define ceremonies with `defineCeremony()`:

```typescript
defineCeremony({
  name: 'standup',
  trigger: 'schedule',
  schedule: '0 9 * * 1-5',
  participants: ['@edie', '@mcmanus'],
  agenda: 'Yesterday / Today / Blockers',
});
```

→ [Full guide: Ceremonies](features/ceremonies.md#ceremonies)

---

## Ralph — work monitor

Ralph triages your issue backlog, assigns work to agents, and keeps the board moving. Activate Ralph when you have open issues, and he reports every 3–5 rounds.

```
> Ralph, start monitoring
```

**CLI commands:**
- `crew triage` — run a single triage pass
- `crew triage --interval 10` — continuous triage every 10 minutes
- `crew watch` — Ralph watchdog mode (monitors and auto-restarts)

The `crew-heartbeat` workflow runs Ralph on a schedule — your crew triages issues between sessions.

**Note:** `crew ralph` is a legacy alias. New projects should use `crew triage`.

→ [Full guide: Ralph — Work Monitor](features/ralph.md#ralph--work-monitor)

---

## Memory system

Crew's memory is layered — personal agent histories, shared team decisions, and reusable skills. Knowledge compounds over sessions. After a few sessions, agents stop asking questions they've already answered. Mature projects carry full architecture knowledge and decision history.

→ [Full guide: Memory System](features/memory.md)

---

## Plugin marketplace

Extend your crew with community plugins — reusable collections of skills, ceremonies, and directives.

```bash
crew plugin install github/my-org/my-extension
crew plugin list
crew plugin remove my-extension
```

Plugins let you add domain expertise (Azure infrastructure patterns), workflow templates (client-delivery processes), or testing ceremonies without modifying Crew core. Build your own and share them.

→ [Full guide: Plugins](features/plugins.md) | [Marketplace](features/marketplace.md)

---

## SubCrews (streams)

Break large teams into focused SubCrews — smaller groups that work independently on different features or domains. SubCrews maintain their own routing and task queues while sharing the parent crew's decisions and memory.

```bash
crew subcrews
```

→ [Full guide: Streams](features/streams.md)

---

## Export and import

Export creates a portable snapshot of your entire team — agents, knowledge, skills. Import brings that snapshot into another repo. Crew handles collision detection and splits imported knowledge into portable learnings and project-specific context automatically.

```bash
crew export --out my-team.json
crew import my-team.json
crew import my-team.json --force   # Archive existing agents first
```

→ [Full guide: Export and Import](features/export-import.md#export--import)

---

## GitHub Issues mode

Crew integrates with GitHub Issues for issue-driven development. Connect to a repo, view the backlog, assign issues to agents, and Crew handles branch creation, implementation, PR creation, and review feedback. Agents link work to issues automatically.

→ [Full guide: GitHub Issues Mode](features/github-issues.md#github-issues-mode)

---

## PRD mode

Paste your product requirements document directly into Crew. The Lead agent decomposes the spec into discrete work items, assigns them to the right agents, and the team works in parallel. Specs become trackable tasks automatically.

→ [Full guide: PRD Mode](features/prd-mode.md#prd-mode)

---

## Human team members

Not every team member needs to be an AI agent. Add humans to the roster for decisions that require a real person — design sign-off, security review, product approval. Crew pauses when work is routed to a human and reminds you if they haven't responded.

→ [Full guide: Human Team Members](features/human-team-members.md#human-team-members)

---

## Notifications

Your crew can notify you when they need input — send instant pings to Teams, Discord, iMessage, or any webhook. Agents trigger notifications when they're blocked, need a decision, hit an error, or complete important work.

**Setup is quick:** Configure an MCP notification server (takes 5 minutes), and agents automatically know when to ping you.

See [Notifications Guide](features/notifications.md#quick-start-teams-simplest-path) for platform-specific setup and examples. For MCP configuration details, see [MCP Setup Guide](features/mcp.md#step-by-step-cli-setup).

---

## Multi-platform support

Crew works with more than GitHub. Pluggable platform adapters let you use:

- **GitHub** — Issues, PRs, Project Boards (via `gh` CLI)
- **Azure DevOps** — Work items, repos, PRs (via `az boards`/`az repos` CLI)
- **GitLab** — Issues and merge requests
- **Microsoft Planner** — Hybrid work-item tracking (via Microsoft Graph API)

Configure cross-project ADO support in `.crew/config.json` — work items can live in a different org/project than the repo.

→ [Full guide: Enterprise Platforms](features/enterprise-platforms.md) | [GitLab Issues](features/gitlab-issues.md)

---

## Upgrading

Already have Crew installed? Update to the latest version:

```bash
npm install -g @blacklite/crew-cli@latest
```

Run `crew doctor` to validate your setup after upgrading:

```bash
crew doctor
```

Doctor runs 9 checks — Node.js version, `gh` CLI auth, `.crew/` directory structure, team state, and more. It reports issues with clear fix instructions.

**Migrating from `.ai-team/` to `.crew/`:**

```bash
crew migrate --from ai-team
```

This renames `.ai-team/` to `.crew/` and updates all internal references.

---

## Context budget

Each agent runs in its own context window. Real numbers:

| What | Tokens | % of 200K window |
|------|--------|-------------------|
| Coordinator (crew.agent.md) | ~13,200 | 6.6% |
| Agent at Week 1 (charter + seed history + decisions) | ~1,250 | 0.6% |
| Agent at Week 4 (+ 15 learnings, 8 decisions) | ~3,300 | 1.7% |
| Agent at Week 12 (+ 50 learnings, 47 decisions) | ~9,000 | 4.5% |
| **Remaining for actual work** | **~187,000** | **93%+** |

The coordinator uses 6.6% of its window. A 12-week veteran agent uses 4.5% — but in **its own window**, not yours. Fan out to 5 agents and you get ~1M tokens of total reasoning capacity across all windows.

---

## Known limitations

- **Experimental** — file formats and APIs may change between versions.
- **Silent success bug** — approximately 7–10% of background agent spawns complete all their file writes but return no text response. This is a platform-level issue. Crew detects it by checking the filesystem for work product and reports what it finds. Work is not lost.
- **Platform latency** — response times depend on the Copilot platform. Complex multi-agent tasks take 40–60 seconds. Simple questions are answered in 2–3 seconds.
- **Node 20+** — requires a Node.js LTS release (v20.0.0 or later).
- **GitHub Copilot required** — Crew works across Copilot hosts (CLI, VS Code, Visual Studio, Coding Agent).
- **First session is the least capable** — agents improve as they accumulate history. Give it a few sessions before judging.

---

## Adding and removing team members

### Adding

```
> I need a DevOps person
```

Crew allocates a name from the current universe, generates a charter and history seeded with project context, and adds them to the roster. Immediately productive.

### Removing

```
> Remove the designer — we're past that phase
```

Agents are never deleted. Their charter and history move to `.crew/agents/_alumni/`. Knowledge is preserved. If you need them back later, they remember everything.

---

## Reviewer protocol

Agents with review authority can reject work. On rejection, the original author is locked out and a different agent must handle the revision. This prevents the common failure mode where an agent keeps fixing its own work in circles.

→ [Full guide: Reviewer Protocol](features/reviewer-protocol.md#reviewer-rejection-protocol)

---

## File ownership

Crew maintains a clear ownership model:

| What | Owner | Safe to edit? |
|------|-------|--------------|
| `.github/agents/crew.agent.md` | Crew (overwritten on upgrade) | No — your changes will be lost |
| `.crew/` | You and your team | Yes — this is your team's state |
| `crew.config.ts` | You | Yes — your SDK-first config |
| Everything else | You | Yes |

---

## Quick reference

| Command | What it does |
|---------|-------------|
| `crew init` | Initialize Crew in the current repo |
| `crew init --sdk` | Initialize with SDK-first TypeScript config |
| `crew init --global` | Initialize a personal crew (cross-project) |
| `crew build` | Generate `.crew/` from `crew.config.ts` |
| `crew build --check` | Validate generated files match disk (for CI) |
| `crew doctor` | Run 9 setup validation checks |
| `crew shell` | **Deprecated** — Enter the interactive shell (use `copilot --agent crew`) |
| `crew triage` | Run a single triage pass |
| `crew triage --interval 10` | Continuous triage every 10 minutes |
| `crew watch` | Ralph watchdog mode |
| `crew export` | Export team to `crew-export.json` |
| `crew import <file>` | Import team from export file |
| `crew import <file> --force` | Import, archiving existing agents |
| `crew plugin install <name>` | Install a plugin from the marketplace |
| `crew plugin list` | List installed plugins |
| `crew migrate --to sdk` | Convert existing crew to SDK-first config |
| `crew migrate --from ai-team` | Migrate from `.ai-team/` to `.crew/` |
| `crew subcrews` | Manage SubCrews |
| `crew status` | Show team status and global config |
| `crew --version` | Show installed version |
| `crew --help` | Show help |
