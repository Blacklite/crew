# Mission Control — crew-sdk

> The programmable multi-agent runtime for GitHub Copilot.
> *"Failure is not an option."*

## Coordinator

| Name | Role | Notes |
|------|------|-------|
| Crew | Coordinator | Routes work, enforces handoffs and reviewer gates. Does not generate domain artifacts. |

## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
| Flight | Lead | `.crew/agents/flight/charter.md` | ✅ Active |
| Procedures | Prompt Engineer | `.crew/agents/procedures/charter.md` | ✅ Active |
| EECOM | Core Dev | `.crew/agents/eecom/charter.md` | ✅ Active |
| FIDO | Quality Owner | `.crew/agents/fido/charter.md` | ✅ Active |
| PAO | DevRel | `.crew/agents/pao/charter.md` | ✅ Active |
| CAPCOM | SDK Expert | `.crew/agents/capcom/charter.md` | ✅ Active |
| CONTROL | TypeScript Engineer | `.crew/agents/control/charter.md` | ✅ Active |
| Surgeon | Release Manager | `.crew/agents/surgeon/charter.md` | ✅ Active |
| Booster | CI/CD Engineer | `.crew/agents/booster/charter.md` | ✅ Active |
| GNC | Node.js Runtime | `.crew/agents/gnc/charter.md` | ✅ Active |
| Network | Distribution | `.crew/agents/network/charter.md` | ✅ Active |
| RETRO | Security | `.crew/agents/retro/charter.md` | ✅ Active |
| INCO | CLI UX & Visual Design | `.crew/agents/inco/charter.md` | ✅ Active |
| GUIDO | VS Code Extension | `.crew/agents/guido/charter.md` | ✅ Active |
| Telemetry | Aspire & Observability | `.crew/agents/telemetry/charter.md` | ✅ Active |
| VOX | REPL & Interactive Shell | `.crew/agents/vox/charter.md` | ✅ Active |
| DSKY | TUI Engineer | `.crew/agents/dsky/charter.md` | ✅ Active |
| Sims | E2E Test Engineer | `.crew/agents/sims/charter.md` | ✅ Active |
| Handbook | SDK Usability | `.crew/agents/handbook/charter.md` | ✅ Active |
| Scribe | Session Logger | `.crew/agents/scribe/charter.md` | 📋 Silent |
| Ralph | Work Monitor | — | 🔄 Monitor |

## Coding Agent

<!-- copilot-auto-assign: false -->

| Name | Role | Charter | Status |
|------|------|---------|--------|
| @copilot | Coding Agent | — | 🤖 Coding Agent |

### Capabilities

**🟢 Good fit — auto-route when enabled:**
- Bug fixes with clear reproduction steps
- Test coverage (adding missing tests, fixing flaky tests)
- Lint/format fixes and code style cleanup
- Dependency updates and version bumps
- Small isolated features with clear specs
- Boilerplate/scaffolding generation
- Documentation fixes and README updates

**🟡 Needs review — route to @copilot but flag for crew member PR review:**
- Medium features with clear specs and acceptance criteria
- Refactoring with existing test coverage
- API endpoint additions following established patterns
- Migration scripts with well-defined schemas

**🔴 Not suitable — route to crew member instead:**
- Architecture decisions and system design
- Multi-system integration requiring coordination
- Ambiguous requirements needing clarification
- Security-critical changes (auth, encryption, access control)
- Performance-critical paths requiring benchmarking
- Changes requiring cross-team discussion

### Git Workflow

When working on issues, follow the Crew branching model:
- Branch from `dev` (not main): `git checkout dev && git pull && git checkout -b crew/{issue-number}-{slug}`
- Create PRs targeting `dev`: `gh pr create --base dev`
- Use branch naming convention: `crew/{issue-number}-{kebab-case-slug}`
- After merge, delete branch and switch back to dev

## Project Context

- **Owner:** Brady
- **Stack:** TypeScript (strict mode, ESM-only), Node.js ≥20, @github/copilot-sdk, Vitest, esbuild
- **Description:** The programmable multi-agent runtime for GitHub Copilot — v1 replatform of Crew beta
- **Distribution:** npm (`npm install -g @blacklite/crew-cli` for CLI, `npm install @blacklite/crew-sdk` for SDK)
- **Universe:** Apollo 13 / NASA Mission Control
- **Created:** 2026-02-21
