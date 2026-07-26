/**
 * Tests for the mcp-spec helper.
 *
 * The crew_state MCP server is launched via the on-PATH `crew` CLI as
 * `crew state-mcp` — no npx bootstrap, no version pinning, no registry probe.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { resolveCrewStateMcpSpec } from '../packages/crew-cli/src/cli/core/mcp-spec.js';

describe('resolveCrewStateMcpSpec', () => {
  it('launches the on-PATH crew CLI as `crew state-mcp`', () => {
    const spec = resolveCrewStateMcpSpec();
    expect(spec.command).toBe('crew');
    expect(spec.args).toEqual(['state-mcp']);
  });

  it('returns a spec with no npx bootstrap / version pinning', () => {
    const spec = resolveCrewStateMcpSpec();
    expect(spec.command).not.toBe('npx');
    expect(spec.args).not.toContain('-y');
    expect(spec.args.join(' ')).not.toMatch(/@blacklite\/crew-cli/);
  });
});

describe('init.ts uses resolveCrewStateMcpSpec (asymmetry fix)', () => {
  // Source-level architectural check: init.ts must reference the shared
  // resolver to keep the npm-registry fallback consistent with upgrade.ts.
  it('packages/crew-cli/src/cli/core/init.ts imports and calls resolveCrewStateMcpSpec', () => {
    const initPath = path.join(
      process.cwd(),
      'packages',
      'crew-cli',
      'src',
      'cli',
      'core',
      'init.ts',
    );
    const src = readFileSync(initPath, 'utf-8');
    expect(src).toMatch(/resolveCrewStateMcpSpec/);
    expect(src).toMatch(/from ['"]\.\/mcp-spec\.js['"]/);
  });

  it('upgrade.ts re-exports resolveCrewStateMcpSpec from mcp-spec (compat)', () => {
    const upgradePath = path.join(
      process.cwd(),
      'packages',
      'crew-cli',
      'src',
      'cli',
      'core',
      'upgrade.ts',
    );
    const src = readFileSync(upgradePath, 'utf-8');
    expect(src).toMatch(/from ['"]\.\/mcp-spec\.js['"]/);
  });
});

describe('isLocalOrUnpublishedVersion guard (#1204)', () => {
  // Import the guard function directly
  let isLocalOrUnpublishedVersion: (version: string) => boolean;

  beforeEach(async () => {
    const mod = await import('../packages/crew-cli/src/cli/core/upgrade.js');
    isLocalOrUnpublishedVersion = mod.isLocalOrUnpublishedVersion;
  });

  it('returns true for empty string', () => {
    expect(isLocalOrUnpublishedVersion('')).toBe(true);
  });

  it('returns true for 0.0.0 placeholder', () => {
    expect(isLocalOrUnpublishedVersion('0.0.0')).toBe(true);
  });

  it('returns true for 0.0.0-development sentinel', () => {
    expect(isLocalOrUnpublishedVersion('0.0.0-development')).toBe(true);
  });

  it('returns true for versions with + build metadata (local builds)', () => {
    expect(isLocalOrUnpublishedVersion('0.10.0+local.1234')).toBe(true);
    expect(isLocalOrUnpublishedVersion('1.0.0+build.42')).toBe(true);
  });

  it('returns false for normal published versions', () => {
    expect(isLocalOrUnpublishedVersion('0.10.0')).toBe(false);
    expect(isLocalOrUnpublishedVersion('0.9.6-preview.42')).toBe(false);
    expect(isLocalOrUnpublishedVersion('1.0.0-rc.1')).toBe(false);
  });
});
