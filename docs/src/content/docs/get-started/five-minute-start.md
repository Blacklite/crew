# Quick start

> ⚠️ **Experimental** — Crew is alpha software. APIs, commands, and behavior may change between releases.

Your first 5 minutes with Crew. Prove it works before you learn anything.

---

## Prerequisites

- **Node.js 20+** — Check with `node --version`
- **Git repository** — New or existing

---

## Install

```bash
npm install --save-dev @blacklite/crew-cli
```

Then initialize:

```bash
npx crew init
```

You'll see:

```
✅ Crew installed.
   .github/agents/crew.agent.md — coordinator agent
   .crew/templates/ — 11 template files

Open GitHub Copilot and select Crew from the agent list.
```

---

## Validate

Check that Crew created your team directory:

```bash
ls .crew/
```

You should see: `team.md`, `routing.md`, `decisions.md`, `agents/`, and more.

Confirm Crew is ready:

```bash
npx crew status
```

---

## Try it

Open GitHub Copilot in your terminal or VS Code. Select **Crew** from the agent list (`/agent Crew` in CLI or `/agents` in VS Code).

Say something simple:

```
> I'm building a task management app with React and Node.js.
> Users can create, update, and delete tasks.
```

Crew forms your team and responds with agent names and roles. Say yes, or just give your first task:

```
> Team, create a basic Express server with a /health endpoint.
```

Crew spawns agents and does the work.

---

## What just happened?

Crew read your description, formed a team of specialists, wrote their charters to `.crew/agents/`, and coordinated parallel work. Check `.crew/decisions.md` to see what they decided.

---

## Next steps

[**Your first session**](first-session) — Step-by-step walkthrough of parallel work, decisions, and memory.
