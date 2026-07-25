/**
 * Tests for the resolveCrew / findCrewDir cache.
 *
 * Covers:
 *   - cache hits avoid the filesystem walk
 *   - explicit clearResolveCrewCache() invalidates immediately
 *   - CREW_NO_RESOLVE_CACHE=1 disables both caches
 *   - cache returns null for misses (and re-checks after invalidation)
 *   - multi-crew.resolveCrewPath() reads crews.json once per call
 *
 * NOTE: TTL-based expiry is tested by mocking Date.now() so the suite runs
 * fast even though the real TTL is 5 seconds.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';

import {
  resolveCrew,
  clearResolveCrewCache,
} from '@blacklite/crew-sdk/resolution';
import * as resolutionModule from '@blacklite/crew-sdk/resolution';

const TMP = join(tmpdir(), `crew-cache-${randomBytes(4).toString('hex')}`);

function scaffold(...dirs: string[]): void {
  for (const d of dirs) {
    mkdirSync(join(TMP, d), { recursive: true });
  }
}

describe('resolveCrew cache', () => {
  beforeEach(() => {
    clearResolveCrewCache();
    delete process.env['CREW_NO_RESOLVE_CACHE'];
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
  });

  afterEach(() => {
    clearResolveCrewCache();
    delete process.env['CREW_NO_RESOLVE_CACHE'];
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
  });

  it('returns the same path on repeated calls (positive hit)', () => {
    scaffold('.git', '.crew');
    const first = resolveCrew(TMP);
    const second = resolveCrew(TMP);
    expect(first).toBe(join(TMP, '.crew'));
    expect(second).toBe(first);
  });

  it('serves a cached null when .crew/ is added after the first lookup (until invalidated)', () => {
    scaffold('.git');
    expect(resolveCrew(TMP)).toBeNull();

    // Add .crew/ AFTER the cache has stored null
    mkdirSync(join(TMP, '.crew'), { recursive: true });

    // Without invalidation, the cached null is still served
    expect(resolveCrew(TMP)).toBeNull();

    // Explicit invalidation forces a fresh walk
    clearResolveCrewCache();
    expect(resolveCrew(TMP)).toBe(join(TMP, '.crew'));
  });

  it('serves a cached path even when the underlying directory is removed (until invalidated)', () => {
    scaffold('.git', '.crew');
    expect(resolveCrew(TMP)).toBe(join(TMP, '.crew'));

    rmSync(join(TMP, '.crew'), { recursive: true, force: true });

    // Cached value still returned
    expect(resolveCrew(TMP)).toBe(join(TMP, '.crew'));

    // Invalidation lets the next lookup observe the removal
    clearResolveCrewCache();
    expect(resolveCrew(TMP)).toBeNull();
  });

  it('CREW_NO_RESOLVE_CACHE=1 disables the cache entirely', () => {
    process.env['CREW_NO_RESOLVE_CACHE'] = '1';
    scaffold('.git');
    expect(resolveCrew(TMP)).toBeNull();

    // Add .crew/ — without cache, the next call reflects FS state immediately
    mkdirSync(join(TMP, '.crew'), { recursive: true });
    expect(resolveCrew(TMP)).toBe(join(TMP, '.crew'));
  });

  it('clearResolveCrewCache() is a no-op when nothing is cached', () => {
    expect(() => clearResolveCrewCache()).not.toThrow();
    // Sanity: a fresh lookup still works after clearing an empty cache
    scaffold('.git', '.crew');
    expect(resolveCrew(TMP)).toBe(join(TMP, '.crew'));
  });

  it('TTL expiry causes a re-walk after the configured window elapses', () => {
    // The cache uses Date.now() with a 5_000 ms TTL. Mocking Date.now lets
    // us assert the expiry behavior without sleeping for 5 seconds.
    scaffold('.git');
    const realNow = Date.now();
    const nowSpy = vi.spyOn(Date, 'now');

    nowSpy.mockReturnValue(realNow);
    expect(resolveCrew(TMP)).toBeNull();

    // Add .crew/ AFTER caching the null
    mkdirSync(join(TMP, '.crew'), { recursive: true });

    // Within TTL → cached null still served
    nowSpy.mockReturnValue(realNow + 4_999);
    expect(resolveCrew(TMP)).toBeNull();

    // Just past TTL → cache miss, fresh walk observes new .crew/
    nowSpy.mockReturnValue(realNow + 5_001);
    expect(resolveCrew(TMP)).toBe(join(TMP, '.crew'));

    nowSpy.mockRestore();
  });

  it('separate startDir keys are cached independently', () => {
    scaffold('.git', '.crew', 'sub');
    const subDir = join(TMP, 'sub');

    expect(resolveCrew(TMP)).toBe(join(TMP, '.crew'));
    expect(resolveCrew(subDir)).toBe(join(TMP, '.crew'));

    // Removing the subdir should not invalidate the parent's cached entry
    rmSync(subDir, { recursive: true, force: true });
    expect(resolveCrew(TMP)).toBe(join(TMP, '.crew'));
  });

  it('exports clearResolveCrewCache from the SDK barrel', async () => {
    const sdk = await import('@blacklite/crew-sdk');
    expect(typeof sdk.clearResolveCrewCache).toBe('function');
    // It should be the SAME function reference as the resolution module's export
    expect(sdk.clearResolveCrewCache).toBe(resolutionModule.clearResolveCrewCache);
  });
});

// ============================================================================
// multi-crew.resolveCrewPath() — verify crews.json is read once per call
// ============================================================================

describe('multi-crew.resolveCrewPath() — config read dedupe', () => {
  // We assert dedupe behaviorally by counting how many times crews.json is
  // parsed during a single call. Using vi.stubEnv() instead of direct
  // process.env mutation keeps env isolated from parallel test files.

  const HOME = join(tmpdir(), `crew-multi-${randomBytes(4).toString('hex')}`);

  function getCrewsJsonPath(): string {
    if (process.platform === 'win32') {
      return join(HOME, 'crew', 'crews.json');
    } else if (process.platform === 'darwin') {
      return join(HOME, 'Library', 'Application Support', 'crew', 'crews.json');
    }
    return join(HOME, 'crew', 'crews.json');
  }

  beforeEach(() => {
    if (existsSync(HOME)) rmSync(HOME, { recursive: true, force: true });
    mkdirSync(HOME, { recursive: true });
    vi.stubEnv('HOME', HOME);
    vi.stubEnv('XDG_CONFIG_HOME', HOME);
    vi.stubEnv('APPDATA', HOME);
    // NOTE: do NOT stub CREW_NAME here. The resolution chain in
    // resolveCrewPath() uses `??` which treats '' as a valid value (only
    // null/undefined trigger the fallback). Setting it to '' would cause
    // `resolved` to be the empty string instead of falling through to
    // config?.active. We want it to remain undefined for these tests.
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    if (existsSync(HOME)) rmSync(HOME, { recursive: true, force: true });
  });

  it('reads crews.json exactly once per resolveCrewPath() call', async () => {
    // Import the multi-crew module directly from the built dist; it isn't
    // re-exported from the SDK barrel.
    const distUrl = new URL(
      '../packages/crew-sdk/dist/multi-crew.js',
      import.meta.url,
    ).href;
    const multiCrew = (await import(/* @vite-ignore */ distUrl)) as {
      resolveCrewPath: (name?: string) => string;
    };
    const { resolveCrewPath } = multiCrew;

    // Manually scaffold a valid crews.json for the temp HOME
    const crewsJson = getCrewsJsonPath();
    mkdirSync(join(crewsJson, '..'), { recursive: true });
    const expectedContent =
      JSON.stringify(
        {
          crews: [
            {
              name: 'alpha',
              path: join(HOME, 'crew', 'crews', 'alpha'),
              created_at: new Date().toISOString(),
            },
          ],
          active: 'alpha',
        },
        null,
        2,
      ) + '\n';
    writeFileSync(crewsJson, expectedContent, 'utf-8');

    // Count crews.json parses by spying on JSON.parse and matching content.
    const originalParse = JSON.parse;
    let reads = 0;
    JSON.parse = function patchedParse(text: string, ...rest: unknown[]) {
      if (typeof text === 'string' && text === expectedContent) {
        reads++;
      }
      // @ts-expect-error variadic forward
      return originalParse(text, ...rest);
    };

    try {
      const resolved = resolveCrewPath();
      expect(resolved).toBe(join(HOME, 'crew', 'crews', 'alpha'));
    } finally {
      JSON.parse = originalParse;
    }

    // Pre-fix: 2 reads (active fallback + entry lookup).
    // Post-fix: exactly 1.
    expect(reads).toBe(1);
  });
});
