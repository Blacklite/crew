# Plugin Marketplace Guide

> ⚠️ **Experimental** — Crew is alpha software. APIs, commands, and behavior may change between releases.

Plugins package reusable Crew capabilities: agents, knowledge packs, workflows, ceremonies, memory providers, routing guidance, decisions, hook metadata, adapter metadata, typed provider contracts, and generated knowledge artifacts.

The everyday flow is simple:

```bash
crew plugin install ./my-plugin
crew plugin enable my-plugin
crew plugin refresh my-plugin
```

After that, spawned agents can receive the plugin's enabled context. For a knowledge plugin such as Graphify, refresh can generate approved artifacts under `.crew/knowledge/graphify/` so agents have a relationship map across code, docs, and decisions.

The MVP is declarative-first with a narrow governed runtime for Crew-owned built-in providers. Crew records hook, adapter, and provider metadata, and approved providers can generate static artifacts. It does not execute plugin-supplied code.

Crew plugins do not replace Copilot plugins or Copilot skills. If a Crew plugin depends on Copilot-owned extensibility, declare that under `copilot.requires`; Crew records and surfaces the dependency, but it does not install it or run Copilot plugin commands.

---

## Plugin lifecycle

Install, activation, and artifact refresh are separate steps.

1. `crew plugin validate <local-plugin-dir>` checks the manifest and prints structured validation errors.
2. `crew plugin dry-run <local-plugin-dir>` prints the files that would be written without changing `.crew/`.
3. `crew plugin install <local-plugin-dir>` copies declared static files, records hashes in `.crew/plugins/lock.json`, and leaves the plugin disabled.
4. `crew plugin enable <plugin-id>` activates the plugin roles declared in its manifest.
5. `crew plugin switch <role> <plugin-id>` makes an enabled plugin active for a role such as `memory` or `knowledge`.
6. `crew plugin refresh <plugin-id>` refreshes approved generated artifacts for built-in providers such as Graphify.
7. `crew plugin disable <plugin-id>` deactivates a plugin without deleting installed files.
8. `crew plugin uninstall <plugin-id>` removes files recorded in the lock and clears the registration.

Use `crew plugin list --json` when another tool needs stable machine-readable state.

---

## Local MVP commands

```bash
crew plugin validate ./my-plugin
crew plugin dry-run ./my-plugin
crew plugin install ./my-plugin
crew plugin list
crew plugin list --json
crew plugin enable my-plugin
crew plugin switch memory my-plugin
crew plugin refresh my-plugin
crew plugin run-lifecycle my-plugin onMemoryRefresh
crew plugin disable my-plugin
crew plugin verify
crew plugin uninstall my-plugin
```

The current MVP supports local plugin directories. Marketplace registration still uses the existing commands:

```bash
crew plugin marketplace add github/awesome-copilot
crew plugin marketplace list
crew plugin marketplace browse awesome-copilot
crew plugin marketplace remove awesome-copilot
```

---

## Manifest format

The MVP manifest file is `plugin.manifest.json`. The validator also accepts legacy local names such as `crew-plugin.json` and `plugin.json` while the schema settles.

```json
{
  "id": "demo-plugin",
  "name": "Demo Plugin",
  "version": "1.0.0",
  "description": "A declarative test plugin.",
  "authors": ["Crew"],
  "license": "MIT",
  "crew": ">=0.9.1",
  "components": {
    "knowledge": ["demo-plugin"],
    "memory": { "provider": "demo-memory" }
  },
  "copilot": {
    "requires": [
      {
        "id": "github/copilot-plugin-example",
        "version": ">=1.0.0",
        "optional": true,
        "reason": "Enables Copilot-owned commands when the user has installed it."
      }
    ]
  },
  "repository": {
    "type": "github",
    "url": "https://github.com/example/demo-plugin"
  },
  "upstream": {
    "package": "demo-tool",
    "registry": "pypi",
    "installCommand": "pip install demo-tool",
    "docs": "https://github.com/example/demo-plugin"
  },
  "mcp": {
    "available": true,
    "server": "demo-tool",
    "entryPoint": "demo-tool-mcp",
    "installCommand": "demo-tool-mcp",
    "reason": "Optional external MCP server users may configure separately."
  },
  "providers": [
    {
      "id": "demo-memory",
      "type": "memory",
      "mode": "read-write",
      "protocol": "mcp",
      "description": "Declarative memory provider contract.",
      "artifact": "memory/providers/demo-memory.md",
      "mcp": {
        "server": "demo-tool",
        "tool": "query-memory",
        "capability": "durable-memory"
      },
      "capabilities": ["durable-memory", "context-recall"]
    }
  ],
  "files": [
    {
      "source": "guidance.md",
      "target": "knowledge/demo-plugin/guidance.md",
      "type": "knowledge"
    }
  ]
}
```

Supported Crew component keys are `agents`, `ceremonies`, `decisions`, `instructions`, `knowledge`, `memory`, `routing`, `templates`, `workflows`, `hooks`, and `adapters`. Capability roles are derived only from these declared components; arbitrary capability strings are not accepted.

Declared files must be relative paths under approved `.crew/` roots such as `agents/`, `knowledge/`, `memory/`, `routing/`, `decisions/`, `ceremonies/`, `prompts/`, `instructions/`, `templates/`, `workflows/`, or `plugins/`.

Copilot plugin dependencies are metadata only:

```json
{
  "copilot": {
    "requires": [
      {
        "id": "github/copilot-plugin-example",
        "version": ">=1.0.0",
        "optional": false,
        "reason": "Provides the Copilot-side command this Crew workflow references."
      }
    ]
  }
}
```

Crew validates and records these dependencies so users know what Copilot plugins to install separately. Crew does not fetch, install, execute, or manage Copilot plugins.

External integration metadata is also record-only. Fields such as `repository`, `upstream.installCommand`, and `mcp.installCommand` explain how a human can install external tools separately; Crew never runs those commands.

Provider contracts are the typed extension seam for memory and knowledge systems. A contract declares the provider `type` (`memory`, `knowledge`, `persistence`, `event`, or `policy`), access `mode` (`read`, `write`, or `read-write`), `protocol` (`static-artifact` or `mcp`), optional static artifact binding, optional MCP binding metadata, and capability labels. These fields let spawned agents understand that a plugin represents a memory or knowledge provider without letting the plugin run code. During the MVP, provider contracts are prompt metadata only: Crew does not start MCP servers, call provider tools, query live memory backends, or install provider packages.

---

## Runtime behavior

Enabled plugins affect spawned Crew agents through their installed static artifacts and provider contracts. When an agent session is spawned, Crew reads `.crew/plugins/runtime.json`, finds enabled active plugin roles, and injects the installed guidance/metadata files plus provider contract summaries into the agent system context under a `Plugin Context` section.

This is still declarative-first behavior: Crew consumes copied Markdown/metadata from `.crew/`, but it does not install upstream packages, start MCP servers, execute plugin-supplied commands, call provider tools, or query external tools during plugin install or agent spawn.

The MVP also includes a narrow governed runtime for Crew-owned built-in providers. `crew plugin refresh <plugin-id>` and `crew plugin run-lifecycle <plugin-id> <event>` can generate artifacts only when the provider name, lifecycle event, and output paths are allowlisted by Crew. The current approved provider is Graphify, which can refresh deterministic knowledge artifacts under `.crew/knowledge/graphify/`.

Disabled plugins do not contribute prompt context, even if their files remain installed on disk.

---

## External integration examples

The repository includes local sample plugins that exercise external integration metadata without adding executable provider code:

| Example | Purpose |
| --- | --- |
| `samples/plugin-knowledge-graphify` | Knowledge graph profile for the real `safishamsi/graphify` project and PyPI package `graphifyy`. It declares a `knowledge` provider contract bound to a static artifact under `.crew/knowledge/graphify/`, and can refresh governed Graphify artifacts with `crew plugin refresh graphify-knowledge`. |
| `samples/plugin-knowledge-index-server` | Instruction and knowledge MCP profile for the real `jagilber-org/index-server` project and npm package `@jagilber-org/index-server`. It declares a metadata-only `knowledge` provider contract for the Index Server MCP catalog. |
| `samples/plugin-memory-mempalace` | Memory-palace-style provider profile for the real `MemPalace/mempalace` CLI and optional `mempalace-mcp` server. It declares a metadata-only `memory` provider contract for spatial memory. |

Graphify's Copilot support is a separately installed skill/integration, not a Crew memory provider or a Crew-managed Copilot plugin. Index Server is an MCP-governed instruction/knowledge catalog, not a memory provider, although it is adjacent because agents can persist validated knowledge across sessions and repositories. MemPalace is a real memory system, but Crew still does not install its package, start MCP, or configure assistant hooks.

---

## Runtime state

Crew stores plugin state under `.crew/plugins/`:

| File | Purpose |
| --- | --- |
| `installed.json` | Installed plugins, versions, enabled state, roles, source path, and deployed files. |
| `lock.json` | Manifest hash and per-file SHA-256 hashes for reproducibility and verification. |
| `runtime.json` | Active plugin bindings by role plus enabled runtime state. |
| `audit.jsonl` | JSON Lines lifecycle audit events for install, verify, enable, switch, disable, and uninstall. |

---

## Guardrails

The product goal is simple pluggability: install, enable, refresh, and give agents better context. The guardrails keep that model predictable:

- No plugin scripts, commands, shell snippets, or executable files are allowed.
- Lifecycle hooks are limited to Crew-owned, capability-gated providers that generate static artifacts.
- No plugin content is evaluated or run by Crew.
- No Copilot plugin commands are run by Crew; `copilot.requires` is dependency metadata only.
- No external package install hints or MCP setup hints are run by Crew; `repository`, `upstream`, and `mcp` fields are metadata only.
- Hook and adapter declarations are metadata only.
- Provider contracts are metadata only; they do not authorize live provider calls.
- Plugin file writes are limited to declared relative targets under `.crew/`.
- Path traversal, absolute paths, symlinks, and script/executable extensions are rejected.
- Governed runtime artifacts are generated only by built-in approved providers and only under approved `.crew/` paths.

See [Plugin security model](../reference/plugin-security.md) for the threat model and the negative checks that gate this feature.

The follow-up roadmap tracks remote marketplace distribution, broader built-in providers, and the trusted executable-provider RFC in [#1102](https://github.com/Blacklite/crew/issues/1102), [#1103](https://github.com/Blacklite/crew/issues/1103), [#1104](https://github.com/Blacklite/crew/issues/1104), and [#1105](https://github.com/Blacklite/crew/issues/1105).

---

## See also

- [Building extensions](../guide/building-extensions.md) — how to author a local plugin.
- [Extensibility guide](../guide/extensibility.md) — how to decide whether an idea belongs in core, a plugin, or team config.
- [Skills System](./skills.md) — the existing Crew knowledge layer; plugin manifests should prefer `knowledge` for reusable guidance and use `copilot.requires` for Copilot-owned plugins.
