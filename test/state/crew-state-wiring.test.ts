/**
 * CrewState SDK Wiring Tests — Phase 2
 *
 * Verifies that SDK modules (CharterCompiler, LocalAgentSource, onboardAgent,
 * ToolRegistry) correctly use CrewState typed collections when wired.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryStorageProvider } from '../../packages/crew-sdk/src/storage/in-memory-storage-provider.js';
import { CrewState } from '../../packages/crew-sdk/src/state/crew-state.js';
import { CharterCompiler } from '../../packages/crew-sdk/src/agents/index.js';
import { LocalAgentSource } from '../../packages/crew-sdk/src/config/agent-source.js';
import { onboardAgent } from '../../packages/crew-sdk/src/agents/onboarding.js';
import { ToolRegistry } from '../../packages/crew-sdk/src/tools/index.js';

// ── Sample data ────────────────────────────────────────────────────────────

const ROOT = '/project';

const CHARTER_EECOM = `# EECOM — Core Dev

> Practical, thorough, makes it work then makes it right.

## Identity

- **Name:** EECOM
- **Role:** Core Dev
- **Expertise:** Runtime implementation, spawning
- **Style:** Practical, thorough, makes it work then makes it right.
`;

const CHARTER_RETRO = `# RETRO — Docs Lead

> Precise, structured, docs-first.

## Identity

- **Name:** RETRO
- **Role:** Docs Lead
- **Expertise:** Documentation, API references
- **Style:** Precise, structured, docs-first.
`;

const HISTORY_EECOM = `# EECOM

## Learnings

### 2026-07-24

Built the IO layer for state module.

## Context

Project uses TypeScript with vitest for testing.
`;

const TEAM_MD = `# Project Crew

## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
| eecom | Core Dev | \`.crew/agents/eecom/charter.md\` | ✅ Active |
| retro | Docs Lead | \`.crew/agents/retro/charter.md\` | ✅ Active |
`;

// ── Helper ─────────────────────────────────────────────────────────────────

function seedStorage(): InMemoryStorageProvider {
  const sp = new InMemoryStorageProvider();
  sp.writeSync(`${ROOT}/.crew/agents/eecom/charter.md`, CHARTER_EECOM);
  sp.writeSync(`${ROOT}/.crew/agents/eecom/history.md`, HISTORY_EECOM);
  sp.writeSync(`${ROOT}/.crew/agents/retro/charter.md`, CHARTER_RETRO);
  sp.writeSync(`${ROOT}/.crew/team.md`, TEAM_MD);
  sp.writeSync(`${ROOT}/.crew/decisions.md`, '# Decisions\n');
  sp.writeSync(`${ROOT}/.crew/routing.md`, '# Routing\n');
  sp.writeSync(`${ROOT}/.crew/config.json`, '{}');
  return sp;
}

// ── CrewState.fromStorage ─────────────────────────────────────────────────

describe('CrewState.fromStorage', () => {
  it('creates CrewState synchronously without validation', () => {
    const sp = new InMemoryStorageProvider();
    // No .crew/ dir seeded — fromStorage should NOT throw
    const state = CrewState.fromStorage(sp, '/empty');
    expect(state).toBeDefined();
    expect(state.root).toBe('/empty');
    expect(state.provider).toBe(sp);
  });

  it('exposes root and provider getters', () => {
    const sp = seedStorage();
    const state = CrewState.fromStorage(sp, ROOT);
    expect(state.root).toBe(ROOT);
    expect(state.provider).toBe(sp);
  });
});

// ── CharterCompiler with CrewState ────────────────────────────────────────

describe('CharterCompiler with CrewState', () => {
  let sp: InMemoryStorageProvider;
  let state: CrewState;

  beforeEach(() => {
    sp = seedStorage();
    state = CrewState.fromStorage(sp, ROOT);
  });

  it('compileAll uses state.agents when CrewState provided', async () => {
    const compiler = new CharterCompiler(sp, state);
    const charters = await compiler.compileAll(ROOT);

    expect(charters.length).toBe(2);
    const names = charters.map(c => c.name).sort();
    expect(names).toEqual(['eecom', 'retro']);
  });

  it('compileAll skips scribe and _ prefixed agents', async () => {
    sp.writeSync(`${ROOT}/.crew/agents/scribe/charter.md`, '# Scribe\n## Identity\n- **Name:** Scribe\n');
    sp.writeSync(`${ROOT}/.crew/agents/_alumni/charter.md`, '# Alumni\n');
    const compiler = new CharterCompiler(sp, state);
    const charters = await compiler.compileAll(ROOT);

    const names = charters.map(c => c.name);
    expect(names).not.toContain('scribe');
    expect(names).not.toContain('_alumni');
  });

  it('compileByName returns typed charter for known agent', async () => {
    const compiler = new CharterCompiler(sp, state);
    const charter = await compiler.compileByName('eecom');

    expect(charter.name).toBe('eecom');
    expect(charter.role).toBe('Core Dev');
    expect(charter.prompt).toContain('Practical, thorough');
  });

  it('compileByName throws for unknown agent', async () => {
    const compiler = new CharterCompiler(sp, state);
    await expect(compiler.compileByName('ghost')).rejects.toThrow();
  });

  it('compileByName throws if no CrewState provided', async () => {
    const compiler = new CharterCompiler(sp); // no state
    await expect(compiler.compileByName('eecom')).rejects.toThrow(
      /compileByName requires CrewState/,
    );
  });

  it('compileAll falls back to StorageProvider when no state', async () => {
    const compiler = new CharterCompiler(sp); // no state
    const charters = await compiler.compileAll(ROOT);

    expect(charters.length).toBe(2);
    const names = charters.map(c => c.name).sort();
    expect(names).toEqual(['eecom', 'retro']);
  });
});

// ── LocalAgentSource with CrewState ───────────────────────────────────────

describe('LocalAgentSource with CrewState', () => {
  let sp: InMemoryStorageProvider;
  let state: CrewState;

  beforeEach(() => {
    sp = seedStorage();
    state = CrewState.fromStorage(sp, ROOT);
  });

  it('listAgents returns manifests via CrewState', async () => {
    const source = new LocalAgentSource(ROOT, sp, state);
    const agents = await source.listAgents();

    expect(agents.length).toBe(2);
    const names = agents.map(a => a.name).sort();
    expect(names).toEqual(['EECOM', 'RETRO']);
  });

  it('getAgent returns full definition via CrewState', async () => {
    const source = new LocalAgentSource(ROOT, sp, state);
    const agent = await source.getAgent('eecom');

    expect(agent).not.toBeNull();
    expect(agent!.charter).toContain('Core Dev');
    expect(agent!.source).toBe('local');
  });

  it('getCharter returns charter content via CrewState', async () => {
    const source = new LocalAgentSource(ROOT, sp, state);
    const charter = await source.getCharter('eecom');

    expect(charter).not.toBeNull();
    expect(charter).toContain('EECOM');
  });

  it('getCharter returns null for unknown agent', async () => {
    const source = new LocalAgentSource(ROOT, sp, state);
    const charter = await source.getCharter('ghost');

    expect(charter).toBeNull();
  });

  it('listAgents falls back to StorageProvider when no state', async () => {
    const source = new LocalAgentSource(ROOT, sp); // no state
    const agents = await source.listAgents();

    expect(agents.length).toBe(2);
  });
});

// ── onboardAgent with CrewState ───────────────────────────────────────────

describe('onboardAgent with CrewState', () => {
  let sp: InMemoryStorageProvider;
  let state: CrewState;

  beforeEach(() => {
    sp = seedStorage();
    state = CrewState.fromStorage(sp, ROOT);
  });

  it('creates agent files via CrewState', async () => {
    const result = await onboardAgent(
      { teamRoot: ROOT, agentName: 'new-agent', role: 'tester' },
      sp,
      state,
    );

    expect(result.createdFiles.length).toBe(2);

    // Verify charter exists via CrewState
    const charter = await state.agents.get('new-agent').charter();
    expect(charter).toContain('New Agent');

    // Verify history was written (overwritten from generic CrewState template)
    const history = sp.readSync(`${ROOT}/.crew/agents/new-agent/history.md`);
    expect(history).toBeDefined();
  });

  it('creates agent files without CrewState (backward compat)', async () => {
    const result = await onboardAgent(
      { teamRoot: ROOT, agentName: 'plain-agent', role: 'developer' },
      sp,
    );

    expect(result.createdFiles.length).toBe(2);
    const charter = sp.readSync(result.charterPath);
    expect(charter).toBeDefined();
  });

  it('rejects duplicate agent', async () => {
    await expect(
      onboardAgent(
        { teamRoot: ROOT, agentName: 'eecom', role: 'developer' },
        sp,
        state,
      ),
    ).rejects.toThrow(/already exists/);
  });
});

// ── ToolRegistry with CrewState ───────────────────────────────────────────

describe('ToolRegistry with CrewState', () => {
  let sp: InMemoryStorageProvider;
  let state: CrewState;

  beforeEach(() => {
    sp = seedStorage();
    state = CrewState.fromStorage(sp, ROOT);
  });

  it('constructs with CrewState parameter', () => {
    const registry = new ToolRegistry(`${ROOT}/.crew`, undefined, sp, state);
    expect(registry.getTools().length).toBeGreaterThan(0);
  });

  it('constructs without CrewState (backward compat)', () => {
    const registry = new ToolRegistry(`${ROOT}/.crew`, undefined, sp);
    expect(registry.getTools().length).toBeGreaterThan(0);
  });

  it('crew_memory appends via CrewState when available', async () => {
    const registry = new ToolRegistry(`${ROOT}/.crew`, undefined, sp, state);
    const memoryTool = registry.getTool('crew_memory');
    expect(memoryTool).toBeDefined();

    const result = await memoryTool!.handler({
      agent: 'eecom',
      section: 'learnings',
      content: 'Wired CrewState into tools module.',
    });

    expect(result.resultType).toBe('success');
    expect(result.textResultForLlm).toContain('Appended to eecom');

    // Verify content was written
    const history = sp.readSync(`${ROOT}/.crew/agents/eecom/history.md`);
    expect(history).toContain('Wired CrewState into tools module.');
  });

  it('crew_memory returns failure for unknown agent via CrewState', async () => {
    const registry = new ToolRegistry(`${ROOT}/.crew`, undefined, sp, state);
    const memoryTool = registry.getTool('crew_memory');

    const result = await memoryTool!.handler({
      agent: 'ghost',
      section: 'learnings',
      content: 'This should fail.',
    });

    expect(result.resultType).toBe('failure');
    expect(result.textResultForLlm).toContain('not found');
  });
});
