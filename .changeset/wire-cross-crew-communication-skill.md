---
"@blacklite/crew-sdk": minor
"@blacklite/crew-cli": minor
---

Add **cross-crew-communication** as a built-in skill (companion to cross-crew)

The merged registry work (#1291) added `crew registry add/list/remove` and the `cross-crew/SKILL.md` for discovery. But discovery is only half the story — once a peer crew is known, agents need to know **how** to actually exchange information with it (sync CLI sessions, async git-based requests, issue-based delegation).

This change ports `cross-crew-communication` from [tamirdresher/crew-skills](https://github.com/tamirdresher/crew-skills/tree/main/plugins/cross-crew-communication) into Crew's bundled skills so a fresh `crew init` produces a coordinator that already knows the four communication patterns. The plugin was validated against two production crew instances (one GitHub-hosted, one Azure DevOps-hosted) before being ported.

**What this skill teaches**

| Pattern | When to use |
|---|---|
| Pattern 0: Synchronous CLI session | Quick knowledge queries — spawn `copilot -C <target-repo>` with the prompt text via `-p (Get-Content $promptFile -Raw)` |
| Pattern 1: Read-only metadata scan | "What's the architecture of crew X?" — read their `team.md` / `decisions.md` directly |
| Pattern 2: Async git-based request/response | Long-running work, PR reviews, multi-cycle tasks. Request files in `.crew/cross-crew/requests/`, response files in `.crew/cross-crew/responses/`. |
| Pattern 3: Issue-based delegation | GitHub-hosted repos — `gh issue create` with `crew:cross-crew` label as the message bus |

Plus: decision tree for choosing the right pattern, anti-patterns, request/response YAML format, and validation status.

**Changes**

- New `.crew/skills/cross-crew-communication/SKILL.md` (canonical source). `sync-skill-templates.mjs` (prebuild) propagates to both `packages/crew-cli/templates/skills/` and `packages/crew-sdk/templates/skills/`.
- `MANIFEST_SKILL_NAMES` in `packages/crew-sdk/src/config/init.ts` grows by 1 entry: `cross-crew-communication`. Now 11 entries.
- `cross-crew/SKILL.md` (the registry-aware skill from #1291) gets a one-paragraph "Companion skill" note at the top pointing to `cross-crew-communication` for protocol details. The two skills are designed to be used together: `cross-crew` answers "who?" (discovery via registry), `cross-crew-communication` answers "how?" (the 4 communication patterns).

**Genericization**

The original plugin documented validation against specific internal Microsoft repositories. Examples in this version use generic names (`platform-crew`, `research-crew`, etc.) so they're meaningful to all upstream users. The protocol mechanics are unchanged. The frontmatter `source:` attributes the port to `tamirdresher/crew-skills`.

**Test coverage**

New `test/init.test.ts > should install cross-crew-communication skill (companion to cross-crew — #5)`: asserts the SKILL.md ends up at `.copilot/skills/cross-crew-communication/SKILL.md` after `initCrew()` and that the content contains the expected pattern names. 26/26 init tests pass; `npm run lint` clean.

**Composition with #1291**

```bash
# 1. Init produces a crew that already knows both skills
crew init

# 2. Register a peer crew (#1291)
crew registry add ../peer-crew-repo

# 3. Ask the coordinator: "what are the team members of the peer crew?"
#    → The coordinator now has cross-crew-communication's Pattern 1 in scope
#      and knows to read team.md from the registered peer
```

**Note on overlap with #1292**

PR #1292 (skills bundling fix) adds `crew-commands`, `crew-version-check`, `tiered-memory`, `iterative-retrieval`, `reflect`, and `cross-crew` to `MANIFEST_SKILL_NAMES`. That PR and this one both modify the same array but add disjoint entries. When both merge, the manifest grows to 15 entries (10 base + 4 from #1292 + 1 from here). Either PR can land first.
