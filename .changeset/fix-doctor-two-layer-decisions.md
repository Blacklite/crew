---
"@blacklite/crew-cli": patch
---

Fix `crew doctor` so `decisions.md` passes validation when two-layer or orphan state backends store it on the `crew-state` branch instead of in the working tree.
