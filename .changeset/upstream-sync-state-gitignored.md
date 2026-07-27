---
"@blacklite/crew-cli": patch
"@blacklite/crew-sdk": patch
---

Stop `crew upstream sync` from dirtying the tracked `.crew/upstream.json`.

The sync timestamp was written back into `upstream.json`, which is committed. Because `crew upstream sync` is invoked from the `post-checkout` and `post-merge` git hooks installed by `crew init`, every pull and every branch switch rewrote the file and left the working tree permanently dirty.

Timestamps now live in `.crew/_upstream_repos/.sync-state.json`, beside the cached clones in a directory crew already gitignores. `upstream.json` holds only declared configuration and is no longer rewritten by `sync`.

Existing repos are migrated automatically: the next `crew upstream` command of any kind moves the legacy `last_synced` values out and rewrites `upstream.json` once. `UpstreamSource.last_synced` is now optional and deprecated; the new `UpstreamSyncState` type is exported from the SDK.
