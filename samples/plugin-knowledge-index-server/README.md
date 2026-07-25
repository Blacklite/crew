# Index Server Knowledge Plugin Example

This is a local Crew plugin example for integrating with the real Index Server project: <https://github.com/jagilber-org/index-server>.

Index Server is a governed MCP knowledge base for AI agents. It indexes instructions and shared knowledge with search, CRUD, validation, versioning, audit trails, approval workflows, and cross-repo knowledge promotion. It is not a Crew memory provider, but it is adjacent to memory because agents can use it to persist and retrieve validated knowledge across sessions and repositories.

It demonstrates:

- declaring Crew `knowledge` and `instructions` components
- recording upstream package metadata for npm package `@jagilber-org/index-server`
- documenting the optional `index-server` MCP server without starting it
- keeping the Crew/MCP boundary intact

## Try it

```bash
crew plugin validate .
crew plugin dry-run .
crew plugin install .
crew plugin enable index-server-knowledge
crew plugin switch knowledge index-server-knowledge
crew plugin list --json
```

## Real Index Server setup

Install and configure Index Server separately from the Crew plugin lifecycle:

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

## Important

This example is declarative only. Crew does not install `@jagilber-org/index-server`, run `index-server`, start MCP, mutate MCP client config, or execute Index Server code during plugin install.
