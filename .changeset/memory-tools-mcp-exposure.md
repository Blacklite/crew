---
"@blacklite/crew-cli": patch
---

Expose memory.* tools (classify, write, search, promote, delete, audit) through the crew_state MCP server so agents can discover and call them. Also pin crew_state to user-level ~/.copilot/mcp-config.json for external `copilot -p` mode compatibility.
