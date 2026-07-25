# Export & Import

> ⚠️ **Experimental** — Crew is alpha software. APIs, commands, and behavior may change between releases.


**Try this to make your team portable:**
```
Export my team to a file — I want to use them on another project
```

**Try this to bring a trained team to a new repo:**
```
Import the team from crew-export.json
```

Crew teams are portable. Export your trained agents, casting state, skills, and decisions to a single JSON file. Import them into any repo and they bring all their knowledge with them.

---

## Export

```bash
crew export
```

Creates `crew-export.json` in the current directory — a portable snapshot of your entire team: agents, casting state, skills, and decisions.

### Custom output path

```bash
crew export --out ./backups/my-team.json
```

### Push directly to a GitHub repository

Instead of writing to a local file, you can push the export straight to a GitHub repo via the GitHub Contents API. This is the easiest way to back up your team to a private repo or share it with collaborators without sending a file.

```bash
# Export to a GitHub repo (uses default branch)
crew export --repo myorg/crew-backups

# Export to a specific branch
crew export --repo myorg/crew-backups --branch nightly
```

Requirements:
- GitHub CLI (`gh`) installed and authenticated with permission to push to the target repo
- The repo must exist (the export does NOT create it)

The export lands at the repo root as `crew-export.json` by default. Combine with `--out` to control the filename inside the repo:

```bash
crew export --repo myorg/crew-backups --out my-team-2026-06-11.json
```

### What's included

| Data | Included |
|------|----------|
| Agent charters | ✅ |
| Agent histories | ✅ (split into portable vs project-specific) |
| Casting state | ✅ |
| **Skills** | ✅ **All earned skills export with the team** |
| Decisions | ✅ |

> **Skills are portable**: When you export a team, all earned skills from `.copilot/skills/` are included in the JSON manifest. After importing, skills are immediately available to all agents — no loss of knowledge.

---

## Import

```bash
crew import crew-export.json
```

Imports the snapshot into the current repo's `.crew/` directory.

### Pull directly from a GitHub repository

You can import a snapshot directly from a GitHub repo without downloading the file first:

```bash
# Import from default branch of a repo
crew import --repo myorg/crew-backups

# Import a specific filename or branch
crew import --repo myorg/crew-backups --branch nightly
crew import --repo myorg/crew-backups --out my-team-2026-06-11.json
```

Requirements:
- GitHub CLI (`gh`) installed and authenticated with read access to the source repo
- The export file must exist at the named path in the repo (default: `crew-export.json` at repo root)

Use `--force` together with `--repo` for the same archive-then-replace behavior as the file-based import.

### Collision detection

If `.crew/` already exists, Crew warns you and stops. To archive the existing team and replace it:

```bash
crew import crew-export.json --force
```

The `--force` flag moves your current team to an archive before importing. Nothing is deleted.

### History splitting

During import, agent histories are split into two categories:

- **Portable knowledge** — general learnings, conventions, and patterns that transfer across projects
- **Project-specific learnings** — context-tagged entries tied to the original repo

Imported agents bring their skills and general knowledge without assuming your project works the same way.

---

## Use Cases

| Scenario | Command |
|----------|---------|
| Back up before a major refactor | `crew export --out ./backup.json` |
| Share a trained team with a colleague | Export, send the JSON, they import — **skills included** |
| Move a team to a different repo | Export from old repo, import into new repo — **skills travel with agents** |
| Reset and start fresh | Export as backup, delete `.crew/`, re-init |

---

## Tips

- Export before running `upgrade` if you want a rollback point.
- The export file is JSON — you can inspect it to see exactly what your team knows.
- Imported agents retain their names and universe. They won't be renamed.
- Commit your `.crew/` directory after importing so the team is available to everyone who clones the repo.
- **Skills are fully portable** — all earned skills export and import with perfect fidelity. No manual copying needed.

## Sample Prompts

```
export the current team
```

Creates a `crew-export.json` snapshot of the entire team in the current directory.

```
import crew-export.json into this repo
```

Imports a team snapshot into the current project's `.crew/` directory.

```
what was included in that export?
```

Shows a summary of what data was captured in the most recent export file.

```
export just the team state, not the full history
```

Creates a lightweight export with agent charters and skills but minimal history.

```
import with --force and archive the current team
```

Overwrites the existing `.crew/` directory after archiving it as a backup.
