/**
 * Tests for crew consult CLI command.
 *
 * The consult command requires a personal crew to exist. These tests focus on:
 * 1. SDK isConsultMode() function (no personal crew needed)
 * 2. Direct import of runConsult() when possible
 * 3. Error handling tests for the CLI
 *
 * @module test/cli/consult
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  readFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { isConsultMode, type CrewDirConfig } from '@blacklite/crew-sdk';

const TEST_ROOT = join(
  tmpdir(),
  `.test-cli-consult-${randomBytes(4).toString('hex')}`,
);

/**
 * Initialize a minimal git repo for testing.
 */
function initGitRepo(dir: string): void {
  execSync('git init', { cwd: dir, stdio: 'ignore' });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'ignore' });
  execSync('git config user.name "Test User"', { cwd: dir, stdio: 'ignore' });
}

/**
 * Run crew CLI command in the test directory.
 */
function runCrew(
  args: string,
  cwd: string,
  env?: Record<string, string>,
): { stdout: string; stderr: string; exitCode: number } {
  const cliPath = join(process.cwd(), 'packages/crew-cli/dist/cli-entry.js');
  try {
    const stdout = execSync(`node ${cliPath} ${args}`, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
      exitCode: e.status ?? 1,
    };
  }
}

function expectedGlobalCrewPath(globalConfig: string): string {
  if (process.platform === 'win32') return join(globalConfig, 'crew');
  if (process.platform === 'darwin') return join(globalConfig, 'Library', 'Application Support', 'crew');
  return join(globalConfig, 'crew');
}

describe('CLI: crew consult', { timeout: 30_000 }, () => {
  beforeEach(() => {
    mkdirSync(TEST_ROOT, { recursive: true });
    initGitRepo(TEST_ROOT);
  });

  afterEach(() => {
    rmSync(TEST_ROOT, { recursive: true, force: true });
  });

  describe('isConsultMode SDK function', () => {
    it('returns true when consult flag is true', () => {
      const config: CrewDirConfig = {
        version: 1,
        teamRoot: '/tmp/crew',
        consult: true,
      };
      expect(isConsultMode(config)).toBe(true);
    });

    it('returns false when consult flag is false', () => {
      const config: CrewDirConfig = {
        version: 1,
        teamRoot: '/tmp/crew',
        consult: false,
      };
      expect(isConsultMode(config)).toBe(false);
    });

    it('returns false when consult flag is missing', () => {
      const config: CrewDirConfig = {
        version: 1,
        teamRoot: '/tmp/crew',
      };
      expect(isConsultMode(config)).toBe(false);
    });
  });

  describe('consult mode config format', () => {
    it('creates valid consult mode config structure', () => {
      // Simulate what the consult command creates
      mkdirSync(join(TEST_ROOT, '.crew'), { recursive: true });
      const config: CrewDirConfig = {
        version: 1,
        teamRoot: '/home/user/.crew',
        projectKey: 'consult',
        consult: true,
      };
      writeFileSync(
        join(TEST_ROOT, '.crew', 'config.json'),
        JSON.stringify(config, null, 2),
      );

      // Verify the config can be read and detected
      const readConfig = JSON.parse(
        readFileSync(join(TEST_ROOT, '.crew', 'config.json'), 'utf-8'),
      );
      expect(isConsultMode(readConfig)).toBe(true);
      expect(readConfig.teamRoot).toBe('/home/user/.crew');
      expect(readConfig.projectKey).toBe('consult');
    });
  });

  describe('git exclude integration', () => {
    it('.git/info/exclude can be written to in a fresh git repo', () => {
      // Verify the git exclude mechanism works
      const excludePath = join(TEST_ROOT, '.git', 'info', 'exclude');
      mkdirSync(join(TEST_ROOT, '.git', 'info'), { recursive: true });
      writeFileSync(excludePath, '# Test exclude\n.crew/\n');

      const content = readFileSync(excludePath, 'utf-8');
      expect(content).toContain('.crew/');
    });

    it('git ignores files in .git/info/exclude', () => {
      // Set up git exclude and a file that should be ignored
      mkdirSync(join(TEST_ROOT, '.git', 'info'), { recursive: true });
      writeFileSync(
        join(TEST_ROOT, '.git', 'info', 'exclude'),
        '.crew/\n',
      );
      mkdirSync(join(TEST_ROOT, '.crew'), { recursive: true });
      writeFileSync(join(TEST_ROOT, '.crew', 'config.json'), '{}');

      // Git status should not show .crew/
      const status = execSync('git status --porcelain', {
        cwd: TEST_ROOT,
        encoding: 'utf-8',
      });
      expect(status).not.toContain('.crew');
    });
  });

  describe('error handling', () => {
    it('fails outside a git repository', () => {
      // Create a non-git directory
      const nonGitDir = join(TEST_ROOT, 'non-git');
      mkdirSync(nonGitDir, { recursive: true });

      const result = runCrew('consult', nonGitDir);
      expect(result.exitCode).not.toBe(0);
      // CLI will fail due to no personal crew first, or no git repo
      expect(result.stderr).toBeTruthy();
    });

    it('requires personal crew to exist', () => {
      // Override XDG_CONFIG_HOME + APPDATA to point to a non-existent path
      // This ensures the SDK won't find a personal crew
      const nonexistent = join(TEST_ROOT, 'nonexistent-config');
      const result = runCrew('consult', TEST_ROOT, {
        HOME: nonexistent,
        XDG_CONFIG_HOME: nonexistent,
        APPDATA: nonexistent,
        LOCALAPPDATA: nonexistent,
      });
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toMatch(/no personal crew/i);
    });
  });

  describe('happy path: init global → consult → status → extract', () => {
    const globalConfig = join(TEST_ROOT, 'xdg-config');
    const projectDir = join(TEST_ROOT, 'their-project');
    const envWithGlobal = {
      HOME: globalConfig,
      XDG_CONFIG_HOME: globalConfig,
      // On Windows, resolveGlobalCrewPath() reads APPDATA, not XDG_CONFIG_HOME
      APPDATA: globalConfig,
      LOCALAPPDATA: globalConfig,
    };

    beforeEach(() => {
      // 1. Create a personal (global) crew via `crew init --global`
      mkdirSync(globalConfig, { recursive: true });
      const initResult = runCrew('init --global', TEST_ROOT, envWithGlobal);
      expect(initResult.exitCode).toBe(0);

      // Verify the personal crew was created
      const personalCrewDir = join(expectedGlobalCrewPath(globalConfig), 'personal-crew');
      expect(existsSync(personalCrewDir)).toBe(true);

      // 2. Create a fresh project with its own git repo (no .crew/)
      mkdirSync(projectDir, { recursive: true });
      initGitRepo(projectDir);
    });

    it('crew consult sets up consult mode in the project', () => {
      const result = runCrew('consult', projectDir, envWithGlobal);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Consult mode activated');

      // .crew/ should exist in the project
      expect(existsSync(join(projectDir, '.crew'))).toBe(true);
      expect(existsSync(join(projectDir, '.crew', 'config.json'))).toBe(true);

      // config.json should have consult: true
      const config = JSON.parse(
        readFileSync(join(projectDir, '.crew', 'config.json'), 'utf-8'),
      );
      expect(config.consult).toBe(true);
      expect(config.sourceCrew).toBeTruthy();

      // extract/ staging directory should exist
      expect(existsSync(join(projectDir, '.crew', 'extract'))).toBe(true);

      // .git/info/exclude should contain .crew/
      const excludePath = join(projectDir, '.git', 'info', 'exclude');
      expect(existsSync(excludePath)).toBe(true);
      const excludeContent = readFileSync(excludePath, 'utf-8');
      expect(excludeContent).toContain('.crew/');

      // git status should show nothing (invisible to project)
      const gitStatus = execSync('git status --porcelain', {
        cwd: projectDir,
        encoding: 'utf-8',
      });
      expect(gitStatus).not.toContain('.crew');
    });

    it('crew consult --status reports active consult mode', () => {
      // First enter consult mode
      runCrew('consult', projectDir, envWithGlobal);

      // Then check status
      const result = runCrew('consult --status', projectDir, envWithGlobal);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Consult mode active');
    });

    it('crew consult --check shows dry-run without creating files', () => {
      const result = runCrew('consult --check', projectDir, envWithGlobal);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Dry-run');
      expect(result.stdout).toContain('consult: true');

      // .crew/ should NOT exist (dry run)
      expect(existsSync(join(projectDir, '.crew'))).toBe(false);
    });

    it('crew extract --dry-run shows staged learnings without modifying', () => {
      // Enter consult mode
      runCrew('consult', projectDir, envWithGlobal);

      // Stage a learning manually (simulating what Scribe does during a session)
      const extractDir = join(projectDir, '.crew', 'extract');
      writeFileSync(
        join(extractDir, 'use-async-await.md'),
        '### Always use async/await\n\nPrefer async/await over raw promises.',
      );

      // Dry-run extract
      const result = runCrew('extract --dry-run', projectDir, envWithGlobal);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Dry-run');
      expect(result.stdout).toContain('use-async-await.md');

      // The learning should still be in extract/ (not removed)
      expect(existsSync(join(extractDir, 'use-async-await.md'))).toBe(true);
    });

    it('crew extract with no staged learnings reports empty', () => {
      // Enter consult mode (no learnings staged)
      runCrew('consult', projectDir, envWithGlobal);

      const result = runCrew('extract', projectDir, envWithGlobal);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('No learnings staged');
    });

    it('crew consult fails if project already has .crew/', () => {
      // Enter consult mode first time
      runCrew('consult', projectDir, envWithGlobal);

      // Try again — should fail because .crew/ already exists
      const result = runCrew('consult', projectDir, envWithGlobal);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toMatch(/already has/i);
    });
  });
});
