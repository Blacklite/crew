---
title: "SubCrews — Scaling Crew Across Multiple Codespaces"
date: 2026-03-05
author: "Tamir Dresher (Community Contributor)"
wave: null
tags: [crew, subcrews, scaling, codespaces, horizontal-scaling, multi-instance, community]
status: draft
hero: "Crew SubCrews lets you partition a repo's work across multiple Codespaces — each running its own scoped Crew instance. One repo, multiple AI teams, zero conflicts."
---

# SubCrews — Scaling Crew Across Multiple Codespaces

> Blog post #23 — A community contribution: horizontal scaling for Crew.

## The Problem We Hit

We were building a multiplayer Tetris game with Crew. One team, 30 issues — UI, backend, cloud infra. Crew handled it fine at first, but as the issue count grew, a single Crew instance became a bottleneck. Agents stepped on each other in shared packages, there was no workflow enforcement, and we had no way to scope each Codespace to its slice of work.

So we built SubCrews.

## What Are SubCrews?

SubCrews partition your repo's issues into labeled subsets. Each Codespace (or machine) runs one SubCrew, scoped to matching issues only.

```
┌─────────────────────────────────────────────────┐
│  Repository: acme/starship                      │
│                                                 │
│  ┌─────────────┐ ┌─────────────┐ ┌───────────┐ │
│  │ Codespace 1 │ │ Codespace 2 │ │ Codespace 3│ │
│  │ team:bridge │ │ team:engine │ │ team:ops   │ │
│  │ UI + API    │ │ Core engine │ │ Infra + CI │ │
│  └─────────────┘ └─────────────┘ └───────────┘ │
│                                                 │
│  Ralph only picks up issues matching            │
│  the active SubCrew's label.                   │
└─────────────────────────────────────────────────┘
```

## How It Works

**1. Define SubCrews** in `.crew/streams.json`:

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
      "folderScope": ["src/core"],
      "description": "Engineering — core systems"
    }
  ]
}
```

**2. Activate a SubCrew:**

```bash
# Via environment variable (ideal for Codespaces)
export CREW_TEAM=bridge

# Or via CLI (local machines)
crew subcrews activate bridge
```

**3. Run Crew normally.** Ralph will only pick up issues labeled `team:bridge`. Agents enforce branch+PR workflow. `folderScope` guides where agents focus (advisory, not enforced — shared code is still accessible).

## The Tetris Experiment

We validated this with [tamirdresher/crew-tetris](https://github.com/tamirdresher/crew-tetris) — 3 Codespaces, 30 issues, Star Trek TNG crew names:

| Codespace | SubCrew | Crew Members | Focus |
|-----------|-----------|---------------|-------|
| CS-1 | `ui` | Riker, Troi | React game board, animations |
| CS-2 | `backend` | Geordi, Worf | WebSocket server, game state |
| CS-3 | `cloud` | Picard, Crusher | Azure, CI/CD, deployment |

**Results:** 9 issues closed, 16 branches created, 6+ PRs merged, real code shipped across all three teams. We discovered that `folderScope` needs to be advisory (shared packages require cross-team access) and that workflow enforcement (`branch-per-issue`) is critical to prevent direct commits to main.

## CLI Commands

```bash
crew subcrews list       # Show all configured SubCrews
crew subcrews status     # Activity per SubCrew (branches, PRs)
crew subcrews activate X # Activate a SubCrew for this machine
```

## Resolution Chain

Crew resolves the active SubCrew in priority order:

1. `CREW_TEAM` environment variable
2. `.crew-workstream` file (written by `activate`, gitignored)
3. Auto-select if exactly one SubCrew is defined
4. No SubCrew → single-crew mode (backward compatible)

## Key Design Decisions

- **folderScope is advisory** — agents prefer these directories but can modify shared code when needed
- **Workflow enforcement** — `branch-per-issue` means every issue gets a branch and PR, never direct commits to main
- **Backward compatible** — repos without `streams.json` work exactly as before
- **Single-machine testing** — use `crew subcrews activate` to switch SubCrews sequentially without needing multiple Codespaces

## What's Next

We're looking at cross-SubCrew coordination — a central dashboard showing all SubCrews' activity, conflict detection for shared files, and auto-merge coordination. See the [PRD](https://github.com/Blacklite/crew/issues/200) for the full roadmap.

The community decided on the name "SubCrews" — each partition is a SubCrew of the main Crew.

## Try It

```bash
# Install Crew
npm install -g @blacklite/crew-cli

# Init in your repo
crew init

# Create streams.json and label your issues
# Then activate and go
crew subcrews activate frontend
crew start
```

Full docs: [Scaling with SubCrews](../scenarios/scaling-workstreams.md) | [Multi-Codespace Setup](../scenarios/multi-codespace.md) | [SubCrews PRD](https://github.com/Blacklite/crew/blob/main/docs/_internal/specs/streams-prd.md)
