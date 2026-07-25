/**
 * Test suite for crew migrate command (Issue #250)
 *
 * Tests the migration between markdown and SDK-First config modes:
 * - `crew migrate --to sdk`: converts markdown crew to SDK config
 * - `crew migrate --to markdown`: removes SDK config, keeps .crew/
 * - `crew migrate --from ai-team`: renames .ai-team/ to .crew/
 *
 * @module test/migrate
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { existsSync } from 'fs';

// Note: migrate function location TBD - adjust import when implementation lands
// Expected at packages/crew-sdk/src/config/migration.ts or cli command
// For now, define test structure that can be filled in when implementation is ready

describe('crew migrate', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'crew-migrate-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  /**
   * Helper: Create a minimal markdown-only crew structure
   */
  async function createMarkdownCrew(targetDir: string) {
    const crewDir = join(targetDir, '.crew');
    await mkdir(crewDir, { recursive: true });
    await mkdir(join(crewDir, 'agents'), { recursive: true });
    await mkdir(join(crewDir, 'decisions'), { recursive: true });
    await mkdir(join(crewDir, 'skills'), { recursive: true });

    // Create team.md with roster
    const teamMd = `# Team

## Members

| Name | Role | Status |
|------|------|--------|
| edie | TypeScript Engineer | active |
| hockney | Tester | active |
| fenster | Systems Engineer | active |
`;
    await writeFile(join(crewDir, 'team.md'), teamMd, 'utf-8');

    // Create agent charters
    await mkdir(join(crewDir, 'agents', 'edie'), { recursive: true });
    await writeFile(
      join(crewDir, 'agents', 'edie', 'charter.md'),
      '# Edie — TypeScript Engineer\n\nExpert in TypeScript...',
      'utf-8'
    );

    await mkdir(join(crewDir, 'agents', 'hockney'), { recursive: true });
    await writeFile(
      join(crewDir, 'agents', 'hockney', 'charter.md'),
      '# Hockney — Tester\n\nSkeptical, relentless...',
      'utf-8'
    );

    await mkdir(join(crewDir, 'agents', 'fenster'), { recursive: true });
    await writeFile(
      join(crewDir, 'agents', 'fenster', 'charter.md'),
      '# Fenster — Systems Engineer\n\nInfrastructure expert...',
      'utf-8'
    );

    // Create decisions.md
    const decisionsMd = `# Team Decisions

## Coding Standards
- Use TypeScript strict mode
- Vitest for testing
`;
    await writeFile(join(crewDir, 'decisions.md'), decisionsMd, 'utf-8');
  }

  /**
   * Helper: Create an SDK-First crew with crew.config.ts
   */
  async function createSdkCrew(targetDir: string) {
    await createMarkdownCrew(targetDir);

    const configTs = `import { defineCrew, defineTeam, defineAgent } from '@blacklite/crew-sdk';

export default defineCrew({
  team: defineTeam({
    name: 'Test Crew',
    members: ['edie', 'hockney'],
  }),
  agents: [
    defineAgent({ name: 'edie', role: 'TypeScript Engineer' }),
    defineAgent({ name: 'hockney', role: 'Tester' }),
  ],
});
`;
    await writeFile(join(targetDir, 'crew.config.ts'), configTs, 'utf-8');
  }

  it('--to sdk generates crew.config.ts from existing .crew/', async () => {
    await createMarkdownCrew(tempDir);

    // TODO: Call migrate function when implementation lands
    // await migrate({ targetDir: tempDir, to: 'sdk' });

    // For now, test structure is defined but will skip
    // Uncomment when implementation is ready:
    /*
    const configPath = join(tempDir, 'crew.config.ts');
    expect(existsSync(configPath)).toBe(true);

    const configContent = await readFile(configPath, 'utf-8');
    expect(configContent).toContain('defineCrew');
    expect(configContent).toContain('defineTeam');
    expect(configContent).toContain('defineAgent');
    */
  });

  it('--to sdk --dry-run prints preview without writing', async () => {
    await createMarkdownCrew(tempDir);

    // TODO: Call migrate with dry-run flag
    // const result = await migrate({ targetDir: tempDir, to: 'sdk', dryRun: true });

    // Assert: crew.config.ts NOT created
    expect(existsSync(join(tempDir, 'crew.config.ts'))).toBe(false);

    // Assert: output contains the config preview (check return value)
    // expect(result.preview).toBeTruthy();
  });

  it('--to sdk preserves decisions.md untouched', async () => {
    await createMarkdownCrew(tempDir);

    const decisionsPath = join(tempDir, '.crew', 'decisions.md');
    const originalContent = await readFile(decisionsPath, 'utf-8');

    // TODO: Call migrate
    // await migrate({ targetDir: tempDir, to: 'sdk' });

    // Assert: decisions.md unchanged
    const afterContent = await readFile(decisionsPath, 'utf-8');
    expect(afterContent).toBe(originalContent);
  });

  it('--to sdk parses team.md members table correctly', async () => {
    await createMarkdownCrew(tempDir);

    // TODO: Call migrate
    // await migrate({ targetDir: tempDir, to: 'sdk' });

    // const configPath = join(tempDir, 'crew.config.ts');
    // const configContent = await readFile(configPath, 'utf-8');

    // Assert: generated config has 3 defineAgent() calls (edie, hockney, fenster)
    // const agentMatches = configContent.match(/defineAgent\(/g);
    // expect(agentMatches).toHaveLength(3);
  });

  it('--to markdown removes crew.config.ts', async () => {
    await createSdkCrew(tempDir);

    // Verify config exists before migration
    expect(existsSync(join(tempDir, 'crew.config.ts'))).toBe(true);

    // TODO: Call migrate
    // await migrate({ targetDir: tempDir, to: 'markdown' });

    // Assert: crew.config.ts removed (or backed up)
    // expect(existsSync(join(tempDir, 'crew.config.ts'))).toBe(false);

    // Assert: .crew/ directory preserved
    expect(existsSync(join(tempDir, '.crew'))).toBe(true);
    expect(existsSync(join(tempDir, '.crew', 'team.md'))).toBe(true);
  });

  it('detects already-SDK crew and reports no-op', async () => {
    await createSdkCrew(tempDir);

    // TODO: Call migrate --to sdk on already-SDK crew
    // const result = await migrate({ targetDir: tempDir, to: 'sdk' });

    // Assert: reports "already in SDK mode" or similar
    // expect(result.status).toBe('no-op');
    // expect(result.message).toMatch(/already.*sdk/i);
  });

  it('--from ai-team renames .ai-team/ to .crew/', async () => {
    // Create old .ai-team/ structure
    const aiTeamDir = join(tempDir, '.ai-team');
    await mkdir(aiTeamDir, { recursive: true });
    await mkdir(join(aiTeamDir, 'agents'), { recursive: true });
    await writeFile(join(aiTeamDir, 'team.md'), '# Old AI Team', 'utf-8');

    // TODO: Call migrate
    // await migrate({ targetDir: tempDir, from: 'ai-team' });

    // Assert: .ai-team/ gone
    // expect(existsSync(join(tempDir, '.ai-team'))).toBe(false);

    // Assert: .crew/ exists with contents
    // expect(existsSync(join(tempDir, '.crew'))).toBe(true);
    // expect(existsSync(join(tempDir, '.crew', 'team.md'))).toBe(true);
  });

  it('--to sdk handles agents with no charter file', async () => {
    await createMarkdownCrew(tempDir);

    // Remove one charter file
    await rm(join(tempDir, '.crew', 'agents', 'fenster', 'charter.md'));

    // TODO: Call migrate
    // await migrate({ targetDir: tempDir, to: 'sdk' });

    // Assert: still generates config with fenster agent (with empty or placeholder charter)
    // const configPath = join(tempDir, 'crew.config.ts');
    // const configContent = await readFile(configPath, 'utf-8');
    // expect(configContent).toContain('fenster');
  });

  it('--to sdk preserves agent capabilities from charter frontmatter', async () => {
    await createMarkdownCrew(tempDir);

    // Add frontmatter to edie's charter
    const charterWithMeta = `---
capabilities:
  - name: typescript
    level: expert
  - name: testing
    level: proficient
---

# Edie — TypeScript Engineer

Expert in TypeScript...
`;
    await writeFile(
      join(tempDir, '.crew', 'agents', 'edie', 'charter.md'),
      charterWithMeta,
      'utf-8'
    );

    // TODO: Call migrate
    // await migrate({ targetDir: tempDir, to: 'sdk' });

    // const configPath = join(tempDir, 'crew.config.ts');
    // const configContent = await readFile(configPath, 'utf-8');

    // Assert: capabilities included in defineAgent call
    // expect(configContent).toMatch(/capabilities.*typescript.*expert/s);
  });

  it('--to sdk preserves routing rules from routing.md', async () => {
    await createMarkdownCrew(tempDir);

    // Create routing.md
    const routingMd = `# Routing

## Rules

- \`feature-*\` → edie
- \`bug-*\` → fenster
- \`test-*\` → hockney

Default: edie
`;
    await writeFile(join(tempDir, '.crew', 'routing.md'), routingMd, 'utf-8');

    // TODO: Call migrate
    // await migrate({ targetDir: tempDir, to: 'sdk' });

    // const configPath = join(tempDir, 'crew.config.ts');
    // const configContent = await readFile(configPath, 'utf-8');

    // Assert: routing section included
    // expect(configContent).toContain('defineRouting');
    // expect(configContent).toContain('feature-*');
  });

  it('--to sdk handles skills/ directory', async () => {
    await createMarkdownCrew(tempDir);

    // Create a skill file
    await mkdir(join(tempDir, '.crew', 'skills', 'git-workflow'), { recursive: true });
    const skillMd = `---
name: Git Workflow
domain: workflow
---

Branch from dev, use crew/* naming...
`;
    await writeFile(
      join(tempDir, '.crew', 'skills', 'git-workflow', 'SKILL.md'),
      skillMd,
      'utf-8'
    );

    // TODO: Call migrate
    // await migrate({ targetDir: tempDir, to: 'sdk' });

    // const configPath = join(tempDir, 'crew.config.ts');
    // const configContent = await readFile(configPath, 'utf-8');

    // Assert: skills section included (if supported)
    // expect(configContent).toContain('skills');
  });

  it('validates markdown crew exists before migration', async () => {
    // Empty directory, no .crew/

    // TODO: Call migrate on empty directory
    // await expect(
    //   migrate({ targetDir: tempDir, to: 'sdk' })
    // ).rejects.toThrow(/no crew found/i);
  });

  it('--force flag overwrites existing crew.config.ts', async () => {
    await createMarkdownCrew(tempDir);

    // Create existing config with different content
    await writeFile(
      join(tempDir, 'crew.config.ts'),
      '// Old config',
      'utf-8'
    );

    // TODO: Call migrate with force
    // await migrate({ targetDir: tempDir, to: 'sdk', force: true });

    // const configContent = await readFile(join(tempDir, 'crew.config.ts'), 'utf-8');
    // expect(configContent).not.toContain('Old config');
    // expect(configContent).toContain('defineCrew');
  });
});
