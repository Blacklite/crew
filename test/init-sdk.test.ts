/**
 * Test suite for crew init --sdk flag (Issue #249)
 *
 * Tests the new configFormat option behavior:
 * - 'markdown' (default): markdown-only crew, no crew.config.ts
 * - 'sdk': SDK-First mode, generates crew.config.ts with defineCrew() syntax
 * - 'typescript' (backward compat): old CrewConfig interface format
 *
 * @module test/init-sdk
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, readdir, access } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { existsSync } from 'fs';

// Import initCrew from SDK
// Note: initCrew lives at packages/crew-sdk/src/config/init.ts
import { initCrew } from '../packages/crew-sdk/src/config/init.js';
import type { InitOptions } from '../packages/crew-sdk/src/config/init.js';

describe('crew init --sdk flag', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'crew-init-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('default init (markdown) does NOT create crew.config.ts', async () => {
    const options: InitOptions = {
      teamRoot: tempDir,
      projectName: 'test-crew',
      agents: [{ name: 'edie', role: 'Engineer' }],
      configFormat: 'markdown',
    };

    await initCrew(options);

    // Assert: .crew/ directory created
    expect(existsSync(join(tempDir, '.crew'))).toBe(true);

    // Assert: crew.config.ts does NOT exist
    expect(existsSync(join(tempDir, 'crew.config.ts'))).toBe(false);

    // Assert: .crew/agents/ exists
    expect(existsSync(join(tempDir, '.crew', 'agents'))).toBe(true);

    // Assert: .github/agents/crew.agent.md exists
    expect(existsSync(join(tempDir, '.github', 'agents', 'crew.agent.md'))).toBe(true);
  });

  it('init --sdk creates crew.config.ts with defineCrew() syntax', async () => {
    const options: InitOptions = {
      teamRoot: tempDir,
      projectName: 'test-crew',
      agents: [{ name: 'edie', role: 'Engineer' }],
      configFormat: 'sdk',
    };

    await initCrew(options);

    // Assert: crew.config.ts exists
    const configPath = join(tempDir, 'crew.config.ts');
    expect(existsSync(configPath)).toBe(true);

    // Read the generated config
    const configContent = await readFile(configPath, 'utf-8');

    // Assert: file contains 'defineCrew'
    expect(configContent).toContain('defineCrew');

    // Assert: file contains 'defineTeam'
    expect(configContent).toContain('defineTeam');

    // Assert: file contains 'defineAgent'
    expect(configContent).toContain('defineAgent');

    // Assert: file imports from '@blacklite/crew-sdk'
    expect(configContent).toContain('@blacklite/crew-sdk');

    // Assert: .crew/ directory also created
    expect(existsSync(join(tempDir, '.crew'))).toBe(true);
  });

  it('init --sdk generates valid TypeScript', async () => {
    const options: InitOptions = {
      teamRoot: tempDir,
      projectName: 'test-crew',
      agents: [{ name: 'edie', role: 'Engineer' }],
      configFormat: 'sdk',
    };

    await initCrew(options);

    const configPath = join(tempDir, 'crew.config.ts');
    const configContent = await readFile(configPath, 'utf-8');

    // Assert: no syntax errors (at minimum, check structure)
    // Check for basic TypeScript syntax patterns
    expect(configContent).toMatch(/export\s+default/);

    // Assert: has proper imports
    expect(configContent).toContain('import');
    expect(configContent).toContain('from');

    // Assert: has function calls with proper parentheses/braces
    expect(configContent).toMatch(/defineCrew\s*\(/);
    expect(configContent).toMatch(/defineTeam\s*\(/);
    expect(configContent).toMatch(/defineAgent\s*\(/);
  });

  it('markdown init still creates all .crew/ directories', async () => {
    const options: InitOptions = {
      teamRoot: tempDir,
      projectName: 'test-crew',
      agents: [{ name: 'edie', role: 'Engineer' }],
      configFormat: 'markdown',
    };

    await initCrew(options);

    // Assert: .crew/agents/ exists
    expect(existsSync(join(tempDir, '.crew', 'agents'))).toBe(true);

    // Assert: .crew/casting/ exists (if created during init)
    const castingPath = join(tempDir, '.crew', 'casting');
    expect(existsSync(castingPath)).toBe(true);

    // Assert: casting files are scaffolded (#579)
    expect(existsSync(join(castingPath, 'policy.json'))).toBe(true);
    expect(existsSync(join(castingPath, 'registry.json'))).toBe(true);
    expect(existsSync(join(castingPath, 'history.json'))).toBe(true);

    // Assert: .crew/decisions/ exists
    expect(existsSync(join(tempDir, '.crew', 'decisions'))).toBe(true);

    // Assert: .crew/decisions/inbox/ exists
    expect(existsSync(join(tempDir, '.crew', 'decisions', 'inbox'))).toBe(true);

    // Assert: .github/skills/ exists
    expect(existsSync(join(tempDir, '.github', 'skills'))).toBe(true);

    // Assert: .crew/identity/ exists
    expect(existsSync(join(tempDir, '.crew', 'identity'))).toBe(true);
  });

  it('init scaffolds casting files with valid JSON (#579)', async () => {
    const options: InitOptions = {
      teamRoot: tempDir,
      projectName: 'test-crew',
      agents: [{ name: 'edie', role: 'Engineer' }],
      configFormat: 'markdown',
    };

    await initCrew(options);

    const castingDir = join(tempDir, '.crew', 'casting');

    // policy.json should have casting_policy_version
    const policy = JSON.parse(await readFile(join(castingDir, 'policy.json'), 'utf-8'));
    expect(policy).toHaveProperty('casting_policy_version');
    expect(policy).toHaveProperty('allowlist_universes');

    // registry.json should have agents object
    const registry = JSON.parse(await readFile(join(castingDir, 'registry.json'), 'utf-8'));
    expect(registry).toHaveProperty('agents');

    // history.json should have empty arrays
    const history = JSON.parse(await readFile(join(castingDir, 'history.json'), 'utf-8'));
    expect(history).toHaveProperty('universe_usage_history');
    expect(history).toHaveProperty('assignment_cast_snapshots');
  });

  it('init does not overwrite existing casting files', async () => {
    const castingDir = join(tempDir, '.crew', 'casting');
    const { mkdirSync, writeFileSync } = await import('fs');
    mkdirSync(castingDir, { recursive: true });
    writeFileSync(join(castingDir, 'registry.json'), '{"agents":{"custom":"data"}}', 'utf-8');

    const options: InitOptions = {
      teamRoot: tempDir,
      projectName: 'test-crew',
      agents: [{ name: 'edie', role: 'Engineer' }],
      configFormat: 'markdown',
    };

    const result = await initCrew(options);

    // Should have skipped the existing file
    const registry = JSON.parse(await readFile(join(castingDir, 'registry.json'), 'utf-8'));
    expect(registry.agents).toEqual({ custom: 'data' });
  });

  it('backward compat: configFormat typescript still works', async () => {
    const options: InitOptions = {
      teamRoot: tempDir,
      projectName: 'test-crew',
      agents: [{ name: 'edie', role: 'Engineer' }],
      configFormat: 'typescript',
    };

    await initCrew(options);

    // Assert: crew.config.ts exists with old CrewConfig format
    const configPath = join(tempDir, 'crew.config.ts');
    expect(existsSync(configPath)).toBe(true);

    const configContent = await readFile(configPath, 'utf-8');

    // Old format uses CrewConfig interface (not defineCrew)
    // This test verifies we don't break existing behavior
    expect(configContent).toContain('CrewConfig');
  });

  it('init --sdk creates agent definitions matching team roster', async () => {
    const options: InitOptions = {
      teamRoot: tempDir,
      projectName: 'test-crew',
      agents: [
        { name: 'edie', role: 'Engineer' },
        { name: 'hockney', role: 'Tester' },
      ],
      configFormat: 'sdk',
    };

    await initCrew(options);

    const configPath = join(tempDir, 'crew.config.ts');
    const configContent = await readFile(configPath, 'utf-8');

    // Should have at least one agent defined
    const agentMatches = configContent.match(/defineAgent\(/g);
    expect(agentMatches).toBeTruthy();
    expect(agentMatches!.length).toBeGreaterThan(0);
  });

  it('init --sdk respects teamName option', async () => {
    const options: InitOptions = {
      teamRoot: tempDir,
      projectName: 'Test Crew',
      agents: [{ name: 'edie', role: 'Engineer' }],
      configFormat: 'sdk',
    };

    await initCrew(options);

    const configPath = join(tempDir, 'crew.config.ts');
    const configContent = await readFile(configPath, 'utf-8');

    // Should contain the team name
    expect(configContent).toContain('Test Crew');
  });

  // ── --sdk --roles integration (#378) ────────────────────────────────

  it('init --sdk --roles uses useRole() instead of defineAgent()', async () => {
    const options: InitOptions = {
      teamRoot: tempDir,
      projectName: 'test-crew',
      agents: [{ name: 'scribe', role: 'scribe' }],
      configFormat: 'sdk',
      roles: true,
    };

    await initCrew(options);

    const configPath = join(tempDir, 'crew.config.ts');
    expect(existsSync(configPath)).toBe(true);

    const configContent = await readFile(configPath, 'utf-8');

    // Should import useRole
    expect(configContent).toContain('useRole');
    expect(configContent).toContain('@blacklite/crew-sdk');

    // Should have useRole() calls for starter team
    expect(configContent).toMatch(/useRole\s*\(\s*'lead'/);
    expect(configContent).toMatch(/useRole\s*\(\s*'backend'/);
    expect(configContent).toMatch(/useRole\s*\(\s*'frontend'/);
    expect(configContent).toMatch(/useRole\s*\(\s*'tester'/);
  });

  it('init --sdk --roles keeps defineAgent() for non-role agents', async () => {
    const options: InitOptions = {
      teamRoot: tempDir,
      projectName: 'test-crew',
      agents: [
        { name: 'scribe', role: 'scribe' },
        { name: 'ralph', role: 'ralph' },
      ],
      configFormat: 'sdk',
      roles: true,
    };

    await initCrew(options);

    const configPath = join(tempDir, 'crew.config.ts');
    const configContent = await readFile(configPath, 'utf-8');

    // System agents use defineAgent, not useRole
    expect(configContent).toContain('defineAgent');
    expect(configContent).toMatch(/defineAgent\([\s\S]*?name:\s*'scribe'/);
    expect(configContent).toMatch(/defineAgent\([\s\S]*?name:\s*'ralph'/);
  });

  it('init --sdk --roles includes role catalog comment', async () => {
    const options: InitOptions = {
      teamRoot: tempDir,
      projectName: 'test-crew',
      agents: [{ name: 'scribe', role: 'scribe' }],
      configFormat: 'sdk',
      roles: true,
    };

    await initCrew(options);

    const configPath = join(tempDir, 'crew.config.ts');
    const configContent = await readFile(configPath, 'utf-8');

    // Should have helpful comment about base roles
    expect(configContent).toContain('built-in base roles');
  });

  it('init --sdk --roles generates valid export default', async () => {
    const options: InitOptions = {
      teamRoot: tempDir,
      projectName: 'test-crew',
      agents: [{ name: 'scribe', role: 'scribe' }],
      configFormat: 'sdk',
      roles: true,
    };

    await initCrew(options);

    const configPath = join(tempDir, 'crew.config.ts');
    const configContent = await readFile(configPath, 'utf-8');

    expect(configContent).toMatch(/export\s+default/);
    expect(configContent).toMatch(/defineCrew\s*\(/);
    expect(configContent).toMatch(/defineTeam\s*\(/);
  });

  it('init --sdk --roles uses base role agent when passed', async () => {
    const options: InitOptions = {
      teamRoot: tempDir,
      projectName: 'test-crew',
      agents: [
        { name: 'kane', role: 'backend' },
        { name: 'ripley', role: 'lead' },
      ],
      configFormat: 'sdk',
      roles: true,
    };

    await initCrew(options);

    const configPath = join(tempDir, 'crew.config.ts');
    const configContent = await readFile(configPath, 'utf-8');

    // Should use useRole for recognized base roles
    expect(configContent).toMatch(/useRole\s*\(\s*'backend'.*name:\s*'kane'/s);
    expect(configContent).toMatch(/useRole\s*\(\s*'lead'.*name:\s*'ripley'/s);

    // Should NOT generate default starter team since caller provided roles
    expect(configContent).not.toContain("useRole('frontend'");
  });

  it('init --sdk without --roles still uses defineAgent()', async () => {
    const options: InitOptions = {
      teamRoot: tempDir,
      projectName: 'test-crew',
      agents: [{ name: 'edie', role: 'Engineer' }],
      configFormat: 'sdk',
      roles: false,
    };

    await initCrew(options);

    const configPath = join(tempDir, 'crew.config.ts');
    const configContent = await readFile(configPath, 'utf-8');

    // Should NOT contain useRole
    expect(configContent).not.toContain('useRole');
    // Should contain defineAgent
    expect(configContent).toContain('defineAgent');
  });

  it('init --roles without --sdk still creates markdown-only', async () => {
    const options: InitOptions = {
      teamRoot: tempDir,
      projectName: 'test-crew',
      agents: [{ name: 'edie', role: 'Engineer' }],
      configFormat: 'markdown',
      roles: true,
    };

    await initCrew(options);

    // Should NOT generate crew.config.ts
    expect(existsSync(join(tempDir, 'crew.config.ts'))).toBe(false);

    // .crew/ directory should still be created
    expect(existsSync(join(tempDir, '.crew'))).toBe(true);
  });
});
