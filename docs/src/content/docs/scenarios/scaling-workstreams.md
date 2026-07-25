# Scaling with SubCrews

> Partition your repo's work across multiple Crew instances for horizontal scaling.

## The Problem

A single Crew instance handles all issues in a repo. For large projects, this creates bottlenecks:
- Too many issues overwhelm a single team
- Agents step on each other's toes in shared code
- No workflow enforcement (agents commit directly to main)
- No way to monitor multiple teams centrally

## The Solution: SubCrews

SubCrews partition a repo's issues into labeled subsets. Each Codespace (or machine) runs one SubCrew, scoped to its slice of work.

```
┌─────────────────────────────────────────────────┐
│  Repository: acme/starship                      │
│                                                 │
│  ┌─────────────┐ ┌─────────────┐ ┌───────────┐ │
│  │ Codespace 1 │ │ Codespace 2 │ │ Codespace 3│ │
│  │ team:bridge │ │ team:engine │ │ team:ops   │ │
│  │ Picard,Riker│ │ Geordi,Worf │ │ Troi,Crusher│ │
│  │ UI + API    │ │ Core engine │ │ Infra + CI │ │
│  └─────────────┘ └─────────────┘ └───────────┘ │
│                                                 │
│  Each Crew instance only picks up issues       │
│  matching its SubCrew label.                 │
└─────────────────────────────────────────────────┘
```

## Quick Start

### 1. Define SubCrews

Create `.crew/streams.json`:

```json
{
  "defaultWorkflow": "branch-per-issue",
  "workstreams": [
    {
      "name": "bridge",
      "labelFilter": "team:bridge",
      "folderScope": ["src/api", "src/ui"],
      "description": "Bridge crew — API and UI"
    },
    {
      "name": "engine",
      "labelFilter": "team:engine",
      "folderScope": ["src/core", "src/engine"],
      "description": "Engineering — core systems"
    },
    {
      "name": "ops",
      "labelFilter": "team:ops",
      "folderScope": ["infra/", "scripts/", ".github/"],
      "description": "Operations — CI/CD and infra"
    }
  ]
}
```

### 2. Label your issues

Each issue gets a `team:*` label matching a SubCrew. Ralph will only pick up issues matching the active SubCrew's label.

### 3. Activate a SubCrew

**Option A — Environment variable (Codespaces):**
Set `CREW_TEAM=bridge` in the Codespace's environment. Crew auto-detects it on session start.

**Option B — CLI activation (local):**
```bash
crew subcrews activate bridge
```
This writes a `.crew-workstream` file (gitignored — local to your machine).

**Option C — Single SubCrew auto-select:**
If `streams.json` defines only one SubCrew, it's auto-selected.

### 4. Run Crew normally

```bash
crew start
# or: "Ralph, go" in the session
```

Ralph will only scan for issues with the `team:bridge` label. Agents will only pick up matching work.

## CLI Commands

```bash
# List configured SubCrews
crew subcrews list

# Show activity per SubCrew (branches, PRs)
crew subcrews status

# Activate a SubCrew for this machine
crew subcrews activate engine

# Deprecated aliases (still work)
crew workstreams list
crew streams list
```

> **Note:** `crew workstreams` and `crew streams` are deprecated aliases for `crew subcrews`.

## Key Design Decisions

### folderScope is Advisory

`folderScope` tells agents which directories to focus on — but it's not a hard lock. Agents can modify shared packages (like `src/shared/`) when needed, and will call out when working outside their scope.

### Workflow Enforcement

Each SubCrew specifies a `workflow` (default: `branch-per-issue`). When active, agents:
- Create a branch for every issue (`crew/{issue-number}-{slug}`)
- Open a PR when work is ready
- Never commit directly to main

### Single-Machine Multi-SubCrew

You don't need multiple Codespaces to test. Use `crew subcrews activate` to switch between SubCrews sequentially on a single machine.

## Resolution Chain

Crew resolves the active SubCrew in this order:

1. `CREW_TEAM` environment variable
2. `.crew-workstream` file (written by `crew subcrews activate`)
3. Auto-select if exactly one SubCrew is defined
4. No SubCrew → single-crew mode (backward compatible)

## Monitoring

Use `crew subcrews status` to see all SubCrews' activity:

```
Configured SubCrews

  Default workflow: branch-per-issue

  ● active  bridge
       Label: team:bridge
       Workflow: branch-per-issue
       Folders: src/api, src/ui

  ○  engine
       Label: team:engine
       Workflow: branch-per-issue
       Folders: src/core, src/engine

  ○  ops
       Label: team:ops
       Workflow: branch-per-issue
       Folders: infra/, scripts/, .github/

  Active SubCrew resolved via: env
```

## See Also

- [Multi-Codespace Setup](multi-codespace.md) — Walkthrough of the Tetris experiment
- [SubCrews PRD](https://github.com/Blacklite/crew/blob/main/docs/_internal/specs/streams-prd.md) — Full specification
- [SubCrews Feature Guide](../features/streams.md) — API reference
