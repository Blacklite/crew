---
title: MCP Frontmatter — crew init --mcp-frontmatter
description: Write MCP server configuration directly into the Crew agent file's frontmatter instead of .copilot/mcp-config.json, for harnesses that read agent-level MCP config.
---

# MCP Frontmatter — `crew init --mcp-frontmatter`

> ⚠️ **Experimental** — Crew is alpha software. APIs, commands, and behavior may change between releases.

**Try this when your agent harness reads frontmatter-level MCP config:**
```bash
crew init --mcp-frontmatter
```

By default, `crew init` writes MCP server configuration to two places:
- `.copilot/mcp-config.json` (workspace-level for Copilot CLI)
- `~/.copilot/mcp-config.json` (user-level, ensures `copilot -p` non-interactive mode also sees the MCP — see [#1247](https://github.com/Blacklite/crew/issues/1247))

The `--mcp-frontmatter` flag changes this: instead of writing JSON config files, MCP server declarations go directly into the YAML frontmatter of `.github/agents/crew.agent.md` (or `.github/agents/crew.md` if you've exported with [Coordinator-as-Agent Export](/crew/docs/features/coordinator-as-agent-export/)).

---

## When to use it

| Your setup | Use `--mcp-frontmatter`? |
|------------|-------------------------|
| Standard Copilot CLI users | ❌ No — default config files work fine |
| Custom agent harness that reads MCP from agent frontmatter | ✅ Yes |
| Building or distributing a Crew agent as a self-contained file | ✅ Yes — keeps MCP config inline with the agent |
| Some VS Code extensions / custom IDE plugins that prefer per-agent MCP declarations | ✅ Yes |

If you're not sure, you don't need this flag. It's specifically for environments where the agent file itself is the source of truth for MCP configuration.

---

## What the output looks like

Without `--mcp-frontmatter` (default), the agent file frontmatter is:

```yaml
---
name: crew
description: Crew coordinator
model: claude-opus-4.5
tools: ["*"]
---
```

And `.copilot/mcp-config.json` separately contains:

```json
{
  "mcpServers": {
    "crew_state": {
      "command": "npx",
      "args": ["-y", "@blacklite/crew-cli@latest", "state-mcp"],
      "tools": ["*"]
    }
  }
}
```

With `--mcp-frontmatter`, the MCP server moves into the frontmatter:

```yaml
---
name: crew
description: Crew coordinator
model: claude-opus-4.5
tools: ["*"]
mcpServers:
  crew_state:
    command: npx
    args: ["-y", "@blacklite/crew-cli@latest", "state-mcp"]
    tools: ["*"]
---
```

And the standalone `.copilot/mcp-config.json` is not written (or contains only non-crew servers).

---

## Effect on `crew upgrade`

`crew upgrade` detects which mode the project is using (looks for the `mcpServers` key in agent frontmatter vs. presence of `.copilot/mcp-config.json`) and preserves the choice. You don't need to re-pass `--mcp-frontmatter` on every upgrade.

To switch modes after init, re-run `crew init --mcp-frontmatter` (or run `crew init` without the flag to switch back). The previous MCP config is migrated.

---

## Limitations

- **Less robust for `copilot -p` non-interactive mode.** Standard mode pins MCP at user level too, which solves the workspace-only loading gap (PR [#1251](https://github.com/Blacklite/crew/pull/1251)). Frontmatter mode skips that user-level write — so `copilot -p` may not see the crew MCP unless the harness reads frontmatter directly.
- **No second-layer fallback.** If the harness that reads frontmatter MCP fails to load it correctly, there's no `.copilot/mcp-config.json` to fall back to. Test in your specific harness before adopting.
- **Schema is harness-specific.** The frontmatter `mcpServers` key follows the Copilot CLI convention, but other harnesses may expect different key names (`mcp_servers`, `mcp.servers`, etc.). Check your harness's spec.

---

## See also

- [MCP Integration](/crew/docs/features/mcp/) — the broader MCP system
- [Coordinator-as-Agent Export](/crew/docs/features/coordinator-as-agent-export/) — bundling MCP config into a self-contained agent file
