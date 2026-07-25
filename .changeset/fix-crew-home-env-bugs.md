---
"@blacklite/crew-sdk": patch
"@blacklite/crew-cli": patch
---

fix: respect CREW_HOME in capabilities.ts and comms-teams.ts, implement CREW_PERSONAL_DIR env var, fix Windows shell flag in loop preflight, link personal crew during init

- capabilities.ts: use `resolveCrewHome()` instead of hardcoded `~/.crew/` for machine-capabilities.json (#1280)
- comms-teams.ts: use `resolveCrewHome()` instead of hardcoded `~/.crew/` for Teams OAuth token storage (#1279)
- resolution.ts: implement `CREW_PERSONAL_DIR` env var override in `resolvePersonalCrewDir()` (#1278)
- loop.ts: add `shell: process.platform === 'win32'` to `checkCopilotCli()` execFile call (#1372)
- init.ts: set `teamRoot` in config.json to personal crew directory when one exists (#1010, #984)
