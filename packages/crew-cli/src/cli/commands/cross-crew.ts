/**
 * crew discover / crew delegate / crew registry — CLI commands for
 * cross-crew orchestration.
 *
 * Commands:
 *   crew discover                            — list known crews and capabilities
 *   crew delegate <crew-name> <description> — create work in another crew
 *   crew registry add <name> <path>          — register a peer crew (no inheritance)
 *   crew registry list                       — show registered peer crews
 *   crew registry remove <name>              — remove a registered peer crew
 *
 * @module cli/commands/cross-crew
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve as resolvePath } from 'node:path';
import { success, warn, info, BOLD, RESET, DIM } from '../core/output.js';
import { fatal } from '../core/errors.js';
import { detectCrewDir } from '../core/detect-crew-dir.js';
import {
  discoverCrews,
  formatDiscoveryTable,
  findCrewByName,
  buildDelegationArgs,
  readCrewRegistry,
  addRegistryEntry,
  removeRegistryEntry,
  type DiscoveredCrew,
} from '@blacklite/crew-sdk';

const execFileAsync = promisify(execFile);

export async function discoverCommand(): Promise<void> {
  const crewDirInfo = detectCrewDir(process.cwd());
  const crewDir = crewDirInfo.path;

  const crews = discoverCrews(crewDir);
  const output = formatDiscoveryTable(crews);
  info(output);
}

export async function delegateCommand(args: string[]): Promise<void> {
  const crewName = args[0];
  const description = args.slice(1).join(' ');

  if (!crewName || !description) {
    fatal('Usage: crew delegate <crew-name> "<description>"');
  }

  const crewDirInfo = detectCrewDir(process.cwd());
  const crewDir = crewDirInfo.path;

  const crews = discoverCrews(crewDir);
  const target = findCrewByName(crews, crewName);

  if (!target) {
    const names = crews.map(s => s.manifest.name).join(', ');
    fatal(
      `Crew "${crewName}" not found.` +
      (names ? ` Known crews: ${names}` : ' No crews discovered — run "crew discover" to check.'),
    );
  }

  if (!target.manifest.accepts.includes('issues')) {
    fatal(`Crew "${crewName}" does not accept issues. Accepts: ${target.manifest.accepts.join(', ')}`);
  }

  const labels = target.manifest.contact.labels || [];
  const ghArgs = buildDelegationArgs({
    targetRepo: target.manifest.contact.repo,
    title: description,
    body: buildDelegationBody(description, target),
    labels,
  });

  info(`\n${BOLD}Delegating to ${crewName}${RESET}`);
  info(`  Repo: ${target.manifest.contact.repo}`);
  info(`  Title: [cross-crew] ${description}\n`);

  try {
    const { stdout } = await execFileAsync('gh', ghArgs);
    const issueUrl = stdout.trim();
    success(`Created cross-crew issue: ${issueUrl}`);
  } catch (err) {
    fatal(`Failed to create issue: ${(err as Error).message}`);
  }
}

function buildDelegationBody(description: string, target: DiscoveredCrew): string {
  return [
    '## Cross-Crew Work Request',
    '',
    `**From:** this repository`,
    `**To:** ${target.manifest.name} (${target.manifest.contact.repo})`,
    '',
    '### Description',
    '',
    description,
    '',
    '### Acceptance Criteria',
    '',
    '- [ ] Work completed and verified',
    '- [ ] Originating crew notified of completion',
    '',
    `${DIM}Created by crew cross-crew orchestration${RESET}`,
  ].join('\n');
}

/**
 * `crew registry` — manage peer crews in `.crew/crew-registry.json`.
 *
 * Unlike `crew upstream add`, registry entries are discovery-only — peer
 * crews are findable via `crew discover` and addressable via `crew
 * delegate`, but their skills/decisions/wisdom are NOT inherited by your
 * coordinator at session start.
 */
export async function registryCommand(args: string[]): Promise<void> {
  const action = args[0];
  if (!action || (action !== 'add' && action !== 'list' && action !== 'remove')) {
    fatal('Usage: crew registry add <name> <path> | list | remove <name>');
  }

  const crewDirInfo = detectCrewDir(process.cwd());
  const crewDir = crewDirInfo.path;

  if (action === 'list') {
    const entries = readCrewRegistry(crewDir);
    if (entries.length === 0) {
      info(`${DIM}No peer crews registered. Add one with: crew registry add <name> <path>${RESET}`);
      return;
    }
    info(`\n${BOLD}Registered peer crews${RESET} (.crew/crew-registry.json):\n`);
    for (const entry of entries) {
      info(`  ${BOLD}${entry.name}${RESET}  →  ${entry.path}`);
    }
    info('');
    return;
  }

  if (action === 'add') {
    const name = args[1];
    const rawPath = args[2];
    if (!name || !rawPath) {
      fatal('Usage: crew registry add <name> <path>');
    }
    // Resolve to absolute path so the registry is portable wrt cwd at write time
    const absPath = resolvePath(rawPath);
    const result = addRegistryEntry(crewDir, name, absPath);
    if (result.added) {
      success(`Registered peer crew "${name}" → ${absPath}`);
      info(`  Capabilities: ${result.manifest!.capabilities.join(', ')}`);
      info(`  Repo: ${result.manifest!.contact.repo}`);
      info(`  Accepts: ${result.manifest!.accepts.join(', ')}`);
      info(`\n${DIM}Run "crew discover" to see all registered peers.${RESET}`);
      return;
    }
    if (result.reason === 'duplicate-name') {
      fatal(`A peer named "${name}" is already registered. Remove it first: crew registry remove ${name}`);
    }
    if (result.reason === 'invalid-manifest') {
      fatal(
        `No valid .crew/manifest.json found at ${absPath}.\n` +
        `  Expected: ${absPath}/.crew/manifest.json (or ${absPath}/manifest.json if you pointed at .crew/).\n` +
        `  Ask the peer team to publish a manifest, or verify the path resolves locally.`,
      );
    }
    fatal('Registry add failed for an unknown reason.');
  }

  if (action === 'remove') {
    const name = args[1];
    if (!name) {
      fatal('Usage: crew registry remove <name>');
    }
    const removed = removeRegistryEntry(crewDir, name);
    if (removed) {
      success(`Removed peer crew "${name}" from the registry.`);
    } else {
      warn(`No peer crew named "${name}" was registered.`);
    }
  }
}
