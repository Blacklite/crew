---
title: "Crew Goes Enterprise — Azure DevOps, Area Paths, and Cross-Project Work Items"
date: 2026-03-07
author: "Tamir Dresher"
wave: null
tags: [crew, azure-devops, enterprise, platform-adapter, work-items, area-paths, iteration-paths]
status: published
hero: "Crew now speaks Azure DevOps natively — auto-detection, configurable work item types, area/iteration paths, and cross-project support for enterprise environments."
---

# Crew Goes Enterprise — Azure DevOps, Area Paths, and Cross-Project Work Items

> Blog post #25 — How Crew learned to work with enterprise ADO environments where nothing is "standard."

## The Problem

GitHub repos have issues. Simple. One repo, one issue tracker, one set of labels.

Enterprise Azure DevOps? Not so much. Your code might live in one project, your work items in another. Your org might use "Scenario" instead of "User Story." Your team's backlog is scoped by area paths. Your sprints use iteration paths. And there's no PAT to manage — you authenticate via `az login`.

Crew needed to understand all of this. Not just "detect ADO" — actually *work* in enterprise ADO environments where every project has its own rules.

## What Shipped

### Platform Auto-Detection

Crew reads your git remote URL and figures out where you are:

```
https://dev.azure.com/myorg/myproject/_git/myrepo     → azure-devops
git@ssh.dev.azure.com:v3/myorg/myproject/myrepo        → azure-devops
https://myorg.visualstudio.com/myproject/_git/myrepo    → azure-devops
```

No configuration needed. `crew init` detects ADO and:
- Skips `.github/workflows/` generation (those don't run in ADO)
- Writes `"platform": "azure-devops"` to `.crew/config.json`
- Generates ADO-appropriate MCP config examples

### Configurable Work Item Types

Not every ADO project uses "User Story." Some use "Scenario," "Bug," or custom types locked down by org policy. Now you can configure it:

```json
{
  "version": 1,
  "platform": "azure-devops",
  "ado": {
    "defaultWorkItemType": "Scenario"
  }
}
```

Crew uses your configured type for all work item creation — Ralph triage, agent task creation, everything.

### Area Paths — Route to the Right Team

In enterprise ADO, area paths determine which team's backlog a work item appears in. A work item in `"MyProject\Frontend"` shows up on the Frontend team's board. One in `"MyProject\Platform"` goes to Platform.

```json
{
  "ado": {
    "areaPath": "MyProject\\Team Alpha"
  }
}
```

Now when Crew creates work items, they land on the right team's board — not lost in the root backlog.

### Iteration Paths — Sprint Placement

Same story for sprints. Enterprise teams plan in iterations, and work items need to appear in the right sprint:

```json
{
  "ado": {
    "iterationPath": "MyProject\\Sprint 5"
  }
}
```

### Cross-Project Work Items — The Enterprise Killer Feature

Here's the one that matters most for large organizations: **your git repo and your work items might live in completely different ADO projects — or even different orgs.**

Common pattern in enterprise:
- **Code** lives in `Engineering/my-service` (locked-down project with strict CI)
- **Work items** live in `Planning/team-backlog` (PM-managed project with custom process templates)

Crew now supports this cleanly:

```json
{
  "version": 1,
  "platform": "azure-devops",
  "ado": {
    "org": "planning-org",
    "project": "team-backlog",
    "defaultWorkItemType": "Scenario",
    "areaPath": "team-backlog\\Alpha Crew",
    "iterationPath": "team-backlog\\2026-Q1\\Sprint 5"
  }
}
```

When `ado.org` or `ado.project` are set, Crew uses them for all work item operations (create, query, tag, comment) while continuing to use the git remote's org/project for repo operations (branches, PRs, commits).

The WIQL queries, `az boards` commands, and Ralph's triage loop all respect this split.

## The Full Config Reference

All fields are optional. Omit any field to use the default.

| Field | Default | Description |
|-------|---------|-------------|
| `ado.org` | *(from git remote)* | ADO org for work items |
| `ado.project` | *(from git remote)* | ADO project for work items |
| `ado.defaultWorkItemType` | `"User Story"` | Type for new work items |
| `ado.areaPath` | *(project default)* | Team backlog routing |
| `ado.iterationPath` | *(project default)* | Sprint board placement |

## Security — No PATs Needed

Crew uses `az login` for authentication. No Personal Access Tokens to rotate, no secrets in config files. Your Azure CLI session handles everything.

For environments where MCP tools are available, Crew also supports the Azure DevOps MCP server for richer API access:

```json
{
  "mcpServers": {
    "azure-devops": {
      "command": "npx",
      "args": ["-y", "@azure/devops-mcp-server"]
    }
  }
}
```

## Security Hardening

The ADO adapter went through a thorough security review:

- **Shell injection prevention** — All `execSync` calls replaced with `execFileSync` (args as arrays, not concatenated strings)
- **WIQL injection prevention** — `escapeWiql()` helper doubles single-quotes in all user-supplied values
- **Bearer token protection** — Planner adapter passes tokens via `curl --config stdin` instead of CLI args (invisible to `ps aux`)

## What We Tested

External integration testing against real ADO environments (WDATP, OS, CrewDemo projects):

| Test | Result |
|------|--------|
| ADO project connectivity | ✅ |
| Repo discovery | ✅ |
| Branch creation | ✅ |
| Git clone + push | ✅ |
| Crew init (platform detection) | ✅ |
| PR creation + auto-complete | ✅ |
| PR read/list/comment | ✅ |
| Commit search | ✅ |
| Work item CRUD | ✅ |
| WIQL tag queries | ✅ |
| Cross-project work items | ✅ |

The only blockers encountered were project-specific restrictions (locked-down work item types in WDATP) — not Crew bugs.

## Ralph in ADO

Ralph's coordinator prompt is now platform-aware. When running against ADO, Ralph uses WIQL queries instead of GitHub issue queries:

```wiql
SELECT [System.Id] FROM WorkItems 
WHERE [System.Tags] Contains 'crew' 
  AND [System.State] <> 'Closed'
  AND [System.TeamProject] = 'team-backlog'
ORDER BY [System.CreatedDate] DESC
```

The full triage → assign → branch → PR → merge loop works end-to-end with ADO.

## Ralph + ADO: The Governance Fix

The coordinator prompt (`crew.agent.md`) is what tells Ralph *where* to look for work. Previously, it only had GitHub commands — `gh issue list`, `gh pr list`. Even if the ADO adapter was perfect, Ralph would still scan GitHub because that's what the governance file told it to do.

We fixed this at every level:
- **MCP detection** — Added `azure-devops-*` to the tool prefix table so the coordinator recognizes ADO MCP tools
- **Platform Detection section** — New section in the governance file explaining how to detect GitHub vs ADO from the git remote
- **Issue Awareness** — Now shows both GitHub and ADO queries, with instructions to read `.crew/config.json` first
- **Ralph Step 1** — Platform-aware scan with both GitHub and ADO command blocks, plus the critical instruction: *"Read `.crew/config.json` for the `ado` section FIRST — do NOT guess the ADO project from the repo name"*

This is the kind of bug that's invisible in unit tests — the code works, but the governance prompt doesn't tell the coordinator to use it.

## Getting Started

```bash
# 1. Install Crew
npm install -g @blacklite/crew-cli

# 2. Clone your ADO repo
git clone https://dev.azure.com/your-org/your-project/_git/your-repo
cd your-repo

# 3. Make sure az CLI is set up
az login
az extension add --name azure-devops

# 4. Init Crew (auto-detects ADO)
crew init

# 5. Edit .crew/config.json if you need custom work item config
# 6. Start working!
```

Full documentation: [Enterprise Platforms Guide](../features/enterprise-platforms.md)

## What's Next

- **Process template introspection** — Auto-detect available work item types from the ADO process template (#240)
- **ADO webhook integration** — Real-time work item change notifications
- **Azure Pipelines scaffolding** — Generate pipeline YAML during `crew init` for ADO repos

---

*The enterprise doesn't bend to your tools. Your tools bend to the enterprise. Crew now does.*

PR: [#191 — Azure DevOps platform adapter](https://github.com/Blacklite/crew/pull/191)
