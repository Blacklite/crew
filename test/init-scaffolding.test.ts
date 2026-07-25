/**
 * Init scaffolding completeness tests (#579)
 *
 * Verifies that `initCrew()` and `runInit()` produce a complete .crew/
 * directory — particularly the casting/ subtree that doctor validates.
 * Also confirms init works without errors in repos that have no remote.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { randomBytes } from 'crypto';
import { execFileSync } from 'child_process';
import { initCrew } from '@blacklite/crew-sdk';
import type { InitOptions } from '@blacklite/crew-sdk';
import { runInit } from '@blacklite/crew-cli/core/init';
import { runDoctor } from '@blacklite/crew-cli/commands/doctor';
import type { DoctorCheck } from '@blacklite/crew-cli/commands/doctor';

const TEST_ROOT = join(process.cwd(), `.test-init-scaffold-${randomBytes(4).toString('hex')}`);

/** Create a bare git repo at the given path (no remote). */
function gitInit(dir: string): void {
  execFileSync('git', ['init'], {
    cwd: dir,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  // Configure git identity so commits don't fail
  execFileSync('git', ['config', 'user.email', 'test@test.local'], {
    cwd: dir,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  execFileSync('git', ['config', 'user.name', 'Test'], {
    cwd: dir,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

/** Default InitOptions for SDK-level initCrew(). */
function sdkOptions(teamRoot: string): InitOptions {
  return {
    teamRoot,
    projectName: 'scaffold-test',
    agents: [{ name: 'edie', role: 'Engineer' }],
    configFormat: 'markdown',
    includeWorkflows: false,
  };
}

// ─── Casting directory scaffolding (SDK initCrew) ─────────────────────

describe('casting directory scaffolding — initCrew()', () => {
  beforeEach(async () => {
    if (existsSync(TEST_ROOT)) {
      await rm(TEST_ROOT, { recursive: true, force: true });
    }
    await mkdir(TEST_ROOT, { recursive: true });
  });

  afterEach(async () => {
    if (existsSync(TEST_ROOT)) {
      await rm(TEST_ROOT, { recursive: true, force: true });
    }
  });

  it('creates .crew/casting/ directory', async () => {
    await initCrew(sdkOptions(TEST_ROOT));
    expect(existsSync(join(TEST_ROOT, '.crew', 'casting'))).toBe(true);
  });

  it('creates .crew/casting/registry.json as valid JSON', async () => {
    await initCrew(sdkOptions(TEST_ROOT));

    const filePath = join(TEST_ROOT, '.crew', 'casting', 'registry.json');
    expect(existsSync(filePath)).toBe(true);

    const content = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed).toBeDefined();
    // Registry is an object (with agents key) or an array — both are valid
    expect(typeof parsed).toBe('object');
  });

  it('creates .crew/casting/policy.json as valid JSON', async () => {
    await initCrew(sdkOptions(TEST_ROOT));

    const filePath = join(TEST_ROOT, '.crew', 'casting', 'policy.json');
    expect(existsSync(filePath)).toBe(true);

    const content = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed).toBeDefined();
    expect(typeof parsed).toBe('object');
  });

  it('creates .crew/casting/history.json as valid JSON', async () => {
    await initCrew(sdkOptions(TEST_ROOT));

    const filePath = join(TEST_ROOT, '.crew', 'casting', 'history.json');
    expect(existsSync(filePath)).toBe(true);

    const content = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed).toBeDefined();
    expect(typeof parsed).toBe('object');
  });

  it('does not overwrite existing casting files on re-init', async () => {
    await initCrew(sdkOptions(TEST_ROOT));

    // Modify registry.json to detect overwrite
    const registryPath = join(TEST_ROOT, '.crew', 'casting', 'registry.json');
    const original = await readFile(registryPath, 'utf-8');
    const modified = JSON.stringify({ agents: { sentinel: true } });
    await rm(registryPath);
    const { writeFile } = await import('fs/promises');
    await writeFile(registryPath, modified, 'utf-8');

    // Re-init
    await initCrew(sdkOptions(TEST_ROOT));

    const after = await readFile(registryPath, 'utf-8');
    expect(after).toContain('sentinel');
  });
});

// ─── Casting directory scaffolding (CLI runInit) ───────────────────────

describe('casting directory scaffolding — runInit()', () => {
  beforeEach(async () => {
    if (existsSync(TEST_ROOT)) {
      await rm(TEST_ROOT, { recursive: true, force: true });
    }
    await mkdir(TEST_ROOT, { recursive: true });
  });

  afterEach(async () => {
    if (existsSync(TEST_ROOT)) {
      await rm(TEST_ROOT, { recursive: true, force: true });
    }
  });

  it('creates all three casting files via CLI init', async () => {
    await runInit(TEST_ROOT);

    for (const file of ['registry.json', 'policy.json', 'history.json']) {
      const filePath = join(TEST_ROOT, '.crew', 'casting', file);
      expect(existsSync(filePath), `${file} should exist`).toBe(true);

      const content = await readFile(filePath, 'utf-8');
      // Should parse without throwing
      const parsed = JSON.parse(content);
      expect(parsed).toBeDefined();
    }
  });
});

// ─── No-remote resilience ──────────────────────────────────────────────

describe('no-remote resilience (#579)', () => {
  beforeEach(async () => {
    if (existsSync(TEST_ROOT)) {
      await rm(TEST_ROOT, { recursive: true, force: true });
    }
    await mkdir(TEST_ROOT, { recursive: true });
  });

  afterEach(async () => {
    if (existsSync(TEST_ROOT)) {
      await rm(TEST_ROOT, { recursive: true, force: true });
    }
  });

  it('initCrew succeeds in a git repo with no remote', async () => {
    gitInit(TEST_ROOT);

    // Confirm no remote exists
    let hasRemote = true;
    try {
      execFileSync('git', ['remote', 'get-url', 'origin'], {
        cwd: TEST_ROOT,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch {
      hasRemote = false;
    }
    expect(hasRemote).toBe(false);

    // Init should not throw
    await expect(initCrew(sdkOptions(TEST_ROOT))).resolves.toBeDefined();

    // Verify scaffolding completed
    expect(existsSync(join(TEST_ROOT, '.crew'))).toBe(true);
    expect(existsSync(join(TEST_ROOT, '.crew', 'casting', 'registry.json'))).toBe(true);
  });

  it('initCrew succeeds in a brand-new git repo (just git init)', async () => {
    gitInit(TEST_ROOT);

    const result = await initCrew(sdkOptions(TEST_ROOT));
    expect(result.createdFiles.length).toBeGreaterThan(0);
    expect(result.crewDir).toBeTruthy();
  });

  it('runInit succeeds in a git repo with no remote', async () => {
    gitInit(TEST_ROOT);

    // Should complete without error
    await expect(runInit(TEST_ROOT)).resolves.toBeUndefined();

    // Verify key output files
    expect(existsSync(join(TEST_ROOT, '.crew'))).toBe(true);
    expect(existsSync(join(TEST_ROOT, '.github', 'agents', 'crew.agent.md'))).toBe(true);
  });

  it('runInit CLI: monorepo subfolder — no nested .git, agent at git root (#939)', async () => {
    // Set up a monorepo: git init at TEST_ROOT, run from a subfolder
    gitInit(TEST_ROOT);
    const subfolder = join(TEST_ROOT, 'services', 'api');
    await mkdir(subfolder, { recursive: true });

    // runInit from the subfolder — CLI should detect the parent git repo
    await expect(runInit(subfolder)).resolves.toBeUndefined();

    // 1. No nested .git/ in subfolder (the original bug)
    expect(existsSync(join(subfolder, '.git'))).toBe(false);
    // 2. .crew/ created in the subfolder
    expect(existsSync(join(subfolder, '.crew'))).toBe(true);
    expect(existsSync(join(subfolder, '.crew', 'casting', 'registry.json'))).toBe(true);
    // 3. crew.agent.md placed at the git root, not the subfolder
    expect(existsSync(join(TEST_ROOT, '.github', 'agents', 'crew.agent.md'))).toBe(true);
    expect(existsSync(join(subfolder, '.github', 'agents', 'crew.agent.md'))).toBe(false);
  });

  it('initCrew succeeds when git is not initialized at all', async () => {
    // TEST_ROOT is a plain directory — no git init
    await expect(initCrew(sdkOptions(TEST_ROOT))).resolves.toBeDefined();
    expect(existsSync(join(TEST_ROOT, '.crew', 'casting', 'registry.json'))).toBe(true);
  });

  it('monorepo subfolder: no nested git init, agent at root, .crew in subfolder (#939)', async () => {
    // Set up a monorepo with a subfolder
    gitInit(TEST_ROOT);
    const subfolder = join(TEST_ROOT, 'team-alpha');
    await mkdir(subfolder, { recursive: true });

    // Run SDK init with agentFileRoot pointing to the git root
    // Enable workflows to test monorepo skip behavior
    const result = await initCrew({
      ...sdkOptions(subfolder),
      agentFileRoot: TEST_ROOT,
      includeWorkflows: true,
    });

    // 1. No nested .git/ in subfolder
    expect(existsSync(join(subfolder, '.git'))).toBe(false);
    // 2. .crew/ created in subfolder
    expect(existsSync(join(subfolder, '.crew'))).toBe(true);
    expect(existsSync(join(subfolder, '.crew', 'casting', 'registry.json'))).toBe(true);
    // 3. crew.agent.md created at monorepo root
    expect(existsSync(join(TEST_ROOT, '.github', 'agents', 'crew.agent.md'))).toBe(true);
    // 4. crew.agent.md NOT in subfolder
    expect(existsSync(join(subfolder, '.github', 'agents', 'crew.agent.md'))).toBe(false);
    // 5. createdFiles should include relative path with ..
    expect(result.createdFiles.some(f => f.includes('crew.agent.md'))).toBe(true);
    // 6. Workflows NOT placed in subfolder (GitHub Actions ignores them there)
    expect(existsSync(join(subfolder, '.github', 'workflows'))).toBe(false);
    // 7. Warning emitted about skipped workflows
    expect(result.warnings?.some(w => w.includes('monorepo-subfolder'))).toBe(true);
  });
});

// ─── Doctor validation after init ──────────────────────────────────────

describe('doctor passes after init (#579)', () => {
  beforeEach(async () => {
    if (existsSync(TEST_ROOT)) {
      await rm(TEST_ROOT, { recursive: true, force: true });
    }
    await mkdir(TEST_ROOT, { recursive: true });
  });

  afterEach(async () => {
    if (existsSync(TEST_ROOT)) {
      await rm(TEST_ROOT, { recursive: true, force: true });
    }
  });

  it('doctor reports casting/registry.json as pass after initCrew()', async () => {
    await initCrew(sdkOptions(TEST_ROOT));

    const checks = await runDoctor(TEST_ROOT);
    const registryCheck = checks.find(
      (c: DoctorCheck) => c.name === 'casting/registry.json exists',
    );
    expect(registryCheck).toBeDefined();
    expect(registryCheck?.status).toBe('pass');
  });

  it('doctor has zero failures after initCrew()', async () => {
    await initCrew(sdkOptions(TEST_ROOT));

    const checks = await runDoctor(TEST_ROOT);
    const failures = checks.filter((c: DoctorCheck) => c.status === 'fail');
    // All core checks should pass after a fresh init
    expect(failures).toEqual([]);
  });

  it('doctor reports casting/registry.json as pass after runInit()', async () => {
    await runInit(TEST_ROOT);

    const checks = await runDoctor(TEST_ROOT);
    const registryCheck = checks.find(
      (c: DoctorCheck) => c.name === 'casting/registry.json exists',
    );
    expect(registryCheck).toBeDefined();
    expect(registryCheck?.status).toBe('pass');
  });

  it('doctor fails when casting/registry.json is missing', async () => {
    await initCrew(sdkOptions(TEST_ROOT));

    // Remove registry.json
    await rm(join(TEST_ROOT, '.crew', 'casting', 'registry.json'));

    const checks = await runDoctor(TEST_ROOT);
    const registryCheck = checks.find(
      (c: DoctorCheck) => c.name === 'casting/registry.json exists',
    );
    expect(registryCheck).toBeDefined();
    expect(registryCheck?.status).toBe('fail');
  });

  it('doctor fails when casting/registry.json is invalid JSON', async () => {
    await initCrew(sdkOptions(TEST_ROOT));

    // Corrupt registry.json
    const { writeFile } = await import('fs/promises');
    await writeFile(
      join(TEST_ROOT, '.crew', 'casting', 'registry.json'),
      'NOT VALID JSON {{{',
      'utf-8',
    );

    const checks = await runDoctor(TEST_ROOT);
    const registryCheck = checks.find(
      (c: DoctorCheck) => c.name === 'casting/registry.json exists',
    );
    expect(registryCheck).toBeDefined();
    expect(registryCheck?.status).toBe('fail');
  });
});

// ─── crew.agent.md template handling (#730) ───────────────────────────

describe('crew.agent.md template handling (#730)', () => {
  beforeEach(async () => {
    if (existsSync(TEST_ROOT)) {
      await rm(TEST_ROOT, { recursive: true, force: true });
    }
    await mkdir(TEST_ROOT, { recursive: true });
  });

  afterEach(async () => {
    if (existsSync(TEST_ROOT)) {
      await rm(TEST_ROOT, { recursive: true, force: true });
    }
  });

  it('initCrew creates crew.agent.md when template exists (happy-path regression)', async () => {
    const result = await initCrew(sdkOptions(TEST_ROOT));

    // crew.agent.md should be in createdFiles
    const agentEntry = result.createdFiles.find(f => f.includes('crew.agent.md'));
    expect(agentEntry).toBeDefined();

    // File should exist on disk
    const agentPath = join(TEST_ROOT, '.github', 'agents', 'crew.agent.md');
    expect(existsSync(agentPath)).toBe(true);

    // No warnings should be emitted
    expect(result.warnings).toEqual([]);
  });

  it('initCrew returns warning when crew.agent.md template is missing', async () => {
    const { FSStorageProvider } = await import('@blacklite/crew-sdk');
    const realStorage = new FSStorageProvider();

    // Create a proxy storage that hides crew.agent.md.template
    const maskedStorage = new Proxy(realStorage, {
      get(target, prop, receiver) {
        if (prop === 'existsSync') {
          return (filePath: string) => {
            if (filePath.endsWith('crew.agent.md.template')) {
              return false;
            }
            return target.existsSync(filePath);
          };
        }
        if (prop === 'readSync') {
          return (filePath: string) => {
            if (filePath.endsWith('crew.agent.md.template')) {
              return undefined;
            }
            return target.readSync(filePath);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });

    const result = await initCrew(sdkOptions(TEST_ROOT), maskedStorage as typeof realStorage);

    // Warning should be present
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain('crew.agent.md template not found');

    // crew.agent.md should NOT be in createdFiles
    const agentEntry = result.createdFiles.find(f => f.includes('crew.agent.md'));
    expect(agentEntry).toBeUndefined();

    // Other files should still be created
    expect(result.createdFiles.length).toBeGreaterThan(0);
  });
});

// ─── .gitignore marker block for two-layer/orphan backends (#1228) ─────────

describe('.gitignore state-backend marker block — initCrew()', () => {
  beforeEach(async () => {
    if (existsSync(TEST_ROOT)) {
      await rm(TEST_ROOT, { recursive: true, force: true });
    }
    await mkdir(TEST_ROOT, { recursive: true });
    gitInit(TEST_ROOT);
  });

  afterEach(async () => {
    if (existsSync(TEST_ROOT)) {
      await rm(TEST_ROOT, { recursive: true, force: true });
    }
  });

  it('initCrew({stateBackend: "two-layer"}) adds the marker block to .gitignore', async () => {
    await initCrew({ ...sdkOptions(TEST_ROOT), stateBackend: 'two-layer' });

    const gitignorePath = join(TEST_ROOT, '.gitignore');
    expect(existsSync(gitignorePath)).toBe(true);
    const content = await readFile(gitignorePath, 'utf-8');
    expect(content).toContain('# Crew: state owned by crew-state branch (two-layer/orphan backend)');
    expect(content).toContain('.crew/decisions.md');
    expect(content).toContain('.crew/agents/*/history.md');
    expect(content).toContain('# /Crew: state owned by crew-state branch');
  });

  it('initCrew({stateBackend: "orphan"}) adds the marker block to .gitignore', async () => {
    await initCrew({ ...sdkOptions(TEST_ROOT), stateBackend: 'orphan' });

    const gitignorePath = join(TEST_ROOT, '.gitignore');
    expect(existsSync(gitignorePath)).toBe(true);
    const content = await readFile(gitignorePath, 'utf-8');
    expect(content).toContain('# Crew: state owned by crew-state branch (two-layer/orphan backend)');
    expect(content).toContain('.crew/decisions.md');
    expect(content).toContain('.crew/agents/*/history.md');
  });

  it('initCrew({stateBackend: "local"}) does NOT add the marker block to .gitignore', async () => {
    await initCrew({ ...sdkOptions(TEST_ROOT), stateBackend: 'local' });

    const gitignorePath = join(TEST_ROOT, '.gitignore');
    expect(existsSync(gitignorePath)).toBe(true);
    const content = await readFile(gitignorePath, 'utf-8');
    expect(content).not.toContain('# Crew: state owned by crew-state branch');
    expect(content).not.toContain('.crew/decisions.md');
    expect(content).not.toContain('.crew/agents/*/history.md');
  });

  it('initCrew() with no stateBackend does NOT add the marker block', async () => {
    await initCrew(sdkOptions(TEST_ROOT));

    const gitignorePath = join(TEST_ROOT, '.gitignore');
    expect(existsSync(gitignorePath)).toBe(true);
    const content = await readFile(gitignorePath, 'utf-8');
    expect(content).not.toContain('# Crew: state owned by crew-state branch');
  });

  it('initCrew with two-layer is idempotent — second call does not duplicate marker block', async () => {
    await initCrew({ ...sdkOptions(TEST_ROOT), stateBackend: 'two-layer' });
    await initCrew({ ...sdkOptions(TEST_ROOT), stateBackend: 'two-layer' });

    const content = await readFile(join(TEST_ROOT, '.gitignore'), 'utf-8');
    const occurrences = (content.match(/# Crew: state owned by crew-state branch/g) ?? []).length;
    expect(occurrences).toBe(1);
  });
});
