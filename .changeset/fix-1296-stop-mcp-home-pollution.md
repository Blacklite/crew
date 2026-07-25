---
"@blacklite/crew-cli": patch
---

Fix #1296: stop writing `crew_state_<hash>` to `~/.copilot/mcp-config.json` on every `crew init` / `crew upgrade`

`crew init` (line 408 of `packages/crew-cli/src/cli/core/init.ts`) and `crew upgrade` (line 738 of `upgrade.ts`) unconditionally called `ensureCrewStateMcpInUserConfig`, which wrote a `crew_state_<hash>` entry to `~/.copilot/mcp-config.json` keyed by a stable hash of the project path. Every new `crew init` accumulated another entry in HOME with no garbage collection.

This contradicted the explicit iter-8 design intent documented at `packages/crew-cli/src/cli/core/mcp-root.ts:1-27`:

> *iter-7: wrote `crew_state_<hash>` into the user's HOME `~/.copilot/mcp-config.json`. That polluted HOME with one entry per Crew project and required a stale-entry GC that we never built. It also touched a file outside the project, which is surprising for `crew init` / `crew upgrade`.*
>
> *iter-8 flips it back inside the project: we write `crew_state` to a repo-root `.mcp.json` ... **No HOME modifications.***

The repo-root `.mcp.json` writes (init.ts:403 / upgrade.ts:728) already cover all documented Copilot CLI launch modes:

- ``copilot`` from the project root → walks up from cwd to git root, auto-loads `.mcp.json`
- ``copilot -p`` from the project root → same `.mcp.json` is found

For ``copilot -p`` invocations launched from **outside** the project root, the right pattern is `--additional-mcp-config @.mcp.json` (already documented as the recommended pattern at init.ts:494).

**Changes**

- Removed the unconditional `ensureCrewStateMcpInUserConfig` call from `init.ts:408` and `upgrade.ts:738`. Replaced both with comments explaining the iter-8 design and pointing at #1296.
- Removed the now-unused import from both files.
- The function definition itself (`mcp-root.ts:178-228`) is **kept** — a future `crew doctor --mcp-prune` cleanup helper may want to inspect HOME for orphan entries. It's just no longer called from the init/upgrade auto-flow.

**Tests**

New regression test in `test/cli/init.test.ts`:

> `should NOT write any crew_state entries to ~/.copilot/mcp-config.json (regression: #1296)`

Isolates the developer's real HOME by setting `USERPROFILE`/`HOME` to a temp dir before init, then asserts no `crew_state*` keys appear under that temp HOME after init. The test passes only because the unconditional write is gone — previously this assertion would have failed.

All 40 existing init tests still pass; `npm run lint` clean.

**Cleanup**

A follow-up could add `crew doctor --mcp-prune` to walk `~/.copilot/mcp-config.json`, find `crew_state_<hash>` entries whose target directory no longer exists, and remove them. Out of scope for this fix.
