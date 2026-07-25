---
"@blacklite/crew-cli": minor
"@blacklite/crew-sdk": minor
---

feat: add `crew preset install <source>` for sharing presets via repo URL or local path (#1224)

Closes #1224. Adds a new subcommand that installs a single preset from a GitHub URL or local path into `$CREW_HOME/presets/<name>/` — the peer-to-peer preset sharing flow that was missing in v0.10.0.

### CLI

```bash
# From a GitHub repo (preset at <repo-root>/preset.json or <repo-root>/presets/<name>/)
crew preset install https://github.com/tamir/my-presets#my-awesome-team

# From a sub-path
crew preset install https://github.com/tamir/my-presets/tree/main/presets/my-awesome-team

# From SSH URL
crew preset install git@github.com:tamir/my-presets.git#my-awesome-team

# From a local path
crew preset install ./my-awesome-team

# Override the installed name
crew preset install https://github.com/tamir/my-presets#my-awesome-team --name corp-team

# Overwrite an existing preset
crew preset install <source> --force
```

After install, the preset is a normal entry in `$CREW_HOME/presets/` — `crew preset list`, `crew preset apply <name>`, and `crew init --preset <name>` all work as today.

### Why

The existing `crew preset init --remote` flow is for syncing your *whole* `$CREW_HOME` repo across machines (single-user, multi-machine use case). There was no built-in way to install just *one* preset from someone else's repo. Users had to:
1. Manually clone the repo to a temp dir
2. `cp -r <clone>/presets/<name> $CREW_HOME/presets/`
3. Then `crew preset apply <name>`

…or hijack `CREW_HOME` (which collides with their own personal crew config).

### What it does

1. Resolves source — GitHub URL → shallow `git clone --depth 1` to a temp dir; local path → use as-is
2. Locates the preset within the source via 3 patterns:
   - Source dir contains `preset.json` → single-preset source
   - Source dir contains a `presets/` collection → require `--name` (or `#name` fragment) to pick
   - Source dir IS the `presets/` dir → require `--name`, or auto-pick if only one preset
3. Validates the preset's `preset.json` manifest (name, agents[]) before any destructive action
4. Verifies `agents/` directory exists
5. Copies `preset.json` (with optional rename) + `agents/` into `$CREW_HOME/presets/<name>/`
6. Fail-stops if destination exists, unless `--force` is passed
7. Cleans up the temp clone whether install succeeds or fails

### What's NOT in scope (deferred to follow-ups)

- `crew preset uninstall` — `rm -rf $CREW_HOME/presets/<name>` works for now
- `crew preset update <name>` to pull a fresh version from origin
- Public preset registry / discovery catalog
