# Frequently asked questions

> ⚠️ **Experimental** — Crew is alpha software. APIs, commands, and behavior may change between releases.


Common questions, troubleshooting tips, and clarifications based on community feedback. Can't find your answer? [Open an issue](https://github.com/Blacklite/crew/issues/new).

---

## Which CLI should I use?

**Short answer:** Use **GitHub Copilot CLI** for day-to-day work. Use **Crew CLI** for setup, diagnostics, and specific features.

**Why GitHub Copilot CLI?**
- Full agent spawning capabilities
- Access to all Crew features through natural conversation
- Model selection and background execution
- No manual commands — just describe what you need

**When to use Crew CLI:**
- Initial setup: `crew init`
- Diagnostics: `crew doctor`
- Continuous triage: `crew triage --interval 10`
- Aspire dashboard: `crew aspire`
- Export/import: `crew export` and `crew import`
- Remote phone access: `crew start --tunnel`

**Common workflow pattern:**
```bash
# Terminal 1: Run continuous triage
crew triage --interval 10

# Terminal 2: Work with your team
gh copilot
> @crew what issues are ready to work?
```

For a detailed feature comparison, see [Client Compatibility Matrix](../scenarios/client-compatibility.md).

---

## Why doesn't `gh issue edit --add-assignee "@copilot"` work?

**Problem:** Running `gh issue edit <number> --add-assignee "@copilot"` (or variants like `copilot-swe-agent[bot]`) fails locally, even with a Personal Access Token.

**Why this happens:** The GitHub Copilot coding agent is a bot account. Bot accounts cannot be assigned to issues via the GitHub CLI in the same way as human users — the GitHub API restricts direct assignment of bot accounts through standard endpoints.

**Recommended workaround:** Use **label-based assignment** through the GitHub Actions workflow:

1. Add the `crew:copilot` label to the issue:
   ```bash
   gh issue edit <number> --add-label "crew:copilot"
   ```

2. The auto-assign workflow (`.github/workflows/crew-copilot-auto-assign.yml`) detects the label and assigns @copilot automatically.

**Prerequisites for auto-assign:**
- You must create a **GitHub Classic Personal Access Token** with `repo` scope
- Add it as a repository secret: `gh secret set COPILOT_ASSIGN_TOKEN`
- The workflow uses this token to perform the assignment on your behalf

See [Copilot Coding Agent](../features/copilot-coding-agent.md) for full setup instructions.

---

## I don't see anything on the Aspire dashboard

**Problem:** You ran `crew aspire` and opened the dashboard, but no telemetry is showing up.

**Why this happens:** The Aspire dashboard integration **requires the Crew CLI**. It is not available when using GitHub Copilot CLI directly.

**How to fix:**
1. Ensure you started Aspire with the Crew CLI:
   ```bash
   crew aspire
   ```

2. Confirm the container is running:
   ```bash
   docker ps | grep aspire-dashboard
   ```

3. Look for the dashboard URL in the output (usually `http://localhost:18888`)

4. Run a Crew CLI command that generates telemetry:
   ```bash
   crew doctor
   crew triage
   ```

5. Refresh the Aspire dashboard — you should see traces, metrics, and logs appear

**Note:** GitHub Copilot CLI sessions do **not** send telemetry to Aspire. Only Crew CLI commands emit OpenTelemetry data to the dashboard.

See [Using Crew with the Aspire Dashboard](../scenarios/aspire-dashboard.md) for details.

---

## `crew doctor` complains about absolute path for teamRoot

**Problem:** Running `crew doctor` shows a warning like:

```
⚠ teamRoot uses absolute path — consider making it relative
```

**Why this matters:** Absolute paths (e.g., `C:\Users\me\crew\` or `/Users/me/crew/`) break portability. If you share the crew with a teammate or clone it to a new machine, the absolute path won't resolve correctly.

**How to fix:** Make the `teamRoot` path **relative to the project root**.

**Example — Before (absolute):**
```json
{
  "teamRoot": "C:\\Users\\me\\repos\\my-team\\.crew"
}
```

**Example — After (relative):**
```json
{
  "teamRoot": ".crew"
}
```

**For linked teams (dual-root mode):**

If your project links to a remote team repository:

```json
{
  "teamRoot": "../team-repo/.crew"
}
```

The path should be relative to your **project root** (where `.crew/` or `crew.config.ts` lives), not to the `.crew/` directory itself.

**Verify the fix:**
```bash
crew doctor
```

You should see `✓ teamRoot is relative` or no warning.

---

## Can I use Crew CLI and GitHub Copilot CLI at the same time?

Yes! They complement each other:

- **Crew CLI** provides infrastructure: triage, Aspire observability, export/import, diagnostics
- **GitHub Copilot CLI** provides conversational interface to your team

**Recommended setup:**
- Run `crew triage --interval 10` in a dedicated terminal (or as a cron job / GitHub Action)
- Use `gh copilot` (or `@crew` in VS Code) for all team interactions
- Use `crew doctor` or `crew aspire` for diagnostics when needed

Both CLIs read and write the same `.crew/` directory, so state stays synchronized.

---

## What's the difference between Ralph and triage?

**Ralph** and **triage** are different names for the same functionality:

- **`crew ralph`** is the legacy command name
- **`crew triage`** is the new primary command name (as of v0.8.26)
- Both commands do the same thing: monitor GitHub issues, apply routing rules, and assign work to team members

**Migration path:**
- Existing scripts using `crew ralph` will continue to work (it's an alias)
- New projects should use `crew triage` in documentation and automation
- The `ralph/` directory in `.crew/` remains unchanged for backward compatibility

---

## How do I add a new agent to my crew?

**In conversation (recommended):**

```
gh copilot
> @crew I want to add a new agent
> Role: Security specialist
> Name: Guardian
> Expertise: OWASP, dependency scanning, secrets detection
```

Crew will create the charter, update the team roster, and add routing rules.

**Manual creation:**

1. Create a charter file in `.crew/agents/<name>/charter.md`
2. Update `.crew/team.md` to include the new agent in the roster
3. Add routing rules in `.crew/routing.md` (if applicable)
4. Optionally add a history file in `.crew/agents/<name>/history.md`

See [Team Setup](../features/team-setup.md) for details.

---

## What happens if I run `crew init` twice?

Nothing breaks! `crew init` is **idempotent** — it's safe to run multiple times.

**What it does:**
- Checks if `.crew/` exists; if yes, does nothing
- Copies missing templates to `.crew/`
- Updates `.github/workflows/` with Crew Actions (skips existing files)
- Adds `.github/agents/crew.agent.md` if missing

**Use cases:**
- Recover from partial initialization
- Update workflows after a Crew upgrade
- Add missing templates without overwriting custom changes

---

## Can I use Crew without GitHub Issues?

Yes, but with limitations.

**What works without GitHub Issues:**
- Conversational team interaction (`@crew`, `gh copilot`)
- Agent spawning and parallel execution
- Memory, decisions, and knowledge sharing
- Skills and ceremonies
- Export/import for portability

**What requires GitHub Issues:**
- Ralph/triage auto-assignment
- Issue-driven development workflows
- Project board integration
- Label-based routing
- Copilot coding agent auto-assignment

If you're using GitLab, see [GitLab Issues](../features/gitlab-issues.md) for integration options.

---

## How do I reset my crew without losing decisions?

**Option 1: Archive and start fresh**
```bash
# Export current state
crew export --out backup-$(date +%Y%m%d).json

# Remove .crew/
rm -rf .crew/

# Reinitialize
crew init
```

Manually copy decisions from the backup JSON or `.crew/decisions.md` if you archived it separately.

**Option 2: Selective cleanup**
```bash
# Remove agent state but keep team structure
rm -rf .crew/agents/*/history.md
rm -rf .crew/sessions/

# Keep .crew/decisions.md, .crew/team.md, .crew/routing.md
```

See [Disaster Recovery](../scenarios/disaster-recovery.md) for more recovery patterns.

---

## Where should I report bugs or request features?

[Open an issue on GitHub](https://github.com/Blacklite/crew/issues/new) with:
- **Environment:** OS, Node.js version, Crew version (`crew --version`)
- **Reproduction steps:** What you ran, what happened, what you expected
- **Output:** Copy the full terminal output, including any errors

For questions or discussions, use [GitHub Discussions](https://github.com/Blacklite/crew/discussions).
