/**
 * Tests for cross-crew orchestration — manifest parsing, discovery,
 * delegation args, status parsing, and display formatting.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  validateManifest,
  readManifest,
  discoverCrews,
  discoverFromUpstreams,
  discoverFromRegistry,
  buildDelegationArgs,
  buildStatusCheckArgs,
  parseIssueStatus,
  formatDiscoveryTable,
  findCrewByName,
} from '../packages/crew-sdk/src/runtime/cross-crew.js';

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanDir(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

function writeManifest(repoDir: string, manifest: Record<string, unknown>): void {
  const crewDir = path.join(repoDir, '.crew');
  fs.mkdirSync(crewDir, { recursive: true });
  fs.writeFileSync(path.join(crewDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

// ============================================================================
// Manifest Validation
// ============================================================================

describe('validateManifest', () => {
  it('accepts a valid manifest', () => {
    expect(validateManifest({
      name: 'platform-crew',
      capabilities: ['kubernetes', 'helm'],
      contact: { repo: 'org/platform' },
      accepts: ['issues'],
    })).toBe(true);
  });

  it('accepts a full manifest with all optional fields', () => {
    expect(validateManifest({
      name: 'platform-crew',
      version: '1.0.0',
      description: 'Platform infrastructure team',
      capabilities: ['kubernetes', 'helm', 'monitoring'],
      contact: { repo: 'org/platform', labels: ['crew:platform'] },
      accepts: ['issues', 'prs'],
      skills: ['helm-developer', 'operator-developer'],
    })).toBe(true);
  });

  it('rejects null', () => {
    expect(validateManifest(null)).toBe(false);
  });

  it('rejects empty name', () => {
    expect(validateManifest({
      name: '',
      capabilities: ['k8s'],
      contact: { repo: 'org/r' },
      accepts: ['issues'],
    })).toBe(false);
  });

  it('rejects missing capabilities', () => {
    expect(validateManifest({
      name: 'crew',
      contact: { repo: 'org/r' },
      accepts: ['issues'],
    })).toBe(false);
  });

  it('rejects missing contact.repo', () => {
    expect(validateManifest({
      name: 'crew',
      capabilities: ['k8s'],
      contact: {},
      accepts: ['issues'],
    })).toBe(false);
  });

  it('rejects invalid accepts values', () => {
    expect(validateManifest({
      name: 'crew',
      capabilities: ['k8s'],
      contact: { repo: 'org/r' },
      accepts: ['emails'],
    })).toBe(false);
  });
});

// ============================================================================
// readManifest
// ============================================================================

describe('readManifest', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = makeTempDir('crew-manifest-read-');
  });

  afterAll(() => {
    cleanDir(tempDir);
  });

  it('reads a valid manifest file', () => {
    writeManifest(tempDir, {
      name: 'test-crew',
      capabilities: ['testing'],
      contact: { repo: 'org/test' },
      accepts: ['issues'],
    });
    const m = readManifest(tempDir);
    expect(m).not.toBeNull();
    expect(m!.name).toBe('test-crew');
    expect(m!.capabilities).toEqual(['testing']);
  });

  it('returns null for missing manifest', () => {
    const emptyDir = makeTempDir('crew-manifest-empty-');
    try {
      expect(readManifest(emptyDir)).toBeNull();
    } finally {
      cleanDir(emptyDir);
    }
  });

  it('returns null for invalid JSON', () => {
    const badDir = makeTempDir('crew-manifest-bad-');
    try {
      fs.mkdirSync(path.join(badDir, '.crew'), { recursive: true });
      fs.writeFileSync(path.join(badDir, '.crew', 'manifest.json'), 'not-json{{{');
      expect(readManifest(badDir)).toBeNull();
    } finally {
      cleanDir(badDir);
    }
  });

  it('returns null for manifest missing required fields', () => {
    const incompleteDir = makeTempDir('crew-manifest-incomplete-');
    try {
      fs.mkdirSync(path.join(incompleteDir, '.crew'), { recursive: true });
      fs.writeFileSync(
        path.join(incompleteDir, '.crew', 'manifest.json'),
        JSON.stringify({ name: 'oops' }),
      );
      expect(readManifest(incompleteDir)).toBeNull();
    } finally {
      cleanDir(incompleteDir);
    }
  });
});

// ============================================================================
// Discovery
// ============================================================================

describe('discoverCrews', () => {
  let repoDir: string;
  let platformDir: string;
  let frontendDir: string;

  beforeAll(() => {
    // Set up repo with upstream.json pointing to two crews
    repoDir = makeTempDir('crew-discover-repo-');
    platformDir = makeTempDir('crew-discover-platform-');
    frontendDir = makeTempDir('crew-discover-frontend-');

    writeManifest(platformDir, {
      name: 'platform-crew',
      description: 'Platform infrastructure',
      capabilities: ['kubernetes', 'helm', 'monitoring'],
      contact: { repo: 'org/platform', labels: ['crew:platform'] },
      accepts: ['issues', 'prs'],
      skills: ['helm-developer'],
    });

    writeManifest(frontendDir, {
      name: 'frontend-crew',
      capabilities: ['react', 'nextjs'],
      contact: { repo: 'org/frontend' },
      accepts: ['issues'],
    });

    const crewDir = path.join(repoDir, '.crew');
    fs.mkdirSync(crewDir, { recursive: true });
    fs.writeFileSync(path.join(crewDir, 'upstream.json'), JSON.stringify({
      upstreams: [
        { name: 'platform', type: 'local', source: platformDir, added_at: new Date().toISOString(), last_synced: null },
        { name: 'frontend', type: 'local', source: frontendDir, added_at: new Date().toISOString(), last_synced: null },
      ],
    }, null, 2));
  });

  afterAll(() => {
    cleanDir(repoDir);
    cleanDir(platformDir);
    cleanDir(frontendDir);
  });

  it('discovers both crews from upstreams', () => {
    const crews = discoverCrews(path.join(repoDir, '.crew'));
    expect(crews).toHaveLength(2);
    expect(crews.map(s => s.manifest.name)).toContain('platform-crew');
    expect(crews.map(s => s.manifest.name)).toContain('frontend-crew');
  });

  it('includes capabilities in discovered manifests', () => {
    const crews = discoverCrews(path.join(repoDir, '.crew'));
    const platform = crews.find(s => s.manifest.name === 'platform-crew')!;
    expect(platform.manifest.capabilities).toContain('kubernetes');
    expect(platform.manifest.capabilities).toContain('helm');
  });

  it('records source as upstream', () => {
    const crews = discoverCrews(path.join(repoDir, '.crew'));
    for (const s of crews) {
      expect(s.source).toBe('upstream');
    }
  });

  it('returns empty array when no upstream.json', () => {
    const emptyDir = makeTempDir('crew-discover-empty-');
    try {
      fs.mkdirSync(path.join(emptyDir, '.crew'), { recursive: true });
      const crews = discoverCrews(path.join(emptyDir, '.crew'));
      expect(crews).toEqual([]);
    } finally {
      cleanDir(emptyDir);
    }
  });

  it('skips upstreams without manifests', () => {
    const noManifestDir = makeTempDir('crew-discover-nomanifest-');
    const mixedRepo = makeTempDir('crew-discover-mixed-');
    try {
      fs.mkdirSync(path.join(noManifestDir, '.crew'), { recursive: true });
      // no manifest.json written

      const crewDir = path.join(mixedRepo, '.crew');
      fs.mkdirSync(crewDir, { recursive: true });
      fs.writeFileSync(path.join(crewDir, 'upstream.json'), JSON.stringify({
        upstreams: [
          { name: 'has-manifest', type: 'local', source: platformDir, added_at: new Date().toISOString(), last_synced: null },
          { name: 'no-manifest', type: 'local', source: noManifestDir, added_at: new Date().toISOString(), last_synced: null },
        ],
      }));

      const crews = discoverCrews(crewDir);
      expect(crews).toHaveLength(1);
      expect(crews[0]!.manifest.name).toBe('platform-crew');
    } finally {
      cleanDir(noManifestDir);
      cleanDir(mixedRepo);
    }
  });
});

// ============================================================================
// Registry Discovery
// ============================================================================

describe('discoverFromRegistry', () => {
  let registryDir: string;
  let crewADir: string;

  beforeAll(() => {
    registryDir = makeTempDir('crew-registry-');
    crewADir = makeTempDir('crew-registry-a-');

    writeManifest(crewADir, {
      name: 'registry-crew-a',
      capabilities: ['go', 'rust'],
      contact: { repo: 'org/services' },
      accepts: ['issues'],
    });
  });

  afterAll(() => {
    cleanDir(registryDir);
    cleanDir(crewADir);
  });

  it('discovers crews from a registry file', () => {
    const registryPath = path.join(registryDir, 'registry.json');
    fs.writeFileSync(registryPath, JSON.stringify([
      { name: 'crew-a', path: crewADir },
    ]));

    const crews = discoverFromRegistry(registryPath);
    expect(crews).toHaveLength(1);
    expect(crews[0]!.manifest.name).toBe('registry-crew-a');
    expect(crews[0]!.source).toBe('registry');
  });

  it('returns empty for missing registry file', () => {
    expect(discoverFromRegistry('/nonexistent/path')).toEqual([]);
  });

  it('returns empty for invalid JSON', () => {
    const badPath = path.join(registryDir, 'bad.json');
    fs.writeFileSync(badPath, 'nope');
    expect(discoverFromRegistry(badPath)).toEqual([]);
  });
});

// ============================================================================
// Delegation
// ============================================================================

describe('buildDelegationArgs', () => {
  it('builds correct gh cli args', () => {
    const args = buildDelegationArgs({
      targetRepo: 'org/platform',
      title: 'Add metrics endpoint',
      body: 'Need Prometheus metrics.',
      labels: ['crew:platform'],
    });

    expect(args).toContain('issue');
    expect(args).toContain('create');
    expect(args).toContain('--repo');
    expect(args).toContain('org/platform');
    expect(args).toContain('--title');
    expect(args).toContain('[cross-crew] Add metrics endpoint');
    expect(args).toContain('--body');
    expect(args).toContain('Need Prometheus metrics.');
    expect(args).toContain('--label');
    expect(args).toContain('crew:cross-crew');
    expect(args).toContain('crew:platform');
  });

  it('does not double-prefix [cross-crew] in title', () => {
    const args = buildDelegationArgs({
      targetRepo: 'org/platform',
      title: '[cross-crew] Already prefixed',
      body: 'test',
    });

    const titleIdx = args.indexOf('--title');
    expect(args[titleIdx + 1]).toBe('[cross-crew] Already prefixed');
  });

  it('adds crew:cross-crew label even when none provided', () => {
    const args = buildDelegationArgs({
      targetRepo: 'org/platform',
      title: 'test',
      body: 'test',
    });

    const labelIndices = args.reduce<number[]>((acc, a, i) => a === '--label' ? [...acc, i] : acc, []);
    const labels = labelIndices.map(i => args[i + 1]);
    expect(labels).toContain('crew:cross-crew');
  });
});

// ============================================================================
// Status Tracking
// ============================================================================

describe('buildStatusCheckArgs', () => {
  it('parses a valid GitHub issue URL', () => {
    const args = buildStatusCheckArgs('https://github.com/org/platform/issues/42');
    expect(args).not.toBeNull();
    expect(args).toContain('--repo');
    expect(args).toContain('org/platform');
    expect(args).toContain('42');
  });

  it('returns null for invalid URL', () => {
    expect(buildStatusCheckArgs('not-a-url')).toBeNull();
    expect(buildStatusCheckArgs('https://gitlab.com/org/repo/issues/1')).toBeNull();
  });
});

describe('parseIssueStatus', () => {
  it('parses open status', () => {
    const result = parseIssueStatus(
      JSON.stringify({ state: 'OPEN', title: 'Test issue' }),
      'https://github.com/org/repo/issues/1',
    );
    expect(result.state).toBe('open');
    expect(result.title).toBe('Test issue');
    expect(result.url).toBe('https://github.com/org/repo/issues/1');
  });

  it('parses closed status', () => {
    const result = parseIssueStatus(
      JSON.stringify({ state: 'CLOSED', title: 'Done' }),
      'https://github.com/org/repo/issues/2',
    );
    expect(result.state).toBe('closed');
  });

  it('handles unparseable JSON', () => {
    const result = parseIssueStatus('bad-json', 'https://github.com/org/repo/issues/3');
    expect(result.state).toBe('unknown');
    expect(result.error).toBeDefined();
  });
});

// ============================================================================
// Display
// ============================================================================

describe('formatDiscoveryTable', () => {
  it('shows message when no crews found', () => {
    const output = formatDiscoveryTable([]);
    expect(output).toContain('No crews discovered');
  });

  it('formats discovered crews', () => {
    const output = formatDiscoveryTable([
      {
        manifest: {
          name: 'platform-crew',
          description: 'Platform team',
          capabilities: ['kubernetes', 'helm'],
          contact: { repo: 'org/platform' },
          accepts: ['issues', 'prs'],
        },
        source: 'upstream',
        sourceRef: 'platform',
      },
    ]);
    expect(output).toContain('platform-crew');
    expect(output).toContain('org/platform');
    expect(output).toContain('kubernetes');
    expect(output).toContain('Platform team');
  });

  it('truncates long capability lists', () => {
    const output = formatDiscoveryTable([
      {
        manifest: {
          name: 'big-crew',
          capabilities: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
          contact: { repo: 'org/big' },
          accepts: ['issues'],
        },
        source: 'upstream',
        sourceRef: 'big',
      },
    ]);
    expect(output).toContain('+2 more');
  });
});

// ============================================================================
// findCrewByName
// ============================================================================

describe('findCrewByName', () => {
  const crews = [
    {
      manifest: {
        name: 'alpha',
        capabilities: ['a'],
        contact: { repo: 'org/alpha' } as const,
        accepts: ['issues' as const],
      },
      source: 'upstream' as const,
      sourceRef: 'alpha',
    },
    {
      manifest: {
        name: 'beta',
        capabilities: ['b'],
        contact: { repo: 'org/beta' } as const,
        accepts: ['issues' as const],
      },
      source: 'upstream' as const,
      sourceRef: 'beta',
    },
  ];

  it('finds crew by exact name', () => {
    expect(findCrewByName(crews, 'alpha')?.manifest.name).toBe('alpha');
    expect(findCrewByName(crews, 'beta')?.manifest.name).toBe('beta');
  });

  it('returns undefined for unknown name', () => {
    expect(findCrewByName(crews, 'gamma')).toBeUndefined();
  });
});

// ============================================================================
// cross-crew-communication/SKILL.md — CLI invocation correctness
// ============================================================================
//
// The SKILL.md tells coordinators how to invoke the Copilot CLI on a peer
// crew repo. An earlier draft of the skill used `ghcs` (which doesn't
// exist as a binary), `--working-directory` (real flag is `-C`), `--no-mcp`
// (real flag is `--disable-builtin-mcps`), `-p <file>` (real flag takes
// prompt TEXT, not a path), and a `~/.agency/logs/` log path (new CLI logs
// under `~/.copilot/logs/`). All five are wrong on the real `copilot` CLI
// (verified empirically against `copilot --help`).
//
// These tests assert each of the 5 corrections is present in every mirrored
// copy of the skill, so a future refactor can't silently regress the file
// back to a state where the CLI commands it suggests would fail.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname_ccc = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT_CCC = resolve(__dirname_ccc, '..');

const CROSS_CREW_COMM_LOCATIONS = [
  '.crew/skills/cross-crew-communication/SKILL.md',
  'packages/crew-cli/templates/skills/cross-crew-communication/SKILL.md',
  'packages/crew-sdk/templates/skills/cross-crew-communication/SKILL.md',
] as const;

describe('cross-crew-communication/SKILL.md uses real Copilot CLI invocations', () => {
  for (const loc of CROSS_CREW_COMM_LOCATIONS) {
    describe(loc, () => {
      const content = readFileSync(resolve(REPO_ROOT_CCC, loc), 'utf-8');

      it('does NOT reference the non-existent `ghcs` binary', () => {
        // `ghcs` (the old "GitHub Copilot in the Shell" shim) is not a
        // standalone binary in modern installs. The real CLI is `copilot`.
        expect(content).not.toMatch(/\bghcs\b/);
      });

      it('does NOT reference the non-existent `--working-directory` flag', () => {
        // `copilot --help` shows `-C <directory>`, not `--working-directory`.
        expect(content).not.toMatch(/--working-directory\b/);
      });

      it('does NOT reference the non-existent `--no-mcp` flag', () => {
        // Real flag is `--disable-builtin-mcps`.
        expect(content).not.toMatch(/--no-mcp\b/);
      });

      it('uses `copilot -C <dir>` for setting the target working directory', () => {
        expect(content).toMatch(/copilot\s+-C\s/);
      });

      it('uses `--disable-builtin-mcps` in the MCP-skip fallback', () => {
        expect(content).toMatch(/--disable-builtin-mcps\b/);
      });

      it('reads the prompt file into a string before passing to `-p`', () => {
        // `-p, --prompt <text>` per `copilot --help` — passing a path makes
        // the CLI try to execute the path string as a prompt.
        expect(content).toMatch(/-p\s+\(Get-Content/);
      });

      it('passes `--allow-all-tools` for autonomous (non-interactive) invocations', () => {
        // Without this, every tool call prompts for permission and hangs
        // the cross-crew delegation indefinitely.
        expect(content).toMatch(/--allow-all-tools\b/);
      });

      it('uses ~/.copilot/logs/ as the primary log root with .agency fallback', () => {
        // New CLI logs under ~/.copilot/logs/. Older agency runtimes
        // wrote to ~/.agency/logs/ — keep the fallback for transitional
        // installs but reference the new path first.
        expect(content).toMatch(/\.copilot\\logs/);
        expect(content).toMatch(/Test-Path/);
      });

      it('every `copilot` spawn into a peer crew includes `--agent crew`', () => {
        // Crew installs ship .github/agents/crew.agent.md which is only
        // loaded when --agent crew is passed. Without it the spawned
        // session runs as a generic Copilot CLI session and does NOT load
        // the peer's team.md, routing, MCP tools, casting, or coordinator
        // — defeating the entire point of cross-crew delegation.
        //
        // Find every `copilot ...` command line (excluding `copilot --resume`
        // which preserves the original session's agent, and prose
        // references to the flag like "`copilot -C <directory>`"). Each
        // remaining line MUST contain `--agent crew`.
        const lines = content.split(/\r?\n/);
        const spawnLines = lines.filter(l =>
          /\bcopilot\s+(?:-[A-Z]|-p|--(?!resume|version|help))/.test(l)
          && !/`copilot\s+-C\s+<directory>`/.test(l) // prose flag reference
        );
        expect(spawnLines.length, 'expected at least one copilot spawn command').toBeGreaterThan(0);
        for (const line of spawnLines) {
          expect(
            line,
            `every copilot spawn into a peer crew must pass '--agent crew'. Offender:\n  ${line.trim()}`
          ).toMatch(/--agent\s+crew\b/);
        }
      });

      it('explains WHY --agent crew is required (universal rule paragraph)', () => {
        // The rationale needs to be visible inline so future edits don't
        // strip --agent thinking it's redundant. Match the universal-rule
        // header + the key consequence keyword.
        expect(content).toMatch(/Universal rule.*--agent crew/i);
        expect(content).toMatch(/generic Copilot CLI session/i);
      });
    });
  }
});
