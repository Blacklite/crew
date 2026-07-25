/**
 * Tests for persistent model preference (Layer 0) — the fix for #284.
 *
 * Validates that model preferences written to `.crew/config.json`
 * are correctly read back, merged without clobbering other fields,
 * and that the 5-layer resolveModel() hierarchy works as documented.
 *
 * @module test/model-preference
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  readModelPreference,
  readAgentModelOverrides,
  writeModelPreference,
  writeAgentModelOverrides,
  resolveModel,
  readReasoningEffort,
  readAgentReasoningEffortOverrides,
  writeReasoningEffort,
  writeAgentReasoningEffortOverrides,
  resolveReasoningEffort,
  clampReasoningEffort,
  readContextTier,
  readAgentContextTierOverrides,
  writeContextTier,
  writeAgentContextTierOverrides,
  resolveContextTier,
  clampContextTier,
} from '@blacklite/crew-sdk/config';

// Temp directory for each test
let crewDir: string;

beforeEach(() => {
  crewDir = mkdtempSync(join(tmpdir(), 'crew-model-pref-'));
});

afterEach(() => {
  rmSync(crewDir, { recursive: true, force: true });
});

// ============================================================================
// readModelPreference
// ============================================================================

describe('readModelPreference', () => {
  it('returns null when config.json does not exist', () => {
    expect(readModelPreference(crewDir)).toBeNull();
  });

  it('returns null when config.json has no defaultModel', () => {
    writeFileSync(join(crewDir, 'config.json'), JSON.stringify({ version: 1 }));
    expect(readModelPreference(crewDir)).toBeNull();
  });

  it('returns null when defaultModel is empty string', () => {
    writeFileSync(
      join(crewDir, 'config.json'),
      JSON.stringify({ version: 1, defaultModel: '' })
    );
    expect(readModelPreference(crewDir)).toBeNull();
  });

  it('returns null when defaultModel is not a string', () => {
    writeFileSync(
      join(crewDir, 'config.json'),
      JSON.stringify({ version: 1, defaultModel: 42 })
    );
    expect(readModelPreference(crewDir)).toBeNull();
  });

  it('returns the model when defaultModel is set', () => {
    writeFileSync(
      join(crewDir, 'config.json'),
      JSON.stringify({ version: 1, defaultModel: 'claude-opus-4.6' })
    );
    expect(readModelPreference(crewDir)).toBe('claude-opus-4.6');
  });

  it('returns null on malformed JSON', () => {
    writeFileSync(join(crewDir, 'config.json'), '{ broken json');
    expect(readModelPreference(crewDir)).toBeNull();
  });
});

// ============================================================================
// readAgentModelOverrides
// ============================================================================

describe('readAgentModelOverrides', () => {
  it('returns empty object when config.json does not exist', () => {
    expect(readAgentModelOverrides(crewDir)).toEqual({});
  });

  it('returns empty object when no overrides field', () => {
    writeFileSync(join(crewDir, 'config.json'), JSON.stringify({ version: 1 }));
    expect(readAgentModelOverrides(crewDir)).toEqual({});
  });

  it('reads per-agent overrides', () => {
    writeFileSync(
      join(crewDir, 'config.json'),
      JSON.stringify({
        version: 1,
        agentModelOverrides: {
          fenster: 'claude-sonnet-4.6',
          mcmanus: 'claude-haiku-4.5',
        },
      })
    );
    const overrides = readAgentModelOverrides(crewDir);
    expect(overrides.fenster).toBe('claude-sonnet-4.6');
    expect(overrides.mcmanus).toBe('claude-haiku-4.5');
  });

  it('ignores non-string values in overrides', () => {
    writeFileSync(
      join(crewDir, 'config.json'),
      JSON.stringify({
        version: 1,
        agentModelOverrides: { fenster: 'claude-sonnet-4.6', bad: 123 },
      })
    );
    const overrides = readAgentModelOverrides(crewDir);
    expect(overrides.fenster).toBe('claude-sonnet-4.6');
    expect(overrides).not.toHaveProperty('bad');
  });
});

// ============================================================================
// writeModelPreference
// ============================================================================

describe('writeModelPreference', () => {
  it('creates config.json if missing', () => {
    writeModelPreference(crewDir, 'claude-opus-4.6');
    const raw = JSON.parse(readFileSync(join(crewDir, 'config.json'), 'utf-8'));
    expect(raw.version).toBe(1);
    expect(raw.defaultModel).toBe('claude-opus-4.6');
  });

  it('merges with existing config without clobbering', () => {
    writeFileSync(
      join(crewDir, 'config.json'),
      JSON.stringify({ version: 1, platform: 'azure-devops', custom: true })
    );
    writeModelPreference(crewDir, 'claude-opus-4.6');
    const raw = JSON.parse(readFileSync(join(crewDir, 'config.json'), 'utf-8'));
    expect(raw.version).toBe(1);
    expect(raw.platform).toBe('azure-devops');
    expect(raw.custom).toBe(true);
    expect(raw.defaultModel).toBe('claude-opus-4.6');
  });

  it('removes defaultModel when set to null', () => {
    writeFileSync(
      join(crewDir, 'config.json'),
      JSON.stringify({ version: 1, defaultModel: 'claude-opus-4.6' })
    );
    writeModelPreference(crewDir, null);
    const raw = JSON.parse(readFileSync(join(crewDir, 'config.json'), 'utf-8'));
    expect(raw).not.toHaveProperty('defaultModel');
  });

  it('overwrites existing defaultModel', () => {
    writeFileSync(
      join(crewDir, 'config.json'),
      JSON.stringify({ version: 1, defaultModel: 'claude-haiku-4.5' })
    );
    writeModelPreference(crewDir, 'claude-opus-4.6');
    const raw = JSON.parse(readFileSync(join(crewDir, 'config.json'), 'utf-8'));
    expect(raw.defaultModel).toBe('claude-opus-4.6');
  });

  it('handles malformed existing config gracefully', () => {
    writeFileSync(join(crewDir, 'config.json'), '{ broken');
    writeModelPreference(crewDir, 'claude-opus-4.6');
    const raw = JSON.parse(readFileSync(join(crewDir, 'config.json'), 'utf-8'));
    expect(raw.version).toBe(1);
    expect(raw.defaultModel).toBe('claude-opus-4.6');
  });
});

// ============================================================================
// writeAgentModelOverrides
// ============================================================================

describe('writeAgentModelOverrides', () => {
  it('writes per-agent overrides', () => {
    writeAgentModelOverrides(crewDir, { fenster: 'claude-sonnet-4.6' });
    const raw = JSON.parse(readFileSync(join(crewDir, 'config.json'), 'utf-8'));
    expect(raw.agentModelOverrides.fenster).toBe('claude-sonnet-4.6');
  });

  it('removes overrides when set to null', () => {
    writeFileSync(
      join(crewDir, 'config.json'),
      JSON.stringify({ version: 1, agentModelOverrides: { fenster: 'claude-sonnet-4.6' } })
    );
    writeAgentModelOverrides(crewDir, null);
    const raw = JSON.parse(readFileSync(join(crewDir, 'config.json'), 'utf-8'));
    expect(raw).not.toHaveProperty('agentModelOverrides');
  });

  it('removes overrides when set to empty object', () => {
    writeFileSync(
      join(crewDir, 'config.json'),
      JSON.stringify({ version: 1, agentModelOverrides: { fenster: 'claude-sonnet-4.6' } })
    );
    writeAgentModelOverrides(crewDir, {});
    const raw = JSON.parse(readFileSync(join(crewDir, 'config.json'), 'utf-8'));
    expect(raw).not.toHaveProperty('agentModelOverrides');
  });

  it('merges without clobbering other config fields', () => {
    writeFileSync(
      join(crewDir, 'config.json'),
      JSON.stringify({ version: 1, defaultModel: 'claude-opus-4.6' })
    );
    writeAgentModelOverrides(crewDir, { fenster: 'claude-sonnet-4.6' });
    const raw = JSON.parse(readFileSync(join(crewDir, 'config.json'), 'utf-8'));
    expect(raw.defaultModel).toBe('claude-opus-4.6');
    expect(raw.agentModelOverrides.fenster).toBe('claude-sonnet-4.6');
  });
});

// ============================================================================
// resolveModel — 5-layer hierarchy
// ============================================================================

describe('resolveModel', () => {
  it('Layer 4: returns default haiku when nothing is set', () => {
    expect(resolveModel({})).toBe('claude-haiku-4.5');
  });

  it('Layer 3: task model wins over default', () => {
    expect(resolveModel({ taskModel: 'claude-sonnet-4.6' })).toBe('claude-sonnet-4.6');
  });

  it('Layer 2: charter preference wins over task model', () => {
    expect(
      resolveModel({
        charterPreference: 'claude-opus-4.6',
        taskModel: 'claude-sonnet-4.6',
      })
    ).toBe('claude-opus-4.6');
  });

  it('Layer 1: session directive wins over charter preference', () => {
    expect(
      resolveModel({
        sessionDirective: 'gpt-5.4',
        charterPreference: 'claude-opus-4.6',
        taskModel: 'claude-sonnet-4.6',
      })
    ).toBe('gpt-5.4');
  });

  it('Layer 0b: persistent config wins over session directive', () => {
    writeFileSync(
      join(crewDir, 'config.json'),
      JSON.stringify({ version: 1, defaultModel: 'claude-opus-4.6' })
    );
    expect(
      resolveModel({
        crewDir,
        sessionDirective: 'gpt-5.4',
        charterPreference: 'claude-sonnet-4.6',
        taskModel: 'claude-haiku-4.5',
      })
    ).toBe('claude-opus-4.6');
  });

  it('Layer 0a: per-agent override wins over global defaultModel', () => {
    writeFileSync(
      join(crewDir, 'config.json'),
      JSON.stringify({
        version: 1,
        defaultModel: 'claude-opus-4.6',
        agentModelOverrides: { fenster: 'gpt-5.3-codex' },
      })
    );
    expect(
      resolveModel({
        agentName: 'fenster',
        crewDir,
        sessionDirective: 'gpt-5.4',
      })
    ).toBe('gpt-5.3-codex');
  });

  it('Layer 0b: global config used when agent has no per-agent override', () => {
    writeFileSync(
      join(crewDir, 'config.json'),
      JSON.stringify({
        version: 1,
        defaultModel: 'claude-opus-4.6',
        agentModelOverrides: { fenster: 'gpt-5.3-codex' },
      })
    );
    expect(
      resolveModel({
        agentName: 'mcmanus',
        crewDir,
        sessionDirective: 'gpt-5.4',
      })
    ).toBe('claude-opus-4.6');
  });

  it('falls through all layers correctly when no config file exists', () => {
    const nonexistentDir = join(crewDir, 'nonexistent');
    expect(
      resolveModel({
        agentName: 'fenster',
        crewDir: nonexistentDir,
        sessionDirective: null,
        charterPreference: null,
        taskModel: 'claude-sonnet-4.6',
      })
    ).toBe('claude-sonnet-4.6');
  });

  it('null session directive is treated as absent', () => {
    expect(
      resolveModel({
        sessionDirective: null,
        taskModel: 'claude-sonnet-4.6',
      })
    ).toBe('claude-sonnet-4.6');
  });
});

// ============================================================================
// Round-trip: write then read
// ============================================================================

describe('round-trip persistence', () => {
  it('writeModelPreference → readModelPreference', () => {
    writeModelPreference(crewDir, 'claude-opus-4.6');
    expect(readModelPreference(crewDir)).toBe('claude-opus-4.6');
  });

  it('write → clear → read returns null', () => {
    writeModelPreference(crewDir, 'claude-opus-4.6');
    writeModelPreference(crewDir, null);
    expect(readModelPreference(crewDir)).toBeNull();
  });

  it('write → overwrite → read returns latest', () => {
    writeModelPreference(crewDir, 'claude-opus-4.6');
    writeModelPreference(crewDir, 'gpt-5.4');
    expect(readModelPreference(crewDir)).toBe('gpt-5.4');
  });

  it('model + agent overrides coexist', () => {
    writeModelPreference(crewDir, 'claude-opus-4.6');
    writeAgentModelOverrides(crewDir, { fenster: 'claude-sonnet-4.6' });
    expect(readModelPreference(crewDir)).toBe('claude-opus-4.6');
    expect(readAgentModelOverrides(crewDir).fenster).toBe('claude-sonnet-4.6');
  });
});

// ============================================================================
// readReasoningEffort
// ============================================================================

describe('readReasoningEffort', () => {
  it('returns null when config.json does not exist', () => {
    expect(readReasoningEffort(crewDir)).toBeNull();
  });

  it('returns null when config.json has no defaultReasoningEffort', () => {
    writeFileSync(join(crewDir, 'config.json'), JSON.stringify({ version: 1 }));
    expect(readReasoningEffort(crewDir)).toBeNull();
  });

  it('returns the effort when defaultReasoningEffort is set', () => {
    writeFileSync(
      join(crewDir, 'config.json'),
      JSON.stringify({ version: 1, defaultReasoningEffort: 'xhigh' })
    );
    expect(readReasoningEffort(crewDir)).toBe('xhigh');
  });

  it('returns null on malformed JSON', () => {
    writeFileSync(join(crewDir, 'config.json'), '{ broken json');
    expect(readReasoningEffort(crewDir)).toBeNull();
  });
});

// ============================================================================
// readAgentReasoningEffortOverrides
// ============================================================================

describe('readAgentReasoningEffortOverrides', () => {
  it('returns empty object when config.json does not exist', () => {
    expect(readAgentReasoningEffortOverrides(crewDir)).toEqual({});
  });

  it('reads per-agent overrides', () => {
    writeFileSync(
      join(crewDir, 'config.json'),
      JSON.stringify({
        version: 1,
        agentReasoningEffortOverrides: {
          fenster: 'xhigh',
          mcmanus: 'low',
        },
      })
    );
    const overrides = readAgentReasoningEffortOverrides(crewDir);
    expect(overrides.fenster).toBe('xhigh');
    expect(overrides.mcmanus).toBe('low');
  });

  it('ignores invalid effort values in overrides', () => {
    writeFileSync(
      join(crewDir, 'config.json'),
      JSON.stringify({
        version: 1,
        agentReasoningEffortOverrides: { fenster: 'xhigh', bad: 'invalid-effort' },
      })
    );
    const overrides = readAgentReasoningEffortOverrides(crewDir);
    expect(overrides.fenster).toBe('xhigh');
    expect(overrides).not.toHaveProperty('bad');
  });
});

// ============================================================================
// writeReasoningEffort
// ============================================================================

describe('writeReasoningEffort', () => {
  it('creates config.json if missing', () => {
    writeReasoningEffort(crewDir, 'xhigh');
    const raw = JSON.parse(readFileSync(join(crewDir, 'config.json'), 'utf-8'));
    expect(raw.version).toBe(1);
    expect(raw.defaultReasoningEffort).toBe('xhigh');
  });

  it('merges with existing config without clobbering', () => {
    writeFileSync(
      join(crewDir, 'config.json'),
      JSON.stringify({ version: 1, defaultModel: 'claude-opus-4.6' })
    );
    writeReasoningEffort(crewDir, 'high');
    const raw = JSON.parse(readFileSync(join(crewDir, 'config.json'), 'utf-8'));
    expect(raw.defaultModel).toBe('claude-opus-4.6');
    expect(raw.defaultReasoningEffort).toBe('high');
  });

  it('removes defaultReasoningEffort when set to null', () => {
    writeFileSync(
      join(crewDir, 'config.json'),
      JSON.stringify({ version: 1, defaultReasoningEffort: 'xhigh' })
    );
    writeReasoningEffort(crewDir, null);
    const raw = JSON.parse(readFileSync(join(crewDir, 'config.json'), 'utf-8'));
    expect(raw).not.toHaveProperty('defaultReasoningEffort');
  });
});

// ============================================================================
// resolveReasoningEffort — layered hierarchy
// ============================================================================

describe('resolveReasoningEffort', () => {
  it('returns undefined when nothing is set', () => {
    expect(resolveReasoningEffort({})).toBeUndefined();
  });

  it('Layer 2: charter preference wins over default', () => {
    expect(
      resolveReasoningEffort({ charterPreference: 'high' })
    ).toBe('high');
  });

  it('Layer 1: spawn override wins over charter', () => {
    expect(
      resolveReasoningEffort({
        spawnOverride: 'xhigh',
        charterPreference: 'high',
      })
    ).toBe('xhigh');
  });

  it('Layer 0b: persistent config wins over spawn override', () => {
    writeFileSync(
      join(crewDir, 'config.json'),
      JSON.stringify({ version: 1, defaultReasoningEffort: 'medium' })
    );
    expect(
      resolveReasoningEffort({
        crewDir,
        spawnOverride: 'xhigh',
        charterPreference: 'high',
      })
    ).toBe('medium');
  });

  it('Layer 0a: per-agent override wins over global', () => {
    writeFileSync(
      join(crewDir, 'config.json'),
      JSON.stringify({
        version: 1,
        defaultReasoningEffort: 'medium',
        agentReasoningEffortOverrides: { fenster: 'xhigh' },
      })
    );
    expect(
      resolveReasoningEffort({
        agentName: 'fenster',
        crewDir,
        spawnOverride: 'high',
      })
    ).toBe('xhigh');
  });

  it('auto is treated as absent at all layers', () => {
    expect(
      resolveReasoningEffort({ charterPreference: 'auto' })
    ).toBeUndefined();

    expect(
      resolveReasoningEffort({ spawnOverride: 'auto', charterPreference: 'high' })
    ).toBe('high');
  });

  it('falls through to charter when config has no effort', () => {
    writeFileSync(
      join(crewDir, 'config.json'),
      JSON.stringify({ version: 1, defaultModel: 'claude-opus-4.6' })
    );
    expect(
      resolveReasoningEffort({
        crewDir,
        charterPreference: 'xhigh',
      })
    ).toBe('xhigh');
  });

  it('clamps to model max when supportedEfforts provided', () => {
    // GPT-5.5 only supports up to "high"
    expect(
      resolveReasoningEffort({
        charterPreference: 'xhigh',
        supportedEfforts: ['low', 'medium', 'high'],
      })
    ).toBe('high');
  });

  it('passes through when within model capabilities', () => {
    expect(
      resolveReasoningEffort({
        charterPreference: 'high',
        supportedEfforts: ['low', 'medium', 'high', 'xhigh'],
      })
    ).toBe('high');
  });

  it('returns undefined when model has no effort support', () => {
    expect(
      resolveReasoningEffort({
        charterPreference: 'xhigh',
        supportedEfforts: [],
      })
    ).toBeUndefined();
  });

  it('ignores invalid spawnOverride values', () => {
    expect(
      resolveReasoningEffort({ spawnOverride: 'invalid', charterPreference: 'high' })
    ).toBe('high');
  });

  it('ignores invalid charterPreference values', () => {
    expect(
      resolveReasoningEffort({ charterPreference: 'turbo' })
    ).toBeUndefined();
  });

  it('ignores invalid persisted defaultReasoningEffort', () => {
    writeFileSync(
      join(crewDir, 'config.json'),
      JSON.stringify({ version: 1, defaultReasoningEffort: 'invalid' })
    );
    expect(
      resolveReasoningEffort({
        crewDir,
        charterPreference: 'high',
      })
    ).toBe('high');
  });

  it('ignores all-invalid layers and returns undefined', () => {
    expect(
      resolveReasoningEffort({
        spawnOverride: 'invalid',
        charterPreference: 'auto',
      })
    ).toBeUndefined();
  });
});

// ============================================================================
// clampReasoningEffort
// ============================================================================

describe('clampReasoningEffort', () => {
  it('returns undefined when no effort requested', () => {
    expect(clampReasoningEffort(undefined, ['low', 'medium', 'high'])).toBeUndefined();
  });

  it('returns undefined when model has no effort support', () => {
    expect(clampReasoningEffort('xhigh', undefined)).toBeUndefined();
    expect(clampReasoningEffort('xhigh', [])).toBeUndefined();
  });

  it('passes through when effort is directly supported', () => {
    expect(clampReasoningEffort('high', ['low', 'medium', 'high', 'xhigh'])).toBe('high');
    expect(clampReasoningEffort('xhigh', ['low', 'medium', 'high', 'xhigh'])).toBe('xhigh');
  });

  it('clamps xhigh to high when model max is high (GPT-5.5)', () => {
    expect(clampReasoningEffort('xhigh', ['low', 'medium', 'high'])).toBe('high');
  });

  it('clamps high to medium when model max is medium', () => {
    expect(clampReasoningEffort('high', ['low', 'medium'])).toBe('medium');
  });

  it('clamps xhigh to medium for Claude Sonnet (single-effort models)', () => {
    expect(clampReasoningEffort('xhigh', ['medium'])).toBe('medium');
  });

  it('treats max and xhigh as equivalent', () => {
    // xhigh requested, model supports max
    expect(clampReasoningEffort('xhigh', ['low', 'medium', 'high', 'max'])).toBe('xhigh');
  });

  it('returns undefined for unrecognized effort value', () => {
    expect(clampReasoningEffort('turbo', ['low', 'medium', 'high'])).toBeUndefined();
  });

  it('handles model that only supports low', () => {
    expect(clampReasoningEffort('xhigh', ['low'])).toBe('low');
    expect(clampReasoningEffort('low', ['low'])).toBe('low');
  });

  it('clamps UP to model minimum when requested is below supported range', () => {
    // Model only supports [high] — requesting "low" clamps up to "high"
    expect(clampReasoningEffort('low', ['high'])).toBe('high');
    // Model only supports [medium, high] — requesting "low" clamps up to "medium"
    expect(clampReasoningEffort('low', ['medium', 'high'])).toBe('medium');
  });
});

// ============================================================================
// readContextTier
// ============================================================================

describe('readContextTier', () => {
  it('returns null when config.json does not exist', () => {
    expect(readContextTier(crewDir)).toBeNull();
  });

  it('returns null when config.json has no defaultContextTier', () => {
    writeFileSync(
      join(crewDir, 'config.json'),
      JSON.stringify({ version: 1 })
    );
    expect(readContextTier(crewDir)).toBeNull();
  });

  it('returns the tier when defaultContextTier is set', () => {
    writeFileSync(
      join(crewDir, 'config.json'),
      JSON.stringify({ version: 1, defaultContextTier: 'long_context' })
    );
    expect(readContextTier(crewDir)).toBe('long_context');
  });

  it('returns "auto" when persisted (sentinel is readable)', () => {
    writeFileSync(
      join(crewDir, 'config.json'),
      JSON.stringify({ version: 1, defaultContextTier: 'auto' })
    );
    expect(readContextTier(crewDir)).toBe('auto');
  });

  it('returns null on malformed JSON', () => {
    writeFileSync(join(crewDir, 'config.json'), '{ broken json');
    expect(readContextTier(crewDir)).toBeNull();
  });
});

// ============================================================================
// readAgentContextTierOverrides
// ============================================================================

describe('readAgentContextTierOverrides', () => {
  it('returns empty object when config.json does not exist', () => {
    expect(readAgentContextTierOverrides(crewDir)).toEqual({});
  });

  it('reads per-agent overrides', () => {
    writeFileSync(
      join(crewDir, 'config.json'),
      JSON.stringify({
        version: 1,
        agentContextTierOverrides: {
          fenster: 'long_context',
          mcmanus: 'default',
        },
      })
    );
    const overrides = readAgentContextTierOverrides(crewDir);
    expect(overrides.fenster).toBe('long_context');
    expect(overrides.mcmanus).toBe('default');
  });

  it('drops "auto" and invalid values in overrides', () => {
    writeFileSync(
      join(crewDir, 'config.json'),
      JSON.stringify({
        version: 1,
        agentContextTierOverrides: {
          fenster: 'long_context',
          keaton: 'auto',
          bad: 'invalid-tier',
        },
      })
    );
    const overrides = readAgentContextTierOverrides(crewDir);
    expect(overrides.fenster).toBe('long_context');
    expect(overrides).not.toHaveProperty('keaton');
    expect(overrides).not.toHaveProperty('bad');
  });
});

// ============================================================================
// writeContextTier
// ============================================================================

describe('writeContextTier', () => {
  it('creates config.json if missing', () => {
    writeContextTier(crewDir, 'long_context');
    const raw = JSON.parse(readFileSync(join(crewDir, 'config.json'), 'utf8'));
    expect(raw.version).toBe(1);
    expect(raw.defaultContextTier).toBe('long_context');
  });

  it('merges with existing config without clobbering', () => {
    writeFileSync(
      join(crewDir, 'config.json'),
      JSON.stringify({ version: 1, defaultModel: 'claude-opus-4.6' })
    );
    writeContextTier(crewDir, 'long_context');
    const raw = JSON.parse(readFileSync(join(crewDir, 'config.json'), 'utf8'));
    expect(raw.defaultModel).toBe('claude-opus-4.6');
    expect(raw.defaultContextTier).toBe('long_context');
  });

  it('removes defaultContextTier when set to null', () => {
    writeFileSync(
      join(crewDir, 'config.json'),
      JSON.stringify({ version: 1, defaultContextTier: 'long_context' })
    );
    writeContextTier(crewDir, null);
    const raw = JSON.parse(readFileSync(join(crewDir, 'config.json'), 'utf8'));
    expect(raw).not.toHaveProperty('defaultContextTier');
  });

  it('does not write an invalid tier', () => {
    writeFileSync(
      join(crewDir, 'config.json'),
      JSON.stringify({ version: 1, defaultModel: 'claude-opus-4.6' })
    );
    writeContextTier(crewDir, 'invalid-tier' as never);
    const raw = JSON.parse(readFileSync(join(crewDir, 'config.json'), 'utf8'));
    expect(raw).not.toHaveProperty('defaultContextTier');
    expect(raw.defaultModel).toBe('claude-opus-4.6');
  });
});

// ============================================================================
// writeAgentContextTierOverrides
// ============================================================================

describe('writeAgentContextTierOverrides', () => {
  it('creates config.json with overrides', () => {
    writeAgentContextTierOverrides(crewDir, { fenster: 'long_context' });
    const raw = JSON.parse(readFileSync(join(crewDir, 'config.json'), 'utf8'));
    expect(raw.agentContextTierOverrides.fenster).toBe('long_context');
  });

  it('removes the field when set to null', () => {
    writeFileSync(
      join(crewDir, 'config.json'),
      JSON.stringify({
        version: 1,
        agentContextTierOverrides: { fenster: 'long_context' },
      })
    );
    writeAgentContextTierOverrides(crewDir, null);
    const raw = JSON.parse(readFileSync(join(crewDir, 'config.json'), 'utf8'));
    expect(raw).not.toHaveProperty('agentContextTierOverrides');
  });

  it('removes the field when given an empty object', () => {
    writeFileSync(
      join(crewDir, 'config.json'),
      JSON.stringify({
        version: 1,
        agentContextTierOverrides: { fenster: 'long_context' },
      })
    );
    writeAgentContextTierOverrides(crewDir, {});
    const raw = JSON.parse(readFileSync(join(crewDir, 'config.json'), 'utf8'));
    expect(raw).not.toHaveProperty('agentContextTierOverrides');
  });

  it('keeps valid entries and drops invalid ones', () => {
    writeAgentContextTierOverrides(crewDir, {
      fenster: 'long_context',
      bad: 'invalid-tier' as never,
    });
    const raw = JSON.parse(readFileSync(join(crewDir, 'config.json'), 'utf8'));
    expect(raw.agentContextTierOverrides.fenster).toBe('long_context');
    expect(raw.agentContextTierOverrides).not.toHaveProperty('bad');
  });
});

// ============================================================================
// resolveContextTier
// ============================================================================

describe('resolveContextTier', () => {
  it('returns undefined when nothing is set', () => {
    expect(resolveContextTier({})).toBeUndefined();
  });

  it('Layer 2: charter preference wins over default', () => {
    expect(
      resolveContextTier({ charterPreference: 'long_context' })
    ).toBe('long_context');
  });

  it('Layer 1: spawn override wins over charter', () => {
    expect(
      resolveContextTier({
        spawnOverride: 'long_context',
        charterPreference: 'default',
      })
    ).toBe('long_context');
  });

  it('Layer 0b: persistent config wins over spawn override', () => {
    writeFileSync(
      join(crewDir, 'config.json'),
      JSON.stringify({ version: 1, defaultContextTier: 'default' })
    );
    expect(
      resolveContextTier({
        crewDir,
        spawnOverride: 'long_context',
        charterPreference: 'long_context',
      })
    ).toBe('default');
  });

  it('Layer 0a: per-agent override wins over global', () => {
    writeFileSync(
      join(crewDir, 'config.json'),
      JSON.stringify({
        version: 1,
        defaultContextTier: 'default',
        agentContextTierOverrides: { fenster: 'long_context' },
      })
    );
    expect(
      resolveContextTier({
        agentName: 'fenster',
        crewDir,
        spawnOverride: 'default',
      })
    ).toBe('long_context');
  });

  it('auto is treated as absent at all layers', () => {
    expect(
      resolveContextTier({ charterPreference: 'auto' })
    ).toBeUndefined();

    expect(
      resolveContextTier({ spawnOverride: 'auto', charterPreference: 'long_context' })
    ).toBe('long_context');
  });

  it('falls through to charter when config has no tier', () => {
    writeFileSync(
      join(crewDir, 'config.json'),
      JSON.stringify({ version: 1, defaultModel: 'claude-opus-4.6' })
    );
    expect(
      resolveContextTier({
        crewDir,
        charterPreference: 'long_context',
      })
    ).toBe('long_context');
  });

  it('clamps to fallback when requested tier is unsupported', () => {
    // Model only supports the default tier — requesting long_context clamps to default
    expect(
      resolveContextTier({
        charterPreference: 'long_context',
        supportedContextTiers: ['default'],
      })
    ).toBe('default');
  });

  it('passes through when within model capabilities', () => {
    expect(
      resolveContextTier({
        charterPreference: 'long_context',
        supportedContextTiers: ['default', 'long_context'],
      })
    ).toBe('long_context');
  });

  it('ignores invalid spawnOverride values', () => {
    expect(
      resolveContextTier({ spawnOverride: 'invalid', charterPreference: 'long_context' })
    ).toBe('long_context');
  });

  it('ignores invalid charterPreference values', () => {
    expect(
      resolveContextTier({ charterPreference: 'turbo' })
    ).toBeUndefined();
  });

  it('ignores invalid persisted defaultContextTier', () => {
    writeFileSync(
      join(crewDir, 'config.json'),
      JSON.stringify({ version: 1, defaultContextTier: 'invalid' })
    );
    expect(
      resolveContextTier({
        crewDir,
        charterPreference: 'long_context',
      })
    ).toBe('long_context');
  });

  it('ignores all-invalid layers and returns undefined', () => {
    expect(
      resolveContextTier({
        spawnOverride: 'invalid',
        charterPreference: 'auto',
      })
    ).toBeUndefined();
  });
});

// ============================================================================
// clampContextTier
// ============================================================================

describe('clampContextTier', () => {
  it('returns undefined when no tier requested', () => {
    expect(clampContextTier(undefined, ['default', 'long_context'])).toBeUndefined();
  });

  it('trusts a valid request when model support is unknown', () => {
    expect(clampContextTier('long_context', undefined)).toBe('long_context');
    expect(clampContextTier('long_context', [])).toBe('long_context');
  });

  it('passes through when tier is directly supported', () => {
    expect(clampContextTier('default', ['default', 'long_context'])).toBe('default');
    expect(clampContextTier('long_context', ['default', 'long_context'])).toBe('long_context');
  });

  it('clamps to default when requested tier is unsupported', () => {
    expect(clampContextTier('long_context', ['default'])).toBe('default');
  });

  it('clamps to the model default when provided', () => {
    // long_context unsupported, model default is explicitly "default"
    expect(clampContextTier('long_context', ['default'], 'default')).toBe('default');
  });

  it('returns fallback for an unrecognized tier value', () => {
    expect(clampContextTier('turbo', ['default', 'long_context'])).toBe('default');
  });
});
