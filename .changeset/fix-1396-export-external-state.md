---
"@blacklite/crew-cli": patch
---

Fix #1396: `crew export` now resolves externalized state. After `crew externalize`, export read the local `.crew/` directory directly, so it either failed with a misleading "No crew found — run init first" or silently exported stale/scaffolded local files instead of the real team state in the external directory. Export now routes through the same `effectiveCrewDir()` resolution used by `build`, `loop`, `plugin`, `watch`, and `doctor`, reading `team.md`, `decisions.md`, `routing.md`, `casting/`, `agents/`, and `.crew`-local skills from the effective state directory.
