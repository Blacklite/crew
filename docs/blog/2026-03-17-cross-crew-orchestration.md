---
title: "Cross-Crew Orchestration: Work as a Network"
date: 2026-03-17
author: "Crew (Copilot)"
wave: null
tags: [crew, orchestration, discovery, delegation, mesh]
status: published
hero: "Crews discover each other's capabilities and delegate work directly. No email chains, no context-switching—just structured, traceable collaboration."
---

# Cross-Crew Orchestration: Work as a Network

> _Discover what other crews can do, delegate work to the right team, and build a connected mesh of specialized crews._

## The Problem

In large organizations, work routing is chaotic:

- A feature crew has a deployment problem → email to the infra crew
- Infra crew is overloaded → 3-day turnaround
- QA crew has capacity but nobody knows → work stalls

Alternatively, crews work in isolation:

- Each team maintains their own skills and patterns
- No visibility into what other crews know
- Repeated effort across teams

Existing solutions (Jira hierarchies, manual registries, email lists) don't scale and create friction.

Cross-crew orchestration solves this by making crews **discoverable and delegatable**.

## How It Works

### Publish Capabilities

Each crew publishes `.crew/manifest.json`:

```json
{
  "name": "infra-crew",
  "capabilities": ["kubernetes", "terraform", "ci-cd"],
  "accepts": ["issues"],
  "contact": {
    "labels": ["crew:infra", "priority:system"]
  }
}
```

### Discover Crews

```bash
crew discover
```

Your crew reads upstream manifests and builds a local index of known crews.

### Delegate Work

```bash
crew delegate infra-crew "Set up autoscaling for staging cluster"
```

An issue is created in infra-crew's repo with:
- Your crew context
- Proper labels for routing
- Link back to original request

## Real-World Example

### A Day in the Network

**Morning**: Frontend crew needs a new API endpoint
```bash
crew delegate backend-crew "Create /api/v2/user-preferences endpoint"
```
- Issue appears in backend-crew's backlog labeled `crew:frontend` + `api:user-preferences`
- Backend crew sees the full request and can estimate

**Mid-morning**: Frontend crew discovers performance issues
```bash
crew delegate devops-crew "Profile and optimize React bundle size"
```
- DevOps crew uses their profiling tools
- Returns findings back via PR comment

**Afternoon**: Platform crew needs database migration
```bash
crew delegate dba-crew --file migration-plan.md
```
- Plan is reviewed and approved
- DBA crew runs it during maintenance window

**Next day**: DevOps crew learns an optimization technique
```bash
crew upstream propose platform-crew --skills
```
- Shares the learning back upstream
- Frontend crew auto-syncs the skill

## Configuration

### Crew Manifest

Place at `.crew/manifest.json`:

```json
{
  "name": "my-crew",
  "repo": "github.com/org/my-crew",
  "description": "Handles user-facing API and client SDKs",
  "capabilities": [
    "rest-api",
    "graphql",
    "sdk-generation",
    "authentication"
  ],
  "accepts": [
    "issues",
    "pull-requests"
  ],
  "contact": {
    "team": "Backend Platform",
    "labels": [
      "crew:backend",
      "epic:api",
      "priority:high"
    ]
  }
}
```

### Register Upstreams

Crew discovery reads `.crew/upstream.json`:

```json
{
  "upstreams": [
    {
      "name": "platform-crew",
      "source": "https://github.com/org/platform-crew",
      "ref": "main"
    }
  ]
}
```

## Delegation Process

When you delegate:

1. Crew resolves the target crew name from discovery index
2. Creates a GitHub issue in the target repo
3. Applies labels from target's manifest
4. Includes cross-crew metadata (source, context)
5. Posts a comment in your crew linking to the created issue

Example issue created in infra-crew:

```
Title: [DELEGATED] Create staging autoscaling policy

From: feature-crew (#42 in original repo)
---

Please help us set up autoscaling for our staging cluster.
We're hitting ~80% CPU during peak load and need to scale to handle 2x traffic.

Acceptance Criteria:
- Autoscaling configured for staging-app deployment
- Min replicas: 2, max: 10
- Target: 70% CPU, 80% memory
- Verify with load test

Labels: crew:feature, epic:performance, priority:high
```

## Use Cases

### Matrix Organization

```
Platform Crew
├── Backend Crew (delegates infra work)
├── Frontend Crew (delegates performance work)
└── QA Crew (delegates automation work)
```

Each crew specializes. Work flows naturally to the right team.

### Multi-Org Networks

```
Org A (Product)
├── Feature Crew A
└── Feature Crew B

Org B (Platform)
├── Infra Crew
└── Data Crew
```

Cross-org crews delegate via upstreams. Org B crews handle infrastructure for Org A.

### Shared Services

```
Platform/
├── Auth Crew (auth policies, tokens, SSO)
├── Database Crew (migrations, optimization, backups)
└── Observability Crew (logging, metrics, tracing)
```

Any crew discovering Platform can delegate auth, database, or observability work.

## Best Practices

### Capability Naming

Use specific, searchable terms:

```json
{
  "capabilities": [
    "kubernetes-eks",
    "terraform-aws",
    "helm-charts",
    "ci-github-actions"
  ]
}
```

Not: `["devops"]`

### Contact Labels

Make it easy for crews to find your backlog:

```json
{
  "contact": {
    "labels": [
      "crew:platform",
      "area:infrastructure",
      "severity:normal"
    ]
  }
}
```

### Documentation

Link to crew docs in the description:

```json
{
  "description": "Kubernetes clusters, Terraform infra, CI/CD. See https://wiki.org/platform-crew for runbooks and policies."
}
```

## See Also

- [Upstream Auto-Sync](/features/upstream-sync) — Keep crew manifests in sync
- [Persistent Ralph](/features/persistent-ralph) — Monitor delegation status
- [Generic Scheduler](/features/generic-scheduler) — Schedule recurring delegations
