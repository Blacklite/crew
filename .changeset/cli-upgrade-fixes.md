---
"@blacklite/crew-cli": patch
"@blacklite/crew-sdk": patch
---

Fix CLI and upgrade bugs:
- `crew externalize` and `crew internalize` now appear in `crew --help` output (#1050)
- `crew build` writes files to the externalized state directory when applicable (#1048)
- `crew new agent` correctly adds agent definitions to `crew.config.ts` (#1047)
- `crew upgrade` backs up customized `crew.agent.md` before overwriting; supports `--dry-run` (#1052)
- Explicit `@agent` mentions bypass direct-response handler and route to named agent (#1029)
- `state-mcp` server uses lazy initialization to avoid blocking multi-MCP startup (#1353)
