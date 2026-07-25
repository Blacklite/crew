# Combining Knowledge from Multiple Crews

**Try this to coordinate cross-team work:**
```
I have two teams — one on frontend, one on backend. How do I coordinate work between them?
```

**Try this to share skills across projects:**
```
Export skills from my React project and import them into this new project
```

You can import one full crew at a time, but you can cherry-pick skills from multiple exports manually. Best practice: merge teams, don't run parallel crews.

---

## 1. The Reality: One Full Crew at a Time

You have 3 repos with trained crews. You're starting a new project and want the best of all of them.

Crew's import system brings in a complete team — roster, charters, histories, skills, decisions. You can only import one full crew cleanly.

**But** you can cherry-pick skills and knowledge manually.

> **Want continuous coordination instead?** If you need crews on different machines to see each other's live state (not just import once), see [Distributed Mesh](../features/distributed-mesh.md) — it syncs remote crew state via git and HTTP.

---

## 2. Export from Each Repository

In each repo with a trained crew:

```bash
cd ~/projects/saas-app
crew export
```

```
📦 Exporting crew to crew-export-2025-07-15.zip
✅ Export complete: crew-export-2025-07-15.zip

Contains:
  - Roster (5 agents)
  - Charters (4 agent charters)
  - Skills (23 skills)
  - Decisions
  - Histories (project-specific context removed)
```

Repeat for your other repos:

```bash
cd ~/projects/mobile-app
crew export
# Produces: crew-export-2025-07-15-1.zip

cd ~/projects/api-gateway
crew export
# Produces: crew-export-2025-07-15-2.zip
```

You now have three export archives.

---

## 3. Import the Most Relevant Crew

Pick the crew whose domain knowledge is closest to your new project.

```bash
cd ~/projects/new-platform
git init
npm install -g @blacklite/crew-cli
crew init
```

```
> Import a crew from crew-export-saas-app.zip
```

```
✅ Crew imported
   5 agents, 23 skills, 47 decisions, histories loaded

Crew initialized. Run copilot --agent crew and tell it what you're building.
```

This crew is now your baseline.

---

## 4. Cherry-Pick Skills from Other Crews

You can't import a second full crew without conflicts, but you **can** manually copy individual skill files.

Extract the other two exports and copy skill files:

```bash
# Extract the mobile-app crew export
unzip crew-export-mobile-app.zip -d /tmp/mobile-crew

# Copy specific skills you want
cp /tmp/mobile-crew/.ai-team/skills/react-native-debugging.md .ai-team/skills/
cp /tmp/mobile-crew/.ai-team/skills/mobile-testing-patterns.md .ai-team/skills/
```

Repeat for the API gateway crew:

```bash
unzip crew-export-api-gateway.zip -d /tmp/gateway-crew

cp /tmp/gateway-crew/.ai-team/skills/rate-limiting-patterns.md .ai-team/skills/
cp /tmp/gateway-crew/.ai-team/skills/auth-middleware-testing.md .ai-team/skills/
```

Skills are standalone markdown files. Agents load them automatically.

---

## 5. Manually Merge History Insights (Optional)

If another crew learned something critical that isn't in a skill file, you can manually append it to an agent's history.

Open `.ai-team/agents/{agent-name}/history.md` and add the knowledge as a session entry:

```markdown
## Session: 2025-07-15

### Context from previous crew (API Gateway project)
- GraphQL resolvers should always validate auth before query execution
- Rate limiting uses token bucket algorithm with Redis backing store
- Circuit breaker pattern wraps all downstream API calls
```

This becomes part of the agent's memory.

---

## 6. Tell Agents About Cross-Project Knowledge

When you give your first task, reference the knowledge you brought in:

```
> Team, we've combined learnings from three previous projects:
> the SaaS app, the mobile app, and the API gateway.
> You have skills from all three. The SaaS patterns are your baseline,
> but we've also imported mobile testing strategies and gateway
> rate-limiting patterns. Use them.
```

```
📋 Scribe — logged cross-project context
```

Agents now know they have hybrid knowledge.

---

## 7. Alternative: Use --force for Full Reimport (Destructive)

If you want to **replace** your imported crew with a different one:

```bash
crew import crew-export-mobile-app.zip --force
```

This **overwrites** the existing crew. Use only if you're sure.

---

## Tips

- **One full import, then cherry-pick.** Import the crew with the closest domain match, then manually copy skills from the others.
- **Skills are modular.** Each skill file is independent. Copy the ones you need, ignore the rest.
- **Histories are context-heavy.** Don't import histories from unrelated projects — they contain project-specific details that will confuse agents.
- **Decisions can be manually merged.** If another crew made architectural decisions you want to preserve, copy them into `.ai-team/decisions.md` as new entries.
- **Skill files are the cleanest transfer.** They're generic, portable, and immediately useful across projects.
