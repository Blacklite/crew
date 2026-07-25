# Keeping Your Crew Across Many Projects

**Try this to prevent re-casting:**
```
I want to keep my current team — don't cast a new one for this project
```

**Try this to save your team:**
```
Export my crew so I can use them on another repo
```

**Try this to load a saved team:**
```
Import the team from crew-export.json
```

Your crew remembers skills, casting, and knowledge. Export them from one project, import into another. They bring all their accumulated expertise with them.

---

## 1. Your Crew Remembers

Crew persistence and portability. Your crew remembers skills, casting, and knowledge. Take them everywhere.

After working on a project for a few weeks, your crew has learned:

- **Skills** — patterns, conventions, best practices (23 skill files in `.ai-team/skills/`)
- **Decisions** — architectural choices, why you picked X over Y (`.ai-team/decisions.md`)
- **Histories** — project-specific context each agent accumulated (`.ai-team/agents/{name}/history.md`)
- **Casting state** — the chosen agent names, roles, universe (`.ai-team/casting-state.json`)

All of this lives in `.ai-team/`. Commit it, and anyone who clones your repo gets the full team.

---

## 2. Export Your Crew

When you finish a project or want to take your crew to a new one:

```bash
cd ~/projects/finished-saas-app
crew export
```

```
📦 Exporting crew to crew-export-2025-07-15.zip

✅ Export complete: crew-export-2025-07-15.zip

Contains:
  - Roster (5 agents)
  - Charters (4 agent charters)
  - Skills (23 skills — portable knowledge)
  - Decisions (architectural decisions)
  - Histories (project-specific context removed)
  - Casting state (agent names, universe)
```

**Important:** The export **removes project-specific details** from histories. What remains is **portable knowledge** — skills, decisions, patterns. Not "we use PostgreSQL in this repo," but "always validate input with Zod."

---

## 3. Import Your Crew Into a New Project

Start a new project:

```bash
mkdir ~/projects/new-mobile-app
cd ~/projects/new-mobile-app
git init
npm install -g @blacklite/crew-cli
crew init
```

When Crew asks what you're building:

```
> Import my crew from crew-export-2025-07-15.zip
```

```
✅ Crew imported

Your team:
  🏗️  Neo      — Lead
  ⚛️  Trinity  — Frontend Dev
  🔧  Morpheus — Backend Dev
  🧪  Tank     — Tester
  📋  Scribe   — (silent)

23 skills loaded
47 decisions loaded
Agent histories loaded (generic knowledge only)

Your crew is ready. What's the project?
```

Now describe the new project:

```
> This is a React Native app for tracking fitness goals.
> TypeScript, Expo, Firebase backend.
```

Agents already know:

- TypeScript conventions (from skills)
- Testing patterns (from skills)
- Decision-making norms (from decisions)
- Their own specialties (from histories)

But they **don't** know the old project's code structure — that was stripped from the export.

---

## 4. What Carries Over vs What Doesn't

### ✅ Portable knowledge (carries over):

- **Skills** — generic patterns ("always rate-limit auth endpoints")
- **Decisions** — architectural reasoning ("why we chose WebSockets over polling")
- **Casting state** — agent names, universe theme
- **Agent roles** — who does what

### ❌ Project-specific details (stripped):

- "The users table has 12 columns"
- "The API is at /server/routes/"
- "We use Prisma with PostgreSQL"
- File paths, module names, specific code references

This is intentional. Skills are **reusable**. Project details are **not**.

---

## 5. Version Upgrades Don't Touch `.crew/`

When Crew releases a new version:

```bash
npm install -g @blacklite/crew-cli@latest
crew upgrade
```

```
🔄 Upgrading Crew from v0.1.5 to v0.2.0

✅ .github/agents/crew.agent.md (updated to v0.2.0)
✅ .ai-team-templates/ (new workflow templates)
✅ .gitattributes (merge=union rules verified)

⚠️  Your .ai-team/ directory was NOT modified.
   Your team's memory, skills, and decisions are untouched.
```

Upgrades only change:

- The Crew agent definition (`.github/agents/crew.agent.md`)
- Workflow templates (`.ai-team-templates/`)
- The installer itself

Your **team's knowledge is safe**.

---

## 6. Git Commit Means Everyone Gets the Team

You commit `.ai-team/`:

```bash
git add .ai-team/
git commit -m "Add Crew team with 3 weeks of accumulated knowledge"
git push
```

A teammate clones the repo:

```bash
git clone https://github.com/yourname/new-mobile-app.git
cd new-mobile-app
copilot
```

They select **Crew** from `/agents`. The full team loads instantly — same agents, same skills, same knowledge.

No re-training. No setup. The crew is **in the repo**.

---

## 7. Long-Lived Crews

Some crews persist across multiple projects over months or years:

1. **Start project A** — crew learns TypeScript, React, testing conventions
2. **Export** → `crew-export-v1.zip`
3. **Start project B** — import the crew, they already know TypeScript patterns
4. **Crew learns Firebase** — new skills accumulated
5. **Export** → `crew-export-v2.zip`
6. **Start project C** — import v2, crew now knows TypeScript + Firebase
7. **Crew learns GraphQL** — more skills
8. **Export** → `crew-export-v3.zip`

Your crew becomes **more valuable over time**. Each project adds to their knowledge.

---

## 8. Sample Prompts for Long-Lived Crews

**Starting a new project with an experienced crew:**

```
> This is a new e-commerce site. You've worked on 3 projects with me
> before, so you know our TypeScript conventions and testing patterns.
> Use what you know.
```

**After a project ends:**

```
> Export the crew. We're taking everything we learned here to the
> next project.
```

**Mid-project knowledge checkpoint:**

```
> Scribe, review what the team has learned so far. Which skills and
> decisions are generic enough to carry to other projects?
```

---

## Tips

- **Export often.** At the end of each project or after a major milestone, export your crew. It's your team backup.
- **Generic skills are gold.** Skills like "always validate input" are reusable everywhere. Project-specific notes like "our API is at /api/v2" are not.
- **Casting state persists.** If your team is Neo, Trinity, Morpheus, they stay that way across projects. Consistent names build familiarity.
- **Import, don't rebuild.** Starting fresh every project wastes the knowledge you've accumulated. Always import your latest crew export.
- **Your crew gets smarter.** After 5 projects, your crew has seen more patterns than most junior developers.
