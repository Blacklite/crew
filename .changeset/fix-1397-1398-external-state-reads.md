---
"@blacklite/crew-cli": patch
---

`crew copilot` and `crew rc` now follow externalized state: roster reads and writes go to the external state dir when `.crew/config.json` has the `stateLocation: external` marker, instead of always using the local `.crew/team.md`.
