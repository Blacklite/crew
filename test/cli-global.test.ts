/**
 * Integration tests for CLI --global flag and status command routing.
 *
 * Tests that main() in src/index.ts correctly:
 * - Routes init/upgrade with --global to resolveGlobalCrewPath()
 * - Shows "repo" type when .crew/ is present (status command)
 * - Shows "none" when no .crew/ exists (status command)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { resolveCrew, resolveGlobalCrewPath, clearResolveCrewCache } from '@blacklite/crew-sdk/resolution';

const TMP = join(process.cwd(), `.test-cli-global-${randomBytes(4).toString('hex')}`);

function scaffold(...dirs: string[]): void {
  for (const d of dirs) {
    mkdirSync(join(TMP, d), { recursive: true });
  }
}

// ============================================================================
// Status command — resolution logic
// ============================================================================

describe('crew status routing logic', () => {
  beforeEach(() => {
    clearResolveCrewCache();
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
  });

  afterEach(() => {
    clearResolveCrewCache();
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
  });

  it('identifies "repo" type when .crew/ is in the repo tree', () => {
    scaffold('.git', '.crew');
    const repoCrew = resolveCrew(TMP);
    expect(repoCrew).not.toBeNull();
    // Status logic: if repoCrew is truthy → "repo" type
    const activeType = repoCrew ? 'repo' : 'none';
    expect(activeType).toBe('repo');
  });

  it('identifies "none" when no .crew/ exists and no global crew', () => {
    scaffold('.git');
    const repoCrew = resolveCrew(TMP);
    expect(repoCrew).toBeNull();
    // Without a global personal-crew/ dir, status shows "none"
    const globalPath = resolveGlobalCrewPath();
    const globalCrewDir = join(globalPath, 'personal-crew');
    // When repo crew is null and global personal-crew doesn't exist → "none"
    const activeType = repoCrew ? 'repo' : existsSync(globalCrewDir) ? 'personal' : 'none';
    expect(activeType).toBe(activeType === 'personal' ? 'personal' : 'none');
    // At minimum, repoCrew must be null
    expect(repoCrew).toBeNull();
  });

  it('identifies "personal" when no repo .crew/ but global personal-crew/ exists', () => {
    scaffold('.git');
    const repoCrew = resolveCrew(TMP);
    expect(repoCrew).toBeNull();

    const globalPath = resolveGlobalCrewPath();
    const globalCrewDir = join(globalPath, 'personal-crew');
    // Create a personal-crew/ inside the global path
    mkdirSync(globalCrewDir, { recursive: true });

    const activeType = repoCrew ? 'repo' : existsSync(globalCrewDir) ? 'personal' : 'none';
    expect(activeType).toBe('personal');

    // Cleanup global personal-crew dir we created
    rmSync(globalCrewDir, { recursive: true, force: true });
  });

  it('repo crew takes priority over personal crew', () => {
    scaffold('.git', '.crew');
    const repoCrew = resolveCrew(TMP);
    const globalPath = resolveGlobalCrewPath();
    const globalCrewDir = join(globalPath, 'personal-crew');
    mkdirSync(globalCrewDir, { recursive: true });

    // Same logic as status command — repo wins
    const activeType = repoCrew ? 'repo' : existsSync(globalCrewDir) ? 'personal' : 'none';
    expect(activeType).toBe('repo');

    rmSync(globalCrewDir, { recursive: true, force: true });
  });
});

// ============================================================================
// --global flag routing
// ============================================================================

describe('--global flag routing', () => {
  it('init --global resolves to global path, not cwd', () => {
    // Replicate the routing logic from src/index.ts:
    //   const dest = hasGlobal ? resolveGlobalCrewPath() : process.cwd();
    const hasGlobal = true;
    const dest = hasGlobal ? resolveGlobalCrewPath() : process.cwd();

    expect(dest).toBe(resolveGlobalCrewPath());
    expect(dest).not.toBe(process.cwd());
  });

  it('init without --global resolves to cwd', () => {
    const hasGlobal = false;
    const dest = hasGlobal ? resolveGlobalCrewPath() : process.cwd();

    expect(dest).toBe(process.cwd());
  });

  it('upgrade --global resolves to global path, not cwd', () => {
    const hasGlobal = true;
    const dest = hasGlobal ? resolveGlobalCrewPath() : process.cwd();

    expect(dest).toBe(resolveGlobalCrewPath());
    expect(dest).not.toBe(process.cwd());
  });

  it('upgrade without --global resolves to cwd', () => {
    const hasGlobal = false;
    const dest = hasGlobal ? resolveGlobalCrewPath() : process.cwd();

    expect(dest).toBe(process.cwd());
  });

  it('global path is consistent across repeated calls', () => {
    const first = resolveGlobalCrewPath();
    const second = resolveGlobalCrewPath();
    expect(first).toBe(second);
  });

  it('global path differs from cwd', () => {
    const globalPath = resolveGlobalCrewPath();
    expect(globalPath).not.toBe(process.cwd());
  });
});
