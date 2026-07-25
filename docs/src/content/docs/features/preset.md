---
title: Presets — Curated Agent Collections
description: Save, share, and apply pre-configured agent rosters across projects with crew preset commands.
---

# Presets — Curated Agent Collections

> ⚠️ **Experimental** — Crew is alpha software. APIs, commands, and behavior may change between releases.

**Try this to see available presets:**
```bash
crew preset list
```

**Try this to apply a preset to a new project:**
```bash
crew init --preset backend-team
```

Presets are reusable, named bundles of agent charters you can apply to any crew. Built-in presets ship with Crew; you can save your own from any project's current agents and (optionally) sync them across machines via a private GitHub repo.

Each preset is a directory at `~/.crew/presets/<name>/` containing a `preset.json` manifest and `agents/` charter files. The preset name is the directory name.

---

## What presets capture

Presets capture **agents only** (charters). For full crew snapshots including casting state, skills, routing rules, and decisions — for example to share a configured crew or publish to an agent toolbox — use [`crew export`](/crew/docs/features/export-import/) instead.

| Captured by preset | NOT captured by preset |
|---|---|
| Agent charters (role, expertise, prompt style) | Casting state (registry, history) |
| Agent count + composition | `routing.md` rules |
| Built-in agent names + descriptions | `decisions.md` ledger |
| | Skills (`.copilot/skills/`) |
| | Ceremonies |
| | Memory (`.crew/memory/`) |

This split is intentional. Presets are about the **shape** of a team. Skills, decisions, and history are about the **work** that team did.

---

## Commands

### `crew preset list`

Show every preset available in your crew home (`~/.crew/presets/`):

```bash
$ crew preset list

Available Presets (3):

  Name              Agents  Description
  ───────────────   ──────  ────────────────────────────────────────
  backend-team      4       Backend-focused crew: lead, API, DB, QA
  full-stack        6       Full-stack web app: lead, FE, BE, design, QA, devops
  data-engineering  4       Data pipeline crew: lead, ETL, ML, QA
```

If no presets directory exists yet, you'll be prompted to run `crew preset init`.

### `crew preset show <name>`

Inspect a preset's manifest and agents before applying:

```bash
$ crew preset show backend-team

backend-team v1.0.0
  Backend-focused crew: lead, API, DB, QA
  Author: bradygaster
  Tags: backend, api

  Agents (4):
    • lead (Lead) — owns architecture, scope, and code review
    • api (Backend Dev) — REST endpoints, validation, error handling
    • db (Database Engineer) — schema, migrations, query optimization
    • qa (Tester) — test coverage, edge cases, CI/CD
```

### `crew preset apply <name> [--force]`

Install the preset's agents into the current crew. The current directory must be a Crew project (have a `.crew/` directory).

```bash
crew preset apply backend-team
```

This copies the preset's `agents/` directory into your project's `.crew/agents/`. Existing agents with the same names are **NOT** overwritten unless you pass `--force`.

### `crew preset save <name> [--force] [--description "..."]`

Save your current project's agents as a new preset:

```bash
crew preset save my-team --description "My favorite roster for greenfield projects"
```

This snapshots the agents from the current crew's `.crew/agents/` directory into `~/.crew/presets/my-team/` along with a `preset.json` manifest. Pass `--force` to overwrite an existing preset of the same name.

### `crew preset init [--remote]`

Initialize the presets directory in your crew home (`~/.crew/presets/`).

- **Local-only** (`crew preset init`) — creates the directory and seeds the built-in presets
- **Remote-synced** (`crew preset init --remote`) — creates the directory, seeds built-ins, AND creates a private GitHub repo (`{your-gh-user}/crew-home`) backing the directory so presets sync across machines

Requirements for `--remote`:
- GitHub CLI (`gh`) installed and authenticated (`gh auth login`)
- Permission to create private repos

On a second machine, run `crew preset init --remote` again and it will detect and clone your existing `crew-home` repo automatically.

---

## Applying a preset at init time

The most common usage — bootstrap a new project with a preset team:

```bash
mkdir my-new-project
cd my-new-project
git init
crew init --preset backend-team
```

This creates the standard `.crew/` scaffold AND applies the preset's agents. If `~/.crew/presets/` doesn't exist yet, `crew init` auto-runs `crew preset init` first to seed the built-in presets.

---

## Cross-machine workflow

Use the remote-backed setup if you want presets to follow you to new machines or shared dev environments:

```bash
# Machine A — initial setup
crew preset init --remote
crew preset save my-team --description "My standard team"

# Machine B — same user, same GitHub account
crew preset init --remote   # detects existing crew-home repo, clones it
crew preset list            # my-team is already here
```

The remote repo lives at `https://github.com/<your-user>/crew-home` (private by default).

---

## Sharing presets between users

Today, the simplest path to share a preset with someone else is:

1. They run `crew preset init --remote` to set up their own crew home
2. You manually copy the preset directory across (or clone yours, copy the directory in, push)

A formal "publish/install from another user's repo" flow is on the roadmap but not in v0.10.

For collaborative team rosters that go beyond just agents (skills, decisions, routing), use [`crew export`](/crew/docs/features/export-import/) instead.

---

## What's in a preset directory

```
~/.crew/presets/backend-team/
├── preset.json              # manifest (name, version, description, tags, agents list)
└── agents/
    ├── lead/
    │   └── charter.md
    ├── api/
    │   └── charter.md
    ├── db/
    │   └── charter.md
    └── qa/
        └── charter.md
```

The `preset.json` manifest format:

```json
{
  "name": "backend-team",
  "version": "1.0.0",
  "description": "Backend-focused crew: lead, API, DB, QA",
  "author": "bradygaster",
  "tags": ["backend", "api"],
  "agents": [
    { "name": "lead", "role": "Lead", "description": "owns architecture, scope, and code review" },
    { "name": "api", "role": "Backend Dev", "description": "REST endpoints, validation, error handling" },
    { "name": "db", "role": "Database Engineer", "description": "schema, migrations, query optimization" },
    { "name": "qa", "role": "Tester", "description": "test coverage, edge cases, CI/CD" }
  ]
}
```

You can hand-edit this file to refine descriptions or add/remove agents — but the corresponding `agents/<name>/charter.md` files must match.

---

## See also

- [Export & Import](/crew/docs/features/export-import/) — full crew snapshots including state
- [Skills](/crew/docs/features/skills/) — earned knowledge (separate from presets)
- [Plugin Marketplace](/crew/docs/features/plugins/) — community-curated bundles
