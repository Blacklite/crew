# @blacklite/crew-cli

The programmable multi-agent CLI for GitHub Copilot. Build an AI team, assign roles, and let them work your repo—automating issue triage, code review, documentation, and more through orchestrated AI agents.

> ⚠️ **Experimental** — Crew is alpha software. APIs, commands, and behavior may change between releases.

## Installation

### Prerequisites

- **Node.js ≥ 20** — Crew requires modern JavaScript runtime features
- **GitHub Copilot** — provides the AI backend for agent orchestration and code analysis
- **GitHub CLI** (`gh`) — required for issue/PR operations and the work loop

### Install from npm

```bash
# Global (recommended)
npm install -g @blacklite/crew-cli@latest

# Project-local
npm install --save-dev @blacklite/crew-cli

# One-shot (no install)
npx @blacklite/crew-cli

# Insider channel (pre-release builds)
npm install -g @blacklite/crew-cli@insider
```

### Verify Installation

```bash
crew --version
crew doctor    # Validate setup
```

## Quick Start

Get a working AI team in three steps:

```bash
# 1. Initialize Crew in your repo
crew init

# 2. Launch the interactive shell and talk to your team
crew
```

The `init` command creates a `.crew/` directory with default agents and configuration. Then `crew` opens a REPL where you can chat with agents, assign work, and monitor progress.

**Example:**

```
crew > @Neo, review the authentication module
crew > Trinity, add unit tests for the login page
crew > /status    # See what's in progress
```

## Commands Reference

For detailed documentation on each command, see the [CLI Reference](https://docs.crew.ai/reference/cli) on the docs site.

### Core Commands

| Command | Purpose |
|---------|---------|
| `crew` | Enter interactive shell (no arguments) |
| `crew init` | Initialize Crew in current repo (idempotent) |
| `crew init --global` | Create a personal crew in your home directory |
| `crew status` | Show which crew is active and why |
| `crew doctor` | Validate setup integrity and diagnose issues |
| `crew upgrade` | Update Crew-owned files to latest version |

### Team Management

| Command | Purpose |
|---------|---------|
| `crew cast --name <name> --role <role>` | Add a new agent to your team (alias: `hire`) |
| `crew copilot` | Add the @copilot coding agent |
| `crew copilot --off` | Remove @copilot from the team |
| `crew copilot --auto-assign` | Enable auto-assignment for @copilot |

### Work & Automation

| Command | Purpose |
|---------|---------|
| `crew triage` | Auto-triage issues and assign to agents |
| `crew triage --interval <min>` | Run triage continuously (default: 10 min) |
| `crew plugin` | Manage plugin marketplaces (add/remove/list/browse) |

### Export & Import

| Command | Purpose |
|---------|---------|
| `crew export` | Export team to a portable JSON snapshot |
| `crew export --out <path>` | Export to custom path |
| `crew import <file>` | Import team from snapshot (or existing crew) |
| `crew import <file> --force` | Replace existing team (archives old one) |

### Utilities

| Command | Purpose |
|---------|---------|
| `crew scrub-emails [directory]` | Remove email addresses from `.crew/` state files |
| `crew --version` | Print installed version |
| `crew help` | Show command help |

## Interactive Shell

Run `crew` with no arguments to enter the REPL. You'll see:

```
crew >
```

### Shell Commands

All shell commands start with `/`.

| Command | Purpose |
|---------|---------|
| `/status` | Show active agents, sessions, recent decisions |
| `/history` | View session log — tasks, decisions, agent work |
| `/agents` | List team members with roles and expertise |
| `/sessions` | List saved sessions |
| `/resume <id>` | Restore a past session |
| `/clear` | Clear terminal output |
| `/help` | Show all commands |
| `/quit` | Exit the shell (also: `Ctrl+C`) |

### Addressing Agents

Use agent names to route messages. Name matching is **case-insensitive**:

```
crew > @Neo, review the architecture
crew > @trinity fix the login bug
crew > Summarize the latest decisions
```

Omit the agent name and the coordinator routes to the best fit.

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `↑` / `↓` | Scroll command history |
| `Ctrl+A` | Jump to start of line |
| `Ctrl+E` | Jump to end of line |
| `Ctrl+U` | Clear to start of line |
| `Ctrl+K` | Clear to end of line |
| `Ctrl+W` | Delete previous word |
| `Ctrl+C` | Exit shell |

## .crew/ Directory Structure

When you run `crew init`, Crew creates a `.crew/` directory with this structure:

```
.crew/
├── team.md                # Roster — agent names, roles, human members
├── routing.md             # Work routing rules (which agent handles what)
├── decisions.md           # Architectural decisions log (append-only)
├── directives.md          # Permanent team rules and conventions
├── ceremonies.md          # Team ceremonies and rituals
├── casting-state.json     # Agent names, universe theme
├── model-config.json      # Per-agent model overrides
├── manifest.json          # Crew metadata and version
├── config.json            # Local config (teamRoot, etc.)
├── agents/                # Agent knowledge files
│   ├── neo/
│   │   ├── charter.md     # Role definition, expertise
│   │   └── history.md     # Accumulated knowledge
│   └── ...
├── skills/                # Reusable knowledge (markdown files)
│   ├── auth-rate-limiting.md
│   └── ...
└── sessions/              # Saved REPL sessions
```

### Key Files

**`team.md`** — Defines your roster:

```markdown
## Team

🏗️  Neo       — Lead        Scope, decisions, code review
⚛️  Trinity   — Frontend    React, TypeScript, UI
🔧  Morpheus — Backend     Node.js, Express, databases
🧪  Tank     — Tester      Jest, integration tests
```

**`routing.md`** — Controls work assignment:

```markdown
# Routing Rules

**Frontend changes** → Trinity
**Backend API work** → Morpheus
**Database migrations** → Morpheus
**Test writing** → Tank
**Architecture** → Neo
```

**`decisions.md`** — Append-only architectural log (agents read this before every task):

```markdown
### 2025-03-20: Use Zod for API validation
**By:** Morpheus
**What:** All API input validation uses Zod schemas
**Why:** Type-safe, composable, generates TypeScript types
```

**`directives.md`** — Permanent rules agents always follow:

```markdown
- Always use TypeScript strict mode
- No any/unknown casts
- All database queries through Prisma, no raw SQL
```

## Built-in Skills

When you run `crew init`, Crew installs **8 curated skills** into `.github/skills/`. These skills teach your agents best practices and conventions:

| Skill | Purpose |
|-------|---------|
| `crew-conventions` | Crew behavioral conventions |
| `error-recovery` | Graceful error recovery patterns |
| `secret-handling` | Secrets management and credential safety |
| `git-workflow` | Git workflow conventions and branch management |
| `session-recovery` | Session checkpoint and recovery patterns |
| `reviewer-protocol` | Code review protocol and reviewer gate patterns |
| `test-discipline` | Test-first discipline and coverage expectations |
| `agent-collaboration` | Multi-agent collaboration and handoff patterns |

Each skill is a `SKILL.md` file inside `.github/skills/<skill-name>/`.

### Skill lifecycle

- **`crew init`** — Installs the 8 manifest skills on first run. If `.github/skills/` already has content, init skips skill installation (idempotent).
- **`crew upgrade`** — Refreshes manifest skills to their latest versions. Skills marked `overwriteOnUpgrade: true` (all built-in skills) are always updated to pick up fixes and improvements.

### Adding custom skills

You can add your own skills by creating a new directory under `.github/skills/`:

```
.github/skills/my-custom-skill/
└── SKILL.md
```

Custom skills are not overwritten during upgrade because they are not part of the built-in manifest.

## Configuration

### .crewrc / config.json

Crew looks for `.crew/config.json` to customize behavior:

```json
{
  "teamRoot": "./team-config",
  "maxAgents": 10,
  "modelDefaults": {
    "temperature": 0.7
  }
}
```

### Environment Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `CREW_CLIENT` | Detected platform | `cli`, `vscode` |
| `COPILOT_TOKEN` | Copilot auth token (SDK usage) | `gho_...` |

### Crew Resolution Order

When Crew starts, it looks for `.crew/` in this order:

1. Current directory (`./.crew/`)
2. Parent directories (walk up to project root)
3. Personal crew directory (platform-specific: `~/.config/crew/` on Linux, `~/Library/Application Support/crew/` on macOS, `%APPDATA%\crew\` on Windows)
4. Global CLI default (fallback only)

First match wins.

## Troubleshooting

### Run `crew doctor`

When something isn't working, run:

```bash
crew doctor
```

This performs a comprehensive diagnostic check:

- `.crew/` directory structure
- Required files: `team.md`, `routing.md`, `decisions.md`
- Agent directory and count
- Configuration validity
- Team root resolution (remote mode)

**Example output:**

```
🩺 Crew Doctor
═══════════════

Mode: local

✅  .crew/ directory exists — directory present
✅  team.md found — file present
✅  routing.md found — file present
✅  agents/ directory exists (4 agents)
✅  decisions.md exists — file present

Summary: 5 passed, 0 failed
```

### Common Issues

**Missing `.crew/` directory**

Run `crew init` to create it.

**Authentication errors**

Ensure GitHub Copilot is installed and you're authenticated. Check your token:

```bash
gh auth status
```

**Node.js version mismatch**

Crew requires Node.js ≥ 20. Check your version:

```bash
node --version
```

**ESM import errors**

Crew is an ESM-only module. If you see import errors, ensure your Node.js version is 20+.

## Links

- **Documentation:** [docs.crew.ai](https://docs.crew.ai)
- **CLI Reference:** [docs.crew.ai/reference/cli](https://docs.crew.ai/reference/cli) — detailed command docs
- **SDK:** [@blacklite/crew-sdk](https://www.npmjs.com/package/@blacklite/crew-sdk) — programmatic API
- **GitHub:** [github.com/Blacklite/crew](https://github.com/Blacklite/crew)
- **Issues:** [github.com/Blacklite/crew/issues](https://github.com/Blacklite/crew/issues)

## License

MIT. See [LICENSE](https://github.com/Blacklite/crew/blob/main/LICENSE) in the repository root.
