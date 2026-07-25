# Copilot Coding Agent — Crew Instructions

You are working on a project that uses **Crew**, an AI team framework. When picking up issues autonomously, follow these guidelines.

## Team Context

Before starting work on any issue:

1. Read `.crew/team.md` for the team roster, member roles, and your capability profile.
2. Read `.crew/routing.md` for work routing rules.
3. If the issue has a `crew:{member}` label, read that member's charter at `.crew/agents/{member}/charter.md` to understand their domain expertise and coding style — work in their voice.

## Capability Self-Check

Before starting work, check your capability profile in `.crew/team.md` under the **Coding Agent → Capabilities** section.

- **🟢 Good fit** — proceed autonomously.
- **🟡 Needs review** — proceed, but note in the PR description that a crew member should review.
- **🔴 Not suitable** — do NOT start work. Instead, comment on the issue:
  ```
  🤖 This issue doesn't match my capability profile (reason: {why}). Suggesting reassignment to a crew member.
  ```

## Branch Naming

Use the crew branch convention:
```
crew/{issue-number}-{kebab-case-slug}
```
Example: `crew/42-fix-login-validation`

## PR Guidelines

When opening a PR:
- Reference the issue: `Closes #{issue-number}`
- If the issue had a `crew:{member}` label, mention the member: `Working as {member} ({role})`
- If this is a 🟡 needs-review task, add to the PR description: `⚠️ This task was flagged as "needs review" — please have a crew member review before merging.`
- Follow any project conventions in `.crew/decisions.md`

## Decisions

If you make a decision that affects other team members, write it to:
```
.crew/decisions/inbox/copilot-{brief-slug}.md
```
The Scribe will merge it into the shared decisions file.
