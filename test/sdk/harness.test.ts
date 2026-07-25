/**
 * Tests for the dual-harness abstraction (copilot | claude).
 *
 * Covers harness resolution precedence (explicit > CREW_HARNESS env >
 * .crew/config.json > default) and the Claude invocation arg builder used
 * by loop/watch spawns.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  resolveHarness,
  isCrewHarness,
  harnessCommand,
  createAgentClient,
  ClaudeClient,
  CrewClient,
} from '@blacklite/crew-sdk/client';
import { buildClaudeInvocationArgs, withClaudeInvocationArgs } from '@blacklite/crew-cli/core/claude-invocation';

const tempDirs: string[] = [];

function makeTeamRoot(config?: Record<string, unknown>): string {
  const root = mkdtempSync(join(tmpdir(), 'crew-harness-test-'));
  tempDirs.push(root);
  if (config) {
    mkdirSync(join(root, '.crew'), { recursive: true });
    writeFileSync(join(root, '.crew', 'config.json'), JSON.stringify(config));
  }
  return root;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

describe('isCrewHarness', () => {
  it('accepts the two valid harnesses', () => {
    expect(isCrewHarness('copilot')).toBe(true);
    expect(isCrewHarness('claude')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isCrewHarness('codex')).toBe(false);
    expect(isCrewHarness('')).toBe(false);
    expect(isCrewHarness(undefined)).toBe(false);
    expect(isCrewHarness(42)).toBe(false);
  });
});

describe('resolveHarness', () => {
  it('defaults to copilot', () => {
    expect(resolveHarness({ env: {} })).toBe('copilot');
  });

  it('explicit option wins over env and config', () => {
    const teamRoot = makeTeamRoot({ harness: 'copilot' });
    const result = resolveHarness({
      explicit: 'claude',
      env: { CREW_HARNESS: 'copilot' },
      teamRoot,
    });
    expect(result).toBe('claude');
  });

  it('reads CREW_HARNESS from env', () => {
    expect(resolveHarness({ env: { CREW_HARNESS: 'claude' } })).toBe('claude');
  });

  it('falls back to .crew/config.json harness field', () => {
    const teamRoot = makeTeamRoot({ harness: 'claude' });
    expect(resolveHarness({ env: {}, teamRoot })).toBe('claude');
  });

  it('ignores invalid explicit and env values', () => {
    const teamRoot = makeTeamRoot({ harness: 'claude' });
    expect(resolveHarness({ explicit: 'bogus', env: { CREW_HARNESS: 'nope' }, teamRoot })).toBe('claude');
  });

  it('ignores unreadable config', () => {
    const teamRoot = makeTeamRoot(); // no .crew/config.json
    expect(resolveHarness({ env: {}, teamRoot })).toBe('copilot');
  });
});

describe('harnessCommand', () => {
  it('maps harness to shell command', () => {
    expect(harnessCommand('copilot')).toBe('copilot');
    expect(harnessCommand('claude')).toBe('claude');
  });
});

describe('createAgentClient', () => {
  it('creates a CrewClient (Copilot) by default', () => {
    const client = createAgentClient({ harness: 'copilot' });
    expect(client).toBeInstanceOf(CrewClient);
  });

  it('creates a ClaudeClient for the claude harness', () => {
    const client = createAgentClient({ harness: 'claude' });
    expect(client).toBeInstanceOf(ClaudeClient);
  });

  it('resolves the harness from config when not explicit', () => {
    const teamRoot = makeTeamRoot({ harness: 'claude' });
    const client = createAgentClient({ teamRoot });
    expect(client).toBeInstanceOf(ClaudeClient);
  });
});

describe('buildClaudeInvocationArgs', () => {
  it('returns [] for non-claude commands', () => {
    expect(buildClaudeInvocationArgs('copilot', makeTeamRoot())).toEqual([]);
    expect(buildClaudeInvocationArgs('my-agent', makeTeamRoot())).toEqual([]);
  });

  it('always includes bypassPermissions for bare claude', () => {
    const args = buildClaudeInvocationArgs('claude', undefined);
    expect(args).toEqual(['--permission-mode', 'bypassPermissions']);
  });

  it('adds --mcp-config when .mcp.json exists at teamRoot', () => {
    const teamRoot = makeTeamRoot();
    writeFileSync(join(teamRoot, '.mcp.json'), '{"mcpServers":{}}');
    const args = buildClaudeInvocationArgs('claude', teamRoot);
    expect(args).toEqual([
      '--permission-mode', 'bypassPermissions',
      '--mcp-config', join(teamRoot, '.mcp.json'),
    ]);
  });

  it('omits --mcp-config when .mcp.json is missing', () => {
    const teamRoot = makeTeamRoot();
    const args = buildClaudeInvocationArgs('claude', teamRoot);
    expect(args).toEqual(['--permission-mode', 'bypassPermissions']);
  });
});

describe('withClaudeInvocationArgs', () => {
  it('prepends invocation args before the prompt args', () => {
    const teamRoot = makeTeamRoot();
    writeFileSync(join(teamRoot, '.mcp.json'), '{"mcpServers":{}}');
    const args = withClaudeInvocationArgs('claude', ['-p', 'do the thing'], teamRoot);
    expect(args.slice(-2)).toEqual(['-p', 'do the thing']);
    expect(args).toContain('--mcp-config');
    expect(args).toContain('bypassPermissions');
  });

  it('respects a caller-supplied permission mode', () => {
    const args = withClaudeInvocationArgs('claude', ['--permission-mode', 'plan', '-p', 'x'], undefined);
    const occurrences = args.filter(a => a === '--permission-mode').length;
    expect(occurrences).toBe(1);
    expect(args).toContain('plan');
  });

  it('passes through untouched for non-claude commands', () => {
    expect(withClaudeInvocationArgs('copilot', ['-p', 'x'], undefined)).toEqual(['-p', 'x']);
  });
});
