---
title: Cross-Crew Discover & Delegate
description: Discover other crews across repository boundaries and delegate work to them via crew discover and crew delegate.
---

# Cross-Crew Discover & Delegate

> ⚠️ **Experimental** — Crew is alpha software. APIs, commands, and behavior may change between releases.

**Try this to see what crews you can reach:**
```bash
crew discover
```

**Try this to send work to another crew:**
```bash
crew delegate platform-crew "Add monitoring dashboard for the auth service"
```

When you have multiple Crew-enabled repositories — a platform crew, a frontend crew, a data crew — you often need to ask the other crew to do something for you. Cross-crew orchestration lets a crew **discover** other crews and **delegate** issues to them, with proper labels and contact info, so the right team picks it up automatically.

Both commands work via GitHub issues — no shared infrastructure required. Each crew's manifest declares what it accepts and how to reach it.

---

## How it works

Each crew publishes a `.crew/manifest.json` file declaring:
- Its name and capabilities (e.g., `kubernetes`, `helm`, `monitoring`)
- Its GitHub repo (the contact)
- The labels to apply to cross-crew issues
- What work types it accepts (`issues`, `prs`)
- Named skills it offers

When you run `crew discover`, Crew reads manifests from:
- **Upstream** — repos declared in your `.crew/upstreams/`
- **Registry** — any registry sources configured
- **Local** — manifests inside the current repo

When you run `crew delegate <crew> "<description>"`, Crew finds the target manifest, creates a properly-labeled GitHub issue in its repo, and includes structured cross-crew metadata so the other crew's coordinator picks it up correctly.

---

## Commands

### `crew discover`

List known crews and their capabilities:

```bash
$ crew discover

Discovered Crews (3):

  Name             Capabilities                Repo                    Accepts
  ──────────────   ──────────────────────────  ──────────────────────  ────────
  platform-crew   kubernetes, helm, infra     myorg/platform          issues
  frontend-crew   react, design-system, ui    myorg/web-app           issues
  data-crew       etl, dbt, pipelines, ml     myorg/data-platform     issues, prs
```

If no crews are discovered, the output reminds you to configure upstreams or check that other repos have published `manifest.json` files.

### `crew delegate <crew-name> "<description>"`

Create a cross-crew work request in another crew's repository:

```bash
crew delegate platform-crew "Add Grafana dashboards for the auth service's p95 latency"
```

This creates an issue in `myorg/platform` titled `[cross-crew] Add Grafana dashboards...` with:
- Crew's discovered labels applied automatically
- A structured body with the originating repo, target crew, description, and acceptance criteria
- The created issue's URL printed to your terminal

Required:
- The target crew's manifest must include the work type — `accepts: ["issues"]` for the default delegation flow
- GitHub CLI (`gh`) installed and authenticated with permission to create issues in the target repo

---

## Publishing a manifest for your own crew

To make your crew discoverable by others, create `.crew/manifest.json`:

```json
{
  "name": "platform-crew",
  "version": "1.0.0",
  "description": "Infrastructure, Kubernetes, and platform services",
  "capabilities": ["kubernetes", "helm", "monitoring", "infra"],
  "contact": {
    "repo": "myorg/platform",
    "labels": ["cross-crew", "needs-triage"]
  },
  "accepts": ["issues"],
  "skills": ["k8s-deployment", "helm-chart-authoring", "prometheus-alerting"]
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `name` | ✅ | Human-readable name (e.g., `platform-crew`). Used in `crew delegate <name>`. |
| `version` | optional | Schema version for forward compatibility |
| `description` | optional | One-line summary shown in `discover` output |
| `capabilities` | ✅ | Tags other crews use to find you (`crew discover` filters here in future versions) |
| `contact.repo` | ✅ | GitHub repo in `owner/repo` format where issues get created |
| `contact.labels` | optional | Labels applied to every cross-crew issue (so your triage automation can find them) |
| `accepts` | ✅ | Work types: `["issues"]`, `["prs"]`, or both |
| `skills` | optional | Named skills your crew offers — informational today, filterable in future |

Commit `manifest.json` to your repo's `.crew/` directory and push. Other crews that have your repo in their upstream list will pick it up on next `crew discover`.

---

## What the delegated issue looks like

When `crew delegate` creates an issue, it uses this structured body so the receiving crew's coordinator can recognize and route it correctly:

```markdown
## Cross-Crew Work Request

**From:** this repository
**To:** platform-crew (myorg/platform)

### Description

Add Grafana dashboards for the auth service's p95 latency

### Acceptance Criteria

- [ ] Work completed and verified
- [ ] Originating crew notified of completion

*Created by crew cross-crew orchestration*
```

The receiving crew sees an issue with their `cross-crew` (and any custom) labels, structured metadata in the body, and clear acceptance criteria.

---

## Limitations in v0.10

- **No automatic completion notification.** When the receiving crew closes the issue, the originating crew doesn't get notified back automatically. Today you watch the issue manually or via standard GitHub notifications.
- **Discovery is upstream-driven.** A crew has to know about another crew (via an upstream declaration) before `discover` can see it. There's no global registry.
- **No capability filtering on delegate.** `crew delegate <name>` requires the exact crew name. You can't say "delegate this to any crew that has the `kubernetes` capability" — yet.
- **PRs aren't supported in the default flow.** Even though manifests can declare `accepts: ["prs"]`, the v0.10 `delegate` command only creates issues.

These are tracked for follow-up. For now, cross-crew orchestration is a useful but minimal MVP — it removes the "where do I file this?" friction and ensures the right team gets a properly-formatted request.

---

## See also

- [Distributed Mesh](/crew/docs/features/distributed-mesh/) — the broader cross-repo coordination architecture
- [Multiple Crews](/crew/docs/scenarios/multiple-crews/) — running several crews in one organization
- [Upstream Inheritance](/crew/docs/features/upstream-inheritance/) — how upstreams get discovered
