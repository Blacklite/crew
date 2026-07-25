# Git Worktree Awareness

> ⚠️ **Experimental** — Crew is alpha software. APIs, commands, and behavior may change between releases.


**Try this to enable branch-specific state:**
```
Use worktree-local mode — I want each branch to have its own team state
```

**Try this to share state across branches:**
```
Share the team across all worktrees — use main-checkout mode
```

Crew supports git worktrees with two strategies: **worktree-local** (each worktree has its own `.crew/` state) and **main-checkout** (shared state across all worktrees).

---

## What Are Worktrees?

## What Are Worktrees?

Git worktrees let you check out multiple branches simultaneously:

```bash
git worktree add ../project-feature-a feature-a
git worktree add ../project-feature-b feature-b
```

Now you have:
- `project/` (main branch)
- `project-feature-a/` (feature-a branch)
- `project-feature-b/` (feature-b branch)

All share the same `.git/` database but have separate working directories.

## Worktree Strategies

### 1. Worktree-Local (Independent State)

Each worktree has its own `.crew/` directory. Agents in one worktree don't see state from another.

**When to use:**
- Multiple features in parallel with **different teams**
- Experimental branches where you want isolated Crew config
- Different team compositions per worktree (e.g., frontend-only team in one, backend-only in another)

**Structure:**
```
project/
├── .git/
└── .crew/                    # Main worktree team

project-feature-a/
├── .git -> ../project/.git/
└── .crew/                    # Feature A team (independent)

project-feature-b/
├── .git -> ../project/.git/
└── .crew/                    # Feature B team (independent)
```

**Setup:**
```bash
cd project-feature-a
# Initialize Crew in this worktree
gh copilot "Initialize Crew for this worktree"
```

### 2. Main-Checkout (Shared State)

All worktrees share the `.crew/` directory from the main checkout. Agents across worktrees see the same team, decisions, and routing rules.

**When to use:**
- Same team working on multiple branches
- Coordinated work where agents need shared context
- Parallel feature development by the same crew

**Structure:**
```
project/
├── .git/
└── .crew/                    # Shared by all worktrees

project-feature-a/
├── .git -> ../project/.git/
└── .crew -> ../project/.crew/  # Symlink

project-feature-b/
├── .git -> ../project/.git/
└── .crew -> ../project/.crew/  # Symlink
```

**Setup:**
```bash
cd project-feature-a
ln -s ../project/.crew .crew
```

Or tell Crew: `"Use the main worktree's team"` — Crew creates the symlink automatically.

## Coordinator Team Root Resolution

When Crew starts in a worktree, the coordinator resolves team root:

1. **Check for `.crew/` in current directory** — If exists and is not a symlink, use worktree-local strategy.
2. **Check if `.crew/` is a symlink** — If yes, follow symlink to main checkout, use main-checkout strategy.
3. **Scan parent worktrees** — If no `.crew/` found, search `../` for main worktree with `.crew/`.
4. **Prompt for strategy** — If ambiguous, ask: "Use worktree-local or main-checkout?"

## Merge Driver for Append-Only Files

Crew uses `merge=union` for append-only log files to avoid conflicts across worktrees:

**.gitattributes:**
```
.crew/log/* merge=union
.crew/orchestration-log/* merge=union
.crew/decisions/inbox/* merge=union
```

This ensures log entries from different worktrees don't conflict when merged back to main.

## Worktree-Aware Commands

When using main-checkout strategy:

| Command | Behavior |
|---------|----------|
| `"Show team roster"` | Reads shared `team.md` from main worktree |
| `"Add a directive"` | Writes to shared `decisions/inbox/` in main worktree |
| `"Who's working on issue #42?"` | Checks orchestration log in main worktree (sees all agents across worktrees) |
| `"Initialize Crew"` | Prompts: "Use main worktree's team or create new?" |

## When to Use Which Strategy

| Scenario | Strategy | Reason |
|----------|----------|--------|
| **Parallel features, same team** | Main-checkout | Shared context, coordinated work |
| **Experimental branch, isolated team** | Worktree-local | No cross-contamination |
| **Hotfix branch + feature branch** | Main-checkout | Same crew, need shared decisions |
| **Multiple teams in same repo** | Worktree-local | Different roles, different directives |
| **Solo dev, multiple branches** | Main-checkout | No need for duplicate state |

## Switching Strategies

You can convert between strategies:

### Worktree-Local → Main-Checkout

```bash
cd project-feature-a
rm -rf .crew
ln -s ../project/.crew .crew
```

Or: `"Convert this worktree to use main team"`

### Main-Checkout → Worktree-Local

```bash
cd project-feature-a
rm .crew  # Remove symlink
cp -r ../project/.crew .crew  # Copy state
```

Or: `"Give this worktree its own Crew team"`

## Sample Prompts

```
Initialize Crew in this worktree with a separate team
```
Creates worktree-local `.crew/` directory. Team is independent from main worktree.

```
Use the main worktree's Crew team
```
Creates symlink to main worktree's `.crew/`. All state is shared.

```
Which worktrees have active Crew teams?
```
Scans all worktrees linked to this repository, reports which have `.crew/` directories.

```
Show me the team roster for the main worktree
```
Resolves main worktree path, reads `team.md` from there (useful when in a feature worktree).

```
Convert this worktree to use the main team
```
Removes worktree-local `.crew/` and creates symlink to main worktree's `.crew/`.
