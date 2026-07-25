# Index Server Knowledge Integration

Index Server is the `jagilber-org/index-server` MCP instruction indexing server. Its package is `@jagilber-org/index-server`, its command is `index-server`, and its MCP server name is `io.github.jagilber-org/index-server`.

## How it relates to Crew memory

Index Server is not a memory provider. It is a governed instruction and knowledge catalog that agents can query and update through MCP.

Use it alongside memory plugins when:

| Need | Better fit |
| --- | --- |
| Durable validated team instructions | Index Server |
| Cross-repo standards and reusable knowledge | Index Server |
| Spatial/session memory with palace metaphors | MemPalace |
| Code and docs relationship graph | Graphify |
| Crew role activation and installed guidance | Crew plugin lifecycle |

## Real setup

Install and configure Index Server outside the Crew plugin lifecycle:

```bash
npm install -g @jagilber-org/index-server
index-server --setup
index-server --dashboard
```

Copilot CLI MCP configuration can use:

```json
{
  "mcpServers": {
    "index-server": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@jagilber-org/index-server@latest", "--dashboard"],
      "env": {
        "INDEX_SERVER_DIR": "C:/mcp/index-data/instructions",
        "INDEX_SERVER_LOG_LEVEL": "info"
      },
      "tools": ["*"]
    }
  }
}
```

## Boundary

This sample does not execute Index Server code. It is a declarative Crew plugin that installs static knowledge guidance under `.crew/knowledge/` and records external MCP metadata only.

Crew does not install npm packages, run `index-server`, start dashboards, update MCP client config, or call Index Server tools during plugin install.
