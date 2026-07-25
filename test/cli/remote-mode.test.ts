/**
 * Tests for remote crew mode — crew link + crew init --mode remote (Issue #313)
 * Remote mode concept by @spboyer (Shayne Boyer), PR Blacklite/crew#131.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, isAbsolute } from 'node:path';
import { randomBytes } from 'node:crypto';
import { runLink } from '@blacklite/crew-cli/commands/link';
import { writeRemoteConfig } from '@blacklite/crew-cli/commands/init-remote';
import { resolveCrewPaths } from '@blacklite/crew-sdk/resolution';

const TMP = join(process.cwd(), `.test-remote-mode-${randomBytes(4).toString('hex')}`);

function scaffold(...dirs: string[]): void {
  for (const d of dirs) {
    mkdirSync(join(TMP, d), { recursive: true });
  }
}

function readConfig(projectDir: string): Record<string, unknown> {
  const raw = readFileSync(join(projectDir, '.crew', 'config.json'), 'utf-8');
  return JSON.parse(raw);
}

describe('crew link', () => {
  beforeEach(() => {
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
  });

  it('creates valid config.json with relative path', () => {
    const projectDir = join(TMP, 'my-project');
    const teamDir = join(TMP, 'team-repo');
    scaffold('my-project/.git', 'team-repo/.crew');

    runLink(projectDir, teamDir);

    const config = readConfig(projectDir);
    expect(config.version).toBe(1);
    expect(config.teamRoot).toBe(relative(projectDir, teamDir));
    expect(config.projectKey).toBeNull();
  });

  it('fails gracefully when target does not exist', () => {
    const projectDir = join(TMP, 'my-project');
    scaffold('my-project/.git');

    expect(() => runLink(projectDir, join(TMP, 'nonexistent'))).toThrow(/does not exist/);
  });

  it('fails when target has no .crew/ directory', () => {
    const projectDir = join(TMP, 'my-project');
    const teamDir = join(TMP, 'bare-repo');
    scaffold('my-project/.git', 'bare-repo');

    expect(() => runLink(projectDir, teamDir)).toThrow(/does not contain a \.crew\/ directory/);
  });

  it('config.json uses relative, not absolute paths', () => {
    const projectDir = join(TMP, 'my-project');
    const teamDir = join(TMP, 'team-repo');
    scaffold('my-project/.git', 'team-repo/.crew');

    runLink(projectDir, teamDir);

    const config = readConfig(projectDir);
    expect(isAbsolute(config.teamRoot as string)).toBe(false);
  });

  it('accepts .ai-team/ in the target as a valid team root', () => {
    const projectDir = join(TMP, 'my-project');
    const teamDir = join(TMP, 'legacy-team');
    scaffold('my-project/.git', 'legacy-team/.ai-team');

    runLink(projectDir, teamDir);

    const config = readConfig(projectDir);
    expect(config.version).toBe(1);
    expect(config.teamRoot).toBe(relative(projectDir, teamDir));
  });

  it('creates .crew/ directory if it does not exist', () => {
    const projectDir = join(TMP, 'my-project');
    const teamDir = join(TMP, 'team-repo');
    scaffold('my-project/.git', 'team-repo/.crew');

    expect(existsSync(join(projectDir, '.crew'))).toBe(false);
    runLink(projectDir, teamDir);
    expect(existsSync(join(projectDir, '.crew'))).toBe(true);
  });

  // ---- Round-trip: link → resolveCrewPaths ----

  it('round-trip: link → resolveCrewPaths → gets remote mode with correct teamDir', () => {
    const projectDir = join(TMP, 'my-project');
    const teamDir = join(TMP, 'team-repo');
    scaffold('my-project/.git', 'my-project/.crew', 'team-repo/.crew');

    runLink(projectDir, teamDir);

    const resolved = resolveCrewPaths(projectDir);
    expect(resolved).not.toBeNull();
    expect(resolved!.mode).toBe('remote');
    expect(resolved!.projectDir).toBe(join(projectDir, '.crew'));
    expect(resolved!.teamDir).toBe(teamDir);
  });
});

describe('writeRemoteConfig (init --mode remote)', () => {
  beforeEach(() => {
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
  });

  it('writes config.json with relative teamRoot', () => {
    const projectDir = join(TMP, 'project');
    const teamDir = join(TMP, 'team');
    scaffold('project', 'team');

    writeRemoteConfig(projectDir, teamDir);

    const config = readConfig(projectDir);
    expect(config.version).toBe(1);
    expect(config.teamRoot).toBe(relative(projectDir, teamDir));
    expect(config.projectKey).toBeNull();
    expect(isAbsolute(config.teamRoot as string)).toBe(false);
  });

  it('creates .crew/ directory if missing', () => {
    const projectDir = join(TMP, 'project');
    scaffold('project');

    writeRemoteConfig(projectDir, '../team');

    expect(existsSync(join(projectDir, '.crew', 'config.json'))).toBe(true);
  });
});
