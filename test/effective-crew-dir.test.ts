/**
 * Tests for effective-crew-dir: resolveStateDir() and effectiveCrewDir()
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { resolveStateDir, effectiveCrewDir } from '../packages/crew-cli/src/cli/core/effective-crew-dir.js';
import { resolveGlobalCrewPath } from '@blacklite/crew-sdk/resolution';

const TMP = join(process.cwd(), `.test-effective-crew-dir-${randomBytes(4).toString('hex')}`);

// Stub platform env vars so resolveGlobalCrewPath() points inside TMP (not the real user dir)
const origAppData = process.env['APPDATA'];
const origXdgConfig = process.env['XDG_CONFIG_HOME'];
beforeEach(() => {
  if (process.platform === 'win32') {
    process.env['APPDATA'] = TMP;
  } else {
    process.env['XDG_CONFIG_HOME'] = TMP;
  }
});
afterEach(() => {
  if (process.platform === 'win32') {
    if (origAppData === undefined) delete process.env['APPDATA'];
    else process.env['APPDATA'] = origAppData;
  } else {
    if (origXdgConfig === undefined) delete process.env['XDG_CONFIG_HOME'];
    else process.env['XDG_CONFIG_HOME'] = origXdgConfig;
  }
});

function scaffold(...dirs: string[]): void {
  for (const d of dirs) {
    mkdirSync(join(TMP, d), { recursive: true });
  }
}

function writeConfig(crewDir: string, config: Record<string, unknown>): void {
  writeFileSync(join(crewDir, 'config.json'), JSON.stringify(config, null, 2));
}

describe('resolveStateDir()', () => {
  beforeEach(() => {
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
  });

  it('returns local path when no config.json exists', () => {
    scaffold('.crew');
    const crewDir = join(TMP, '.crew');
    expect(resolveStateDir(crewDir)).toBe(crewDir);
  });

  it('returns local path when stateLocation is not external', () => {
    scaffold('.crew');
    const crewDir = join(TMP, '.crew');
    writeConfig(crewDir, { version: 1, teamRoot: '.' });
    expect(resolveStateDir(crewDir)).toBe(crewDir);
  });

  it('returns external path when stateLocation is external', () => {
    scaffold('.crew');
    const crewDir = join(TMP, '.crew');
    const projectKey = `test-external-${randomBytes(4).toString('hex')}`;
    writeConfig(crewDir, {
      version: 1,
      teamRoot: '.',
      projectKey,
      stateLocation: 'external',
    });

    const result = resolveStateDir(crewDir);
    const globalDir = resolveGlobalCrewPath();
    const expected = join(globalDir, 'projects', projectKey);
    expect(result).toBe(expected);
  });

  it('returns local path when stateLocation is external but projectKey is missing', () => {
    scaffold('.crew');
    const crewDir = join(TMP, '.crew');
    writeConfig(crewDir, {
      version: 1,
      teamRoot: '.',
      stateLocation: 'external',
    });
    expect(resolveStateDir(crewDir)).toBe(crewDir);
  });
});

describe('effectiveCrewDir()', () => {
  beforeEach(() => {
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
  });

  it('returns local for both when state is not externalized', () => {
    scaffold('.crew');
    const { local, stateDir } = effectiveCrewDir(TMP);
    expect(local.path).toBe(join(TMP, '.crew'));
    expect(stateDir).toBe(join(TMP, '.crew'));
  });

  it('returns external stateDir when state is externalized', () => {
    scaffold('.crew');
    const crewDir = join(TMP, '.crew');
    const projectKey = `test-effective-${randomBytes(4).toString('hex')}`;
    writeConfig(crewDir, {
      version: 1,
      teamRoot: '.',
      projectKey,
      stateLocation: 'external',
    });

    const { local, stateDir } = effectiveCrewDir(TMP);
    expect(local.path).toBe(crewDir);

    const globalDir = resolveGlobalCrewPath();
    expect(stateDir).toBe(join(globalDir, 'projects', projectKey));
  });

  it('preserves CrewDirInfo metadata in local field', () => {
    scaffold('.crew');
    const { local } = effectiveCrewDir(TMP);
    expect(local.name).toBe('.crew');
    expect(local.isLegacy).toBe(false);
  });
});
