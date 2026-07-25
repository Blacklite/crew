# MemPalace Memory Plugin Example

This is a local Crew plugin example for a memory-palace-style provider.

It demonstrates:

- declaring the Crew `memory` component
- installing memory provider guidance under `.crew/memory/`
- recording upstream package metadata for PyPI package `mempalace`
- documenting the optional `mempalace-mcp` server without starting it
- keeping the Crew/Copilot boundary intact

## Try it

```bash
crew plugin validate .
crew plugin dry-run .
crew plugin install .
crew plugin enable mempalace-memory
crew plugin switch memory mempalace-memory
crew plugin list --json
```

## Important

This example is declarative only. Crew does not install `mempalace`, run `mempalace`, start `mempalace-mcp`, install assistant hooks, or execute memory provider code during plugin install.

Install and configure MemPalace separately:

```bash
pip install mempalace
mempalace init ~/projects/myapp
mempalace mine ~/projects/myapp
mempalace search "important design decision"
mempalace wake-up
```
