# SDK Init Implementation Roadmap

> Deep dive analysis and implementation plan for `crew init --sdk`

**Author:** EECOM (Core Dev)  
**Date:** 2025-03-08  
**Purpose:** Trace the complete init flow, identify gaps, and roadmap fixes for the unified PRD

---

## 1. CURRENT INIT FLOW — END-TO-END TRACE

### 1.1 CLI Entry → Init Handler

**File:** `packages/crew-cli/src/cli-entry.ts`

```
Line 227: if (cmd === 'init')
Line 228-241: Parse --mode, --global, --no-workflows, --sdk flags
Line 246: Call runInit(dest, { includeWorkflows, sdk })
```

**What happens:**
- `--sdk` flag is captured and passed to `runInit()` as `options.sdk`
- No other init-time processing — flag is just forwarded

### 1.2 runInit → SDK initCrew

**File:** `packages/crew-cli/src/cli/core/init.ts`

```typescript
Line 87: export async function runInit(dest: string, options: RunInitOptions = {})
Line 106-125: Build SDK InitOptions object
Line 116: configFormat: options.sdk ? 'sdk' : 'markdown'
Line 138: result = await sdkInitCrew(initOptions)
```

**What happens:**
- CLI options are transformed into SDK `InitOptions`
- `configFormat` is set to `'sdk'` when `--sdk` is true
- Only **Scribe** is included in the agents array (hardcoded line 110-115)
- **NO coordinator prompts at this stage** — that only happens in the REPL shell

### 1.3 SDK initCrew → File Generation

**File:** `packages/crew-sdk/src/config/init.ts`

```typescript
Line 530: export async function initCrew(options: InitOptions): Promise<InitResult>
Line 573-591: Create .crew/ directory structure
Line 594-637: Create .crew/config.json (NOT crew.config.ts)
Line 640-657: Create config file (crew.config.ts OR crew.config.json OR skip)
Line 646: configFileName = configFormat === 'sdk' ? 'crew.config.ts' : ...
Line 649: configContent = configFormat === 'sdk' ? generateSDKBuilderConfig(options) : ...
Line 664-678: Create agent directories and files (charter.md, history.md)
Line 745-770: Create team.md (empty roster)
Line 774-793: Create routing.md
```

**What files are created (--sdk path):**

1. `.crew/` directory structure
2. `.crew/config.json` — crew settings (platform, extraction, etc.)
3. `crew.config.ts` — SDK builder config (defineCrew/defineTeam/defineAgent)
4. `.crew/agents/scribe/charter.md`
5. `.crew/agents/scribe/history.md`
6. `.crew/identity/now.md`
7. `.crew/identity/wisdom.md`
8. `.crew/ceremonies.md`
9. `.crew/decisions.md`
10. `.crew/team.md` — **empty roster** (no Members table entries)
11. `.crew/routing.md`
12. `.crew/templates/` (if includeTemplates)
13. `.github/workflows/` (if includeWorkflows)
14. `crew.agent.md` (Copilot prompt template)
15. `.init-prompt` (if options.prompt is provided)

**CRITICAL GAP:** `crew.config.ts` is generated with hardcoded Scribe only. No entries for team members that will be added later.

---

## 2. REPL AUTO-CAST FLOW (PHASE 1 + PHASE 2)

### 2.1 Shell Launch → Init Mode Detection

**File:** `packages/crew-cli/src/cli/shell/lifecycle.ts`

```typescript
Line 58-100: async initialize()
Line 82: this.discoveredAgents = parseTeamManifest(teamContent)
Line 84-90: If no agents found, check for .init-prompt file
```

**What happens:**
- Shell reads `team.md`
- If `## Members` table is empty, enters "Auto-Cast Mode"
- If `.init-prompt` exists (from `crew init "prompt"`), uses that prompt
- Otherwise, prompts user to describe project

### 2.2 Init Mode → Coordinator Proposal (Phase 1)

**File:** `packages/crew-cli/src/cli/shell/index.ts`

```typescript
Line 382: async function handleInitCast(parsed: ParsedInput, skipConfirmation?: boolean)
Line 386-393: Check for .init-prompt file
Line 402-415: Create Init Mode coordinator session
Line 410: const initSysPrompt = buildInitModePrompt({ teamRoot })
Line 419-435: Send prompt and collect response
Line 438: const proposal = parseCastResponse(accumulated)
```

**What happens:**
- Creates a **temporary coordinator session** with Init Mode prompt
- Init Mode prompt (from `coordinator.ts`) instructs coordinator to propose a team
- Response is parsed into a `CastProposal` (name, role, scope, universe)
- **NO file writes yet** — just a proposal

**Init Mode Prompt:** `packages/crew-cli/src/cli/shell/coordinator.ts` line 42-86

### 2.3 User Confirmation → Finalize Cast (Phase 2)

**File:** `packages/crew-cli/src/cli/shell/index.ts`

```typescript
Line 456-474: If not skipConfirmation, show proposal and wait for y/n
Line 489: async function finalizeCast(proposal: CastProposal, parsed: ParsedInput)
Line 492: const result = await createTeam(teamRoot, proposal)
```

**What happens:**
- User confirms with "y"
- `createTeam()` is called (from `cast.ts`)
- **All team files are created** (see section 2.4)
- Re-dispatches original user message to the new team

### 2.4 createTeam → File Generation

**File:** `packages/crew-cli/src/cli/core/cast.ts`

```typescript
Line 367: export async function createTeam(teamRoot: string, proposal: CastProposal)
Line 380-411: Create agent directories (charter.md, history.md)
Line 414-457: Update team.md (insert Members table)
Line 459-486: Update routing.md (insert routing table)
Line 489-525: Create casting/ files (registry.json, history.json, policy.json)
```

**What files are created/updated:**

1. `.crew/agents/{name}/charter.md` (for each member)
2. `.crew/agents/{name}/history.md` (for each member)
3. `.crew/team.md` — **updated** with Members table
4. `.crew/routing.md` — **updated** with routing table
5. `.crew/casting/registry.json` — agent registry
6. `.crew/casting/history.json` — casting snapshot
7. `.crew/casting/policy.json` — universe policy

**CRITICAL GAP:** `crew.config.ts` is **NOT** updated with new team members.

---

## 3. ADD TEAM MEMBER FLOW

### 3.1 During Phase 2 (REPL auto-cast)

**Current State:**
- Members are added by `createTeam()` function
- Files created: charter.md, history.md
- Files updated: team.md, routing.md, casting/registry.json

**Gap:**
- `crew.config.ts` is **NOT** updated with new `defineAgent()` entries

### 3.2 After Phase 2 (manual add later)

**Current State:**
- **NO built-in command** for adding team members after init
- Users must manually:
  1. Create `.crew/agents/{name}/` directory
  2. Write `charter.md` and `history.md`
  3. Update `team.md` Members table
  4. Update `routing.md` routing table
  5. Update `.crew/casting/registry.json`
  6. **Manually update `crew.config.ts`** (if using --sdk mode)

**Gap:**
- No `crew hire` or `crew add-member` command exists
- No automated flow for adding members to SDK config

---

## 4. REMOVE TEAM MEMBER FLOW

### 4.1 Current State

**NO built-in remove flow exists.**

Users must manually:
1. Remove agent directory (`.crew/agents/{name}/`)
2. Remove from `team.md` Members table
3. Remove from `routing.md` routing table
4. Remove from `.crew/casting/registry.json`
5. **Manually remove from `crew.config.ts`** (if using --sdk mode)

**Gap:**
- No `crew remove-member` command
- No cleanup utilities
- No crew.config.ts sync

---

## 5. RALPH & @COPILOT PLACEMENT

### 5.1 Ralph (Work Monitor)

**Current State:**
- Ralph is **automatically added** by `createTeam()` if not already present
- Charter template exists in `cast.ts` (line 329-336)
- Added to team.md, routing.md, casting/registry.json

**Gap:**
- Ralph is **NOT** added to `crew.config.ts` during auto-cast
- No `defineAgent('ralph', ...)` entry

**Where Ralph SHOULD be created:**
- During `createTeam()` when casting a team (auto-cast Phase 2) ✅ (partially works)
- During `crew init --sdk` if user provides a prompt ❌ (missing)
- Ralph should be in `crew.config.ts` ❌ (missing)

### 5.2 @copilot (Coding Agent)

**Current State:**
- `crew copilot` command exists (`packages/crew-cli/src/cli/commands/copilot.ts`)
- Command can add/remove @copilot entry in `team.md`
- Creates `.crew/agents/copilot/` directory

**Gap:**
- `copilot` command does **NOT** update `crew.config.ts`
- No `defineAgent('copilot', ...)` entry is added

**Where @copilot SHOULD be offered:**
- During `crew init` (optional, with flag like `--with-copilot`) ❌ (missing)
- Via `crew copilot` command (currently only updates team.md) ⚠️ (partial)

---

## 6. CASTINGENGINE INTEGRATION

### 6.1 Current State

**File:** `packages/crew-sdk/src/casting/casting-engine.ts`

```typescript
export class CastingEngine {
  getUniverses(): UniverseId[]
  getUniverse(id: UniverseId): UniverseTemplate | undefined
  castTeam(config: CastingConfig): CastMember[]
}
```

**What it does:**
- Provides universe templates (Usual Suspects, Ocean's Eleven)
- Maps roles to characters with personality and backstory
- Returns `CastMember[]` with name, role, personality, backstory

**Gap:**
- CastingEngine is **NEVER called** during CLI init
- Init Mode coordinator uses an **LLM prompt** to generate teams (not CastingEngine)
- No integration point exists

### 6.2 Where CastingEngine SHOULD be integrated

**Option A: Replace Init Mode prompt with CastingEngine**
- Pro: Deterministic, no LLM needed for team proposals
- Con: Less flexible, no user input interpretation
- Integration point: `handleInitCast()` in shell/index.ts

**Option B: Use CastingEngine to AUGMENT proposals**
- Pro: Keeps LLM flexibility, adds structured character data
- Con: More complex flow
- Integration point: After `parseCastResponse()`, before `createTeam()`

**Option C: Offer CastingEngine as an alternative init mode**
- Pro: Clean separation, users can choose
- Con: Adds CLI complexity
- Integration point: New flag like `--use-casting-engine` or `--universe <name>`

**Recommended:** Option B
- Keep Init Mode LLM for flexibility
- After parsing proposal, call `CastingEngine.castTeam()` to enrich members with personality/backstory
- Merge into charter.md generation

### 6.3 Integration API

**Proposed flow:**

```typescript
// In handleInitCast(), after parseCastResponse()
const proposal = parseCastResponse(accumulated);
if (!proposal) { /* error */ }

// NEW: Enrich with CastingEngine
const engine = new CastingEngine();
const enrichedMembers = enrichWithCasting(proposal, engine);
proposal.members = enrichedMembers;

// Continue to finalizeCast()
```

**New function:**

```typescript
function enrichWithCasting(
  proposal: CastProposal, 
  engine: CastingEngine
): CastMember[] {
  const universeId = mapUniverseName(proposal.universe);
  const roles = proposal.members.map(m => m.role as AgentRole);
  
  const castMembers = engine.castTeam({
    universe: universeId,
    teamSize: proposal.members.length,
    requiredRoles: roles,
  });
  
  // Merge cast data into proposal members
  return proposal.members.map((m, i) => ({
    ...m,
    personality: castMembers[i]?.personality || personalityForRole(m.role),
    backstory: castMembers[i]?.backstory || '',
  }));
}
```

**Where to add:** `packages/crew-cli/src/cli/shell/index.ts` (near handleInitCast)

---

## 7. IMPLEMENTATION ROADMAP

### 7.1 Fix 1: crew.config.ts Sync During Auto-Cast

**Problem:** `crew.config.ts` is not updated when team members are added during auto-cast.

**Files to modify:**
1. `packages/crew-cli/src/cli/core/cast.ts` — `createTeam()` function
2. New utility: `packages/crew-cli/src/cli/core/crew-config-sync.ts`

**What to change:**
- Add a check: if `crew.config.ts` exists in teamRoot
- Parse existing config using TypeScript AST or regex
- Append `defineAgent()` entries for new members
- Write back to `crew.config.ts`

**Dependencies:**
- Requires AST parser (TypeScript compiler API) or regex-based append
- Risk: High complexity for AST parsing, medium for regex

**Test files:**
- `test/init-sdk.test.ts` — add test for auto-cast + config sync
- `test/cast-parser.test.ts` — verify crew.config.ts update

**Risk Assessment:** 🟡 Medium
- AST parsing adds dependency on `typescript` package
- Regex-based append is fragile but simpler
- Edge case: User has customized crew.config.ts structure

---

### 7.2 Fix 2: crew.config.ts Update During CLI Init

**Problem:** `crew init --sdk` only creates Scribe in crew.config.ts, missing Ralph and other agents.

**Files to modify:**
1. `packages/crew-sdk/src/config/init.ts` — `initCrew()` function
2. `packages/crew-sdk/src/config/init.ts` — `generateSDKBuilderConfig()` function

**What to change:**
- Include Ralph in the default agents array when `configFormat === 'sdk'`
- Update `generateSDKBuilderConfig()` to include all agents from `options.agents`

**Code change:**

```typescript
// In initCrew(), line ~660-678
if (configFormat === 'sdk') {
  // Add Ralph to agents if not present
  const sdkAgents = [...agents];
  const hasRalph = agents.some(a => a.name === 'ralph');
  if (!hasRalph) {
    sdkAgents.push({ name: 'ralph', role: 'ralph', displayName: 'Ralph' });
  }
  
  // Generate config with all agents
  const configContent = generateSDKBuilderConfig({
    ...options,
    agents: sdkAgents,
  });
}
```

**Dependencies:** None

**Test files:**
- `test/init-sdk.test.ts` — verify Ralph is in crew.config.ts
- `test/init.test.ts` — verify Scribe and Ralph are both present

**Risk Assessment:** 🟢 Low
- Simple fix, no breaking changes

---

### 7.3 Fix 3: Add `crew hire` Command

**Problem:** No built-in command to add team members after init.

**Files to create:**
1. `packages/crew-cli/src/cli/commands/hire.ts` (new)

**Files to modify:**
1. `packages/crew-cli/src/cli-entry.ts` — add routing for `hire` command

**What to implement:**

```typescript
// New command: crew hire [--name <name>] [--role <role>]
export async function runHire(options: HireOptions): Promise<void> {
  // 1. Prompt for name and role (if not provided)
  // 2. Create .crew/agents/{name}/ directory
  // 3. Generate charter.md and history.md
  // 4. Update team.md Members table
  // 5. Update routing.md routing table
  // 6. Update .crew/casting/registry.json
  // 7. If crew.config.ts exists, append defineAgent() entry
  // 8. Success message
}
```

**Dependencies:**
- Reuse `generateCharter()` and `generateHistory()` from `cast.ts`
- Reuse crew.config.ts sync utility from Fix 1

**Test files:**
- `test/hire.test.ts` (new)

**Risk Assessment:** 🟡 Medium
- Requires interactive prompts (use `enquirer` or similar)
- crew.config.ts sync is complex

---

### 7.4 Fix 4: Add `crew remove-member` Command

**Problem:** No built-in command to remove team members.

**Files to create:**
1. `packages/crew-cli/src/cli/commands/remove-member.ts` (new)

**Files to modify:**
1. `packages/crew-cli/src/cli-entry.ts` — add routing

**What to implement:**

```typescript
// New command: crew remove-member <name>
export async function runRemoveMember(name: string): Promise<void> {
  // 1. Confirm removal (interactive prompt)
  // 2. Delete .crew/agents/{name}/ directory
  // 3. Remove from team.md Members table
  // 4. Remove from routing.md routing table
  // 5. Remove from .crew/casting/registry.json
  // 6. If crew.config.ts exists, remove defineAgent() entry
  // 7. Success message
}
```

**Dependencies:**
- crew.config.ts sync utility from Fix 1

**Test files:**
- `test/remove-member.test.ts` (new)

**Risk Assessment:** 🟡 Medium
- Removing from crew.config.ts is error-prone
- Risk of orphaned references in other files

---

### 7.5 Fix 5: @copilot Integration in Init

**Problem:** No way to add @copilot during `crew init`.

**Files to modify:**
1. `packages/crew-cli/src/cli-entry.ts` — add `--with-copilot` flag
2. `packages/crew-cli/src/cli/core/init.ts` — handle flag
3. `packages/crew-sdk/src/config/init.ts` — include @copilot agent

**What to change:**

```typescript
// In cli-entry.ts, line ~246
const withCopilot = args.includes('--with-copilot');
runInit(dest, { includeWorkflows, sdk, withCopilot });

// In init.ts, pass to SDK
const initOptions: InitOptions = {
  // ...
  agents: [
    { name: 'scribe', role: 'scribe', displayName: 'Scribe' },
    ...(options.withCopilot ? [{ name: 'copilot', role: 'developer', displayName: 'Copilot' }] : []),
  ],
};
```

**Dependencies:** None

**Test files:**
- `test/init.test.ts` — verify @copilot is created with flag

**Risk Assessment:** 🟢 Low

---

### 7.6 Fix 6: CastingEngine Integration

**Problem:** CastingEngine exists but is never used during init.

**Files to modify:**
1. `packages/crew-cli/src/cli/shell/index.ts` — `handleInitCast()` function
2. `packages/crew-cli/src/cli/core/cast.ts` — add enrichment function

**What to implement:**

```typescript
// In handleInitCast(), after parseCastResponse()
import { CastingEngine } from '@blacklite/crew-sdk/casting';

const proposal = parseCastResponse(accumulated);
if (!proposal) { /* error */ }

// NEW: Enrich with CastingEngine
const engine = new CastingEngine();
const enrichedProposal = enrichWithCasting(proposal, engine);

// Show proposal with enriched data
await finalizeCast(enrichedProposal, parsed);
```

**New function in cast.ts:**

```typescript
export function enrichWithCasting(
  proposal: CastProposal,
  engine: CastingEngine
): CastProposal {
  // Map universe name to CastingEngine universe ID
  const universeId = mapUniverseName(proposal.universe);
  
  // Cast team using CastingEngine
  const roles = proposal.members.map(m => m.role as AgentRole);
  const castMembers = engine.castTeam({
    universe: universeId,
    teamSize: proposal.members.length,
    requiredRoles: roles,
  });
  
  // Merge casting data into proposal
  const enrichedMembers = proposal.members.map((m, i) => ({
    ...m,
    personality: castMembers[i]?.personality || personalityForRole(m.role),
    backstory: castMembers[i]?.backstory || '',
  }));
  
  return { ...proposal, members: enrichedMembers };
}

function mapUniverseName(name: string): UniverseId {
  if (/usual suspects/i.test(name)) return 'usual-suspects';
  if (/ocean.*eleven/i.test(name)) return 'oceans-eleven';
  return 'usual-suspects'; // fallback
}
```

**Dependencies:**
- Requires exporting `AgentRole` type from casting-engine.ts
- Update `generateCharter()` to use personality and backstory from enriched data

**Test files:**
- `test/casting.test.ts` — verify enrichment works
- `test/init-autocast.test.ts` — verify end-to-end flow

**Risk Assessment:** 🟡 Medium
- Universe name mapping is heuristic
- Requires refactoring charter generation

---

### 7.7 Fix 7: Ralph Creation During Init

**Problem:** Ralph is not created during `crew init --sdk` with a prompt.

**Files to modify:**
1. `packages/crew-sdk/src/config/init.ts` — `initCrew()` function

**What to change:**
- When `options.prompt` is provided, include Ralph in agents array
- When `configFormat === 'sdk'`, include Ralph in crew.config.ts

**Code change:**

```typescript
// In initCrew(), after agents are defined
if (options.prompt || configFormat === 'sdk') {
  // Ensure Ralph is included
  const hasRalph = agents.some(a => a.name === 'ralph');
  if (!hasRalph) {
    agents.push({ name: 'ralph', role: 'ralph', displayName: 'Ralph' });
  }
}
```

**Dependencies:** None

**Test files:**
- `test/init-prompt.test.ts` — verify Ralph is created

**Risk Assessment:** 🟢 Low

---

## 8. DEPENDENCY GRAPH

```
Fix 1 (crew.config.ts sync utility)
  ↓
Fix 2 (CLI init Ralph)
Fix 3 (crew hire command) ← depends on Fix 1
Fix 4 (crew remove-member) ← depends on Fix 1
Fix 5 (@copilot init flag)
Fix 6 (CastingEngine integration)
Fix 7 (Ralph during init)
```

**Critical Path:**
1. Fix 1 (sync utility) → enables all other fixes
2. Fix 2 (Ralph in init) → low-hanging fruit
3. Fix 7 (Ralph with prompt) → completes Ralph story
4. Fix 6 (CastingEngine) → high value, medium risk
5. Fix 3 (hire command) → user-facing feature
6. Fix 4 (remove command) → nice-to-have
7. Fix 5 (@copilot flag) → bonus feature

---

## 9. OPEN QUESTIONS

### 9.1 crew.config.ts Sync Strategy

**Question:** Should we use AST parsing or regex for crew.config.ts updates?

**Options:**
- **AST (TypeScript Compiler API):** Precise, handles complex syntax, heavy dependency
- **Regex:** Simple, fragile, works for 90% of cases
- **Template-based:** Replace entire file, loses user customizations

**Recommendation:** Start with regex, upgrade to AST if issues arise.

### 9.2 CastingEngine vs LLM Proposals

**Question:** Should CastingEngine replace the LLM-based Init Mode prompt?

**Options:**
- **Replace:** Deterministic, no LLM needed, less flexible
- **Augment:** Keep LLM for flexibility, use CastingEngine to enrich
- **Parallel:** Offer both modes (flag to choose)

**Recommendation:** Augment. Keep LLM for user intent parsing, use CastingEngine for character data.

### 9.3 Ralph as a Default vs Optional

**Question:** Should Ralph always be created, or opt-in?

**Current behavior:** Ralph is auto-added during auto-cast, but NOT during `crew init --sdk`.

**Options:**
- **Always include Ralph:** Simplifies the mental model
- **Opt-in with flag:** `--with-ralph` (more flexible)
- **Auto-include in SDK mode only:** Matches current auto-cast behavior

**Recommendation:** Always include Ralph (both init paths). He's a core team member.

---

## 10. SUMMARY

### Current State
- `crew init --sdk` creates minimal files (Scribe only in crew.config.ts)
- Auto-cast (REPL Phase 1 + 2) creates full team but doesn't sync crew.config.ts
- No commands for adding/removing members after init
- CastingEngine exists but is never used
- Ralph is inconsistently created

### Fixes Required
1. crew.config.ts sync during auto-cast
2. Ralph in CLI init
3. `crew hire` command
4. `crew remove-member` command
5. @copilot init flag
6. CastingEngine integration
7. Ralph during init with prompt

### Implementation Order
1. Fix 1 (sync utility) — foundation
2. Fix 2, 7 (Ralph fixes) — quick wins
3. Fix 6 (CastingEngine) — high value
4. Fix 3, 4, 5 (commands & flags) — polish

---

**Next Steps:**
1. Review this roadmap with Brady
2. Prioritize fixes for unified PRD
3. Create GitHub issues for each fix
4. Assign to team members based on expertise

**END OF ROADMAP**
