# Copilot Coding Agent — Crew Instructions

You are working on **Crew**, an AI team framework. Follow these guidelines for autonomous issue work.

## Team Context

1. Read `.crew/team.md` for roster, roles, and your capability profile.
2. Read `.crew/routing.md` for work routing rules.
3. If the issue has a `crew:{member}` label, read `.crew/agents/{member}/charter.md` — work in their voice.

## Capability Self-Check

Check your profile in `.crew/team.md` under **Coding Agent → Capabilities**: 🟢 proceed, 🟡 proceed + flag for review in PR, 🔴 stop and comment on issue suggesting reassignment.

## Branch Naming

`crew/{issue-number}-{kebab-case-slug}` — Example: `crew/42-fix-login-validation`

## Git Safety — Mandatory

- ❌ NEVER `git add .`, `git add -A`, or `git commit -a` — stage specific files only
- ❌ NEVER push to `dev` or `main` directly — always open a PR
- ❌ NEVER force push to shared branches
- ✅ Branch from latest dev: `git fetch origin && git checkout dev && git pull origin dev && git checkout -b <branch>`
- ✅ Before committing: `git diff --cached --stat` (file count matches intent) and `git diff --cached --diff-filter=D --name-only` (no unintended deletions)
- ✅ `npm run build` must pass before pushing. Commit message must reference `Closes #N`.
- 🛑 STOP and ask if: >20 files in diff, unintended deletions, or out-of-scope changes

## Protected Files

When touching files in `packages/crew-cli/src/cli/core/`, read `.copilot/skills/protected-files/SKILL.md` first. Some bootstrap files must use only Node.js built-ins — no npm packages or SDK imports.

## Sweeping Refactors

Before codebase-wide changes, check the Protected Files skill and scan for `— zero dependencies` markers in file headers. Convert in small batches; verify each compiles. Confirm SDK imports resolve against `packages/crew-sdk/src/index.ts`.

## PR Guidelines

- Reference the issue: `Closes #{issue-number}`
- If `crew:{member}` labeled, mention: `Working as {member} ({role})`
- If 🟡 task, add: `⚠️ Needs crew member review before merging.`
- Consult `.crew/decisions.md` for project conventions

## PR Scope Rules

- **`repo-health`** PRs: Only `.github/`, `scripts/`, root configs, tests, docs. NEVER `packages/*/src/`.
- **`fix`/`feat`** PRs: May modify product source. Requires changeset if touching `packages/*/src/`.
- Split infrastructure + product changes into separate PRs.

## Changeset Requirement

PRs modifying `packages/crew-cli/src/` or `packages/crew-sdk/src/` MUST include a `.changeset/{name}.md` file (patch/minor/major). The `changelog-gate` CI check enforces this. Escape hatch: `skip-changelog` label.

## PR Review Skills

Before submitting or reviewing PRs, consult: `.copilot/skills/reviewer-protocol/SKILL.md`, `.copilot/skills/architectural-review/SKILL.md`, `.copilot/skills/security-review/SKILL.md`.

## Automated PR Nudge

The **PR Nudge** workflow (`.github/workflows/crew-pr-nudge.yml`) runs on weekdays at 2pm UTC and posts actionable comments on open PRs that have been stale for 7+ days. It diagnoses specific blockers — failing CI checks, unresolved review threads, missing approvals, outdated branches, and draft status — so PR authors know exactly what to do next. Draft PRs get a 14-day grace period. The workflow won't nudge the same PR more than once per week.

## Decisions

Team decisions go to `.crew/decisions/inbox/copilot-{brief-slug}.md` — Scribe merges them.
