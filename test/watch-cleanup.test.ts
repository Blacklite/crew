import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const TEST_ROOT = path.join(os.tmpdir(), `crew-cleanup-test-${Date.now()}`);
const CREW_DIR = path.join(TEST_ROOT, '.crew');

// We test the CleanupCapability by importing it directly
// (vitest resolves workspace paths, but we import from relative source)
import { CleanupCapability } from '../packages/crew-cli/src/cli/commands/watch/capabilities/cleanup.js';
import type { WatchContext } from '../packages/crew-cli/src/cli/commands/watch/types.js';

function makeContext(overrides: Partial<WatchContext> = {}): WatchContext {
  return {
    teamRoot: TEST_ROOT,
    adapter: {} as WatchContext['adapter'],
    round: 1,
    roster: [],
    config: {},
    ...overrides,
  };
}

function writeFile(relativePath: string, content: string = ''): void {
  const full = path.join(TEST_ROOT, relativePath);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content);
}

beforeEach(() => {
  mkdirSync(CREW_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
});

describe('CleanupCapability', () => {
  const cap = new CleanupCapability();

  it('has correct metadata', () => {
    expect(cap.name).toBe('cleanup');
    expect(cap.phase).toBe('housekeeping');
    expect(cap.configShape).toBe('object');
  });

  it('preflight succeeds when .crew/ exists', async () => {
    const result = await cap.preflight(makeContext());
    expect(result.ok).toBe(true);
  });

  it('preflight fails when .crew/ is missing', async () => {
    rmSync(CREW_DIR, { recursive: true, force: true });
    const result = await cap.preflight(makeContext());
    expect(result.ok).toBe(false);
  });

  it('clears all files in .crew/.scratch/', async () => {
    writeFile('.crew/.scratch/prompt-123.txt', 'hello');
    writeFile('.crew/.scratch/msg-456.tmp', 'world');

    const result = await cap.execute(makeContext());
    expect(result.success).toBe(true);
    expect(result.summary).toContain('scratch: 2 files cleared');
    expect(readdirSync(path.join(CREW_DIR, '.scratch'))).toHaveLength(0);
  });

  it('archives old orchestration-log entries', async () => {
    // Old file (date in filename older than 30 days)
    writeFile('.crew/orchestration-log/2025-01-01T00-00-00Z-agent.md', 'old');
    // Recent file (today)
    const today = new Date().toISOString().slice(0, 10);
    writeFile(`.crew/orchestration-log/${today}T12-00-00Z-agent.md`, 'recent');

    const result = await cap.execute(makeContext());
    expect(result.success).toBe(true);
    expect(result.summary).toContain('orchestration-log: 1 entries pruned');
    // Recent file should still exist
    const remaining = readdirSync(path.join(CREW_DIR, 'orchestration-log'));
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toContain(today);
  });

  it('archives old session log entries', async () => {
    writeFile('.crew/log/2025-02-15T10-00-00Z-session.md', 'old session');
    const today = new Date().toISOString().slice(0, 10);
    writeFile(`.crew/log/${today}T08-00-00Z-session.md`, 'fresh');

    const result = await cap.execute(makeContext());
    expect(result.success).toBe(true);
    expect(result.summary).toContain('log: 1 entries pruned');
  });

  it('warns about stale inbox files (>7 days)', async () => {
    writeFile('.crew/decisions/inbox/2025-03-01-old-decision.md', 'stale');
    const today = new Date().toISOString().slice(0, 10);
    writeFile(`.crew/decisions/inbox/${today}-fresh-decision.md`, 'fresh');

    const result = await cap.execute(makeContext());
    expect(result.success).toBe(true);
    expect(result.summary).toContain('stale inbox files');
  });

  it('skips cleanup on non-matching rounds', async () => {
    writeFile('.crew/.scratch/should-survive.txt', 'data');
    // everyNRounds defaults to 10; round 5 should skip
    const result = await cap.execute(makeContext({ round: 5, config: {} }));
    expect(result.success).toBe(true);
    expect(result.summary).toContain('skipped');
    expect(existsSync(path.join(CREW_DIR, '.scratch', 'should-survive.txt'))).toBe(true);
  });

  it('runs on round 10 (every 10th round)', async () => {
    writeFile('.crew/.scratch/temp.txt', 'data');
    const result = await cap.execute(makeContext({ round: 10 }));
    expect(result.success).toBe(true);
    expect(result.summary).not.toContain('skipped');
  });

  it('always runs on round 1', async () => {
    writeFile('.crew/.scratch/temp.txt', 'data');
    const result = await cap.execute(makeContext({ round: 1 }));
    expect(result.success).toBe(true);
    expect(result.summary).toContain('scratch: 1 files cleared');
  });

  it('respects custom everyNRounds config', async () => {
    writeFile('.crew/.scratch/temp.txt', 'data');
    // Custom config: every 3 rounds
    const result = await cap.execute(makeContext({ round: 3, config: { everyNRounds: 3 } }));
    expect(result.success).toBe(true);
    expect(result.summary).not.toContain('skipped');
  });

  it('reports nothing to do when all clean', async () => {
    const result = await cap.execute(makeContext());
    expect(result.success).toBe(true);
    expect(result.summary).toBe('cleanup: nothing to do');
  });
});
