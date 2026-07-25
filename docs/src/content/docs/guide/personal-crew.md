# Your Personal Crew

> ⚠️ **Experimental** — Crew is alpha software. APIs, commands, and behavior may change between releases.

:::tip[Git helps protect your project state]
We strongly recommend using git to version-control your project `.crew/` directory. Every session writes to it — decisions, logs, orchestration history. Agent charters, skills, and casting histories live in your personal crew directory (not committed to projects). Without version control, context window resets, crashes, or accidental deletions could be unrecoverable. If git isn't an option, regular manual backups to external storage or cloud sync can help protect your work.
:::

**Try this:**
```bash
crew init --global
```

Your agents follow you everywhere now. Same team, every project, persistent memory.

This tutorial walks you through setup, explains what's happening behind the scenes, and shows a few ways personal crews make your work better.

---

## 1. What Is a Personal Crew?

Normally, Crew lives inside a single project — `.crew/` in your repo root. Your agents know that project. They don't know your other ones.

A personal crew flips that. Your team identity — agents, charters, skills, casting history — moves to your personal crew directory. Every project you work in can point to it.

**Personal crew location by platform:**

| Platform | Path |
|----------|------|
| Linux | `~/.config/crew/` |
| macOS | `~/Library/Application Support/crew/` |
| Windows | `%APPDATA%\crew\` |

What that means in practice:

- Your agents remember your conventions across all your repos
- Skills learned in one project carry over to every other one
- Your Lead reviews code the same way everywhere
- You don't repeat yourself when starting a new project

You're still one person. But your team travels with you.

---

## 2. Set It Up

### Install the CLI globally

```bash
npm install -g @blacklite/crew-cli
```

Now `crew` works from any directory. Not tied to a specific project.

### Initialize your personal crew

```bash
crew init --global
```

You'll see:

```
✅ Personal crew initialized.
   {personal crew directory} — your global team root
   Agents, skills, and casting will be shared across projects.
```

That's it. You have a personal team root.

### Verify it's working

```bash
crew status
```

```
Crew Status
  Global crew: {personal crew directory}
  Agents: 0 (none cast yet — start a session to form your team)
  Skills: 0
```

No agents yet. They form when you start your first session. The global directory is just the container — your team comes to life when you give them work.

### Connect a project

Navigate to any project and run:

```bash
cd ~/projects/my-api
crew init
```

Crew detects your global team root and writes a pointer:

```
✅ Crew initialized.
   .crew/config.json → teamRoot: {personal crew directory}
   Team identity inherited from personal crew.
   Project-local state (decisions, logs) stays here.
```

Your project now has its own `.crew/` directory for local state, but your agents, skills, and casting come from the global root.

Repeat for any project you want connected.

---

## 3. What Just Happened? (Behind the Scenes)

Two things were created. Understanding the split is the key to personal crews.

### The global directory: your personal crew

This is your **team identity**. It contains:

```
{personal crew directory}/
  agents/          — your agent charters and histories
  casting/         — who's been cast, role assignments
  skills/          — accumulated knowledge ("always use Zod", "prefer Tailwind")
```

This is the stuff that makes your agents *yours*. It persists across sessions. It grows as you work. It follows you from project to project.

### The global `crew.agent.md` — a reference, not a live file

You'll also see `.github/agents/crew.agent.md` inside your global config directory. This file is **not** discoverable by GitHub Copilot — Copilot only reads agent files inside a git repository's `.github/agents/` folder.

So why is it there? It serves as a **local reference** of the Crew agent instructions that were applied to your projects. The actual source for `crew init` is the packaged template bundled with the CLI (`crew.agent.md.template`), so the global copy is not used as input for future inits. It exists so you can see what Crew generated without opening a project.

If you want Copilot to use Crew's agent instructions in a project, run `crew init` in that project's root — that creates the "real" `.github/agents/crew.agent.md` inside the git repo where Copilot can discover it.

### The project pointer: `.crew/config.json`

Inside each connected project, `.crew/config.json` looks like this:

```json
{
  "version": 1,
  "teamRoot": "{personal crew directory}",
  "projectKey": null
}
```

That `teamRoot` field is the magic. When Crew's resolution system sees it, the project enters **remote mode**. Here's how the two modes compare:

| | **Local mode** (default) | **Remote mode** (personal crew) |
|---|---|---|
| Team identity | `.crew/` in project | Personal crew directory (global) |
| Decisions & logs | `.crew/` in project | `.crew/` in project |
| Agents shared? | No — project only | Yes — across all connected projects |
| Skills shared? | No | Yes |

In remote mode:

- **Team identity** (agents, charters, skills, casting) → loaded from your personal crew directory
- **Project-local state** (decisions, logs, orchestration-log) → stays in this project's `.crew/`

The resolution system walks up directories looking for `.crew/`. When it finds one with a `teamRoot` in `config.json`, it switches to remote mode — pulling team identity from the external path while keeping project state local.

### Why the split matters

Your agents know you across projects. They remember your conventions. But each project has its own decisions and logs.

The API project doesn't get cluttered with the frontend project's session history. The Discord bot's architectural decisions stay in the Discord bot. Clean separation — shared brain, local memory.

---

## 4. Use Case: Your Side Projects Get a Team

You have three side projects. A CLI tool, a web app, a Discord bot. All different stacks. All just you.

```bash
# Already done once
crew init --global

# Connect each project
cd ~/projects/cli-tool && crew init
cd ~/projects/web-app && crew init
cd ~/projects/discord-bot && crew init
```

Now when you open any of them:

```
> Fredo, set up the database layer.
```

Fredo already knows you prefer PostgreSQL. He knows you use Zod for validation. He picked that up from working on your CLI tool last week. You didn't tell him again — he remembered.

Your Lead reviews code the same way in every repo. Your Tester follows the same patterns. Three projects, one consistent team.

Without a personal crew, you'd re-explain your conventions every time you start a new project. With one, the onboarding is already done.

---

## 5. Use Case: Code Review Across Repos

Your Lead agent reviews every pull request in every project. But more than that — they remember architectural decisions from *other* repos.

```
> Michael, review this new endpoint.
```

```
🏗️ Michael — reviewing /api/users endpoint

Looks good. Two notes:
  - In your CLI tool, you standardized on cursor-based pagination.
    This endpoint uses offset pagination. Intentional?
  - Missing rate limiting. We added this as a skill after the
    auth module in your web app.
```

Michael isn't just reviewing code in isolation. He's cross-referencing decisions and skills from your other projects. That's the personal crew at work — knowledge that spans repos.

The more projects you connect, the richer these reviews become. Your Lead builds a mental model of how *you* build software, not just how one project works.

---

## 6. Use Case: Learning a New Codebase

You join an open-source project. New repo, unfamiliar code. But your agents already know *you*.

For projects you don't own — OSS contributions, client work, temporary collaborations — use **consult mode**. Your team consults invisibly, and the project never knows Crew was there:

```bash
cd ~/projects/new-oss-contribution
crew consult
```

Your personal crew is copied into the project's `.crew/` directory, hidden via `.git/info/exclude`. The agents don't know the codebase yet — they'll learn it. But they already know your preferences:

- How you like code structured
- What testing patterns you follow
- Your communication style (direct? exploratory? detail-oriented?)

```
> Team, help me understand this codebase. Where's the entry point
> and how does routing work?
```

Your agents explore the repo with your familiar voice. They ask the questions you'd ask. The codebase is new — but your relationship with your team isn't.

When you're done, extract the generic learnings back to your personal crew and clean up:

```bash
crew extract --clean
```

It's not a cold start. It's your team meeting a new project.

> 📖 **Full guide:** [Consult Mode](../features/consult-mode.md) — invisible consulting, learning extraction, license handling.

---

## 7. Use Case: Automating Your Personal Workflow

Your personal crew isn't just for writing code. It's a workflow tool.

Set a directive once:

```
> Always run linting before marking a task done.
```

```
📌 Captured. Linting required before task completion.
```

That directive is now in your personal crew directory — every project, every session. Your agents enforce it everywhere. You set the standard once and it sticks.

Over time, your personal crew becomes an opinionated workflow engine. Not because you configured it that way — because you worked with it and it learned.

---

## 8. Use Case: Skills That Grow Everywhere

Skills accumulate in your personal crew directory under `skills/`. Every project contributes.

After a few weeks:

```
{personal crew directory}/skills/
  always-use-zod.md
  prefer-tailwind.md
  cursor-pagination.md
  rate-limit-auth-endpoints.md
  structured-logging.md
  error-boundaries-in-react.md
```

These came from different projects. The Zod skill was learned in your API. The Tailwind preference was captured in your web app. The rate-limiting skill came from a code review rejection.

Now every new project starts with all of that knowledge baked in. Your agents don't make the same mistakes twice — in any repo.

This is the long game. Early sessions feel similar to project-local crews. But after a few weeks of cross-project work, the difference is real. Your skills directory becomes a personal engineering handbook that your agents actually read.

---

## 9. Where It's Headed

Honest moment: this is new. Personal crews work, but they're early.

What works well today:
- Shared team identity across projects
- Skills that accumulate and carry over
- Consistent agent behavior everywhere you work
- **Consult mode** — bring your team to projects you don't own, invisibly ([docs](../features/consult-mode.md))

What's still rough:
- No sync mechanism between machines yet — your personal crew directory is local to your machine
- Project keys aren't used for anything yet (that `null` in config.json)
- No UI for browsing your global skills or agent histories (it's files for now)

We're building in the open. If something feels off, [open an issue](https://github.com/Blacklite/crew/issues). If something feels right, we want to hear about that too.

---

## Tips

- **Git-first workflow is strongly recommended.** Commit your project `.crew/` directory to git after any session. Without version control:
  - Session state could be lost on crashes, context resets, or machine reboots
  - Project-local decisions and logs are at risk
  - Accidental deletions may be unrecoverable
  - Cross-project context could vanish
  
  Think of git as your insurance policy for your project's local state. It's a good habit: after a session ends, run `git add .crew/ && git commit -m "crew: project state"`. (Agent histories, skills, and team identity are stored in your personal crew directory — not in project repos.)

- **Commit project `.crew/` but not personal crew directory.** The project-local state (decisions, logs) belongs in version control. Your global identity (agents, skills, casting) is personal — keep it out of repos.
  ```bash
  # DO THIS
  git add .crew/
  git commit -m "crew: project state"
  
  # DON'T commit your personal crew directory (~/.config/crew/ or similar) — it's machine-specific
  ```

- **Check status anytime.** `crew status` shows your global crew directory and which projects are connected.
- **Skills are the payoff.** The more projects you work across, the more skills accumulate. After a month, your agents have a real knowledge base tailored to how *you* build software.
- **It's just files.** Your personal crew directory is a folder on your machine. You can browse it, edit it, back it up, copy it to another machine manually. No magic, no cloud, no lock-in. But **always back up or version-control your `.crew/` state**.
- **Global install matters.** `npm install -g @blacklite/crew-cli` gives you the `crew` command everywhere. Without it, you'd need `npx` in each project. Global CLI + global crew = full portability.

---

## What to Try Next

- [**Your First Session**](../get-started/first-session.md) — The full walkthrough from zero to fan-out
- [**Solo Dev Scenario**](../scenarios/solo-dev.md) — Crew for one-person teams
- [**Tips & Tricks**](tips-and-tricks.md) — Patterns that work
