## SDK Init Shore-Up — Umbrella Issue

**Consolidates:** #337, #338, #339, #340, #341, #342

### Problem

`crew init --sdk` produces incomplete crew state. Three critical gaps:

1. **Config ↔ team.md sync broken** (#337) — Adding/removing members updates team.md but never touches crew.config.ts
2. **Built-in members missing** (#338, #339) — Ralph and @copilot work in CLI crews but are invisible to SDK consumers
3. **CastingEngine bypassed** (#342) — CLI init uses raw LLM prompts, ignoring curated universe templates

### Solution: 3-Phase Plan

**Phase 1 — Fix the Gaps** (P1, Small)
- [ ] #337 — Config ↔ team.md sync: update crew.config.ts when members change
- [ ] #338 — Include Ralph in generated crew.config.ts
- [ ] #339 — Add @copilot to team.md roster and crew.config.ts

**Phase 2 — Wire CastingEngine** (P1, Medium)
- [ ] #342 — Integrate CastingEngine into CLI init flow (augment LLM proposals with curated templates)

**Phase 3 — Exercise Test Matrix** (P2, Large)
- [ ] #340 — 29 features need active exercise testing
- [ ] #341 — Full parity test results (32/50 verified, gaps identified)

### PRD & Analysis

- Full PRD: `.crew/identity/prd-sdk-init-shoreup.md`
- Technical Analysis: `.crew/identity/sdk-init-technical-analysis.md`
- Implementation Roadmap: `.crew/identity/sdk-init-implementation-roadmap.md`

### Open Design Questions

1. AST vs regex for crew.config.ts mutations
2. CastingEngine: augment LLM proposals (recommended) or replace entirely?
3. Ralph charter: create one, or document as "built-in, no charter"?

### Success Criteria

- `crew init --sdk` generates config with all team members including Ralph and @copilot
- Adding/removing members updates crew.config.ts automatically
- CastingEngine templates used during init (not bypassed)
- Test matrix at 90%+ verified features
