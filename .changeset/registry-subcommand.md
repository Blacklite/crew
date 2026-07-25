---
"@blacklite/crew-cli": minor
"@blacklite/crew-sdk": minor
---

Add `crew registry add/list/remove` for discovery-only peer crews (no inheritance)

The existing `crew upstream add` triggers inheritance (skills/decisions/wisdom flow from the other crew into yours at session start). For peer relationships where you want discovery and delegation but NOT inheritance, you previously had to hand-edit `.crew/crew-registry.json` — the `crew discover` error message even told you to "create a crew-registry.json" manually.

This adds a real CLI surface for the registry, symmetric to `crew upstream`:

- `crew registry add <name> <path>` — registers a peer, validates its manifest, refuses on duplicate name
- `crew registry list` — shows all registered peers
- `crew registry remove <name>` — removes by name

It also fixes a subtle path-semantics confusion: `readManifest()` now accepts BOTH `repo-root` and `repo-root/.crew` paths (the docs/SKILL showed the `.crew`-suffixed form, but the code previously joined `.crew/manifest.json` onto whatever you gave it, so the suffixed form silently failed). The SDK helpers (`readCrewRegistry`, `writeCrewRegistry`, `addRegistryEntry`, `removeRegistryEntry`) are exported for tooling.

The `cross-crew` SKILL and the `crew discover` empty-state hint are updated to reflect the new command.

Closes #1290.
