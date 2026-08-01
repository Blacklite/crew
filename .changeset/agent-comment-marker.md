---
"@blacklite/crew-cli": minor
"@blacklite/crew-sdk": minor
---

Agent comment signing, and human-comment detection in Ralph's work-check cycle.

Crew agents post through `gh` using the operator's credentials, so agent comments and human comments carry the same `author.login`. Author cannot distinguish them and style heuristics are fragile, which meant a human reply on an issue was the one work signal Ralph could not see — an answer could sit in a thread indefinitely while the crew kept acting on advice that answer had overturned.

- **Marker convention (`crew.agent.md`, `issue-lifecycle.md`).** Every agent-posted issue or PR comment ends with `<!-- crew:agent={member} -->`. Anything unmarked is a human comment by definition. Mandatory for every member and every posting path (`gh issue comment`, `gh pr comment`, `gh pr review --body`, GitHub MCP equivalents); not applied to commit messages, issue bodies or PR bodies.
- **`seen=` acknowledgement field.** A reply to human input extends the marker with the ISO-8601 timestamp of the newest human comment read (`<!-- crew:agent=link seen=2026-07-29T03:06:23Z -->`). This is the durable, per-issue high-water mark, and it lives in the thread rather than on disk — agents run in worktrees, in CI and on multiple machines, where a local state file is wrong. A marked comment *without* `seen=` does not advance the mark, so a status update cannot silence an outstanding question.
- **Ralph's scan (`ralph-reference.md`).** New "Human Comment Detection" section: a single GraphQL query for the whole tracker (replacing the O(open issues) `gh issue view` loop), the two-level high-water mark (session set for within-session dedupe, `seen=` for across sessions), and a `commentWatch.since` adoption cutoff in `.crew/config.json` so pre-convention comments are not reported as a back-catalogue of false human alerts. Human comments sort first in the priority order, because a human reply can supersede work already in flight; the routed reviewer must state explicitly whether it does.
