# PRD: Personal Crew Consult Mode

**Author:** James Sturtevant  
**Date:** 2026-02-27  
**Status:** Implemented  
**Wave:** M6 (Personal Crew Enhancement)

---

## Problem Statement

You have a personal crew at your global crew path (resolved via `resolveGlobalCrewPath()` — e.g. `~/.config/crew/.crew` on Linux, `~/Library/Application Support/crew/.crew` on macOS, `%APPDATA%/crew/.crew` on Windows) with agents, skills, and decisions refined over time. You want to use this team on projects you don't own (OSS contributions, client work, temporary collaborations) without:

1. **Polluting the project** — no `.gitignore` changes, no committed `.crew/` folder
2. **Polluting your crew** — no project-specific knowledge bleeding into your global crew

Currently, `crew init` creates a project-owned crew. There's no way to "bring your team" to a project invisibly, work with them, and bring back only the generic learnings.

---

## Solution: Consult Mode

Your team **consults** on a project. They bring their expertise, do the work, learn things. When done, they extract what's reusable and return home. The project never knows Crew was there.

### Key Behaviors

| Aspect | Normal Mode | Consult Mode |
|--------|-------------|--------------|
| Crew location | `.crew/` in project | **Copy** of personal crew into project `.crew/` |
| Git visibility | Committed or `.gitignore` | Invisible via `.git/info/exclude` |
| Writes go to | Project `.crew/` | Project `.crew/` (isolated copy, won't affect personal crew) |
| Agent file | `.github/agents/crew.agent.md` (committed) | `.github/agents/crew.agent.md` (excluded, points to local `.crew/`) |
| After session | Stays in project | Extract generic → personal crew, discard rest |

---

## Commands

### Entry: `crew consult`

```bash
cd ~/projects/their-oss-project
crew consult              # Enter consult mode
crew consult --status     # Check if in consult mode, show pending learnings
crew consult --check      # Dry-run: show what would happen without creating files
```

**Creates:**
```
.crew/                     # Full copy of personal crew
├── config.json             # { "consult": true, "sourceCrew": "<personal crew path>", ... }
├── agents/                 # Copied from personal crew
├── skills/                 # Copied from personal crew
├── decisions.md            # Copied from personal crew
├── scribe-charter.md       # Patched with consult mode extraction instructions
├── sessions/               # Local session history
└── extract/                # Staging area for generic learnings (Scribe writes here)

.github/agents/
└── crew.agent.md          # Points to local .crew/ (also excluded from git)
```

**Also:**
- Appends `.crew/` and `.github/agents/crew.agent.md` to `.git/info/exclude` (git-internal, never visible)
- If project already has committed `.crew/`: **error out**

**Why copy instead of reference?**
- Changes during consult session don't pollute your personal crew
- Session-specific decisions/skills stay isolated until explicitly extracted
- Works offline (no dependency on external path)

### Exit: `crew extract`

```bash
crew extract                    # Review and extract generic learnings
crew extract --dry-run          # Preview what would be extracted (no changes)
crew extract --clean            # Also delete project .crew/ after (prompts for confirmation)
crew extract --clean --yes      # Delete without confirmation
crew extract --accept-risks     # Allow extraction despite license or other risks
```

**Flow:**
1. Read project LICENSE file
2. Warn if copyleft (GPL, AGPL) — license contamination risk
3. Load staged learnings from `.crew/extract/`
4. User selects which learnings to extract
5. Merge selected items to personal crew
6. Log to `<sourceCrew>/consultations/{project}.md`
7. Remove extracted files from `.crew/extract/`

---

## Classification: Scribe-Based

The extraction classification is done by **Scribe** during the session, not by SDK heuristics.

When consult mode is set up, the Scribe charter is patched with extraction instructions:

```markdown
## Consult Mode Extraction

**This crew is in consult mode.** When merging decisions from the inbox, also classify each decision:

### Classification

For each decision in `.crew/decisions/inbox/`:

1. **Generic** (applies to any project) → Copy to `.crew/extract/` with the same filename
   - Signals: "always use", "never use", "prefer X over Y", "best practice", coding standards, patterns that work anywhere
   - These will be extracted to the personal crew via `crew extract`

2. **Project-specific** (only applies here) → Keep in local `decisions.md` only
   - Signals: Contains file paths from this project, references "this project/codebase/repo", mentions project-specific config/APIs/schemas

Generic decisions go to BOTH `.crew/decisions.md` (for this session) AND `.crew/extract/` (for later extraction).
```

**User always has final say.** Scribe proposes by writing to `extract/`, user approves/rejects via `crew extract`. No extraction happens without explicit confirmation.

---

## Extraction Review

Via `crew extract`:

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

### License Handling

**Permissive licenses (MIT, Apache, BSD, ISC):** Proceed normally with extraction review.

**Copyleft licenses (GPL, AGPL, LGPL):** **Blocked by default.** Extraction refuses unless user explicitly opts in:

```
🚫 License: GPL-3.0 (copyleft)
   Extraction blocked. Patterns from copyleft projects may carry
   license obligations that affect your future work.
   
   See: https://crew.dev/docs/license-risk
   
   To proceed anyway: crew extract --accept-risks
```

---

## Technical Design

### Config Schema

Consult mode config in `.crew/config.json`:

```typescript
interface ConsultDirConfig {
  consult: boolean;        // true = consult mode
  sourceCrew: string;     // Path to original personal crew (for extraction)
  projectName: string;     // Name of the project being consulted
  createdAt: string;       // ISO timestamp
}
```

### SDK Types

```typescript
// Result of setupConsultMode()
interface SetupConsultModeResult {
  crewDir: string;           // Path to project .crew/
  personalCrewRoot: string;  // Path to personal crew root
  gitExclude: string;         // Path to git exclude file
  projectName: string;        // Project name (basename)
  dryRun: boolean;            // Whether this was a dry run
  agentFile: string;          // Path to .github/agents/crew.agent.md
  createdFiles: string[];     // List of created file paths (relative to crewDir)
}

// A learning staged by Scribe for extraction
interface StagedLearning {
  filename: string;   // e.g. "use-async-await.md"
  filepath: string;   // Full path to file in extract/
  content: string;    // File content
}

// Result of extraction
interface ExtractionResult {
  extracted: StagedLearning[];  // Learnings extracted to personal crew
  skipped: StagedLearning[];    // Learnings rejected by user
  license: LicenseInfo;
  projectName: string;
  timestamp: string;
  acceptedRisks: boolean;
}
```

### Errors

```typescript
// Thrown when personal crew doesn't exist
class PersonalCrewNotFoundError extends Error {
  constructor() {
    super('No personal crew found.');
    this.name = 'PersonalCrewNotFoundError';
  }
}
```

### Invisibility Mechanism

`.git/info/exclude` is:
- Git-internal exclude file (same syntax as `.gitignore`)
- Lives in `.git/`, so never committed
- Project owner never sees it
- `git status` shows nothing

> **Important:** Do not hard-code `resolve(cwd, '.git/info/exclude')`. In git worktrees
> and submodules, `.git` is a *file* pointing at the real git dir. Use `git rev-parse`
> to resolve the correct path:

```bash
# Resolve the correct exclude path (works with worktrees/submodules)
EXCLUDE_PATH=$(git rev-parse --git-path info/exclude)
echo ".crew/" >> "$EXCLUDE_PATH"
```

---

## Consultation Log

Track all consultations in `<sourceCrew>/consultations/`:

**`<sourceCrew>/consultations/kubernetes-dashboard.md`:**
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

## Success Criteria

1. **Invisible by default:** `git status` shows nothing in consult mode
2. **No pollution upstream:** Project `.crew/` never modifies global crew without explicit approval
3. **No pollution downstream:** Project-specific learnings stay in project or are discarded
4. **Audit trail:** `<sourceCrew>/consultations/` tracks what was extracted from where
5. **License safety:** User warned about copyleft extraction risks
6. **Matches InitResult:** `SetupConsultModeResult.createdFiles` array matches `InitResult.createdFiles` pattern

---

## Non-Goals (v1)

- Cross-machine sync of global crew (users can use git or `crew export/import`)
- Consulting on crewified projects (error out for now)
- Automatic extraction (always requires user approval)
- SDK-side heuristic classification (Scribe handles this via LLM during session)

---

## References

- [Personal Crew Guide](../docs/guide/personal-crew.md)
- [SDK Sharing Module](../packages/crew-sdk/src/sharing/)
- [Export Command](../packages/crew-cli/src/cli/commands/export.ts)
