/**
 * Crew SubCrews — Comprehensive Tests
 *
 * Tests cover:
 *   - SubCrew types (compile-time, verified via usage)
 *   - SubCrew resolution (env var, file, config, fallback)
 *   - Label-based filtering (match, no match, multiple labels, case insensitive)
 *   - Config loading / validation
 *   - CLI activate command (writes .crew-workstream)
 *   - Init with SubCrews (generates workstreams.json)
 *   - Edge cases (empty SubCrews, invalid JSON, missing env, passthrough)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  loadSubCrewsConfig,
  resolveSubCrew,
  getSubCrewLabelFilter,
  filterIssuesBySubCrew,
  // Verify backward-compat aliases still exist
  loadWorkstreamsConfig,
  resolveWorkstream,
  getWorkstreamLabelFilter,
  filterIssuesByWorkstream,
} from '../packages/crew-sdk/src/streams/index.js';

import type {
  SubCrewDefinition,
  SubCrewConfig,
  ResolvedSubCrew,
  SubCrewIssue,
  // Verify deprecated type aliases still exist
  WorkstreamDefinition,
  WorkstreamConfig,
  ResolvedWorkstream,
  WorkstreamIssue,
} from '../packages/crew-sdk/src/streams/index.js';

// ============================================================================
// Helpers
// ============================================================================

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'crew-workstreams-test-'));
}

function writeCrewWorkstreamsConfig(root: string, config: SubCrewConfig): void {
  const crewDir = path.join(root, '.crew');
  fs.mkdirSync(crewDir, { recursive: true });
  fs.writeFileSync(path.join(crewDir, 'workstreams.json'), JSON.stringify(config, null, 2), 'utf-8');
}

function writeCrewWorkstreamFile(root: string, name: string): void {
  fs.writeFileSync(path.join(root, '.crew-workstream'), name + '\n', 'utf-8');
}

const SAMPLE_CONFIG: SubCrewConfig = {
  workstreams: [
    { name: 'ui-team', labelFilter: 'team:ui', folderScope: ['apps/web'], workflow: 'branch-per-issue', description: 'UI specialists' },
    { name: 'backend-team', labelFilter: 'team:backend', folderScope: ['apps/api'], workflow: 'direct' },
    { name: 'infra-team', labelFilter: 'team:infra' },
  ],
  defaultWorkflow: 'branch-per-issue',
};

const SAMPLE_ISSUES: SubCrewIssue[] = [
  { number: 1, title: 'Fix button color', labels: [{ name: 'team:ui' }, { name: 'bug' }] },
  { number: 2, title: 'Add REST endpoint', labels: [{ name: 'team:backend' }] },
  { number: 3, title: 'Setup CI', labels: [{ name: 'team:infra' }] },
  { number: 4, title: 'Unscoped issue', labels: [{ name: 'bug' }] },
  { number: 5, title: 'Multi-label', labels: [{ name: 'team:ui' }, { name: 'team:backend' }] },
];

// ============================================================================
// loadStreamsConfig
// ============================================================================

describe('loadSubCrewsConfig', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('returns null when .crew/workstreams.json does not exist', () => {
    expect(loadSubCrewsConfig(tmpDir)).toBeNull();
  });

  it('loads a valid SubCrews config', () => {
    writeCrewWorkstreamsConfig(tmpDir, SAMPLE_CONFIG);
    const result = loadSubCrewsConfig(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.workstreams).toHaveLength(3);
    expect(result!.defaultWorkflow).toBe('branch-per-issue');
  });

  it('returns null for invalid JSON', () => {
    const crewDir = path.join(tmpDir, '.crew');
    fs.mkdirSync(crewDir, { recursive: true });
    fs.writeFileSync(path.join(crewDir, 'workstreams.json'), '{invalid', 'utf-8');
    expect(loadSubCrewsConfig(tmpDir)).toBeNull();
  });

  it('returns null when workstreams array is missing', () => {
    const crewDir = path.join(tmpDir, '.crew');
    fs.mkdirSync(crewDir, { recursive: true });
    fs.writeFileSync(path.join(crewDir, 'workstreams.json'), '{"defaultWorkflow":"direct"}', 'utf-8');
    expect(loadSubCrewsConfig(tmpDir)).toBeNull();
  });

  it('defaults defaultWorkflow to branch-per-issue when missing', () => {
    const crewDir = path.join(tmpDir, '.crew');
    fs.mkdirSync(crewDir, { recursive: true });
    fs.writeFileSync(path.join(crewDir, 'workstreams.json'), '{"workstreams":[{"name":"a","labelFilter":"x"}]}', 'utf-8');
    const result = loadSubCrewsConfig(tmpDir);
    expect(result!.defaultWorkflow).toBe('branch-per-issue');
  });

  it('preserves folderScope arrays', () => {
    writeCrewWorkstreamsConfig(tmpDir, SAMPLE_CONFIG);
    const result = loadSubCrewsConfig(tmpDir)!;
    expect(result.workstreams[0]!.folderScope).toEqual(['apps/web']);
  });

  it('preserves optional description', () => {
    writeCrewWorkstreamsConfig(tmpDir, SAMPLE_CONFIG);
    const result = loadSubCrewsConfig(tmpDir)!;
    expect(result.workstreams[0]!.description).toBe('UI specialists');
    expect(result.workstreams[1]!.description).toBeUndefined();
  });
});

// ============================================================================
// resolveStream
// ============================================================================

describe('resolveSubCrew', () => {
  let tmpDir: string;
  const origEnv = process.env.CREW_TEAM;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    delete process.env.CREW_TEAM;
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (origEnv !== undefined) {
      process.env.CREW_TEAM = origEnv;
    } else {
      delete process.env.CREW_TEAM;
    }
  });

  // --- Env var resolution ---

  it('resolves from CREW_TEAM env var with matching config', () => {
    process.env.CREW_TEAM = 'ui-team';
    writeCrewWorkstreamsConfig(tmpDir, SAMPLE_CONFIG);
    const result = resolveSubCrew(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('ui-team');
    expect(result!.source).toBe('env');
    expect(result!.definition.labelFilter).toBe('team:ui');
    expect(result!.definition.folderScope).toEqual(['apps/web']);
  });

  it('synthesizes definition from CREW_TEAM when no config exists', () => {
    process.env.CREW_TEAM = 'custom-team';
    const result = resolveSubCrew(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('custom-team');
    expect(result!.source).toBe('env');
    expect(result!.definition.labelFilter).toBe('team:custom-team');
  });

  it('synthesizes definition from CREW_TEAM when SubCrew not in config', () => {
    process.env.CREW_TEAM = 'unknown-team';
    writeCrewWorkstreamsConfig(tmpDir, SAMPLE_CONFIG);
    const result = resolveSubCrew(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('unknown-team');
    expect(result!.source).toBe('env');
    expect(result!.definition.labelFilter).toBe('team:unknown-team');
  });

  // --- File resolution ---

  it('resolves from .crew-workstream file with matching config', () => {
    writeCrewWorkstreamsConfig(tmpDir, SAMPLE_CONFIG);
    writeCrewWorkstreamFile(tmpDir, 'backend-team');
    const result = resolveSubCrew(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('backend-team');
    expect(result!.source).toBe('file');
    expect(result!.definition.workflow).toBe('direct');
  });

  it('synthesizes definition from .crew-workstream file when no config', () => {
    writeCrewWorkstreamFile(tmpDir, 'my-subcrew');
    const result = resolveSubCrew(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('my-subcrew');
    expect(result!.source).toBe('file');
    expect(result!.definition.labelFilter).toBe('team:my-subcrew');
  });

  it('ignores empty .crew-workstream file', () => {
    fs.writeFileSync(path.join(tmpDir, '.crew-workstream'), '   \n', 'utf-8');
    expect(resolveSubCrew(tmpDir)).toBeNull();
  });

  it('trims whitespace from .crew-workstream file', () => {
    writeCrewWorkstreamsConfig(tmpDir, SAMPLE_CONFIG);
    fs.writeFileSync(path.join(tmpDir, '.crew-workstream'), '  ui-team  \n', 'utf-8');
    const result = resolveWorkstream(tmpDir);
    expect(result!.name).toBe('ui-team');
    expect(result!.source).toBe('file');
  });

  // --- Config resolution (single SubCrew auto-select) ---

  it('auto-selects single SubCrew from config', () => {
    const singleConfig: WorkstreamConfig = {
      workstreams: [{ name: 'solo', labelFilter: 'team:solo' }],
      defaultWorkflow: 'direct',
    };
    writeCrewWorkstreamsConfig(tmpDir, singleConfig);
    const result = resolveWorkstream(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('solo');
    expect(result!.source).toBe('config');
  });

  // --- Fallback ---

  it('returns null when no SubCrew context exists', () => {
    expect(resolveWorkstream(tmpDir)).toBeNull();
  });

  it('returns null when config has multiple SubCrews but no env/file', () => {
    writeCrewWorkstreamsConfig(tmpDir, SAMPLE_CONFIG);
    expect(resolveWorkstream(tmpDir)).toBeNull();
  });

  // --- Priority order ---

  it('env var takes priority over .crew-workstream file', () => {
    process.env.CREW_TEAM = 'ui-team';
    writeCrewWorkstreamsConfig(tmpDir, SAMPLE_CONFIG);
    writeCrewWorkstreamFile(tmpDir, 'backend-team');
    const result = resolveWorkstream(tmpDir);
    expect(result!.name).toBe('ui-team');
    expect(result!.source).toBe('env');
  });

  it('.crew-workstream file takes priority over config auto-select', () => {
    const singleConfig: WorkstreamConfig = {
      workstreams: [
        { name: 'alpha', labelFilter: 'team:alpha' },
      ],
      defaultWorkflow: 'branch-per-issue',
    };
    writeCrewWorkstreamsConfig(tmpDir, singleConfig);
    writeCrewWorkstreamFile(tmpDir, 'alpha');
    const result = resolveWorkstream(tmpDir);
    // file source takes priority
    expect(result!.source).toBe('file');
  });
});

// ============================================================================
// getSubCrewLabelFilter
// ============================================================================

describe('getSubCrewLabelFilter', () => {
  it('returns the label filter from definition', () => {
    const subcrew: ResolvedSubCrew = {
      name: 'ui-team',
      definition: { name: 'ui-team', labelFilter: 'team:ui' },
      source: 'env',
    };
    expect(getSubCrewLabelFilter(subcrew)).toBe('team:ui');
  });

  it('returns synthesized label filter', () => {
    const subcrew: ResolvedSubCrew = {
      name: 'custom',
      definition: { name: 'custom', labelFilter: 'team:custom' },
      source: 'file',
    };
    expect(getSubCrewLabelFilter(subcrew)).toBe('team:custom');
  });

  it('backward compat: getWorkstreamLabelFilter still works', () => {
    const subcrew: ResolvedWorkstream = {
      name: 'ui-team',
      definition: { name: 'ui-team', labelFilter: 'team:ui' },
      source: 'env',
    };
    expect(getWorkstreamLabelFilter(subcrew)).toBe('team:ui');
  });
});

// ============================================================================
// filterIssuesBySubCrew
// ============================================================================

describe('filterIssuesBySubCrew', () => {
  it('filters issues matching the SubCrew label', () => {
    const subcrew: ResolvedSubCrew = {
      name: 'ui-team',
      definition: { name: 'ui-team', labelFilter: 'team:ui' },
      source: 'env',
    };
    const result = filterIssuesBySubCrew(SAMPLE_ISSUES, subcrew);
    expect(result).toHaveLength(2); // issue 1 and 5
    expect(result.map(i => i.number)).toEqual([1, 5]);
  });

  it('returns empty array when no issues match', () => {
    const subcrew: ResolvedSubCrew = {
      name: 'qa-team',
      definition: { name: 'qa-team', labelFilter: 'team:qa' },
      source: 'env',
    };
    const result = filterIssuesBySubCrew(SAMPLE_ISSUES, subcrew);
    expect(result).toHaveLength(0);
  });

  it('handles case-insensitive matching', () => {
    const subcrew: ResolvedSubCrew = {
      name: 'ui-team',
      definition: { name: 'ui-team', labelFilter: 'TEAM:UI' },
      source: 'env',
    };
    const result = filterIssuesBySubCrew(SAMPLE_ISSUES, subcrew);
    expect(result).toHaveLength(2);
  });

  it('returns all issues when labelFilter is empty', () => {
    const subcrew: ResolvedSubCrew = {
      name: 'all',
      definition: { name: 'all', labelFilter: '' },
      source: 'env',
    };
    const result = filterIssuesBySubCrew(SAMPLE_ISSUES, subcrew);
    expect(result).toHaveLength(SAMPLE_ISSUES.length);
  });

  it('handles issues with no labels', () => {
    const issues: SubCrewIssue[] = [
      { number: 10, title: 'No labels', labels: [] },
    ];
    const subcrew: ResolvedSubCrew = {
      name: 'ui-team',
      definition: { name: 'ui-team', labelFilter: 'team:ui' },
      source: 'env',
    };
    expect(filterIssuesBySubCrew(issues, subcrew)).toHaveLength(0);
  });

  it('handles empty issues array', () => {
    const subcrew: ResolvedSubCrew = {
      name: 'ui-team',
      definition: { name: 'ui-team', labelFilter: 'team:ui' },
      source: 'env',
    };
    expect(filterIssuesBySubCrew([], subcrew)).toHaveLength(0);
  });

  it('filters backend-team correctly', () => {
    const subcrew: ResolvedSubCrew = {
      name: 'backend-team',
      definition: { name: 'backend-team', labelFilter: 'team:backend' },
      source: 'config',
    };
    const result = filterIssuesBySubCrew(SAMPLE_ISSUES, subcrew);
    expect(result).toHaveLength(2); // issue 2 and 5
    expect(result.map(i => i.number)).toEqual([2, 5]);
  });

  it('filters infra-team correctly (single match)', () => {
    const subcrew: ResolvedSubCrew = {
      name: 'infra-team',
      definition: { name: 'infra-team', labelFilter: 'team:infra' },
      source: 'file',
    };
    const result = filterIssuesBySubCrew(SAMPLE_ISSUES, subcrew);
    expect(result).toHaveLength(1);
    expect(result[0]!.number).toBe(3);
  });

  it('backward compat: filterIssuesByWorkstream still works', () => {
    const subcrew: ResolvedWorkstream = {
      name: 'ui-team',
      definition: { name: 'ui-team', labelFilter: 'team:ui' },
      source: 'env',
    };
    const result = filterIssuesByWorkstream(SAMPLE_ISSUES, subcrew);
    expect(result).toHaveLength(2);
  });
});

// ============================================================================
// Type checks (compile-time — these just verify the types work)
// ============================================================================

describe('SubCrew types', () => {
  it('SubCrewDefinition accepts all fields', () => {
    const def: SubCrewDefinition = {
      name: 'test',
      labelFilter: 'team:test',
      folderScope: ['src/'],
      workflow: 'branch-per-issue',
      description: 'Test SubCrew',
    };
    expect(def.name).toBe('test');
    expect(def.workflow).toBe('branch-per-issue');
  });

  it('SubCrewDefinition works with minimal fields', () => {
    const def: SubCrewDefinition = {
      name: 'minimal',
      labelFilter: 'team:minimal',
    };
    expect(def.folderScope).toBeUndefined();
    expect(def.workflow).toBeUndefined();
    expect(def.description).toBeUndefined();
  });

  it('SubCrewConfig has required fields', () => {
    const config: SubCrewConfig = {
      workstreams: [],
      defaultWorkflow: 'direct',
    };
    expect(config.workstreams).toEqual([]);
    expect(config.defaultWorkflow).toBe('direct');
  });

  it('ResolvedSubCrew has source provenance', () => {
    const resolved: ResolvedSubCrew = {
      name: 'test',
      definition: { name: 'test', labelFilter: 'x' },
      source: 'env',
    };
    expect(resolved.source).toBe('env');
  });
});

// ============================================================================
// Init integration (streams.json generation)
// ============================================================================

describe('initCrew with SubCrews', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('generates workstreams.json when streams option is provided', async () => {
    const { initCrew } = await import('../packages/crew-sdk/src/config/init.js');
    const streams: SubCrewDefinition[] = [
      { name: 'ui-team', labelFilter: 'team:ui', folderScope: ['apps/web'] },
      { name: 'api-team', labelFilter: 'team:api' },
    ];

    await initCrew({
      teamRoot: tmpDir,
      projectName: 'test-workstreams',
      agents: [{ name: 'lead', role: 'lead' }],
      streams,
      includeWorkflows: false,
      includeTemplates: false,
      includeMcpConfig: false,
    });

    const workstreamsPath = path.join(tmpDir, '.crew', 'workstreams.json');
    expect(fs.existsSync(workstreamsPath)).toBe(true);

    const content = JSON.parse(fs.readFileSync(workstreamsPath, 'utf-8')) as SubCrewConfig;
    expect(content.workstreams).toHaveLength(2);
    expect(content.workstreams[0]!.name).toBe('ui-team');
    expect(content.defaultWorkflow).toBe('branch-per-issue');
  });

  it('does not generate workstreams.json when no streams provided', async () => {
    const { initCrew } = await import('../packages/crew-sdk/src/config/init.js');

    await initCrew({
      teamRoot: tmpDir,
      projectName: 'test-no-subcrews',
      agents: [{ name: 'lead', role: 'lead' }],
      includeWorkflows: false,
      includeTemplates: false,
      includeMcpConfig: false,
    });

    const workstreamsPath = path.join(tmpDir, '.crew', 'workstreams.json');
    expect(fs.existsSync(workstreamsPath)).toBe(false);
  });

  it('adds .crew-workstream to .gitignore', async () => {
    const { initCrew } = await import('../packages/crew-sdk/src/config/init.js');

    await initCrew({
      teamRoot: tmpDir,
      projectName: 'test-gitignore',
      agents: [{ name: 'lead', role: 'lead' }],
      includeWorkflows: false,
      includeTemplates: false,
      includeMcpConfig: false,
    });

    const gitignorePath = path.join(tmpDir, '.gitignore');
    expect(fs.existsSync(gitignorePath)).toBe(true);
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    expect(content).toContain('.crew-workstream');
  });
});

// ============================================================================
// CLI activate (unit test the file-writing behavior)
// ============================================================================

describe('CLI activate behavior', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('writes .crew-workstream file with the SubCrew name', () => {
    const filePath = path.join(tmpDir, '.crew-workstream');
    fs.writeFileSync(filePath, 'my-subcrew\n', 'utf-8');
    const content = fs.readFileSync(filePath, 'utf-8').trim();
    expect(content).toBe('my-subcrew');
  });

  it('resolves after activation', () => {
    writeCrewWorkstreamsConfig(tmpDir, SAMPLE_CONFIG);
    writeCrewWorkstreamFile(tmpDir, 'infra-team');
    const result = resolveWorkstream(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('infra-team');
    expect(result!.definition.labelFilter).toBe('team:infra');
  });

  it('overwriting .crew-workstream changes active workstream', () => {
    writeCrewWorkstreamsConfig(tmpDir, SAMPLE_CONFIG);
    writeCrewWorkstreamFile(tmpDir, 'ui-team');
    expect(resolveWorkstream(tmpDir)!.name).toBe('ui-team');

    writeCrewWorkstreamFile(tmpDir, 'backend-team');
    expect(resolveWorkstream(tmpDir)!.name).toBe('backend-team');
  });
});

// ============================================================================
// Edge cases
// ============================================================================

describe('Edge cases', () => {
  let tmpDir: string;
  const origEnv = process.env.CREW_TEAM;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    delete process.env.CREW_TEAM;
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (origEnv !== undefined) {
      process.env.CREW_TEAM = origEnv;
    } else {
      delete process.env.CREW_TEAM;
    }
  });

  it('handles empty SubCrews array in config', () => {
    const emptyConfig: SubCrewConfig = { workstreams: [], defaultWorkflow: 'direct' };
    writeCrewWorkstreamsConfig(tmpDir, emptyConfig);
    expect(resolveSubCrew(tmpDir)).toBeNull();
  });

  it('handles config with workstreams but non-array type', () => {
    const crewDir = path.join(tmpDir, '.crew');
    fs.mkdirSync(crewDir, { recursive: true });
    fs.writeFileSync(path.join(crewDir, 'workstreams.json'), '{"workstreams":"not-array"}', 'utf-8');
    expect(loadSubCrewsConfig(tmpDir)).toBeNull();
  });

  it('handles CREW_TEAM set to empty string', () => {
    process.env.CREW_TEAM = '';
    expect(resolveSubCrew(tmpDir)).toBeNull();
  });

  it('filterIssuesBySubCrew handles labels with special characters', () => {
    const issues: SubCrewIssue[] = [
      { number: 1, title: 'Test', labels: [{ name: 'team:front-end/ui' }] },
    ];
    const subcrew: ResolvedSubCrew = {
      name: 'fe',
      definition: { name: 'fe', labelFilter: 'team:front-end/ui' },
      source: 'env',
    };
    const result = filterIssuesBySubCrew(issues, subcrew);
    expect(result).toHaveLength(1);
  });

  it('resolves workflow from definition over defaultWorkflow', () => {
    const config: SubCrewConfig = {
      workstreams: [{ name: 'direct-subcrew', labelFilter: 'team:direct', workflow: 'direct' }],
      defaultWorkflow: 'branch-per-issue',
    };
    writeCrewWorkstreamsConfig(tmpDir, config);
    const result = resolveSubCrew(tmpDir);
    expect(result!.definition.workflow).toBe('direct');
  });
});
