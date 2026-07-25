---
"@blacklite/crew-sdk": minor
"@blacklite/crew-cli": patch
---

`crew cast` now discovers project agents from the external state dir when state is externalized. `LocalAgentSource` accepts an optional explicit agents directory that overrides the `.crew/agents` probing, since externalized state keeps agents at `<externalStateDir>/agents` with no `.crew` nesting.
