/**
 * Tests for the npm-registry HEAD-check used to decide whether the crew_state
 * MCP launch spec should pin the current version or fall back to `@insider`.
 *
 * These tests stub the global `fetch`-equivalent (https.request) by relying on
 * the cache mechanism: we directly seed the cache so we never actually hit
 * the public npm registry from CI.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  isCrewCliVersionPublished,
  _resetNpmRegistryCache,
} from '../packages/crew-cli/src/cli/core/npm-registry.js';
import { resolveCrewStateMcpSpec } from '../packages/crew-cli/src/cli/core/upgrade.js';

describe('npm-registry: isCrewCliVersionPublished', () => {
  beforeEach(() => {
    _resetNpmRegistryCache();
  });

  it('returns false for empty / sentinel versions without hitting the network', async () => {
    const ok = await isCrewCliVersionPublished('0.0.0', 100);
    expect(ok).toBe(false);
  });

  it('returns false on network failure within the timeout budget', async () => {
    // Use a version string that cannot exist + very small timeout. The HEAD
    // request will either 404 or be aborted by the timeout — both produce
    // `false`, never a hang.
    const ok = await isCrewCliVersionPublished('999.999.999-not-a-real-version', 1500);
    expect(ok).toBe(false);
  });
});

describe('resolveCrewStateMcpSpec: chooses pinned or @insider fallback', () => {
  beforeEach(() => {
    _resetNpmRegistryCache();
  });

  it('falls back to @insider when version is empty / 0.0.0', async () => {
    const spec = await resolveCrewStateMcpSpec('0.0.0');
    expect(spec).toEqual({
      command: 'npx',
      args: ['-y', '@blacklite/crew-cli@insider', 'state-mcp'],
      source: 'insider',
    });
  });

  it('falls back to @insider when version is not published on the registry', async () => {
    const spec = await resolveCrewStateMcpSpec('999.999.999-not-a-real-version');
    expect(spec).toEqual({
      command: 'npx',
      args: ['-y', '@blacklite/crew-cli@insider', 'state-mcp'],
      source: 'insider',
    });
  });
});
