---
"@blacklite/crew-sdk": patch
"@blacklite/crew-cli": patch
---

fix: conditional .gitignore entries for two-layer/orphan state backends

When the state backend is `two-layer` or `orphan`, `crew init` and `crew upgrade` now add `.crew/decisions.md` and `.crew/agents/*/history.md` to `.gitignore` (delimited by `# Crew: state owned by crew-state branch` marker comments). When the backend is switched back to `local`, the marker block is removed so those files become committable again.

Defense-in-depth complement to the existing pre-commit hook — prevents `git add .`, IDE "stage all", and `git add -A` from silently staging two-layer state into the working tree.
