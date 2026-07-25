/**
 * crew cast — session cast display tests
 *
 * Verifies the cast command correctly discovers project agents
 * by deriving the correct base path from resolveCrewPaths():
 *   - local mode:  parent of paths.projectDir (repo root)
 *   - remote mode: paths.teamDir (team repo root)
 * Regression tests for #871 (double-nested .crew/.crew/agents path).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { randomBytes } from 'crypto';

const TEST_ROOT = join(process.cwd(), `.test-cast-${randomBytes(4).toString('hex')}`);

/**
 * Charter using ## Identity sections, as expected by parseCharterMetadata().
 * The agent name and role are read from these sections; fallback is the
 * directory name when the section is absent.
 */
const SAMPLE_CHARTER = `## Identity

**Name:** TestAgent
**Role:** Core Dev

Test agent for cast command tests.
`;

async function scaffold(root: string): Promise<void> {
  const sq = join(root, '.crew');
  await mkdir(join(sq, 'agents', 'test-agent'), { recursive: true });
  await writeFile(join(sq, 'agents', 'test-agent', 'charter.md'), SAMPLE_CHARTER);
  await mkdir(join(sq, 'casting'), { recursive: true });
  await writeFile(join(sq, 'team.md'), '# Team\n\n## Members\n\n- TestAgent\n');
  await writeFile(join(sq, 'routing.md'), '# Routing\n');
  await writeFile(join(sq, 'decisions.md'), '# Decisions\n');
  await writeFile(
    join(sq, 'casting', 'registry.json'),
    JSON.stringify({ agents: [] }, null, 2),
  );
}

// Mock personal agents to isolate project agent discovery
vi.mock('@blacklite/crew-sdk/agents/personal', () => ({
  resolvePersonalAgents: vi.fn(async () => [] as unknown[]),
  mergeSessionCast: vi.fn((project: unknown[], personal: unknown[]) => [...(project as unknown[]), ...(personal as unknown[])]),
}));

describe('crew cast', () => {
  beforeEach(async () => {
    if (existsSync(TEST_ROOT)) {
      await rm(TEST_ROOT, { recursive: true, force: true });
    }
    await mkdir(TEST_ROOT, { recursive: true });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (existsSync(TEST_ROOT)) {
      await rm(TEST_ROOT, { recursive: true, force: true });
    }
  });

  it('discovers project agents using repo root, not .crew/ dir (#871)', async () => {
    await scaffold(TEST_ROOT);

    // Suppress console output during test
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { runCast } = await import('@blacklite/crew-cli/commands/cast');
    await runCast(TEST_ROOT);

    // If the bug were present (passing paths.teamDir = .crew/ to LocalAgentSource),
    // it would look in .crew/.crew/agents/ — which doesn't exist — and find 0 agents.
    // With the fix, it looks in TEST_ROOT/.crew/agents/ and finds our test agent.
    const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('TestAgent');
    expect(output).toContain('Session Cast');
  });

  it('does not look in double-nested .crew/.crew/agents/ path', async () => {
    await scaffold(TEST_ROOT);

    // Create a decoy agent at the WRONG double-nested path
    const wrongPath = join(TEST_ROOT, '.crew', '.crew', 'agents', 'decoy');
    await mkdir(wrongPath, { recursive: true });
    await writeFile(join(wrongPath, 'charter.md'), `## Identity\n\n**Name:** Decoy\n**Role:** Wrong\n`);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { runCast } = await import('@blacklite/crew-cli/commands/cast');
    await runCast(TEST_ROOT);

    const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    // Should find TestAgent from correct path, not decoy from wrong path
    expect(output).toContain('TestAgent');
    expect(output).not.toContain('Decoy');
  });

  it('discovers agents when runCast is called from a nested subdirectory', async () => {
    await scaffold(TEST_ROOT);

    // Simulate invoking from a deep nested working directory — resolveCrewPaths
    // walks up the tree until it finds .crew/, then the fix computes the repo root
    // as path.resolve(projectDir, '..') so LocalAgentSource scans the right path.
    const nestedDir = join(TEST_ROOT, 'src', 'feature', 'deep');
    await mkdir(nestedDir, { recursive: true });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { runCast } = await import('@blacklite/crew-cli/commands/cast');
    await runCast(nestedDir);

    const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('TestAgent');
    expect(output).toContain('Session Cast');
  });

  it('discovers agents from team repository in remote mode', async () => {
    // Remote mode: project has .crew/config.json with teamRoot pointing to a
    // separate team repo.  Agents live in <teamRoot>/.crew/agents/, not in the
    // project's own .crew/.
    const projectRoot = join(TEST_ROOT, 'project');
    const teamRoot = join(TEST_ROOT, 'team');

    // Bootstrap project's .crew with a config.json that enables remote mode
    const projectSq = join(projectRoot, '.crew');
    await mkdir(projectSq, { recursive: true });
    await writeFile(
      join(projectSq, 'config.json'),
      JSON.stringify({ version: 1, teamRoot: '../team' }),
    );

    // Team repo holds the agents
    await mkdir(join(teamRoot, '.crew', 'agents', 'remote-agent'), { recursive: true });
    await writeFile(
      join(teamRoot, '.crew', 'agents', 'remote-agent', 'charter.md'),
      `## Identity\n\n**Name:** RemoteAgent\n**Role:** Remote Engineer\n`,
    );

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { runCast } = await import('@blacklite/crew-cli/commands/cast');
    await runCast(projectRoot);

    const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('RemoteAgent');
    expect(output).toContain('Session Cast');
  });

  it('discovers agents from the external state dir when state is externalized (#1399)', async () => {
    const extGlobal = join(TEST_ROOT, 'global');
    const projectKey = `test-cast-ext-${randomBytes(4).toString('hex')}`;
    const origAppData = process.env['APPDATA'];
    const origXdg = process.env['XDG_CONFIG_HOME'];
    // Point resolveGlobalCrewPath() inside extGlobal (not the real user dir)
    if (process.platform === 'win32') process.env['APPDATA'] = extGlobal;
    else process.env['XDG_CONFIG_HOME'] = extGlobal;

    try {
      // Local repo: marker .crew as `crew externalize` leaves it, plus a
      // stale local agent that must NOT be discovered
      const sq = join(TEST_ROOT, '.crew');
      await mkdir(join(sq, 'agents', 'stale-agent'), { recursive: true });
      await writeFile(
        join(sq, 'config.json'),
        JSON.stringify({ version: 1, teamRoot: '.', projectKey, stateLocation: 'external' }),
      );
      await writeFile(
        join(sq, 'agents', 'stale-agent', 'charter.md'),
        `## Identity\n\n**Name:** StaleAgent\n**Role:** Leftover\n`,
      );

      // External state dir: agents live directly under it, no .crew nesting
      const extAgent = join(extGlobal, 'crew', 'projects', projectKey, 'agents', 'ext-agent');
      await mkdir(extAgent, { recursive: true });
      await writeFile(
        join(extAgent, 'charter.md'),
        `## Identity\n\n**Name:** ExternalAgent\n**Role:** External Dev\n`,
      );

      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const { runCast } = await import('@blacklite/crew-cli/commands/cast');
      await runCast(TEST_ROOT);

      const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
      expect(output).toContain('ExternalAgent');
      expect(output).not.toContain('StaleAgent');
    } finally {
      if (origAppData === undefined) delete process.env['APPDATA'];
      else process.env['APPDATA'] = origAppData;
      if (origXdg === undefined) delete process.env['XDG_CONFIG_HOME'];
      else process.env['XDG_CONFIG_HOME'] = origXdg;
    }
  });
});
