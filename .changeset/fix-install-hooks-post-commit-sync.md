---
"@blacklite/crew-cli": patch
---

fix: three bugs in `crew install-hooks` — post-commit state sync, pre-commit guard scope, and `--force` reinstall

**post-commit made `crew sync` a silent no-op.** The generated hook exported `CREW_SYNC_ACTIVE=1` before invoking the CLI, but `runSync()` in `sync.ts` early-returns whenever that variable is already set — it owns the guard itself. The child process therefore inherited its own kill switch and exited without doing anything, so crew-state never advanced on commit for any repo on a `two-layer` / `orphan` backend. Because every sync hook ends in `|| true`, the failure produced no output. The hook now only *reads* `CREW_SYNC_ACTIVE` as a re-entry guard and never sets it. The four inline-git sync hooks (`pre-push`, `post-merge`, `post-rewrite`, `post-checkout`) legitimately export it to keep their own git operations from re-triggering hooks and are unchanged.

**pre-commit blocked `.crew/casting/`.** The staged-path guard also matched `casting/` and `routing/`. Casting is authoritative team identity — `crew init` writes a `.gitignore` stating it MUST be committed, and `crew_state_write` rejects casting keys as non-mutable — so blocking it contradicted the rest of the product and broke commits that touched the agent registry. `routing/` matched nothing at all (the file is `routing.md`). The guard is now scoped to `decisions.md` and `agents/*/history.md`, matching the crew-state `.gitignore` block in `gitignore-state.ts`.

**`--force` appended a duplicate hook section.** The force branch built a `cleaned` string with a no-op `filter(() => true)`, discarded it, and fell through to the append path, so each forced reinstall added another crew block below the existing one. Hook sections are now delimited by `# --- crew-sync-hook ---` / `# --- /crew-sync-hook ---` and genuinely replaced. Sections written by earlier versions have no end marker; because the crew block was always appended last, an unterminated section is stripped to end-of-file, so upgrading users' chained hooks keep their own content intact.
