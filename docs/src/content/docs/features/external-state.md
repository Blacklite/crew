# External State Storage

> ⚠️ **Experimental** — Crew is alpha software. APIs, commands, and behavior may change between releases.


**Try this to move state outside the working tree:**
```bash
crew externalize
```

**Try this to move state back:**
```bash
crew internalize
```

**Try this to check current state location:**
```bash
cat .crew/config.json | grep stateLocation
```

Crew can store `.crew/` state outside the working tree in a platform-specific global directory — solving branch-switch data loss and PR pollution.

---

## The Problem

By default, `.crew/` lives in the working tree alongside your code:

```
my-repo/
  .crew/
    decisions/
    skills/
    team.md
    routing.md
```

This creates two problems:

### 1. Branch-Switch Data Loss

When you switch Git branches, `.crew/` is destroyed:

```bash
git checkout feature-branch    # .crew/ exists
git checkout main              # .crew/ GONE (if not on main)
```

Your decisions, skills, earned knowledge — all lost.

### 2. PR Pollution

If you commit `.crew/` to preserve it, every branch includes crew state in PRs:

```diff
+ .crew/decisions/log.md
+ .copilot/skills/ci-setup/SKILL.md
+ .crew/team.md
```

Reviewers see crew metadata mixed with your actual code changes.

---

## The Solution: External State

`crew externalize` moves `.crew/` to a platform-specific global directory **outside the working tree**:

**Platform paths:**

| OS | Path |
|----|------|
| **Windows** | `%APPDATA%\crew\projects\{repo-name}\` |
| **macOS** | `~/Library/Application Support/crew/projects/{repo-name}/` |
| **Linux** | `~/.config/crew/projects/{repo-name}/` |

**Result:**
- Crew state persists across branch switches
- PRs never contain `.crew/` files
- State is isolated per repository (based on repo name)

---

## Usage

### Externalize

Move `.crew/` to external storage:

```bash
crew externalize
```

**What happens:**
1. Resolves platform-specific global path (e.g., `~/Library/Application Support/crew/projects/my-repo/`)
2. Moves `.crew/` contents to global path
3. Creates thin marker file `.crew/config.json` in working tree (existing config fields are preserved):
   ```json
   {
     "version": 1,
     "teamRoot": ".",
     "projectKey": "my-repo",
     "stateLocation": "external"
   }
   ```
4. Adds `.crew/config.json` to `.gitignore` (if not already present) — the marker is machine-specific and must not be committed

**After externalization:**
- Working tree has only `.crew/config.json` (gitignored marker)
- All crew state lives in global directory
- Branch switches don't affect crew data

---

### Internalize

Move state back to working tree:

```bash
crew internalize
```

**What happens:**
1. Reads marker file to find external state location
2. Copies state from the global directory back to `.crew/` (the external copy is left in place)
3. Removes the external-state fields (`stateLocation`, `teamRoot`, `projectKey`) from `.crew/config.json` — the file is deleted when no other settings remain
4. Leaves `.gitignore` unchanged

**After internalization:**
- `.crew/` lives in working tree again
- Can commit crew state if desired
- Vulnerable to branch-switch data loss again

---

## Configuration

The thin marker file `.crew/config.json` tracks state location:

```json
{
  "version": 1,
  "teamRoot": ".",
  "projectKey": "my-repo",
  "stateLocation": "external"
}
```

| `stateLocation` | Meaning |
|-------|---------|
| absent (or no marker file) | State lives in working tree (`.crew/` in repo) |
| `"external"` | State lives in global directory (platform-specific path) |

**Notes:**
- Marker file is created by `crew externalize`
- Marker file is gitignored — not committed to repo
- `crew internalize` removes the external-state fields from the file (and deletes it when nothing else remains)

---

## Global Directory Structure

```
~/Library/Application Support/crew/projects/
  my-repo/
    decisions/
      log.md
      inbox/
    skills/
      ci-setup/SKILL.md
    team.md
    routing.md
  other-repo/
    decisions/
    skills/
```

Each repo gets its own isolated directory based on repository name. State is never shared across repos.

---

## When to Use External State

**Use `crew externalize` when:**
- You switch branches frequently
- You want crew state isolated from code PRs
- You work on feature branches where `.crew/` isn't committed to base branch
- You want crew state to persist across `git clean -fdx`

**Keep internal state when:**
- You want crew state committed to the repo (e.g., decisions, skills travel with code)
- You rarely switch branches
- You want crew state versioned alongside code

---

## Multi-Repo Workflows

External state is **isolated per repository** — each repo gets its own global directory. If you work on multiple repos, each maintains separate crew state:

```
~/Library/Application Support/crew/projects/
  frontend/
    decisions/
    skills/
    team.md
  backend/
    decisions/
    skills/
    team.md
```

No cross-repo state pollution.

---

## Git Integration

After externalization, only the thin marker file exists in the working tree, and it is gitignored:

```bash
$ git status
On branch feature-branch
nothing to commit, working tree clean
# .crew/config.json exists on disk but is gitignored — not committed
```

This means:
- PRs never show crew state changes
- Branch switches don't affect crew data
- `git clean -fdx` doesn't delete crew state (it lives outside the repo — though it does remove the gitignored marker, which `crew externalize` can recreate)

---

## Migration

### From Internal to External

```bash
# Before: .crew/ in working tree
ls .crew/
# decisions/  skills/  team.md  routing.md

crew externalize

# After: only marker file in working tree
ls .crew/
# config.json

# State moved to global directory
ls ~/Library/Application\ Support/crew/projects/my-repo/
# decisions/  skills/  team.md  routing.md
```

### From External to Internal

```bash
crew internalize

# State moved back to working tree
ls .crew/
# decisions/  skills/  team.md  routing.md  config.json
```

---

## Notes

- External state is **opt-in** — default is internal (working tree)
- External state is **platform-aware** — uses OS-specific global directories
- External state is **isolated per repo** — no cross-repo pollution
- Marker file is **gitignored** — never committed
- `crew upgrade` respects current state location (doesn't force internal/external)

---

## Sample Prompts

```
crew externalize
```

Moves crew state to global directory.

```
crew internalize
```

Moves crew state back to working tree.

```
Where is my crew state stored?
```

Reports current state location (internal vs external).

```
Show me the external state path
```

Prints the platform-specific global directory path.
