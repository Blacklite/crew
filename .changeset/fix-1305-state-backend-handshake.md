---
"@blacklite/crew-cli": minor
"@blacklite/crew-sdk": minor
---

Fix #1305: coordinator must probe for `crew_state` / `memory.*` tools before writing state, and hard-refuse writes when the bridge isn't reachable on non-local backends

## Symptom

A coordinator session against a Crew with `stateBackend: "two-layer"` wrote `.crew/decisions.md` + four `.crew/agents/{name}/history.md` files + a `.crew/decisions/inbox/copilot-directive-…md` via raw `create`/`edit` tools — never calling any `crew_state_*` or `memory.*` tool. The pre-commit hook caught the contract violation; the agent treated it as a "git problem" instead of the symptom it was.

## Root cause (two failure modes stacked)

**Mechanical (Copilot CLI):** Copilot CLI loads MCP server tools lazily — they're registered (via `.mcp.json`) but not always advertised in the model's initial function list. Models have to use `tool_search_tool_regex` to find them or guess they exist. The `crew_state` MCP server is correctly registered with `tools: ["*"]` and responds to `initialize`/`tools/list` over stdio — but the model's tool block at session start may not include them. This is a Copilot CLI architectural choice (lazy discovery vs. preload), not something Crew can fix server-side.

**Behavioral (crew.agent.md):** The pre-1305 prompt said *"When memory tools are available, use them before writing durable memory by hand"* and *"If memory tools are not available, fall back to crew_decide or crew_state_write"*. Models read `"available"` as `"listed in my tool prompt"` instead of `"after probing to find out"`. There was no hard refusal clause for the case where the agent is about to violate the state-backend contract.

## Fix

Two changes to `.crew-templates/crew.agent.md` (synced to all 4 mirror targets):

### 1. New "State-backend handshake" section (MANDATORY, runs once per session)

Inserted right after the `stateBackend` resolution at L131. Steps:

1. If `STATE_BACKEND ∈ {"local", "worktree"}`: file ops on `.crew/` are valid; skip the probe.
2. Otherwise: probe for `crew_state_health` via `tool_search_tool_regex` (or equivalent tool-discovery mechanism). On success, call `crew_state_health` once to confirm the bridge answers.
3. **If the probe fails**: HALT before any state write. Output a precise error to the user (verbatim text in the template): *"Crew's runtime state bridge is missing for backend `{STATE_BACKEND}`. The `crew_state` MCP server in `.mcp.json` is not reachable in this Copilot session. Restart Copilot CLI so `.mcp.json` is loaded, or change `stateBackend` to `local` in `.crew/config.json`."*

### 2. Replaced soft "if not available" language with a HARD RULE in `### Memory Governance Tools`

Lists the runtime-owned paths that are FORBIDDEN to write via `create`/`edit`/`write_file` on non-local backends when the bridge isn't reachable:

- `.crew/decisions.md`
- `.crew/decisions/inbox/**`
- `.crew/agents/*/history.md`
- `.crew/casting/*.json`
- `.crew/identity/*.md`
- `.crew/memory/**`
- `.crew/orchestration-log/**`
- `.crew/log/**`
- `.crew/rai/audit-trail.md`
- `.crew/fact-checker/audit-trail.md`

Clarified the local-backend carve-out so `STATE_BACKEND ∈ {"local", "worktree"}` users still freely use `create`/`edit`/`write_file` on `.crew/`.

Also clarified that `memory.*` and `crew_state_*` share the same MCP server (they're aliases in the same registry — see `packages/crew-cli/src/cli/commands/state-mcp.ts`) so models stop treating them as separate availability checks.

## Tests

New `test/state-backend-handshake.test.ts` runs against all 4 template mirror targets and asserts (20 tests = 5 assertions × 4 files):

- Mandatory handshake section exists with "every session" + "before any state mutation" timing
- Probe step exists with `crew_state_health` + tool-discovery mechanism
- HALT step exists with restart-CLI + change-stateBackend remediation
- HARD RULE exists listing the forbidden paths + `create`/`edit`/`write_file` tools by name
- Local/worktree carve-out preserved

20/20 pass; `npm run lint` clean.

## What's NOT in scope (filed/tracked separately)

**Server-side fix (auto-preload MCP tools):** The mechanical root cause is a Copilot CLI feature — preload MCP server tools into the model's function list at session start instead of behind lazy discovery. Out of Crew's control. If maintainers agree it's worth pursuing, file as a feature request against `github/copilot-cli`. With this PR's prompt-level enforcement in place, the server-side fix becomes a nice-to-have rather than load-bearing.

**Skill reinforcement (init-mode, agent-conduct):** Could repeat the rules in `.crew/skills/init-mode/SKILL.md` and `.crew/skills/agent-conduct/SKILL.md` as defense-in-depth for users who skip `crew upgrade`. Worth a small follow-up PR; not blocking.

Closes #1305
