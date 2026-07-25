/**
 * SubCrew Resolver — Resolves which SubCrew is active.
 *
 * Resolution order:
 *   1. CREW_TEAM env var → look up in SubCrews config
 *   2. .crew-workstream file (gitignored) → contains SubCrew name
 *   3. If exactly one SubCrew is defined in the config, auto-select that SubCrew
 *   4. null (no active SubCrew — single-crew mode / no SubCrews)
 *
 * @module streams/resolver
 */

import { FSStorageProvider } from '../storage/fs-storage-provider.js';
import { join } from 'path';
import type { SubCrewConfig, SubCrewDefinition, ResolvedSubCrew } from './types.js';

const storage = new FSStorageProvider();

/**
 * Load SubCrews configuration from .crew/workstreams.json.
 *
 * @param crewRoot - Root directory of the project (where .crew/ lives)
 * @returns Parsed SubCrewConfig or null if not found / invalid
 */
export function loadSubCrewsConfig(crewRoot: string): SubCrewConfig | null {
  const configPath = join(crewRoot, '.crew', 'workstreams.json');
  if (!storage.existsSync(configPath)) {
    return null;
  }

  try {
    const raw = storage.readSync(configPath) ?? '';
    const rawConfig = JSON.parse(raw) as unknown;

    if (!rawConfig || typeof rawConfig !== 'object') {
      return null;
    }

    const configLike = rawConfig as { defaultWorkflow?: unknown; workstreams?: unknown };

    // Derive a sane defaultWorkflow value
    const validWorkflows = ['branch-per-issue', 'direct'] as const;
    const rawWorkflow =
      typeof configLike.defaultWorkflow === 'string' && configLike.defaultWorkflow.trim() !== ''
        ? configLike.defaultWorkflow
        : 'branch-per-issue';
    const defaultWorkflow: 'branch-per-issue' | 'direct' =
      validWorkflows.includes(rawWorkflow as typeof validWorkflows[number])
        ? (rawWorkflow as 'branch-per-issue' | 'direct')
        : 'branch-per-issue';

    const workstreamsRaw = configLike.workstreams;
    if (!Array.isArray(workstreamsRaw)) {
      return null;
    }

    const workstreams: SubCrewDefinition[] = workstreamsRaw
      .filter(entry => entry && typeof entry === 'object')
      .map(entry => {
        const e = entry as {
          name?: unknown;
          labelFilter?: unknown;
          folderScope?: unknown;
          workflow?: unknown;
          description?: unknown;
        };

        if (typeof e.name !== 'string' || typeof e.labelFilter !== 'string') {
          return null;
        }

        const normalized: Record<string, unknown> = {
          name: e.name,
          labelFilter: e.labelFilter,
        };

        if (Array.isArray(e.folderScope) && e.folderScope.every(item => typeof item === 'string')) {
          normalized.folderScope = e.folderScope;
        }

        if (typeof e.workflow === 'string' && e.workflow.trim() !== '') {
          normalized.workflow = e.workflow;
        } else {
          normalized.workflow = defaultWorkflow;
        }

        if (typeof e.description === 'string') {
          normalized.description = e.description;
        }

        return normalized as unknown as SubCrewDefinition;
      })
      .filter((s): s is SubCrewDefinition => s !== null);

    if (workstreams.length === 0) {
      return null;
    }

    return { defaultWorkflow, workstreams };
  } catch {
    return null;
  }
}

/** @deprecated Use loadSubCrewsConfig instead */
export const loadWorkstreamsConfig = loadSubCrewsConfig;

/** @deprecated Use loadSubCrewsConfig instead */
export const loadStreamsConfig = loadSubCrewsConfig;

/**
 * Find a SubCrew definition by name in a config.
 */
function findSubCrew(config: SubCrewConfig, name: string): SubCrewDefinition | undefined {
  return config.workstreams.find(s => s.name === name);
}

/**
 * Resolve which SubCrew is active for the current environment.
 *
 * @param crewRoot - Root directory of the project
 * @returns ResolvedSubCrew or null if no SubCrew is active
 */
export function resolveSubCrew(crewRoot: string): ResolvedSubCrew | null {
  const config = loadSubCrewsConfig(crewRoot);

  // 1. CREW_TEAM env var
  const envTeam = process.env.CREW_TEAM;
  if (envTeam) {
    if (config) {
      const def = findSubCrew(config, envTeam);
      if (def) {
        return { name: envTeam, definition: def, source: 'env' };
      }
    }
    // Env var set but no matching SubCrew config — synthesize a minimal definition
    return {
      name: envTeam,
      definition: {
        name: envTeam,
        labelFilter: `team:${envTeam}`,
      },
      source: 'env',
    };
  }

  // 2. .crew-workstream file
  const workstreamFilePath = join(crewRoot, '.crew-workstream');
  if (storage.existsSync(workstreamFilePath)) {
    try {
      const subcrewName = (storage.readSync(workstreamFilePath) ?? '').trim();
      if (subcrewName) {
        if (config) {
          const def = findSubCrew(config, subcrewName);
          if (def) {
            return { name: subcrewName, definition: def, source: 'file' };
          }
        }
        // File exists but no config — synthesize
        return {
          name: subcrewName,
          definition: {
            name: subcrewName,
            labelFilter: `team:${subcrewName}`,
          },
          source: 'file',
        };
      }
    } catch {
      // Ignore read errors
    }
  }

  // 3. If exactly one SubCrew is defined, auto-select it
  if (config && config.workstreams.length === 1) {
    const def = config.workstreams[0]!;
    return { name: def.name, definition: def, source: 'config' };
  }

  // 4. No SubCrew detected
  return null;
}

/** @deprecated Use resolveSubCrew instead */
export const resolveWorkstream = resolveSubCrew;

/** @deprecated Use resolveSubCrew instead */
export const resolveStream = resolveSubCrew;

/**
 * Get the GitHub label filter string for a resolved SubCrew.
 *
 * @param subcrew - The resolved SubCrew
 * @returns Label filter string (e.g., "team:ui")
 */
export function getSubCrewLabelFilter(subcrew: ResolvedSubCrew): string {
  return subcrew.definition.labelFilter;
}

/** @deprecated Use getSubCrewLabelFilter instead */
export const getWorkstreamLabelFilter = getSubCrewLabelFilter;

/** @deprecated Use getSubCrewLabelFilter instead */
export const getStreamLabelFilter = getSubCrewLabelFilter;
