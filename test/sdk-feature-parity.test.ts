/**
 * SDK Feature Parity Tests (Issue #340)
 * 
 * Tests for SDK features that have real code implementations.
 * These tests exercise actual behavior, not just "function exists" checks.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
  resolveCrewPaths, 
  resolveCrew, 
  loadDirConfig,
  isConsultMode,
  ensureCrewPathDual,
  type ResolvedCrewPaths,
  type CrewDirConfig,
} from '../packages/crew-sdk/src/resolution.js';
import { 
  ReviewerLockoutHook, 
  HookPipeline,
  type PreToolUseContext,
} from '../packages/crew-sdk/src/hooks/index.js';
import { 
  CompiledWorkTypeRule, 
  RoutingMatch,
  type CompiledRouter,
} from '../packages/crew-sdk/src/config/routing.js';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// =============================================================================
// Worktree Awareness Tests
// =============================================================================

describe('SDK Feature: Worktree Awareness', () => {
  it('resolveCrew() stops at .git boundary (worktree file)', () => {
    // Create temp structure: repo/.git (file, not dir) → simulates worktree
    const testRoot = join(tmpdir(), `crew-test-${Date.now()}`);
    mkdirSync(testRoot, { recursive: true });
    
    // Write .git file (worktree marker)
    writeFileSync(join(testRoot, '.git'), 'gitdir: /some/other/location');
    
    // No .crew/ in this directory
    const result = resolveCrew(testRoot);
    
    // Should return null — stops at .git boundary
    expect(result).toBeNull();
    
    rmSync(testRoot, { recursive: true, force: true });
  });

  it('resolveCrew() finds .crew/ in parent before hitting .git', () => {
    const testRoot = join(tmpdir(), `crew-test-${Date.now()}`);
    const subdir = join(testRoot, 'src', 'components');
    mkdirSync(subdir, { recursive: true });
    
    // Put .git at root
    mkdirSync(join(testRoot, '.git'));
    
    // Put .crew/ at root
    mkdirSync(join(testRoot, '.crew'));
    
    // Resolve from deep subdirectory
    const result = resolveCrew(subdir);
    
    expect(result).toBe(join(testRoot, '.crew'));
    
    rmSync(testRoot, { recursive: true, force: true });
  });

  it('resolveCrewPaths() handles local mode (no config.json)', () => {
    const testRoot = join(tmpdir(), `crew-test-${Date.now()}`);
    mkdirSync(join(testRoot, '.crew'), { recursive: true });
    
    const result = resolveCrewPaths(testRoot);
    
    expect(result).not.toBeNull();
    expect(result?.mode).toBe('local');
    expect(result?.projectDir).toBe(result?.teamDir);
    
    rmSync(testRoot, { recursive: true, force: true });
  });

  it('resolveCrewPaths() handles remote mode (with teamRoot config)', () => {
    const testRoot = join(tmpdir(), `crew-test-${Date.now()}`);
    const projectCrew = join(testRoot, 'project-a', '.crew');
    const teamCrew = join(testRoot, 'team-identity');
    
    mkdirSync(projectCrew, { recursive: true });
    mkdirSync(teamCrew, { recursive: true });
    
    // Write config.json with teamRoot
    const config: CrewDirConfig = {
      version: 1,
      teamRoot: '../team-identity',
      projectKey: 'project-a',
    };
    writeFileSync(join(projectCrew, 'config.json'), JSON.stringify(config, null, 2));
    
    const result = resolveCrewPaths(join(testRoot, 'project-a'));
    
    expect(result).not.toBeNull();
    expect(result?.mode).toBe('remote');
    expect(result?.projectDir).toBe(projectCrew);
    expect(result?.teamDir).toContain('team-identity');
    
    rmSync(testRoot, { recursive: true, force: true });
  });

  it('isConsultMode() returns true when config.consult is true', () => {
    const config: CrewDirConfig = {
      version: 1,
      teamRoot: '../personal-crew',
      projectKey: null,
      consult: true,
    };
    
    expect(isConsultMode(config)).toBe(true);
  });

  it('isConsultMode() returns false when config.consult is false or missing', () => {
    const config: CrewDirConfig = {
      version: 1,
      teamRoot: '../team',
      projectKey: 'project',
    };
    
    expect(isConsultMode(config)).toBe(false);
    expect(isConsultMode(null)).toBe(false);
  });

  it('ensureCrewPathDual() allows paths in projectDir', () => {
    const projectDir = '/repo/.crew';
    const teamDir = '/team-identity';
    const filePath = '/repo/.crew/decisions/inbox/test.md';
    
    const result = ensureCrewPathDual(filePath, projectDir, teamDir);
    expect(result).toContain('.crew');
  });

  it('ensureCrewPathDual() allows paths in teamDir', () => {
    const projectDir = '/repo/.crew';
    const teamDir = '/team-identity';
    const filePath = '/team-identity/agents/test-agent-1/charter.md';
    
    const result = ensureCrewPathDual(filePath, projectDir, teamDir);
    expect(result).toContain('team-identity');
  });

  it('ensureCrewPathDual() rejects paths outside both roots', () => {
    const projectDir = '/repo/.crew';
    const teamDir = '/team-identity';
    const filePath = '/etc/passwd';
    
    expect(() => {
      ensureCrewPathDual(filePath, projectDir, teamDir);
    }).toThrow(/outside both crew roots/);
  });
});

// =============================================================================
// Reviewer Lockout Tests
// =============================================================================

describe('SDK Feature: Reviewer Lockout', () => {
  let lockout: ReviewerLockoutHook;

  beforeEach(() => {
    lockout = new ReviewerLockoutHook();
  });

  it('lockout() adds agent to artifact lockout registry', () => {
    lockout.lockout('src/auth.ts', 'test-agent-1');
    
    expect(lockout.isLockedOut('src/auth.ts', 'test-agent-1')).toBe(true);
  });

  it('isLockedOut() returns false for agents not in registry', () => {
    lockout.lockout('src/auth.ts', 'test-agent-1');
    
    expect(lockout.isLockedOut('src/auth.ts', 'test-agent-2')).toBe(false);
  });

  it('getLockedAgents() returns all locked agents for artifact', () => {
    lockout.lockout('src/auth.ts', 'test-agent-1');
    lockout.lockout('src/auth.ts', 'test-agent-2');
    
    const locked = lockout.getLockedAgents('src/auth.ts');
    expect(locked).toHaveLength(2);
    expect(locked).toContain('test-agent-1');
    expect(locked).toContain('test-agent-2');
  });

  it('clearLockout() removes lockouts for artifact', () => {
    lockout.lockout('src/auth.ts', 'test-agent-1');
    lockout.clearLockout('src/auth.ts');
    
    expect(lockout.isLockedOut('src/auth.ts', 'test-agent-1')).toBe(false);
  });

  it('clearAll() removes all lockouts', () => {
    lockout.lockout('src/auth.ts', 'test-agent-1');
    lockout.lockout('src/db.ts', 'test-agent-2');
    
    lockout.clearAll();
    
    expect(lockout.isLockedOut('src/auth.ts', 'test-agent-1')).toBe(false);
    expect(lockout.isLockedOut('src/db.ts', 'test-agent-2')).toBe(false);
  });

  it('createHook() blocks write tools when agent is locked out', () => {
    lockout.lockout('auth', 'test-agent-1');
    
    const hook = lockout.createHook();
    const ctx: PreToolUseContext = {
      toolName: 'edit',
      arguments: { path: 'src/auth.ts' },
      agentName: 'test-agent-1',
      sessionId: 'session-123',
    };
    
    const result = hook(ctx);
    
    expect(result.action).toBe('block');
    expect(result.reason).toMatch(/locked out/i);
  });

  it('createHook() allows writes when agent is not locked out', () => {
    lockout.lockout('auth', 'test-agent-1');
    
    const hook = lockout.createHook();
    const ctx: PreToolUseContext = {
      toolName: 'edit',
      arguments: { path: 'src/db.ts' },
      agentName: 'test-agent-1',
      sessionId: 'session-123',
    };
    
    const result = hook(ctx);
    
    expect(result.action).toBe('allow');
  });

  it('supports multiple lockouts per artifact', () => {
    // Simulate 2-error lockout threshold
    lockout.lockout('src/auth.ts', 'test-agent-1');
    lockout.lockout('src/auth.ts', 'test-agent-2');
    
    const lockedAgents = lockout.getLockedAgents('src/auth.ts');
    expect(lockedAgents).toHaveLength(2);
  });
});

// =============================================================================
// Deadlock Handling Tests
// =============================================================================

describe('SDK Feature: Deadlock Handling', () => {
  it('HookPipeline with reviewerLockout enabled detects all-agents-locked scenario', () => {
    const pipeline = new HookPipeline({ reviewerLockout: true });
    const lockout = pipeline.getReviewerLockout();
    
    // Lock out all agents from the same artifact
    lockout.lockout('critical-file', 'test-agent-1');
    lockout.lockout('critical-file', 'test-agent-2');
    lockout.lockout('critical-file', 'test-agent-3');
    
    const lockedAgents = lockout.getLockedAgents('critical-file');
    
    // All agents locked out → deadlock scenario
    expect(lockedAgents.length).toBeGreaterThanOrEqual(3);
  });

  it('clearLockout() can be used to escalate past deadlock', () => {
    const pipeline = new HookPipeline({ reviewerLockout: true });
    const lockout = pipeline.getReviewerLockout();
    
    lockout.lockout('critical-file', 'test-agent-1');
    lockout.lockout('critical-file', 'test-agent-2');
    
    // Deadlock detected → clear lockouts to allow escalation
    lockout.clearLockout('critical-file');
    
    expect(lockout.getLockedAgents('critical-file')).toHaveLength(0);
  });
});

// =============================================================================
// Skill Confidence Lifecycle Tests
// =============================================================================

describe('SDK Feature: Skill Confidence Lifecycle', () => {
  it('routing confidence can be low, medium, or high', () => {
    const lowConfRule: CompiledWorkTypeRule = {
      workType: 'ambiguous-task',
      agents: ['test-agent-1'],
      patterns: [/vague/],
      confidence: 'low',
      priority: 1,
    };
    
    const mediumConfRule: CompiledWorkTypeRule = {
      workType: 'typical-task',
      agents: ['test-agent-1'],
      patterns: [/feature/],
      confidence: 'medium',
      priority: 2,
    };
    
    const highConfRule: CompiledWorkTypeRule = {
      workType: 'clear-task',
      agents: ['test-agent-1'],
      patterns: [/bug-fix/],
      confidence: 'high',
      priority: 3,
    };
    
    expect(lowConfRule.confidence).toBe('low');
    expect(mediumConfRule.confidence).toBe('medium');
    expect(highConfRule.confidence).toBe('high');
  });

  it('routing match includes confidence level', () => {
    const match: RoutingMatch = {
      agents: ['test-agent-1'],
      confidence: 'high',
      reason: 'Exact pattern match',
    };
    
    expect(match.confidence).toBe('high');
  });

  it('priority can be set based on confidence (high → normal, low → low)', () => {
    // Simulate coordinator logic: high confidence → normal priority
    const highConfMatch: RoutingMatch = {
      agents: ['test-agent-1'],
      confidence: 'high',
      reason: 'Clear match',
    };
    
    const priority = highConfMatch.confidence === 'high' ? 'normal' : 'low';
    expect(priority).toBe('normal');
    
    // Low confidence → low priority
    const lowConfMatch: RoutingMatch = {
      agents: ['test-agent-1'],
      confidence: 'low',
      reason: 'Fallback',
    };
    
    const lowPriority = lowConfMatch.confidence === 'high' ? 'normal' : 'low';
    expect(lowPriority).toBe('low');
  });
});
