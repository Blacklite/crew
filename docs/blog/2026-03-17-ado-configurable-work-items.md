---
title: "ADO Configurable Work Items: Match Your Process"
date: 2026-03-17
author: "Crew (Copilot)"
wave: null
tags: [crew, azure-devops, ado, work-items, configuration]
status: published
hero: "Crew now adapts to your Azure DevOps process template. Automatically detect available work item types, area paths, and iterations. No more hardcoded defaults."
---

# ADO Configurable Work Items: Match Your Process

> _Use any Azure DevOps process template. Crew introspects your project, learns your structure, and creates work items the way your team works._

## The Problem

Crew originally hardcoded work item creation: always User Stories, always in the default area, no iterations. This worked for simple projects but broke with reality:

- Scrum teams use different types than Agile teams
- Some teams organize by component, others by team
- Custom process templates add specialized types
- Iterations/sprints matter for sprint planning

As a result:
- Crew created work items in the wrong area
- Wrong work item types appearing in backlog
- Ralph (work monitor) created clutter, not structure

Organizations had to work around Crew instead of Crew adapting to their workflow.

## How It Works

### Auto-Discovery

During crew initialization:

```bash
crew init --org contoso --project "My Project" --introspect
```

Crew connects to your ADO project and discovers:

✓ Available work item types (Bug, Task, User Story, Feature, Scenario, etc.)
✓ Area paths (team/component organization)
✓ Iterations and sprints
✓ Custom fields

Suggests a config based on what exists.

### Configuration

Store your preferences in `.crew/config.json`:

```json
{
  "ado": {
    "org": "contoso",
    "project": "Platform",
    "defaultWorkItemType": "User Story",
    "areaPath": "Platform\Backend Services",
    "iterationPath": "Platform\Sprint 5"
  }
}
```

### Validation

Before creating work items, validate:

```bash
crew config validate
```

Returns:
```
✓ Organization: contoso
✓ Project: Platform
✓ Work Item Type: User Story (exists)
✓ Area Path: Platform\Backend Services (exists)
✓ Iteration: Platform\Sprint 5 (exists)
```

### Creation

When Ralph monitors work:

```bash
crew ralph scan
```

Creates issues as:
- **Type**: Your configured `defaultWorkItemType`
- **Area**: Your configured `areaPath`
- **Iteration**: Your configured `iterationPath` (if set)

Issues appear in the right backlog, organized correctly.

## Real-World Scenario

### Before: Hardcoded Approach

Crew creates all issues as "User Story" in default area → Scrum backlog is polluted with non-stories, area organization is ignored.

### After: Configurable Approach

**Backend Team** runs their crew with:
```json
{
  "defaultWorkItemType": "User Story",
  "areaPath": "Platform\Backend"
}
```

**QA Team** runs their crew with:
```json
{
  "defaultWorkItemType": "Bug",
  "areaPath": "Platform\QA"
}
```

**DevOps Team** runs their crew with:
```json
{
  "defaultWorkItemType": "Task",
  "areaPath": "Platform\Infrastructure"
}
```

Now:
- Backend issues show as User Stories in the Backend area ✓
- QA issues show as Bugs in the QA area ✓
- DevOps issues show as Tasks in the Infrastructure area ✓
- Each team's backlog stays organized ✓
- Ralph creates work that makes sense for each team ✓

## Process Template Support

Works with all Azure DevOps templates:

### Scrum
- Types: Epic, Feature, User Story, Task, Bug, Impediment
- Areas: Team structure (Team 1, Team 2)
- Iterations: Sprint cycles (Sprint 1, Sprint 2, etc.)

### Agile
- Types: Epic, Feature, User Story, Task, Bug, Issue
- Areas: Component-based (Web, API, Database)
- Iterations: Release cycles (Release 1, Release 2)

### CMMI
- Types: Epic, Feature, Requirement, Task, Bug, Review, Issue
- Areas: Department structure
- Iterations: Phase-based (Planning, Dev, Test, Deploy)

### Custom Templates
Any custom template is supported. Introspect to see what's available.

## Configuration Reference

In `.crew/config.json`, add an `ado` section:

```json
{
  "ado": {
    "org": "your-org-name",
    "project": "Your Project",
    "defaultWorkItemType": "User Story",
    "areaPath": "Your Project\Team Name",
    "iterationPath": "Your Project\Sprint 1"
  }
}
```

All fields optional. Defaults:
- **defaultWorkItemType**: `"User Story"`
- **areaPath**: Project root
- **iterationPath**: None (not assigned to sprint)

## Introspection Workflow

### Step 1: Connect

```bash
crew init --org contoso --project "Platform" --introspect
```

### Step 2: Review Suggestions

Crew prints discovered options:
```
Available Work Item Types:
  - User Story
  - Task
  - Bug
  - Epic
  - Feature

Available Areas:
  - Platform
  - Platform\Backend
  - Platform\Frontend
  - Platform\QA

Available Iterations:
  - Platform\Sprint 1
  - Platform\Sprint 2
  - Platform\Sprint 3
```

### Step 3: Configure

Update `.crew/config.json` with your choices.

### Step 4: Validate

```bash
crew config validate
```

### Step 5: Use

Ralph now creates work items correctly.

## Overrides

Override defaults for specific work items:

```bash
crew create issue "Critical bug" --type Bug --areaPath "Platform\QA"
```

Or in code:
```typescript
crew.createWorkItem({
  title: "Setup logging",
  type: "Task",
  areaPath: "Platform\Infrastructure",
  iterationPath: "Platform\Sprint 5"
});
```

## Multi-Team Setup

Each team/crew has their own config:

**crew-backend/.crew/config.json**:
```json
{ "ado": { "defaultWorkItemType": "User Story", "areaPath": "Platform\Backend" } }
```

**crew-frontend/.crew/config.json**:
```json
{ "ado": { "defaultWorkItemType": "User Story", "areaPath": "Platform\Frontend" } }
```

**crew-qa/.crew/config.json**:
```json
{ "ado": { "defaultWorkItemType": "Bug", "areaPath": "Platform\QA" } }
```

## Fallback Behavior

If config is missing or invalid:

1. Attempts to use configured values
2. Falls back to defaults if not found:
   - Work item type → "User Story"
   - Area → Project root
   - Iteration → None
3. Logs warnings when fallback occurs

## See Also

- [Persistent Ralph](/features/persistent-ralph) — Ralph creates work with your config
- [Cross-Crew Orchestration](/features/cross-crew-orchestration) — Delegate work with correct types
- [Generic Scheduler](/features/generic-scheduler) — Run ADO operations on schedule
