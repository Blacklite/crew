# Crew SubCrews

> Scale Crew across multiple Codespaces by partitioning work into labeled SubCrews.

## What Are SubCrews?

A **SubCrew** is a named partition of work within a Crew project. Each SubCrew targets a specific GitHub label (e.g., `team:ui`, `team:backend`) and optionally restricts agents to certain directories. Multiple Crew instances — each running in its own Codespace — can each activate a different SubCrew, enabling parallel work across teams.

## Why SubCrews?

Crew was originally designed for a single team per repository. As projects grow, a single Codespace becomes a bottleneck:

- **Model rate limits** — One Codespace hitting API limits slows the whole team
- **Context overload** — Ralph picks up all issues, not just the relevant ones
- **Folder conflicts** — Multiple agents editing the same files causes merge pain

SubCrews solve this by giving each Codespace a scoped view of the project.

## Configuration

### 1. Create `.crew/streams.json`

```json
{
  "workstreams": [
    {
      "name": "ui-team",
      "labelFilter": "team:ui",
      "folderScope": ["apps/web", "packages/ui"],
      "workflow": "branch-per-issue",
      "description": "Frontend team — React, CSS, components"
    },
    {
      "name": "backend-team",
      "labelFilter": "team:backend",
      "folderScope": ["apps/api", "packages/core"],
      "workflow": "branch-per-issue",
      "description": "Backend team — APIs, database, services"
    },
    {
      "name": "infra-team",
      "labelFilter": "team:infra",
      "folderScope": [".github", "infrastructure"],
      "workflow": "direct",
      "description": "Infrastructure — CI/CD, deployment, monitoring"
    }
  ],
  "defaultWorkflow": "branch-per-issue"
}
```

### 2. Activate a SubCrew

There are three ways to tell Crew which SubCrew to use:

#### Environment Variable (recommended for Codespaces)

```bash
export CREW_TEAM=ui-team
```

Set this in your Codespace's environment or devcontainer.json:

```json
{
  "containerEnv": {
    "CREW_TEAM": "ui-team"
  }
}
```

#### .crew-workstream File (local activation)

```bash
crew subcrews activate ui-team
```

This writes a `.crew-workstream` file (gitignored) so the setting is local to your machine.

#### Auto-select (single SubCrew)

If `streams.json` contains only one SubCrew, it's automatically selected.

### 3. Resolution Priority

1. `CREW_TEAM` env var (highest)
2. `.crew-workstream` file
3. Single-SubCrew auto-select
4. No SubCrew (classic single-crew mode)

## SubCrew Definition Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Unique SubCrew identifier (kebab-case) |
| `labelFilter` | Yes | GitHub label to filter issues |
| `folderScope` | No | Directories this SubCrew may modify |
| `workflow` | No | `branch-per-issue` (default) or `direct` |
| `description` | No | Human-readable purpose |

## CLI Reference

```bash
# List configured SubCrews
crew subcrews list

# Show SubCrew activity (branches, PRs)
crew subcrews status

# Activate a SubCrew locally
crew subcrews activate <name>
```

> **Note:** `crew workstreams` and `crew streams` are deprecated aliases for `crew subcrews`.

## How It Works

### Triage (Ralph)

When a SubCrew is active, Ralph's triage only picks up issues labeled with the SubCrew's `labelFilter`. Unmatched issues are left for other SubCrews or the main crew.

### Workflow Enforcement

- **branch-per-issue** (default): Every issue gets its own branch and PR. Agents never commit directly to main.
- **direct**: Agents may commit directly (useful for infra/ops SubCrews).

### Folder Scope

When `folderScope` is set, agents should primarily modify files within those directories. However, `folderScope` is **advisory, not a hard lock** — agents may still touch shared files (types, configs, package exports) when their issue requires it. The real protection comes from `branch-per-issue` workflow: each issue gets its own branch, so two SubCrews editing the same file won't conflict until merge time.

> **Tip:** If two SubCrews' PRs touch the same file, Git resolves non-overlapping changes automatically. For semantic conflicts (incompatible API changes), use PR review to catch them.

### Cost Optimization: Single-Machine Multi-SubCrew

You don't need a separate Codespace per SubCrew. One machine can serve multiple SubCrews:

```bash
# Switch between SubCrews manually
crew subcrews activate ui-team      # Ralph works team:ui issues
# ... later ...
crew subcrews activate backend-team # now works team:backend issues
```

This gives you 1× Codespace cost instead of N×, at the expense of serial (not parallel) execution. Each issue still gets its own branch — no conflicts.

## Example: Multi-Codespace Setup

See [Multi-Codespace Scenario](../scenarios/multi-codespace.md) for a complete walkthrough.
