# Cross-Crew Orchestration

**Try this to discover known crews:**
```
crew discover
```

**Try this to delegate work:**
```
crew delegate backend-crew "Optimize the API response time"
```

**Try this to see crew details:**
```
crew discover backend-crew
```

Cross-crew orchestration lets you discover other crews' capabilities and delegate work directly to them. Build a mesh of specialized crews that work together.

---

## What Cross-Crew Orchestration Does

Cross-crew orchestration enables crews to **discover each other** and **delegate work**. Instead of work bouncing between teams via email, or crews working in isolation, they form a connected mesh:

1. **Discover** — Find known crews and their capabilities
2. **Understand** — See what work types each crew accepts
3. **Delegate** — Create issues directly in another crew with context
4. **Route** — Issues arrive with proper labels and metadata

## Quick Start

### Discover Other Crews

List all discoverable crews in your network:
```bash
crew discover
```

Output:
```
Known Crews:
  backend-crew (github.com/org/backend-crew)
    Capabilities: api, database, performance
    Contact: @backend-team
    Accepts: issues, pull-requests

  frontend-crew (github.com/org/frontend-crew)
    Capabilities: ui, ux, accessibility
    Contact: @frontend-team
    Accepts: issues, pull-requests

  infra-crew (github.com/org/infra-crew)
    Capabilities: kubernetes, terraform, ci-cd
    Contact: @infra-team
    Accepts: issues
```

Get details about one crew:
```bash
crew discover backend-crew
```

### Delegate Work

Create an issue in another crew:
```bash
crew delegate backend-crew "Implement caching for user profiles API endpoint"
```

The issue is created in backend-crew's repository with:
- Proper labels (automatically applied based on crew manifest)
- Cross-crew metadata in the issue body
- Link back to your crew
- Assignment to the crew's triage team

Provide more context in a file:
```bash
crew delegate infra-crew --file deployment-request.md
```

### Remove an Upstream

Stop tracking a crew:
```bash
crew delegate remove backend-crew
```

## Configuration

Crews publish their capabilities via `.crew/manifest.json`:

```json
{
  "name": "backend-crew",
  "repo": "github.com/org/backend-crew",
  "description": "API and database services",
  "capabilities": [
    "api",
    "database",
    "performance",
    "caching"
  ],
  "accepts": [
    "issues",
    "pull-requests"
  ],
  "contact": {
    "team": "Backend Engineering",
    "labels": ["crew:backend", "needs-review"]
  }
}
```

- **name**: Unique crew identifier
- **repo**: GitHub repository URL
- **description**: What the crew does
- **capabilities**: Skills and services offered
- **accepts**: What work types the crew will take on
- **contact**: How to reach them (labels, team mentions)

## How Discovery Works

Discovery reads upstream crew manifests:

1. Find `.crew/upstream.json` in your crew
2. For each upstream, fetch `.crew/manifest.json`
3. Build a local index of known crews
4. Cache the index locally in `.crew/.discovery-cache.json`

Discovery is **read-only**—it doesn't modify other crews.

## Use Cases

### Multi-Team Organization

- **Platform Crew**: Infrastructure, databases, deployments
- **Feature Crew A**: Mobile and API clients
- **Feature Crew B**: Web frontend and analytics
- **Infra Crew**: CI/CD, monitoring, on-call

Teams discover each other's capabilities and delegate work instead of context-switching.

### Distributed Org

- Multiple orgs, each with their own crews
- Cross-org upstreams link crews (with permission)
- Feature team can delegate testing to central QA crew
- QA crew can delegate infrastructure to platform team

### Specialized Service Crews

- DevOps crew publishes "kubernetes", "terraform", "monitoring" capabilities
- Any team discovering DevOps can delegate infrastructure tasks
- No need to find the right person—just find the right crew

## Manifest Best Practices

### Be Descriptive

```json
{
  "capabilities": [
    "rest-api",
    "graphql",
    "websockets",
    "performance-optimization"
  ]
}
```

Not just `["backend"]` — be specific about what you can do.

### Label for Routing

```json
{
  "contact": {
    "labels": ["crew:backend", "epic:api", "priority:high"]
  }
}
```

Labels help delegates find the right backlog and priority.

### Document Acceptance Criteria

```json
{
  "description": "API and database services. We accept issues that involve REST/GraphQL APIs, query optimization, and data modeling."
}
```

Delegates know whether their work fits.

## See Also

- [Upstream Auto-Sync](/features/upstream-sync) — Keep crews in sync automatically
- [Persistent Ralph](/features/persistent-ralph) — Track all crew activity
- [Generic Scheduler](/features/generic-scheduler) — Schedule cross-crew workflows
