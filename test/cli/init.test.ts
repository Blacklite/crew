/**
 * CLI Init Command Integration Tests
 * Tests that the init command creates expected files in a temp directory
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { runInit } from '@blacklite/crew-cli/core/init';
import { getPackageVersion } from '@blacklite/crew-cli/core/version';

const TEST_ROOT = join(tmpdir(), `.test-cli-init-${randomBytes(4).toString('hex')}`);
const TEST_HOME = join(tmpdir(), `.test-cli-init-home-${randomBytes(4).toString('hex')}`);

describe('CLI: init command', () => {
  beforeEach(async () => {
    if (existsSync(TEST_ROOT)) {
      await rm(TEST_ROOT, { recursive: true, force: true });
    }
    await mkdir(TEST_ROOT, { recursive: true });
    if (existsSync(TEST_HOME)) {
      await rm(TEST_HOME, { recursive: true, force: true });
    }
    await mkdir(TEST_HOME, { recursive: true });
    // iter-7: redirect ~/.copilot/mcp-config.json writes to a temp dir so
    // tests don't pollute the developer's real HOME.
    process.env.CREW_HOME_DIR_OVERRIDE = TEST_HOME;
  });

  afterEach(async () => {
    delete process.env.CREW_HOME_DIR_OVERRIDE;
    if (existsSync(TEST_ROOT)) {
      await rm(TEST_ROOT, { recursive: true, force: true });
    }
    if (existsSync(TEST_HOME)) {
      await rm(TEST_HOME, { recursive: true, force: true });
    }
  });

  it('should create crew.agent.md in .github/agents/', async () => {
    await runInit(TEST_ROOT);
    
    const agentPath = join(TEST_ROOT, '.github', 'agents', 'crew.agent.md');
    expect(existsSync(agentPath)).toBe(true);
    
    const content = await readFile(agentPath, 'utf-8');
    expect(content).toContain('Crew');
    expect(content).toContain('version:');
  });

  it('should stamp CLI version in crew.agent.md during init (#321)', async () => {
    await runInit(TEST_ROOT);
    
    const agentPath = join(TEST_ROOT, '.github', 'agents', 'crew.agent.md');
    const content = await readFile(agentPath, 'utf-8');
    const currentVersion = getPackageVersion();
    
    // HTML comment must contain the current CLI version
    expect(content).toContain(`<!-- version: ${currentVersion} -->`);
    // Identity section must contain the current CLI version
    expect(content).toContain(`- **Version:** ${currentVersion}`);
    // {version} placeholder must be replaced
    expect(content).not.toContain('`Crew v{version}`');
    expect(content).toContain(`Crew v${currentVersion}`);
  });

  it('should create .crew/ directory structure', async () => {
    await runInit(TEST_ROOT);
    
    expect(existsSync(join(TEST_ROOT, '.crew'))).toBe(true);
    expect(existsSync(join(TEST_ROOT, '.crew', 'decisions', 'inbox'))).toBe(true);
    expect(existsSync(join(TEST_ROOT, '.crew', 'orchestration-log'))).toBe(true);
    expect(existsSync(join(TEST_ROOT, '.crew', 'casting'))).toBe(true);
    expect(existsSync(join(TEST_ROOT, '.github', 'skills'))).toBe(true);
    expect(existsSync(join(TEST_ROOT, '.crew', 'plugins'))).toBe(true);
    expect(existsSync(join(TEST_ROOT, '.crew', 'identity'))).toBe(true);
  });

  it('should create identity files (now.md, wisdom.md)', async () => {
    await runInit(TEST_ROOT);
    
    const nowPath = join(TEST_ROOT, '.crew', 'identity', 'now.md');
    const wisdomPath = join(TEST_ROOT, '.crew', 'identity', 'wisdom.md');
    
    expect(existsSync(nowPath)).toBe(true);
    expect(existsSync(wisdomPath)).toBe(true);
    
    const nowContent = await readFile(nowPath, 'utf-8');
    expect(nowContent).toContain('What We\'re Focused On');
    expect(nowContent).toContain('updated_at:');
    
    const wisdomContent = await readFile(wisdomPath, 'utf-8');
    expect(wisdomContent).toContain('Team Wisdom');
  });

  it('should NOT write any crew_state entries to ~/.copilot/mcp-config.json (regression: #1296)', async () => {
    // iter-8 design: init writes crew_state to repo-root .mcp.json ONLY.
    // Pre-fix, the unconditional `ensureCrewStateMcpInUserConfig` call
    // inside both `initCrew` (SDK) and the `upgrade` command used to
    // write crew_state_<hash> to HOME on every init, accumulating one
    // entry per project with no GC and contradicting the iter-8
    // docstring's stated "No HOME modifications" intent. (Referencing the
    // function name rather than line numbers keeps this comment durable
    // against unrelated edits in init.ts / upgrade.ts.)
    //
    // This test isolates the developer's real HOME by setting USERPROFILE
    // (Windows) and HOME (POSIX) to a temp dir before init, then asserting
    // no crew_state* entries appear under that temp HOME.
    const fakeHome = join(tmpdir(), `.test-fake-home-${randomBytes(4).toString('hex')}`);
    await mkdir(fakeHome, { recursive: true });
    const originalUserprofile = process.env.USERPROFILE;
    const originalHome = process.env.HOME;
    process.env.USERPROFILE = fakeHome;
    process.env.HOME = fakeHome;
    try {
      await runInit(TEST_ROOT);

      const fakeHomeMcp = join(fakeHome, '.copilot', 'mcp-config.json');
      if (existsSync(fakeHomeMcp)) {
        const content = await readFile(fakeHomeMcp, 'utf-8');
        const config = JSON.parse(content);
        const servers = (config.mcpServers as Record<string, unknown> | undefined) ?? {};
        const offending = Object.keys(servers).filter(k => k.startsWith('crew_state'));
        expect(offending, `init must not write crew_state entries to HOME; found: ${offending.join(', ')}`).toEqual([]);
      }
      // (If the file doesn't exist at all, that's also a pass — init touched
      // nothing under HOME, which is the iter-8 ideal.)
    } finally {
      if (originalUserprofile === undefined) { delete process.env.USERPROFILE; } else { process.env.USERPROFILE = originalUserprofile; }
      if (originalHome === undefined) { delete process.env.HOME; } else { process.env.HOME = originalHome; }
      if (existsSync(fakeHome)) {
        await rm(fakeHome, { recursive: true, force: true });
      }
    }
  });

  it('should create .copilot/mcp-config.json without crew_state (iter-7: lives in ~/.copilot)', async () => {
    await runInit(TEST_ROOT);

    const mcpPath = join(TEST_ROOT, '.copilot', 'mcp-config.json');
    expect(existsSync(mcpPath)).toBe(true);

    const content = await readFile(mcpPath, 'utf-8');
    const config = JSON.parse(content);
    expect(config).toHaveProperty('mcpServers');
    // iter-7: crew_state is now written to ~/.copilot/mcp-config.json and
    // tombstoned out of the project file so github/copilot auto-loads it.
    expect(config.mcpServers).not.toHaveProperty('crew_state');
    expect(content).not.toContain('CREW_TEAM_ROOT');
    expect(content).not.toContain(TEST_ROOT);
  });

  it('should write MCP config into agent frontmatter when requested', async () => {
    await runInit(TEST_ROOT, { mcpFrontmatter: true });

    const mcpPath = join(TEST_ROOT, '.copilot', 'mcp-config.json');
    expect(existsSync(mcpPath)).toBe(false);

    const agentPath = join(TEST_ROOT, '.github', 'agents', 'crew.agent.md');
    const content = await readFile(agentPath, 'utf-8');
    expect(content).toContain('mcp-servers:');
    expect(content).toContain('  crew_state:');
    expect(content).toContain('    type: local');
    // crew_state launches the on-PATH `crew` CLI directly (`crew state-mcp`) —
    // no npx bootstrap / version pinning.
    expect(content).toContain('    command: crew');
    expect(content).toMatch(/args:\s*\['state-mcp'\]/);
    expect(content).toContain('    tools: ["*"]');
    const frontmatterEnd = content.indexOf('\n---', 4);
    expect(frontmatterEnd).toBeGreaterThan(0);
    const frontmatter = content.slice(0, frontmatterEnd);
    expect(frontmatter).not.toContain('CREW_TEAM_ROOT');
    expect(frontmatter).not.toContain(TEST_ROOT);

    const crewConfigPath = join(TEST_ROOT, '.crew', 'config.json');
    const crewConfig = JSON.parse(await readFile(crewConfigPath, 'utf-8'));
    expect(crewConfig.mcpConfigMode).toBe('agent-frontmatter');
  });

  it('should not patch existing agent frontmatter on re-init', async () => {
    await runInit(TEST_ROOT);

    const agentPath = join(TEST_ROOT, '.github', 'agents', 'crew.agent.md');
    const firstContent = await readFile(agentPath, 'utf-8');

    await runInit(TEST_ROOT, { mcpFrontmatter: true });

    const secondContent = await readFile(agentPath, 'utf-8');
    expect(secondContent).toBe(firstContent);
    expect(secondContent).not.toContain('mcp-servers:');
  });

  it('should create ceremonies.md', async () => {
    await runInit(TEST_ROOT);
    
    const ceremoniesPath = join(TEST_ROOT, '.crew', 'ceremonies.md');
    expect(existsSync(ceremoniesPath)).toBe(true);
  });

  it('should append to .gitattributes with merge=union rules', async () => {
    await runInit(TEST_ROOT);
    
    const gitattributesPath = join(TEST_ROOT, '.gitattributes');
    expect(existsSync(gitattributesPath)).toBe(true);
    
    const content = await readFile(gitattributesPath, 'utf-8');
    expect(content).toContain('.crew/decisions.md merge=union');
    expect(content).toContain('.crew/orchestration-log/** merge=union');
  });

  it('should append to .gitignore with runtime state exclusions', async () => {
    await runInit(TEST_ROOT);
    
    const gitignorePath = join(TEST_ROOT, '.gitignore');
    expect(existsSync(gitignorePath)).toBe(true);
    
    const content = await readFile(gitignorePath, 'utf-8');
    expect(content).toContain('.crew/orchestration-log/');
    expect(content).toContain('.crew/log/');
    expect(content).toContain('.crew/decisions/inbox/');
    expect(content).toContain('.crew/sessions/');
  });

  it('should copy templates to .crew/templates/', async () => {
    await runInit(TEST_ROOT);
    
    const templatesPath = join(TEST_ROOT, '.crew', 'templates');
    expect(existsSync(templatesPath)).toBe(true);
    
    // Should contain crew.agent.md.template (renamed to prevent CLI discovery)
    expect(existsSync(join(templatesPath, 'crew.agent.md.template'))).toBe(true);
  });

  it('should copy starter skills if none exist', async () => {
    await runInit(TEST_ROOT);
    
    const skillsPath = join(TEST_ROOT, '.github', 'skills');
    const skills = await readdir(skillsPath);
    
    // Should have at least one skill
    expect(skills.length).toBeGreaterThan(0);
  });

  it('should install exactly the 4 framework workflows', async () => {
    await runInit(TEST_ROOT);
    
    const workflowsPath = join(TEST_ROOT, '.github', 'workflows');
    expect(existsSync(workflowsPath)).toBe(true);
    
    const frameworkWorkflows = [
      'crew-heartbeat.yml',
      'crew-triage.yml',
      'crew-issue-assign.yml',
      'sync-crew-labels.yml'
    ];
    
    for (const workflow of frameworkWorkflows) {
      expect(existsSync(join(workflowsPath, workflow))).toBe(true);
    }
  });

  it('should NOT install CI/CD workflows', async () => {
    await runInit(TEST_ROOT);
    
    const workflowsPath = join(TEST_ROOT, '.github', 'workflows');
    
    const cicdWorkflows = [
      'crew-ci.yml',
      'crew-release.yml',
      'crew-docs.yml',
      'crew-insider-release.yml',
      'crew-preview.yml',
      'crew-promote.yml',
      'crew-label-enforce.yml'
    ];
    
    for (const workflow of cicdWorkflows) {
      expect(existsSync(join(workflowsPath, workflow))).toBe(false);
    }
  });

  it('should not overwrite existing files on re-init', async () => {
    await runInit(TEST_ROOT);
    
    const agentPath = join(TEST_ROOT, '.github', 'agents', 'crew.agent.md');
    const firstContent = await readFile(agentPath, 'utf-8');
    
    // Modify the file
    const modified = firstContent + '\n<!-- MODIFIED -->';
    await rm(agentPath);
    await mkdir(join(TEST_ROOT, '.github', 'agents'), { recursive: true });
    await require('fs/promises').writeFile(agentPath, modified);
    
    // Run init again
    await runInit(TEST_ROOT);
    
    // File should be skipped (not overwritten)
    const secondContent = await readFile(agentPath, 'utf-8');
    expect(secondContent).toContain('<!-- MODIFIED -->');
  });
});
