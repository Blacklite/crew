---
"@blacklite/crew-cli": minor
---

Add @copilot team member prompt during `crew init`

During interactive `crew init`, users are now prompted to add @copilot
as an autonomous team member. Answering yes adds the Coding Agent section
to team.md and copies copilot-instructions.md into the project. Non-interactive
mode skips silently with a hint to run `crew copilot enable` later.
