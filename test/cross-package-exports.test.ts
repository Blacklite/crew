/**
 * Cross-package export smoke test
 *
 * Validates that every value import crew-cli uses from crew-sdk actually
 * exists at runtime.  TypeScript can resolve from source during development,
 * but the compiled npm output may diverge (missing re-exports, renamed files,
 * ESM/CJS mismatches).  This test catches that class of bug.
 *
 * How it works:
 *   For each SDK subpath the CLI imports from, we dynamically import the
 *   module and assert every named export the CLI relies on is defined.
 *
 * Maintenance:
 *   When a new import from @blacklite/crew-sdk is added to crew-cli,
 *   add a corresponding assertion here.  The grep one-liner in the test
 *   description shows how to audit.
 *
 * Related incident: v0.9.3-insider.1 shipped with FSStorageProvider missing
 * from the SDK barrel — broke users at runtime while tests passed locally.
 */

import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// ─── Helper ──────────────────────────────────────────────────────────────

/** Assert a set of named exports exist on a module. */
function expectExports(mod: Record<string, unknown>, names: string[], subpath: string) {
  for (const name of names) {
    expect(mod[name], `"${name}" should be exported from ${subpath}`).toBeDefined();
  }
}

// ─── Root barrel: @blacklite/crew-sdk ─────────────────────────────────

describe('cross-package exports — CLI → SDK', () => {
  describe('@blacklite/crew-sdk (root barrel)', () => {
    it('exports FSStorageProvider and core runtime symbols', async () => {
      const sdk = await import('@blacklite/crew-sdk');
      expectExports(sdk, [
        'FSStorageProvider',
        'CrewState',
        'TIMEOUTS',
        'StreamingPipeline',
        'RuntimeEventBus',
        'resolveCrew',
        'resolveGlobalCrewPath',
        'initCrewTelemetry',
        'recordAgentSpawn',
        'recordAgentDuration',
        'recordAgentError',
        'recordAgentDestroy',
        'safeTimestamp',
        'getMeter',
        'addCrewStateGitignoreBlock',
        'removeCrewStateGitignoreBlock',
        'readCrewRegistry',
        'addRegistryEntry',
        'removeRegistryEntry',
      ], '@blacklite/crew-sdk');
    });

    it('exports role helpers', async () => {
      const sdk = await import('@blacklite/crew-sdk');
      expectExports(sdk, [
        'listRoles',
        'searchRoles',
        'getCategories',
        'getRoleById',
        'generateCharterFromRole',
        'addAgentToConfig',
      ], '@blacklite/crew-sdk');
    });

    it('exports init / personal-crew helpers', async () => {
      const sdk = await import('@blacklite/crew-sdk');
      expectExports(sdk, [
        'initCrew',
        'cleanupOrphanInitPrompt',
        'ensurePersonalCrewDir',
        'resolvePersonalCrewDir',
      ], '@blacklite/crew-sdk');
    });

    it('exports external-state helpers', async () => {
      const sdk = await import('@blacklite/crew-sdk');
      expectExports(sdk, [
        'resolveExternalStateDir',
        'deriveProjectKey',
      ], '@blacklite/crew-sdk');
    });

    it('exports consult-mode helpers', async () => {
      const sdk = await import('@blacklite/crew-sdk');
      expectExports(sdk, [
        'setupConsultMode',
        'isConsultMode',
        'PersonalCrewNotFoundError',
        'detectLicense',
        'loadStagedLearnings',
        'logConsultation',
        'mergeToPersonalCrew',
        'getPersonalCrewRoot',
      ], '@blacklite/crew-sdk');
    });

    it('exports cross-crew helpers', async () => {
      const sdk = await import('@blacklite/crew-sdk');
      expectExports(sdk, [
        'discoverCrews',
        'formatDiscoveryTable',
        'findCrewByName',
        'buildDelegationArgs',
        'loadSubCrewsConfig',
        'resolveSubCrew',
      ], '@blacklite/crew-sdk');
    });

    it('exports RemoteBridge', async () => {
      const sdk = await import('@blacklite/crew-sdk');
      expectExports(sdk, ['RemoteBridge'], '@blacklite/crew-sdk');
    });
  });

  // ─── Subpath: /config ──────────────────────────────────────────────────

  describe('@blacklite/crew-sdk/config', () => {
    it('exports config helpers used by CLI', async () => {
      const mod = await import('@blacklite/crew-sdk/config');
      expectExports(mod, [
        'initCrew',
        'MigrationRegistry',
        'writeEconomyMode',
        'readEconomyMode',
      ], '@blacklite/crew-sdk/config');
    });
  });

  // ─── Subpath: /config/agent-source ─────────────────────────────────────

  describe('@blacklite/crew-sdk/config/agent-source', () => {
    it('exports LocalAgentSource', async () => {
      const mod = await import('@blacklite/crew-sdk/config/agent-source');
      expectExports(mod, ['LocalAgentSource'], '@blacklite/crew-sdk/config/agent-source');
    });
  });

  // ─── Subpath: /resolution ──────────────────────────────────────────────

  describe('@blacklite/crew-sdk/resolution', () => {
    it('exports resolution helpers', async () => {
      const mod = await import('@blacklite/crew-sdk/resolution');
      expectExports(mod, [
        'resolveCrew',
        'resolveCrewPaths',
        'resolveGlobalCrewPath',
        'resolvePersonalCrewDir',
        'ensurePersonalCrewDir',
      ], '@blacklite/crew-sdk/resolution');
    });
  });

  // ─── Subpath: /client ──────────────────────────────────────────────────

  describe('@blacklite/crew-sdk/client', () => {
    it('exports CrewClient', async () => {
      const mod = await import('@blacklite/crew-sdk/client');
      expectExports(mod, ['CrewClient'], '@blacklite/crew-sdk/client');
    });
  });

  // ─── Subpath: /adapter/errors ──────────────────────────────────────────

  describe('@blacklite/crew-sdk/adapter/errors', () => {
    it('exports RateLimitError', async () => {
      const mod = await import('@blacklite/crew-sdk/adapter/errors');
      expectExports(mod, ['RateLimitError'], '@blacklite/crew-sdk/adapter/errors');
    });
  });

  // ─── Subpath: /agents/personal ─────────────────────────────────────────

  describe('@blacklite/crew-sdk/agents/personal', () => {
    it('exports personal-agent helpers', async () => {
      const mod = await import('@blacklite/crew-sdk/agents/personal');
      expectExports(mod, [
        'resolvePersonalAgents',
        'mergeSessionCast',
      ], '@blacklite/crew-sdk/agents/personal');
    });
  });

  // ─── Subpath: /casting ─────────────────────────────────────────────────

  describe('@blacklite/crew-sdk/casting', () => {
    it('exports CastingEngine', async () => {
      const mod = await import('@blacklite/crew-sdk/casting');
      expectExports(mod, ['CastingEngine'], '@blacklite/crew-sdk/casting');
    });
  });

  // ─── Subpath: /platform ────────────────────────────────────────────────

  describe('@blacklite/crew-sdk/platform', () => {
    it('exports createPlatformAdapter', async () => {
      const mod = await import('@blacklite/crew-sdk/platform');
      expectExports(mod, ['createPlatformAdapter'], '@blacklite/crew-sdk/platform');
    });
  });

  // ─── Subpath: /ralph ───────────────────────────────────────────────────

  describe('@blacklite/crew-sdk/ralph', () => {
    it('exports RalphMonitor', async () => {
      const mod = await import('@blacklite/crew-sdk/ralph');
      expectExports(mod, ['RalphMonitor'], '@blacklite/crew-sdk/ralph');
    });
  });

  describe('@blacklite/crew-sdk/ralph/triage', () => {
    it('exports triage helpers', async () => {
      const mod = await import('@blacklite/crew-sdk/ralph/triage');
      expectExports(mod, [
        'parseRoster',
        'parseRoutingRules',
        'parseModuleOwnership',
        'triageIssue',
      ], '@blacklite/crew-sdk/ralph/triage');
    });
  });

  describe('@blacklite/crew-sdk/ralph/rate-limiting', () => {
    it('exports rate-limiting helpers', async () => {
      const mod = await import('@blacklite/crew-sdk/ralph/rate-limiting');
      expectExports(mod, [
        'PredictiveCircuitBreaker',
        'getTrafficLight',
      ], '@blacklite/crew-sdk/ralph/rate-limiting');
    });
  });

  // ─── Subpath: /runtime/* ───────────────────────────────────────────────

  describe('@blacklite/crew-sdk/runtime/event-bus', () => {
    it('exports EventBus', async () => {
      const mod = await import('@blacklite/crew-sdk/runtime/event-bus');
      expectExports(mod, ['EventBus'], '@blacklite/crew-sdk/runtime/event-bus');
    });
  });

  // ─── SDK exports-map file resolution ───────────────────────────────────

  describe('SDK package.json exports map → file existence', () => {
    it('every exports-map entry points to an existing file', async () => {
      const fs = await import('node:fs');

      // In a workspace monorepo the SDK lives at packages/crew-sdk.
      // In CI / installed scenarios, find it under node_modules.
      const candidates = [
        resolve(process.cwd(), 'packages', 'crew-sdk'),
        resolve(process.cwd(), 'node_modules', '@blacklite', 'crew-sdk'),
      ];
      const sdkRoot = candidates.find(
        (p) => existsSync(resolve(p, 'package.json')),
      );
      expect(sdkRoot, 'Could not locate SDK package.json').toBeDefined();

      const pkg = JSON.parse(
        fs.readFileSync(resolve(sdkRoot!, 'package.json'), 'utf8'),
      );
      const exportsMap = pkg.exports as Record<string, Record<string, string>>;
      const missing: string[] = [];

      for (const [subpath, targets] of Object.entries(exportsMap)) {
        if (typeof targets === 'string') {
          if (!existsSync(resolve(sdkRoot!, targets))) {
            missing.push(`${subpath} → ${targets}`);
          }
          continue;
        }
        for (const [condition, file] of Object.entries(targets)) {
          if (!existsSync(resolve(sdkRoot!, file))) {
            missing.push(`${subpath}[${condition}] → ${file}`);
          }
        }
      }

      expect(missing, `Missing files in SDK exports map:\n${missing.join('\n')}`).toEqual([]);
    });
  });
});
