# Consult Mode

> ⚠️ **Experimental** — Crew is alpha software. APIs, commands, and behavior may change between releases.


Consult mode lets you bring your personal crew to projects you don't own — OSS contributions, client work, temporary collaborations — without leaving any trace. Your team consults, does the work, learns things, and returns home with only the generic learnings you approve.

---

## The Problem

You have a personal crew at your global path (e.g., `~/Library/Application Support/crew/personal-crew` on macOS, `~/.config/crew/personal-crew` on Linux) with agents, skills, and decisions refined over time. When you contribute to someone else's project, you face a dilemma:

- **Pollute the project?** Running `crew init` creates a `.crew/` folder they didn't ask for
- **Pollute your crew?** Project-specific knowledge bleeds into your global crew
- **Work without your team?** Lose the productivity benefits you've built up

---

## The Solution

Your team **consults** on a project. They bring their expertise, do the work, and learn things. When done, they extract what's reusable and return home. The project never knows Crew was there.

| Aspect | Normal Mode | Consult Mode |
|--------|-------------|--------------|
| Crew location | `.crew/` in project | **Copy** of personal crew into project `.crew/` |
| Git visibility | Committed or `.gitignore` | Invisible via `.git/info/exclude` |
| Writes go to | Project `.crew/` | Project `.crew/` (isolated copy) |
| After session | Stays in project | Extract generic learnings → personal crew, discard rest |

---

## Quick Start

### OSS Contribution

```bash
cd ~/projects/kubernetes-dashboard
crew consult                 # Enter consult mode
# ... do your work with your crew ...
crew extract                 # Review and extract generic learnings
crew extract --clean --yes   # Clean up after extraction
```

### Client Work

```bash
cd ~/client-projects/acme-corp
crew consult                 # Enter consult mode
# ... work on the project ...
crew extract --dry-run       # Preview what would be extracted
crew extract --clean         # Extract and clean up (prompts for confirmation)
```

### Check Status

```bash
crew consult --status        # See if consult mode is active
crew consult --check         # Dry-run: show what would happen
```

---

## Command Reference

### `crew consult`

Enter consult mode with your personal crew.

```bash
crew consult              # Enter consult mode
crew consult --status     # Check current consult mode status
crew consult --check      # Dry-run: show what would happen without creating files
```

**What happens:**

1. Copies your personal crew into the project's `.crew/` directory
2. Adds `.crew/` and `.github/agents/crew.agent.md` to `.git/info/exclude`
3. Patches the Scribe charter with extraction instructions
4. Creates a staging area at `.crew/extract/` for generic learnings

**Created structure:**

```
.crew/                     # Full copy of personal crew
├── config.json             # { "consult": true, "sourceCrew": "...", ... }
├── agents/                 # Copied from personal crew
├── skills/                 # Copied from personal crew
├── decisions.md            # Copied from personal crew
├── scribe-charter.md       # Patched with consult mode extraction instructions
├── sessions/               # Local session history
└── extract/                # Staging area for generic learnings

.github/agents/
└── crew.agent.md          # Points to local .crew/ (also excluded from git)
```

**Requirements:**

- You must have a personal crew configured
- The project must not already have a committed `.crew/` folder

---

### `crew extract`

Extract generic learnings from a consult session back to your personal crew.

```bash
crew extract                    # Review and extract generic learnings
crew extract --dry-run          # Preview what would be extracted (no changes)
crew extract --clean            # Also delete project .crew/ after (prompts for confirmation)
crew extract --clean --yes      # Delete without confirmation
crew extract --accept-risks     # Allow extraction despite license risks
```

**What happens:**

1. Reads the project's LICENSE file
2. Loads staged learnings from `.crew/extract/`
3. Presents an interactive selection UI
4. Merges selected items to your personal crew
5. Logs the consultation to `<personal-crew>/consultations/{project}.md`
6. Optionally cleans up the project `.crew/` directory

**Example output:**

```
📤 Learnings staged for extraction:

⚠️  License: MIT (safe to extract)

Found 3 learning(s) in .crew/extract/:
  [1] use-async-await.md
  [2] validate-inputs.md  
  [3] prefer-composition.md

Select learnings to extract (space to toggle, enter to confirm):
❯ ◉ use-async-await.md
  ◉ validate-inputs.md
  ◉ prefer-composition.md

Extract 3 learning(s)? [Y/n]
```

---

## Learning Classification

During your consult session, the **Scribe** automatically classifies decisions as they're made:

### Generic (applies to any project)

Copied to `.crew/extract/` for later extraction:

- "Always use async/await instead of callbacks"
- "Validate inputs at API boundaries"
- "Prefer composition over inheritance"
- Best practices, coding standards, patterns that work anywhere

### Project-specific (only applies here)

Kept in local `decisions.md` only — not extracted:

- References to specific file paths in the project
- Project-specific config, APIs, or schemas
- Decisions that mention "this project" or "this codebase"

**You always have final say.** The Scribe proposes by writing to `extract/`, you approve or reject via `crew extract`. No extraction happens without your explicit confirmation.

---

## License Handling

### Permissive Licenses (Safe)

MIT, Apache, BSD, ISC — proceed normally:

```
⚠️  License: MIT (safe to extract)
```

### Copyleft Licenses (Blocked)

GPL, AGPL, LGPL — extraction is blocked by default:

```
🚫 License: GPL-3.0 (copyleft)
   Extraction blocked. Patterns from copyleft projects may carry
   license obligations that affect your future work.
   
   See: https://crew.dev/docs/license-risk
   
   To proceed anyway: crew extract --accept-risks
```

To override:

```bash
crew extract --accept-risks
```

---

## Technical Notes

### Git Invisibility

Consult mode uses `.git/info/exclude` to hide Crew files:

- Same syntax as `.gitignore`
- Lives inside `.git/`, so it's never committed
- Project owners never see it
- `git status` shows nothing Crew-related

### Why Copy Instead of Reference?

Your personal crew is **copied** into the project rather than referenced:

- Changes during the session don't pollute your personal crew
- Session-specific decisions stay isolated until explicitly extracted
- Works offline (no dependency on external path)
- Clean separation between "consulting" and "bringing home"

### Consultation Log

All consultations are tracked in your personal crew at `consultations/{project}.md`:

```markdown
# kubernetes-dashboard

**First consulted:** 2026-02-27  
**Last session:** 2026-03-15  
**License:** Apache-2.0

## Sessions

### 2026-02-27
- use-async-await.md: "### Always use async/await..."
- validate-inputs.md: "### Validate inputs at API..."

### 2026-03-15
- prefer-composition.md: "### Prefer composition over..."
```

---

## Tips

- Run `crew consult --check` before entering consult mode to preview what will happen
- Use `crew extract --dry-run` to review staged learnings without committing
- The `--clean` flag is convenient for OSS drive-by contributions where you won't return
- Consult mode errors out if the project already has a committed `.crew/` — use normal mode instead
- Your personal crew is never modified during the session — only via explicit `crew extract`

---

## Next Steps

- **Set up a personal crew:** See [Your Personal Crew](../guide/personal-crew.md) for initial setup with `crew init --global`
- **Learn about sharing:** See [Export & Import](./export-import.md) for portable team snapshots
- **Upstream inheritance:** See [Upstream Inheritance](./upstream-inheritance.md) for knowledge sharing across teams
