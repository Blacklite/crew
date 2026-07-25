# Graphify Knowledge Graph Integration

Graphify is the `safishamsi/graphify` knowledge graph tool for codebases and documentation. The published Python package is `graphifyy`, and the CLI command is `graphify`.

## What this plugin contributes

- A `knowledge` role declaration for teams that use Graphify alongside Crew.
- Static guidance describing where Graphify fits in the Crew workflow.
- Upstream metadata that points to the real repository and PyPI package.

## Real setup

Install and configure Graphify outside the Crew plugin lifecycle:

```bash
uv tool install graphifyy
graphify install --platform copilot
graphify query "What are the major systems in this repo?"
graphify path "PluginManifest" "PluginState"
```

Useful Graphify outputs include:

| Artifact | Purpose |
| --- | --- |
| `graphify-out/graph.html` | Interactive graph visualization |
| `graphify-out/graph.json` | Machine-readable graph data |
| `graphify-out/GRAPH_REPORT.md` | Markdown analysis report |

## Boundary

This sample does not execute Graphify code. It is a declarative Crew plugin that installs static knowledge guidance under `.crew/knowledge/` and records external metadata only.

Graphify's Copilot support is a separately installed skill/integration. Crew does not install `graphifyy`, run `graphify`, install Copilot skills, or treat Graphify as a memory provider.
