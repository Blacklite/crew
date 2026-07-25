# Configuration Reference

> ⚠️ **Experimental** — Crew is alpha software. APIs, commands, and behavior may change between releases.


**Try this:**
```
crew init
```
That's it. Crew works out of the box. Everything below is optional.

---

## crew.config.ts

For type-safe SDK-First configuration, create this at your project root:

```typescript
import {
  defineCrew,
  defineTeam,
  defineAgent,
  defineRouting,
} from '@blacklite/crew-sdk';

export default defineCrew({
  version: '1.0.0',
  team: defineTeam({
    name: 'my-crew',
    description: 'My project team',
    members: ['@edie', '@mcmanus'],
  }),
  agents: [
    defineAgent({
      name: 'edie',
      role: 'TypeScript Engineer',
      model: 'claude-sonnet-4',
      tools: ['grep', 'edit', 'view'],
    }),
    defineAgent({
      name: 'mcmanus',
      role: 'DevRel',
      model: 'claude-haiku-4.5',
      tools: ['grep', 'view'],
    }),
  ],
  routing: defineRouting({
    rules: [
      { pattern: 'feature-*', agents: ['@edie'], tier: 'standard' },
      { pattern: 'docs-*', agents: ['@mcmanus'], tier: 'lightweight' },
    ],
    defaultAgent: '@coordinator',
  }),
});
```

Each builder (`defineCrew()`, `defineTeam()`, `defineAgent()`, etc.) validates your config at runtime with type-safe error messages. Edit your `.ts` file, then run `crew build` to generate `.crew/` markdown.

**Or start with markdown:** `crew init` creates a markdown-only crew with no config file needed.

---

## .crew/ Directory

```
.crew/
├── team.md              # Who's on the team
├── routing.md           # Work routing rules
├── decisions.md         # Architectural decisions (shared memory)
├── directives.md        # Permanent team rules
├── casting-state.json   # Agent names + universe theme
├── model-config.json    # Per-agent model overrides
├── agents/
│   ├── {name}/
│   │   ├── charter.md   # Role, expertise, voice
│   │   └── history.md   # What this agent has done
│   └── ...
├── skills/              # Reusable knowledge files
├── decisions/inbox/     # Pending decisions (Scribe merges these)
├── log/                 # Session logs
└── orchestration-log/   # Coordinator state
```

Commit this directory. It's your team's brain. Anyone who clones the repo gets the full team with all their knowledge.

---

## .crew/ — Required vs Optional Files

`crew init` creates a working team. Here's what's required and what's optional.

### Required Files

These are always created by `crew init`. The loader expects them.

| File | Purpose | Can You Edit? |
|------|---------|---------------|
| `.crew/team.md` | Team roster — loader requires it | Yes |
| `.crew/decisions.md` | Shared decision log — agents read before work | Yes (append only) |
| `.crew/routing.md` | Work assignment rules | Yes |
| `.crew/ceremonies.md` | Team meeting definitions | Yes |
| `.crew/config.json` | SDK settings (teamRoot, version) | Rarely |
| `.crew/agents/{name}/charter.md` | Agent identity — compiled at spawn | Yes |
| `.crew/agents/{name}/history.md` | Agent learnings — grows over time | Append only |
| `.crew/identity/now.md` | Current team focus | Auto-updated |
| `.crew/identity/wisdom.md` | Accumulated team patterns | Auto-updated |
| `.gitattributes` | Merge drivers for append-only files | Merge rules only |

### Optional Files

These are created only when you opt in during init.

- **`.crew/templates/`** — SDK templates, overwritten on upgrade
- **`.github/workflows/*.yml`** — CI/CD workflows (opt-in: `--include-workflows`)
- **`.copilot/mcp-config.json`** — MCP server config (opt-in: `--include-mcp-config`)

> ⚠️ **Hard rule:** Crew NEVER writes temp files, logs, or memory to your repo root. All team state lives in `.crew/` only. Your project tree stays clean.

### Quick Recovery

```bash
crew doctor                        # Check for issues
rm -rf .crew && crew init         # Full reset (back up agents/decisions first)
```

---

## Routing Rules

Control which agent gets which work. Edit `.crew/routing.md` or configure in `crew.config.ts`:

```markdown
# Routing Rules

**Frontend changes** → Trinity
**Backend API work** → Morpheus
**Database migrations** → Morpheus
**Test writing** → Tank
**Architecture decisions** → Neo
```

Or programmatically:

```typescript
routing: {
  workTypes: [
    { pattern: /\bAPI|backend\b/i, targets: ['backend'], tier: 'standard' },
    { pattern: /\bUI|React\b/i, targets: ['frontend'], tier: 'standard' },
    { pattern: /\bstatus|help\b/i, targets: [], tier: 'direct' },
  ],
  issueLabels: [
    { labels: ['bug', 'backend'], targets: ['backend'] },
  ],
}
```

---

## Model Configuration

17 models across three tiers. Crew picks the right one, or you override:

| Tier | Models | Use Case |
|------|--------|----------|
| **premium** | claude-opus-4, gpt-4.1 | Architecture, code review |
| **standard** | claude-sonnet-4, gpt-4.1 | Most work |
| **fast** | claude-haiku-3.5, gpt-4.1-mini | Triage, logging, quick tasks |

Per-agent overrides in `model-config.json`:

```json
{
  "neo": "claude-opus-4",
  "tank": "claude-haiku-3.5"
}
```

Resolution order: user override → charter → task auto-select → config default.

---

## Resolution Order

Crew finds `.crew/` by walking up:

1. Current directory (`./.crew/`)
2. Parent directories (up to project root)
3. Personal crew directory (platform-specific: `~/.config/crew/` on Linux, `~/Library/Application Support/crew/` on macOS, `%APPDATA%\crew\` on Windows)
4. Global CLI default (fallback)

First match wins.

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `CREW_CLIENT` | Detected client (`cli` or `vscode`) |
| `COPILOT_TOKEN` | Auth token for SDK usage |

---

## See Also

- [CLI Reference](cli.md) — Commands and shell interactions
- [SDK Reference](sdk.md) — Programmatic API
