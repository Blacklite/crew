# Crew Is Now Public

Crew, the AI agent team framework for GitHub Copilot, moves from private repo to public distribution on npm.

## What Is Crew?

**AI agent teams for any project.** Describe what you're building. Get a team of specialists — lead, frontend, backend, tester, DevRel — that live in your repo, learn your codebase, and persist across sessions. Not a chatbot. A real team.

## What Changed

| | Before | Now |
|---------|--------|-----|
| Repository | Private (Blacklite/crew-pr) | **[Public](https://github.com/Blacklite/crew)** |
| Distribution | `npx github:Blacklite/crew` (removed) | `npm install -g @blacklite/crew-cli` |
| Versioning | Git commits | Semantic versioning (v0.8.18) |
| Packages | Monolithic `@bradygaster/create-crew` | **Separate:** `@blacklite/crew-cli` + `@blacklite/crew-sdk` |

## Get Started in 3 Commands

```bash
npm install -g @blacklite/crew-cli
crew init
copilot
```

Then in Copilot: `/agent` → select **Crew** → describe your project.

## Key Links

- **Repository:** [github.com/Blacklite/crew](https://github.com/Blacklite/crew)
- **Migration guide:** [docs/get-started/migration.md](https://github.com/Blacklite/crew/blob/main/docs/get-started/migration.md)
- **Samples:** [samples/](https://github.com/Blacklite/crew/tree/main/samples) — hello-crew, rock-paper-scissors, streaming-chat, hook-governance, and more
- **Full blog post:** [docs/blog/021-the-migration.md](https://github.com/Blacklite/crew/blob/main/docs/blog/021-the-migration.md)
- **README:** [github.com/Blacklite/crew](https://github.com/Blacklite/crew#what-is-crew)

## For Beta Users

If you're on v0.5.4, upgrade with:

```bash
npm uninstall -g @bradygaster/create-crew
npm install -g @blacklite/crew-cli
cd your-crew-project
crew upgrade
```

See the [migration guide](https://github.com/Blacklite/crew/blob/main/docs/get-started/migration.md) for details.

---

**Crew** — AI agent teams for any project. Open source. On npm. Ready now.

[Get started →](https://github.com/Blacklite/crew)
