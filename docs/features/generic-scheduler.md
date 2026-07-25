# Generic Scheduler

**Try this to see all scheduled tasks:**
```
crew schedule list
```

**Try this to check next run times:**
```
crew schedule status
```

**Try this to trigger a task manually:**
```
crew schedule run ralph-heartbeat
```

The generic scheduler unifies cron jobs, polling loops, and manual triggers. Define all recurring crew tasks in one place and let Crew orchestrate them.

---

## What the Generic Scheduler Does

The generic scheduler gives crews a **unified way to schedule and run recurring tasks**:

1. **Define** tasks in `.crew/schedule.json` (cron, interval, event-driven, startup)
2. **Trigger** locally via `crew schedule run` or automatically via polling
3. **Monitor** with `crew schedule status` to see run history and next run times
4. **Recover** from failures with configurable retry and backoff
5. **Scale** to GitHub Actions for headless/CI environments

No more scattered cron jobs, polling scripts, or manual triggers.

## Quick Start

### Initialize a Schedule

Create a default `.crew/schedule.json`:
```bash
crew schedule init
```

This creates:
```json
{
  "schedules": [
    {
      "id": "ralph-heartbeat",
      "name": "Ralph Work Monitor",
      "enabled": true,
      "trigger": { "type": "interval", "intervalSeconds": 300 },
      "task": { "type": "script", "command": "crew ralph watch --duration 30s" },
      "providers": ["local-polling"],
      "retry": { "maxRetries": 1, "backoffSeconds": 5 }
    }
  ]
}
```

### List All Schedules

```bash
crew schedule list
```

Output:
```
ID                    Name                        Trigger              Status
ralph-heartbeat       Ralph Work Monitor          Every 5min           Enabled
upstream-sync         Upstream Sync               Every 6h             Enabled
ci-daily-report       Daily CI Report             Mon-Fri 8am          Enabled
```

### Check Status

```bash
crew schedule status
```

Output:
```
ralph-heartbeat
  Last Run:  2026-03-17 14:25:30 (Success)
  Next Run:  2026-03-17 14:30:30 (in 4min)

upstream-sync
  Last Run:  2026-03-17 12:00:00 (Success)
  Next Run:  2026-03-17 18:00:00 (in 4h)
```

### Run Manually

Trigger a task immediately:
```bash
crew schedule run ralph-heartbeat
```

## Schedule Configuration

The schedule manifest lives in `.crew/schedule.json`:

```json
{
  "schedules": [
    {
      "id": "unique-id",
      "name": "Human-readable name",
      "description": "What this task does",
      "enabled": true,
      "trigger": { ... },
      "task": { ... },
      "providers": ["local-polling"],
      "retry": { "maxRetries": 2, "backoffSeconds": 5 },
      "tags": ["monitoring", "core"]
    }
  ]
}
```

### Trigger Types

#### Interval
Run every N seconds:
```json
{ "type": "interval", "intervalSeconds": 300 }
```

#### Cron
Use standard cron syntax:
```json
{ "type": "cron", "expression": "0 8 * * MON-FRI" }
```

#### Event
Run when something happens:
```json
{ "type": "event", "eventName": "session:complete" }
```

#### Startup
Run once when crew initializes:
```json
{ "type": "startup" }
```

### Task Types

#### Script
Run a shell command:
```json
{ "type": "script", "command": "crew upstream sync" }
```

#### Workflow
Trigger a GitHub Actions workflow:
```json
{ "type": "workflow", "ref": ".github/workflows/daily-report.yml" }
```

#### Copilot
Run a Copilot agent task:
```json
{ "type": "copilot", "agent": "ralph", "prompt": "check work queue" }
```

#### Webhook
POST to a URL:
```json
{ "type": "webhook", "url": "https://example.com/hooks/crew-task" }
```

### Providers

#### Local Polling
Run in-process when `crew` is running:
```json
{ "providers": ["local-polling"] }
```

Use this for development and testing. Runs until you stop the crew CLI.

#### GitHub Actions
Automatically generate and trigger GitHub Actions workflows:
```json
{ "providers": ["github-actions"] }
```

Use this for production. Crew generates `.github/workflows/schedule-{id}.yml` and GitHub runs it on schedule.

## Real-World Example

### Multi-Task Schedule

```json
{
  "schedules": [
    {
      "id": "ralph-monitor",
      "name": "Ralph Work Monitor",
      "trigger": { "type": "interval", "intervalSeconds": 300 },
      "task": { "type": "script", "command": "crew ralph watch --duration 25s" },
      "providers": ["local-polling", "github-actions"],
      "retry": { "maxRetries": 2, "backoffSeconds": 10 }
    },
    {
      "id": "upstream-sync",
      "name": "Upstream Sync",
      "trigger": { "type": "cron", "expression": "0 */6 * * *" },
      "task": { "type": "script", "command": "crew upstream sync --auto-pr" },
      "providers": ["github-actions"],
      "retry": { "maxRetries": 1, "backoffSeconds": 30 }
    },
    {
      "id": "daily-report",
      "name": "Daily Status Report",
      "trigger": { "type": "cron", "expression": "0 9 * * MON-FRI" },
      "task": { "type": "workflow", "ref": ".github/workflows/daily-report.yml" },
      "providers": ["github-actions"]
    }
  ]
}
```

This schedule:
- Monitors work every 5 minutes (local + GHA)
- Syncs upstreams every 6 hours (GHA only, no local polling)
- Generates a daily report on weekday mornings (GHA only)

## Local vs. GitHub Actions

### Local Polling (`crew schedule`)

Run while working locally:
```bash
cd my-crew
crew schedule watch
```

The scheduler runs in your terminal until you exit. Tasks execute in-process. Perfect for development.

### GitHub Actions

For production and headless environments, Crew generates workflows:

```bash
crew schedule init-ci
```

This creates `.github/workflows/crew-schedule-*.yml` files. GitHub Actions runs them on your schedule.

Advantages:
- Runs 24/7 (no local machine needed)
- Logs available in GitHub UI
- Built-in error notifications
- No setup beyond git push

## State & History

Crew maintains schedule state in `.crew/.schedule-state.json`:

```json
{
  "ralph-monitor": {
    "lastRun": "2026-03-17T14:25:30Z",
    "lastStatus": "success",
    "lastOutput": "10 issues found, 3 stale",
    "nextRun": "2026-03-17T14:30:30Z",
    "runCount": 1847,
    "failCount": 3
  }
}
```

This is auto-managed. You can inspect it but shouldn't edit it directly.

## Use Cases

### Monitoring Loop
Monitor work queue every 5 minutes:
```bash
crew schedule init ralph-monitor
```

### Hourly Syncs
Keep multiple crews synchronized:
```bash
crew upstream sync --interval hourly
```

### Daily Reports
Generate daily team status reports:
```bash
crew schedule run daily-report
```

### Event Hooks
Trigger on session complete:
```bash
crew schedule new downstream-notify --event session:complete
```

## Error Handling

Schedules include retry logic:

```json
{
  "retry": {
    "maxRetries": 2,
    "backoffSeconds": 5
  }
}
```

If a task fails:
1. Wait 5 seconds
2. Retry (first attempt)
3. Wait 10 seconds (exponential backoff)
4. Retry (second attempt)
5. If still failing, log error and skip until next trigger

## See Also

- [Upstream Auto-Sync](/features/upstream-sync) — Use scheduler to sync automatically
- [Persistent Ralph](/features/persistent-ralph) — Monitor crew work continuously
- [Cross-Crew Orchestration](/features/cross-crew-orchestration) — Delegate across crews
