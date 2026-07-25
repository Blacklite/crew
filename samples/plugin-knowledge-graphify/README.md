# Graphify Knowledge Graph Plugin Example

This is a local Crew plugin example for integrating with the real Graphify project: <https://github.com/safishamsi/graphify>.

Graphify is a code and documentation knowledge graph tool. It is not modeled here as a Crew memory provider or as a Copilot plugin.

It demonstrates:

- declaring the Crew `knowledge` component
- recording upstream package metadata for PyPI package `graphifyy`
- installing Graphify usage guidance under `.crew/knowledge/`
- keeping the Crew/Copilot boundary intact

## Try it

```bash
crew plugin validate .
crew plugin dry-run .
crew plugin install .
crew plugin enable graphify-knowledge
crew plugin switch knowledge graphify-knowledge
crew plugin list --json
```

## Real Graphify setup

Install and configure Graphify separately from the Crew plugin lifecycle:

```bash
uv tool install graphifyy
graphify install --platform copilot
graphify query "How does this repository fit together?"
```

Graphify produces artifacts such as `graphify-out/graph.html`, `graphify-out/graph.json`, and `graphify-out/GRAPH_REPORT.md`.

## Important

This example is declarative only. Crew does not install `graphifyy`, run `graphify`, install Copilot skills, or execute Graphify code during plugin install.
