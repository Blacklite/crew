/**
 * Effective crew directory resolution — external state aware.
 *
 * Wraps detectCrewDir() to follow the config.json stateLocation marker
 * when state has been externalized via `crew externalize`.
 *
 * @module cli/core/effective-crew-dir
 */

import { detectCrewDir, type CrewDirInfo } from './detect-crew-dir.js';
import { loadDirConfig, resolveExternalStateDir } from '@blacklite/crew-sdk';

/**
 * Resolve the effective state directory from a local .crew/ path.
 *
 * If `.crew/config.json` has `stateLocation: 'external'` and a valid
 * `projectKey`, returns the external state directory. Otherwise returns
 * the original `crewDirPath` unchanged.
 */
export function resolveStateDir(crewDirPath: string): string {
  const config = loadDirConfig(crewDirPath);
  if (config?.stateLocation === 'external' && config.projectKey) {
    return resolveExternalStateDir(config.projectKey, false);
  }
  return crewDirPath;
}

export interface EffectiveCrewDirs {
  /** The local .crew/ directory info (for config.json and non-state files) */
  local: CrewDirInfo;
  /** The effective state directory (external dir when externalized, otherwise local .crew/) */
  stateDir: string;
}

/**
 * Detect the crew directory and resolve the effective state dir.
 *
 * Combines detectCrewDir() (zero-dependency bootstrap) with external
 * state resolution from config.json. Use `stateDir` for reading state
 * files (team.md, routing.md, agents/, plugins/, etc.) and `local.path`
 * for non-state files that remain in the working tree.
 */
export function effectiveCrewDir(dest: string): EffectiveCrewDirs {
  const local = detectCrewDir(dest);
  return { local, stateDir: resolveStateDir(local.path) };
}
