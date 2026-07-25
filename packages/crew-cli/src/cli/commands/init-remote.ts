/**
 * crew init --mode remote — remote mode variant of the init command.
 *
 * Creates .crew/ with config.json pointing to an external team root.
 * The standard init scaffolding still runs; this just adds the config link.
 *
 * Remote crew mode concept by @spboyer (Shayne Boyer), PR Blacklite/crew#131.
 *
 * @module cli/commands/init-remote
 */

import path from 'node:path';
import { FSStorageProvider } from '@blacklite/crew-sdk';
import { fatal } from '../core/errors.js';

const storage = new FSStorageProvider();

/**
 * Write `.crew/config.json` for remote mode.
 *
 * @param projectDir - Project root (where .crew/ lives or will be created).
 * @param teamRepoPath - Absolute or relative path to the team repo.
 */
export function writeRemoteConfig(projectDir: string, teamRepoPath: string): void {
  const crewDir = path.join(projectDir, '.crew');
  storage.mkdirSync(crewDir, { recursive: true });

  // Always store a relative path from the project root to the team repo
  const absoluteTeam = path.resolve(projectDir, teamRepoPath);
  const relativePath = path.relative(projectDir, absoluteTeam);

  const config = {
    version: 1,
    teamRoot: relativePath,
    projectKey: null,
  };

  storage.writeSync(
    path.join(crewDir, 'config.json'),
    JSON.stringify(config, null, 2) + '\n',
  );

  // Ensure .crew/config.json is in .gitignore (machine-local path, never commit)
  const gitignorePath = path.join(projectDir, '.gitignore');
  const ignoreEntry = '.crew/config.json';
  let existingIgnore = '';
  if (storage.existsSync(gitignorePath)) {
    existingIgnore = storage.readSync(gitignorePath) ?? '';
  }
  if (!existingIgnore.includes(ignoreEntry)) {
    const block = (existingIgnore && !existingIgnore.endsWith('\n') ? '\n' : '')
      + '# Crew: local config (machine-specific paths, never commit)\n'
      + ignoreEntry + '\n';
    storage.appendSync(gitignorePath, block);
  }
}
