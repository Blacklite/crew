# Crew

[English](README.md) | [中文](README.zh.md)

**Human-led AI agent teams for any project.** One command. A team that helps you move faster with your code.

[![Status](https://img.shields.io/badge/status-alpha-blueviolet)](#status)
[![Platform](https://img.shields.io/badge/platform-GitHub%20Copilot-blue)](#what-is-crew)

> ⚠️ **Alpha Software** — Crew is experimental. APIs and CLI commands may change between releases. We'll document breaking changes in [CHANGELOG.md](CHANGELOG.md).

---

## What is Crew?

Crew gives you a human-directed AI development team through GitHub Copilot. Describe what you're building. Get a team of specialists — frontend, backend, tester, lead — that live in your repo as files. They persist across sessions, learn your codebase, share decisions, and help you move faster without giving up oversight.

Crew is a productivity tool for humans, not a replacement for engineers, reviewers, or decision-makers. People stay accountable for priorities, approvals, and final changes; Crew helps with coordination, repetition, and parallel execution.

It's not a chatbot wearing hats. Each team member runs in its own context, reads only its own knowledge, and writes back what it learned so the work stays inspectable.

> **Responsible AI stance** — Crew is built to amplify a human operator with GitHub Copilot, not to remove humans from the loop. Use it to delegate faster, review better, and keep governance close to the code.

---

## Quick Start

### 1. Create your project

```bash
mkdir my-project && cd my-project
git init
```

**✓ Validate:** Run `git status` — you should see "No commits yet".

### 2. Install Crew

```bash
npm install -g @blacklite/crew-cli
crew init
```

> **⚡ Want to be up and running in under a second?** Use `crew init --preset default` to start with a fully-configured crew — complete with members, charters, and routing rules — ready to go immediately. The default `crew init` (without the flag) walks you through setup step by step, ideal if you prefer to build and customize your crew deliberately.

**✓ Validate:** Check that `.crew/team.md` was created in your project.

### 3. Authenticate with GitHub (for Issues, PRs, and Ralph)

```bash
gh auth login
```

**✓ Validate:** Run `gh auth status` — you should see "Logged in to github.com".

### 4. Open Copilot and go

```
copilot --agent crew --yolo
```

> **Why `--yolo`?** Crew makes many tool calls in a typical session. Without it, Copilot will prompt you to approve each one.

**In VS Code**, open Copilot Chat and select the **Crew** agent.

Then:

```
I'm starting a new project. Set up the team.
Here's what I'm building: a recipe sharing app with React and Node.
```

**✓ Validate:** Crew responds with team member proposals. Type `yes` to confirm — they're ready to work.

Crew proposes a team — each member named from a persistent thematic cast. You say **yes**. They're ready.

---

## .NET package preview

Building a .NET app that should call a Crew team as a Microsoft Agent Framework agent? `Crew.Agents.AI` is a preview NuGet package under [`src/Crew.Agents.AI`](src/Crew.Agents.AI/README.md). It registers a Crew-backed `AIAgent` in DI and targets early `0.1.0-preview` consumers.

## Upgrading

Upgrading Crew is a two-step process.

**Step 1: Update the CLI binary**

```bash
npm install -g @blacklite/crew-cli@latest
```

**Step 2: Update Crew-owned files in your project**

```bash
crew upgrade
```

`crew upgrade` updates `crew.agent.md`, templates, and GitHub workflows to the latest versions. It never touches your `.crew/` team state — your agents, decisions, and history are always preserved.

Use `--force` to re-apply updates even when your installed version already matches the latest.

---

## Local Development Installation

To install and run Crew from source for development:

```bash
# Clone the repository
git clone https://github.com/Blacklite/crew.git
cd crew

# Install dependencies (npm workspaces)
npm install

# Build the project (SDK first, then CLI)
npm run build

# Run the CLI directly
node ./packages/crew-cli/dist/cli-entry.js init

# Or link it globally for convenience
npm run dev:link
```

After `npm run dev:link`, the `crew` command will be available globally and will use your local build. To update after code changes, re-run `npm run build` to recompile.

---

## Quick Commands

Say **"crew commands"** in chat to see a categorized menu of common operations — install & upgrade, team management, issues & PRs, plugins, model settings, and session state. You can also ask naturally: *"how do I switch state backends?"* or *"how do I add a team member?"* — Crew matches your intent and walks you through it. The `crew-commands` skill ships out of the box with every `crew init` and `crew upgrade`.

---

## All Commands (17 commands)

| Command | What it does |
|---------|-------------|
| `crew init` | **Init** — scaffold Crew in the current directory (idempotent — safe to run multiple times); alias: `cast`; use `--global` to init in personal crew directory, `--mode remote <path>` for dual-root mode |
| `crew upgrade` | Update Crew-owned files to latest; never touches your team state; use `--global` to upgrade personal crew, `--migrate-directory` to rename `.ai-team/` → `.crew/` |
| `crew upgrade --self` | Update the Crew CLI package itself; add `--insider` for dev-channel prerelease builds |
| `crew update-check` | Report cached CLI update status for tooling/CI; use `--json` for structured output, `--refresh` to bypass the cache |
| `crew status` | Show which crew is active and why |
| `crew triage` | **Watch mode** — poll for issues and auto-triage to team (aliases: `watch`, `loop`); use `--interval <minutes>` to set polling frequency (default: 10); with `--execute` dispatch Copilot agents; use `--agent-cmd`, `--copilot-flags`, `--auth-user` to customize agent execution; `--health` shows watch status; `--log-file` for diagnostics |
| `crew copilot` | Add/remove the Copilot coding agent (@copilot); use `--off` to remove, `--auto-assign` to enable auto-assignment |
| `crew doctor` | Check your setup and diagnose issues (alias: `heartbeat`) |
| `crew link <team-repo-path>` | Connect to a remote team |
| `crew externalize` | Move `.crew/` state outside the working tree; survives branch switches; use `--key <name>` for custom project key |
| `crew internalize` | Move externalized state back into `.crew/` |
| `crew shell` | **Deprecated** — Launch interactive shell explicitly. Use `copilot --agent crew` instead. |
| `crew export` | Export crew to a portable JSON snapshot |
| `crew import <file>` | Import crew from an export file |
| `crew plugin marketplace add\|remove\|list\|browse` | Manage plugin marketplaces |
| `crew upstream add\|remove\|list\|sync` | Manage upstream Crew sources |
| `crew nap` | Context hygiene — compress, prune, archive; use `--deep` for aggressive compression, `--dry-run` to preview changes |
| `crew aspire` | Open Aspire dashboard for observability |
| `crew scrub-emails [directory]` | Remove email addresses from Crew state files (default: `.crew/`) |

---

## Watch Mode — Ralph's Automated Polling

Ralph continuously polls for work and dispatches agents to handle it. Watch mode helps a human team stay responsive — Ralph automates triage, execution handoffs, and monitoring, then escalates back to people when judgment or approval is needed.

### Quick Start

```bash
# Monitor for issues (triage mode — no execution)
npx @blacklite/crew-cli watch

# Monitor and auto-execute against actionable issues
npx @blacklite/crew-cli watch --execute --interval 5

# With custom agent runner and copilot flags
npx @blacklite/crew-cli watch --execute \
  --agent-cmd "agency copilot" \
  --copilot-flags "--yolo --autopilot --mcp mail --agent crew" \
  --auth-user myaccount

# Run watch with diagnostics
npx @blacklite/crew-cli watch --execute --log-file ./watch.log --verbose

# Check health of running watch process
npx @blacklite/crew-cli watch --health
```

### Key Flags

| Flag | Description |
|------|-------------|
| `--execute` | Enable agent execution (spawn Copilot sessions for actionable issues) |
| `--interval N` | Poll every N minutes (default: 10) |
| `--agent-cmd` | Custom agent command (default: `gh copilot`) |
| `--copilot-flags` | Flags passed to the agent runner (e.g., `--yolo --autopilot`) |
| `--auth-user` | GitHub/Azure DevOps account to use for agent auth |
| `--log-file` | Mirror output to file for later review and diagnostics |
| `--verbose` | Show extra diagnostic output (auth probes, callbacks, pulls) |
| `--health` | Show status of running watch: PID, uptime, auth readiness, capabilities |
| `--overnight-start HH:MM` | Pause watch during off-hours (e.g., `--overnight-start 18:00`) |
| `--overnight-end HH:MM` | Resume watch at this time (e.g., `--overnight-end 08:00`) |
| `--notify-level` | Control output verbosity (`all` / `important` / `none`, default: `important`) |
| `--state-backend` | Persistence strategy (`git-notes` or `orphan-branch`, default: in-memory) |

### How Watch Decides What to Execute

Ralph uses an **agent-delegated selection pattern**:

1. Ralph scans for triage-eligible issues (unassigned, labeled, etc.)
2. Ralph builds a context snapshot: issue list, crew state, recent decisions
3. Ralph writes this context to a **temp file** using the `-p <path>` flag
4. Ralph invokes the agent with that file: `gh copilot -p context.md`
5. The agent **decides which issue to work on** and **how**
6. Ralph monitors execution, logs results, updates issue status

This design keeps the polling loop lean while letting agents handle issue selection automatically under the team's rules, review gates, and escalation policy.

### Issue Selection & Escalation

Ralph provides a rich prompt scaffold to the agent:

```
## Work Context

### Available Issues (prioritized)
- #42 Urgent bug in auth (P0)
- #89 Performance review pending (P1)
- #123 Docs update (P2)

### Why These Issues Matter
...context from decision archive...

### Success Criteria
- Tests pass
- Changes match team conventions
- PR linked to issue

### When to Escalate
If blocker detected → pause, log, notify humans
```

Agents see **full context** and can decide intelligently rather than blindly executing random work.

### Error Recovery (4-Tier Escalation)

Watch includes a tiered remediation strategy:

1. **Tier 1 — Circuit Breaker Reset**: Clear and retry
2. **Tier 2 — Auth Reprobe**: Re-verify credentials
3. **Tier 3 — Git Pull**: Update local state
4. **Tier 4 — Pause 30m**: Back off for human intervention

This prevents watch from spamming the same failure endlessly.

### State Backends

Watch can persist its state in different ways:

```bash
# Default: in-memory (loses state on restart)
crew watch --execute

# Persist to git-notes (survives restarts, no new branches)
crew watch --execute --state-backend git-notes

# Persist to orphan branch (isolated history, easy to prune)
crew watch --execute --state-backend orphan-branch
```

### Graceful Shutdown

To stop a running watch process gracefully:

```bash
# Create sentinel file
touch .crew/ralph-stop

# Watch will finish current round and exit cleanly
# Logs final state, cleans scratch dirs
```

### Cleanup

Watch automatically prunes stale artifacts:
- Scratch directories older than 7 days
- Log files older than 30 days
- Orphaned orchestration state

### Monitoring Watch

Check on a running watch:

```bash
crew watch --health
```

Output example:
```
Ralph Watch Status

PID: 12345
Uptime: 2h 15m
Last Poll: 2 minutes ago

Auth: Ready (account: myaccount@github.com)
Capabilities: Issue triage, PR review, ADO sync

Next Poll: 14:35 (in 3 minutes)
Round: 42 / 1200
```

---

## Interactive Shell

> ⚠️ **Deprecated:** The interactive shell (`crew` with no arguments) has been deprecated. For the best Crew experience, use the [GitHub Copilot CLI](https://docs.github.com/en/copilot/github-copilot-in-the-cli) instead.
>
> ```bash
> copilot --agent crew
> ```
>
> See [Choose your interface](docs/src/content/docs/get-started/choose-your-interface.md) for current options.

Tired of typing `crew` followed by a command every time? Enter the interactive shell.

### Entering the Shell

```bash
crew
```

No arguments. Just `crew`. You'll get a prompt:

```
crew >
```

You're now connected to your team. Talk to them.

### Shell Commands

All shell commands start with `/`:

| Command | What it does |
|---------|-------------|
| `/status` | Check your team and what's happening |
| `/history` | See recent messages |
| `/agents` | List all team members |
| `/sessions` | List saved sessions |
| `/resume <id>` | Restore a past session |
| `/version` | Show version |
| `/clear` | Clear the screen |
| `/help` | Show all commands |
| `/quit` | Exit the shell (or Ctrl+C) |

### Talking to Agents

Use `@AgentName` (case-insensitive) or natural language with a comma:

```
crew > @Keaton, analyze the architecture of this project
crew > McManus, write a blog post about our new feature
crew > Build the login page
```

The coordinator routes messages to the right agents. Multiple agents can work in parallel—you'll see progress in real-time.

### What the Shell Does

- **Real-time visibility:** See agents working, decisions being recorded, blockers as they happen
- **Message routing:** Describe what you need; the coordinator figures out who should do it
- **Parallel execution:** Multiple agents work simultaneously on independent tasks
- **Session persistence:** If an agent crashes, it resumes from checkpoint; you never lose context
- **Decision logging:** Every decision is recorded in `.crew/decisions.md` for the whole team to see

For more details on shell usage, see the commands table above.

## Samples

Eight working examples from beginner to advanced — casting, governance, streaming, Docker. See [samples/README.md](samples/README.md).

---

## Agents Work in Parallel — You Stay in Control

Crew helps one human coordinate more work at once. When you give a task, the coordinator launches every agent that can usefully start — simultaneously — while you keep priorities, review, and final decisions.

```
You: "Team, build the login page"

  🏗️ Lead — analyzing requirements...          ⎤
  ⚛️ Frontend — building login form...          ⎥ all launched
  🔧 Backend — setting up auth endpoints...     ⎥ in parallel
  🧪 Tester — writing test cases from spec...   ⎥
  📋 Scribe — logging everything...             ⎦
```

When agents finish, the coordinator records follow-up work and leaves a breadcrumb trail so you can review what happened with full context:

- **`decisions.md`** — every decision any agent made
- **`orchestration-log/`** — what was spawned, why, and what happened
- **`log/`** — full session history, searchable

**Knowledge compounds across sessions.** Every time an agent works, it writes lasting learnings to its `history.md`. After a few sessions, agents know your conventions, your preferences, your architecture. They stop asking questions they've already answered.

**And it's all in git.** Anyone who clones your repo gets the team — with all their accumulated knowledge.

---

## What Gets Created

```
.crew/
├── team.md              # Roster — who's on the team
├── routing.md           # Routing — who handles what
├── decisions.md         # Shared brain — team decisions
├── ceremonies.md        # Sprint ceremonies config
├── casting/
│   ├── policy.json      # Casting configuration
│   ├── registry.json    # Persistent name registry
│   └── history.json     # Universe usage history
├── agents/
│   ├── {name}/
│   │   ├── charter.md   # Identity, expertise, voice
│   │   └── history.md   # What they know about YOUR project
│   └── scribe/
│       └── charter.md   # Silent memory manager
├── skills/              # Compressed learnings from work
├── identity/
│   ├── now.md           # Current team focus
│   └── wisdom.md        # Reusable patterns
└── log/                 # Session history (searchable archive)
```

**Commit this folder.** Your team persists. Names persist. Anyone who clones gets the team — with the same cast.

### SDK-First Mode (New in Phase 1)

> ⚠️ **Experimental.** SDK-first mode is under active development and has known bugs. Use markdown-first (the default) for production teams.

Prefer TypeScript? You can define your team in code instead of markdown. Create a `crew.config.ts` with builder functions, run `crew build`, and the `.crew/` files are generated automatically.

```typescript
// crew.config.ts
import { defineCrew, defineTeam, defineAgent } from '@blacklite/crew-sdk';

export default defineCrew({
  team: defineTeam({ name: 'Platform Crew', members: ['@edie', '@mcmanus'] }),
  agents: [
    defineAgent({ name: 'edie', role: 'TypeScript Engineer', model: 'claude-sonnet-4' }),
    defineAgent({ name: 'mcmanus', role: 'DevRel', model: 'claude-haiku-4.5' }),
  ],
});
```

Run `crew build` to generate all the markdown. See the [SDK-First Mode Guide](docs/src/content/docs/sdk-first-mode.md) for full documentation.

---

## Monorepo Development

Crew is a monorepo with two packages:
- **`@blacklite/crew-sdk`** — Core runtime and library for programmable agent orchestration
- **`@blacklite/crew-cli`** — Command-line interface that depends on the SDK

### Building

```bash
# Install dependencies (npm workspaces)
npm install

# Build TypeScript to dist/
npm run build

# Build CLI bundle (dist/ + esbuild → cli.js)
npm run build:cli

# Watch mode for development
npm run dev
```

### Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch
```

### Linting

```bash
# Type check (no emit)
npm run lint
```

### Publishing

Crew uses [changesets](https://github.com/changesets/changesets) for independent versioning across packages:

```bash
# Add a changeset
npx changeset add

# Validate changesets
npm run changeset:check
```

Changesets are resolved on the `main` branch; releases happen independently per package.

---

## SDK documentation

The SDK provides programmatic control over agent orchestration — custom tools, hook pipelines, file-write guards, PII scrubbing, reviewer lockout, and event-driven monitoring.

- [SDK API reference](docs/src/content/docs/reference/sdk.md)
- [Custom tools and hooks guide](docs/src/content/docs/reference/tools-and-hooks.md)
- [Extensibility guide](docs/src/content/docs/guide/extensibility.md)
- [Samples](samples/README.md) — eight working examples from beginner to advanced

For SDK installation: `npm install @blacklite/crew-sdk`

---

## Requirements

- **Node.js** ≥22.5.0
- **npm** ≥10.0.0
- **Git** with SSH agent
- **GitHub CLI** (`gh`) for GitHub integration

## License

This project is licensed under the terms of the MIT open source license. Please refer to the [LICENSE](./LICENSE) file for the full terms.

## Maintainers

- [@bradygaster](https://github.com/bradygaster)
- [@tamirdresher](https://github.com/tamirdresher)

See [CODEOWNERS](.github/CODEOWNERS) for the full list.

## Support

For help or questions about using Crew, please use [GitHub Discussions](https://github.com/github/crew/discussions). See [SUPPORT.md](./SUPPORT.md) for details.

## Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for build setup, monorepo structure, and guidelines.

## Code of Conduct

This project has adopted the [Contributor Covenant Code of Conduct](./CODE_OF_CONDUCT.md). See the full text for details on expected behavior and reporting.
