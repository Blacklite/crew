# Issue Lifecycle — Repo Connection & PR Flow

Reference for connecting Crew to a repository and managing the issue→branch→PR→merge lifecycle.

## Repo Connection Format

When connecting Crew to an issue tracker, store the connection in `.crew/team.md`:

```markdown
## Issue Source

**Repository:** {owner}/{repo}  
**Connected:** {date}  
**Platform:** {GitHub | Azure DevOps | Planner}  
**Filters:**
- Labels: `{label-filter}`
- Project: `{project-name}` (ADO/Planner only)
- Plan: `{plan-id}` (Planner only)
```

**Detection triggers:**
- User says "connect to {repo}"
- User says "monitor {repo} for issues"
- Ralph is activated without an issue source

## Platform-Specific Issue States

Each platform tracks issue lifecycle differently. Crew normalizes these into a common board state.

### GitHub

| GitHub State | GitHub API Fields | Crew Board State |
|--------------|-------------------|-------------------|
| Open, no assignee | `state: open`, `assignee: null` | `untriaged` |
| Open, assigned, no branch | `state: open`, `assignee: @user`, no linked PR | `assigned` |
| Open, branch exists | `state: open`, linked branch exists | `inProgress` |
| Open, PR opened | `state: open`, PR exists, `reviewDecision: null` | `needsReview` |
| Open, PR approved | `state: open`, PR `reviewDecision: APPROVED` | `readyToMerge` |
| Open, changes requested | `state: open`, PR `reviewDecision: CHANGES_REQUESTED` | `changesRequested` |
| Open, CI failure | `state: open`, PR `statusCheckRollup: FAILURE` | `ciFailure` |
| Closed | `state: closed` | `done` |

**Issue labels used by Crew:**
- `crew` — Issue is in Crew backlog
- `crew:{member}` — Assigned to specific agent
- `crew:untriaged` — Needs triage
- `go:needs-research` — Needs investigation before implementation
- `priority:p{N}` — Priority level (0=critical, 1=high, 2=medium, 3=low)
- `next-up` — Queued for next agent pickup

**Branch naming convention:**
```
crew/{issue-number}-{kebab-case-slug}
```
Example: `crew/42-fix-login-validation`

### Azure DevOps

| ADO State | Crew Board State |
|-----------|-------------------|
| New | `untriaged` |
| Active, no branch | `assigned` |
| Active, branch exists | `inProgress` |
| Active, PR opened | `needsReview` |
| Active, PR approved | `readyToMerge` |
| Resolved | `done` |
| Closed | `done` |

**Work item tags used by Crew:**
- `crew` — Work item is in Crew backlog
- `crew:{member}` — Assigned to specific agent

**Branch naming convention:**
```
crew/{work-item-id}-{kebab-case-slug}
```
Example: `crew/1234-add-auth-module`

### Microsoft Planner

Planner does not have native Git integration. Crew uses Planner for task tracking and GitHub/ADO for code management.

| Planner Status | Crew Board State |
|----------------|-------------------|
| Not Started | `untriaged` |
| In Progress, no PR | `inProgress` |
| In Progress, PR opened | `needsReview` |
| Completed | `done` |

**Planner→Git workflow:**
1. Task created in Planner bucket
2. Agent reads task from Planner
3. Agent creates branch in GitHub/ADO repo
4. Agent opens PR referencing Planner task ID in description
5. Agent marks task as "Completed" when PR merges

## Issue → Branch → PR → Merge Lifecycle

### 1. Issue Assignment (Triage)

**Trigger:** Ralph detects an untriaged issue or user manually assigns work.

**Actions:**
1. Read `.crew/routing.md` to determine which agent should handle the issue
2. Apply `crew:{member}` label (GitHub) or tag (ADO)
3. Transition issue to `assigned` state
4. Optionally spawn agent immediately if issue is high-priority

**Issue read command:**
```bash
# GitHub
gh issue view {number} --json number,title,body,labels,assignees

# Azure DevOps
az boards work-item show --id {id} --output json
```

### 2. Branch Creation (Start Work)

**Trigger:** Agent accepts issue assignment and begins work.

**Actions:**
1. Ensure working on latest base branch (usually `main` or `dev`)
2. Create feature branch using Crew naming convention
3. Transition issue to `inProgress` state

**Branch creation commands:**

**Standard (single-agent, no parallelism):**
```bash
git checkout main && git pull && git checkout -b crew/{issue-number}-{slug}
```

**Worktree (parallel multi-agent):**
```bash
git worktree add ../worktrees/{issue-number} -b crew/{issue-number}-{slug}
cd ../worktrees/{issue-number}
```

> **Note:** Worktree support is in progress (#525). Current implementation uses standard checkout.

### 3. Implementation & Commit

**Actions:**
1. Agent makes code changes
2. Commits reference the issue number
3. Pushes branch to remote

**Commit message format:**
```
{type}({scope}): {description} (#{issue-number})

{detailed explanation if needed}

{breaking change notice if applicable}

Closes #{issue-number}

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

**Commit types:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `style`, `build`, `ci`

**Push command:**
```bash
git push -u origin crew/{issue-number}-{slug}
```

### 4. PR Creation

**Trigger:** Agent completes implementation and is ready for review.

**Actions:**
1. Open PR from feature branch to base branch
2. Reference issue in PR description
3. Apply labels if needed
4. Transition issue to `needsReview` state

**PR creation commands:**

**GitHub:**
```bash
gh pr create --title "{title}" \
  --body "Closes #{issue-number}\n\n{description}" \
  --head crew/{issue-number}-{slug} \
  --base main
```

**Azure DevOps:**
```bash
az repos pr create --title "{title}" \
  --description "Closes #{work-item-id}\n\n{description}" \
  --source-branch crew/{work-item-id}-{slug} \
  --target-branch main
```

**PR description template:**
```markdown
Closes #{issue-number}

## Summary
{what changed}

## Changes
- {change 1}
- {change 2}

## Testing
{how this was tested}

{If working as a crew member:}
Working as {member} ({role})

{If needs human review:}
⚠️ This task was flagged as "needs review" — please have a crew member review before merging.
```

### 5. PR Review & Updates

**Review states:**
- **Approved** → `readyToMerge`
- **Changes requested** → `changesRequested`
- **CI failure** → `ciFailure`

**When changes are requested:**
1. Agent addresses feedback
2. Commits fixes to the same branch
3. Pushes updates
4. Requests re-review

**Update workflow:**
```bash
# Make changes
# ⚠️ NEVER use `git add .` or `git add -A` — only stage files you intentionally changed
git add -- {specific files you modified}
git commit -m "fix: address review feedback"
git push
```

**Re-request review (GitHub):**
```bash
gh pr ready {pr-number}
```

### 6. PR Merge

**Trigger:** PR is approved and CI passes.

**Merge strategies:**

**GitHub (merge commit):**
```bash
gh pr merge {pr-number} --merge --delete-branch
```

**GitHub (squash):**
```bash
gh pr merge {pr-number} --squash --delete-branch
```

**Azure DevOps:**
```bash
az repos pr update --id {pr-id} --status completed --delete-source-branch true
```

**Post-merge actions:**
1. Issue automatically closes (if "Closes #{number}" is in PR description)
2. Feature branch is deleted
3. Crew board state transitions to `done`
4. Worktree cleanup (if worktree was used — #525)

### 7. Cleanup

**Standard workflow cleanup:**
```bash
git checkout main
git pull
git branch -d crew/{issue-number}-{slug}
```

**Worktree cleanup (future, #525):**
```bash
cd {original-cwd}
git worktree remove ../worktrees/{issue-number}
```

## Spawn Prompt Additions for Issue Work

When spawning an agent to work on an issue, include this context block:

```markdown
## ISSUE CONTEXT

**Issue:** #{number} — {title}  
**Platform:** {GitHub | Azure DevOps | Planner}  
**Repository:** {owner}/{repo}  
**Assigned to:** {member}

**Description:**
{issue body}

**Labels/Tags:**
{labels}

**Acceptance Criteria:**
{criteria if present in issue}

**Branch:** `crew/{issue-number}-{slug}`

**Your task:**
{specific directive to the agent}

**After completing work:**
1. Commit with message referencing issue number
2. Push branch
3. Open PR using:
   ```
   gh pr create --title "{title}" --body "Closes #{number}\n\n{description}" --head crew/{issue-number}-{slug} --base {base-branch}
   ```
4. Report PR URL to coordinator
```

## Agent Comment Signing

Crew agents post through `gh`, which authenticates as the operator. **Every agent
comment is therefore authored by the human's GitHub account.** Author is useless as a
discriminator, and style heuristics ("agents write long comments with `##` headers")
break the moment either party writes atypically.

Sign agent comments instead.

### The marker

Append this as the **last line** of the body of every comment an agent posts to an
issue or a PR:

```
<!-- crew:agent={member} -->
```

- `{member}` is the crew member's roster name, lowercased (`link`, `sparks`, `ralph`).
- It renders as nothing on GitHub, survives comment edits, and is one `grep` away.
- **Anything without the marker is, by definition, a human comment.** That inverse is
  the point: the marker is what makes human replies detectable at all.

Applies to `gh issue comment`, `gh pr comment`, `gh pr review --body`, **replies to
inline PR review threads** (`gh api .../comments`, `add_reply_to_pull_request_comment`),
the equivalent GitHub MCP tools, and any workflow that posts on an agent's behalf. It
does **not** apply to commit messages, PR bodies, or issue bodies — comments only.

The marker is unchanged on review threads, but it does a different job there. On an issue
it makes human comments detectable. On a review thread — where GitHub's `isResolved`
already tracks outstanding-ness — it is what lets Ralph tell "an agent has replied here"
from "nobody has", so an addressed thread stops being re-routed as new work while still
staying open for the reviewer. See `ralph-reference.md` → "Answered-but-unresolved".

### Acknowledging a human reply — the `seen=` field

When an agent comment is a **response to human input on that thread**, add a `seen=`
field carrying the ISO-8601 timestamp of the newest human comment the agent read:

```
<!-- crew:agent=link seen=2026-07-29T03:06:23Z -->
```

`seen=` is the per-issue high-water mark for human comments. Ralph treats every
unmarked comment newer than the highest `seen=` on that issue as unreviewed and keeps
surfacing it. A marked comment **without** `seen=` does not advance the mark — a
status update posted while a human question is still outstanding must not silence
that question.

Acknowledge honestly. `seen=` asserts "an agent read this and responded to it". It is
not a dismissal button.

**`seen=` does not apply to inline review threads.** Those carry `isResolved`, so a
`seen=` field there would be a second high-water mark competing with GitHub's own. Use
the bare `<!-- crew:agent={member} -->` marker on thread replies. `seen=` still applies
to top-level `COMMENTED` review bodies and PR conversation comments, which have no
resolution state of their own.

### Resolving review threads

**Agents reply to review threads. Agents do not resolve them.** Resolution stays with
the reviewer.

The tempting argument for the other choice is real: resolving is the natural
acknowledgement, and it keeps the queue clean. But compare how the two options fail.

- An agent resolves a thread it only partly addressed → the feedback disappears from
  every view the reviewer uses. The failure is **silent**, and nothing surfaces it later.
- An agent leaves an addressed thread open → the thread stays visible until someone
  confirms. The failure is **noisy**, and the reviewer sees it immediately.

For a mechanism whose entire purpose is that feedback stops sitting unread, a
silent-drop failure mode defeats the thing being built. A noisy one merely annoys.

That asymmetry only decides the question because the queue-cleanliness argument has
another answer: Ralph demotes a thread whose newest comment is a signed agent reply to
`awaiting confirmation` rather than re-reporting it as new work. The queue stays clean
without the agent taking the reviewer's button. And if the reviewer replies again, the
thread returns to the queue on its own.

There is a second reason, smaller but not nothing: resolving another person's review
thread is theirs to do by convention on GitHub. An agent doing it at scale reads as the
crew closing its own homework.

**Exception:** if the operator explicitly asks an agent to resolve threads — in the
session, not inferred from a PR comment — that is a direct instruction and it holds.

### Anti-patterns

- ❌ Omitting the marker "just this once" — one unmarked agent comment is a false human alert.
- ❌ Putting the marker anywhere but the last line.
- ❌ Setting `seen=` to the current time — the value is the timestamp of the comment
  being acknowledged, not the time of acknowledgement.
- ❌ Setting `seen=` on a comment that did not actually address the human input.
- ❌ Resolving a review thread to clear it from Ralph's queue.
- ❌ Silently skipping a review thread the agent disagrees with — reply and say so.
- ❌ Back-filling markers onto historical comments — use an adoption cutoff instead
  (see `ralph-reference.md` → "Adoption cutoff").

## Ralph's Role in Issue Lifecycle

Ralph (the work monitor) continuously checks issue and PR state:

1. **Triage:** Detects untriaged issues, assigns `crew:{member}` labels
2. **Spawn:** Launches agents for assigned issues
3. **Monitor:** Tracks PR state transitions (needsReview → changesRequested → readyToMerge)
4. **Merge:** Automatically merges approved PRs
5. **Cleanup:** Marks issues as done when PRs merge

**Ralph's work-check cycle:**
```
Scan → Categorize → Dispatch → Watch → Report → Loop
```

See `.crew/templates/ralph-reference.md` for Ralph's full lifecycle.

## PR Review Handling

### Automated Approval (CI-only projects)

If the project has no human reviewers configured:
1. PR opens
2. CI runs
3. If CI passes, Ralph auto-merges
4. Issue closes

### Human Review Required

If the project requires human approval:
1. PR opens
2. Human reviewer is notified (GitHub/ADO notifications)
3. Reviewer approves or requests changes
4. If approved + CI passes, Ralph merges
5. If changes requested, agent addresses feedback

### Crew Member Review

If the issue was assigned to a crew member and they authored the PR:
1. Another crew member reviews (conflict of interest avoidance)
2. Original author is locked out from re-working rejected code (rejection lockout)
3. Reviewer can approve edits or reject outright

## Common Issue Lifecycle Patterns

### Pattern 1: Quick Fix (Single Agent, No Review)
```
Issue created → Assigned to agent → Branch created → Code fixed → 
PR opened → CI passes → Auto-merged → Issue closed
```

### Pattern 2: Feature Development (Human Review)
```
Issue created → Assigned to agent → Branch created → Feature implemented → 
PR opened → Human reviews → Changes requested → Agent fixes → 
Re-reviewed → Approved → Merged → Issue closed
```

### Pattern 3: Research-Then-Implement
```
Issue created → Labeled `go:needs-research` → Research agent spawned → 
Research documented → Research PR merged → Implementation issue created → 
Implementation agent spawned → Feature built → PR merged
```

### Pattern 4: Parallel Multi-Agent (Future, #525)
```
Epic issue created → Decomposed into sub-issues → Each sub-issue assigned → 
Multiple agents work in parallel worktrees → PRs opened concurrently → 
All PRs reviewed → All PRs merged → Epic closed
```

## Anti-Patterns

- ❌ Creating branches without linking to an issue
- ❌ Committing without issue reference in message
- ❌ Opening PRs without "Closes #{number}" in description
- ❌ Merging PRs before CI passes
- ❌ Leaving feature branches undeleted after merge
- ❌ Using `checkout -b` when parallel agents are active (causes working directory conflicts)
- ❌ Manually transitioning issue states — let the platform and Crew automation handle it
- ❌ Skipping the branch naming convention — breaks Ralph's tracking logic
- ❌ Posting an agent comment without the `<!-- crew:agent={member} -->` marker — it will
  be misread as a human reply and re-routed for review

## Migration Notes

**v0.8.x → v0.9.x (Worktree Support):**
- `checkout -b` → `git worktree add` for parallel agents
- Worktree cleanup added to post-merge flow
- `TEAM_ROOT` passing to agents to support worktree-aware state resolution

This template will be updated as worktree lifecycle support lands in #525.
