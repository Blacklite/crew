/**
 * CLI command: crew subcrews
 *
 * Subcommands:
 *   list      — Show configured SubCrews
 *   status    — Show activity per SubCrew (branches, PRs)
 *   activate  — Write .crew-workstream file to activate a SubCrew
 */

import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { FSStorageProvider } from '@blacklite/crew-sdk';

const storage = new FSStorageProvider();
import { loadSubCrewsConfig, resolveSubCrew } from '@blacklite/crew-sdk';
import type { SubCrewDefinition } from '@blacklite/crew-sdk';

const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';

/**
 * Entry point for `crew subcrews` subcommand.
 */
export async function runSubCrews(cwd: string, args: string[]): Promise<void> {
  const sub = args[0];

  if (!sub || sub === 'list') {
    return listSubCrews(cwd);
  }
  if (sub === 'status') {
    return showSubCrewStatus(cwd);
  }
  if (sub === 'activate') {
    const name = args[1];
    if (!name) {
      console.error(`${RED}✗${RESET} Usage: crew subcrews activate <name>`);
      process.exit(1);
    }
    return activateSubCrew(cwd, name);
  }

  console.error(`${RED}✗${RESET} Unknown subcrews subcommand: ${sub}`);
  console.log(`\nUsage: crew subcrews <list|status|activate <name>>`);
  process.exit(1);
}

/** @deprecated Use runSubCrews instead */
export const runWorkstreams = runSubCrews;

/** @deprecated Use runSubCrews instead */
export const runStreams = runSubCrews;

/**
 * List configured SubCrews.
 */
function listSubCrews(cwd: string): void {
  const config = loadSubCrewsConfig(cwd);
  const active = resolveSubCrew(cwd);

  if (!config || config.workstreams.length === 0) {
    console.log(`\n${DIM}No SubCrews configured.${RESET}`);
    console.log(`${DIM}Create .crew/streams.json to define SubCrews.${RESET}\n`);
    return;
  }

  console.log(`\n${BOLD}Configured SubCrews${RESET}\n`);
  console.log(`  Default workflow: ${config.defaultWorkflow}\n`);

  for (const subcrew of config.workstreams) {
    const isActive = active?.name === subcrew.name;
    const marker = isActive ? `${GREEN}● active${RESET}` : `${DIM}○${RESET}`;
    const workflow = subcrew.workflow ?? config.defaultWorkflow;
    console.log(`  ${marker}  ${BOLD}${subcrew.name}${RESET}`);
    console.log(`       Label: ${subcrew.labelFilter}`);
    console.log(`       Workflow: ${workflow}`);
    if (subcrew.folderScope?.length) {
      console.log(`       Folders: ${subcrew.folderScope.join(', ')}`);
    }
    if (subcrew.description) {
      console.log(`       ${DIM}${subcrew.description}${RESET}`);
    }
    console.log();
  }

  if (active) {
    console.log(`  ${DIM}Active SubCrew resolved via: ${active.source}${RESET}\n`);
  }
}

/**
 * Show activity per SubCrew (branches, PRs via gh CLI).
 */
function showSubCrewStatus(cwd: string): void {
  const config = loadSubCrewsConfig(cwd);
  const active = resolveSubCrew(cwd);

  if (!config || config.workstreams.length === 0) {
    console.log(`\n${DIM}No SubCrews configured.${RESET}\n`);
    return;
  }

  console.log(`\n${BOLD}SubCrew Status${RESET}\n`);

  for (const subcrew of config.workstreams) {
    const isActive = active?.name === subcrew.name;
    const marker = isActive ? `${GREEN}●${RESET}` : `${DIM}○${RESET}`;
    console.log(`  ${marker} ${BOLD}${subcrew.name}${RESET} (${subcrew.labelFilter})`);

    // Try to get PR and branch info via gh CLI
    try {
      const result = spawnSync(
        'gh',
        ['pr', 'list', '--label', subcrew.labelFilter, '--json', 'number,title,state', '--limit', '5'],
        { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
      );
      const prOutput = result.stdout ?? '';
      const prs = JSON.parse(prOutput) as Array<{ number: number; title: string; state: string }>;
      if (prs.length > 0) {
        console.log(`    ${YELLOW}PRs:${RESET}`);
        for (const pr of prs) {
          console.log(`      #${pr.number} ${pr.title} (${pr.state})`);
        }
      } else {
        console.log(`    ${DIM}No open PRs${RESET}`);
      }
    } catch {
      console.log(`    ${DIM}(gh CLI not available — skipping PR lookup)${RESET}`);
    }

    // Try to get branch info
    try {
      const result = spawnSync(
        'git',
        ['branch', '--list', `*${subcrew.name}*`],
        { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
      );
      const branchOutput = result.stdout ?? '';
      const branches = branchOutput.trim().split('\n').filter(Boolean);
      if (branches.length > 0) {
        console.log(`    ${YELLOW}Branches:${RESET}`);
        for (const branch of branches) {
          console.log(`      ${branch.trim()}`);
        }
      }
    } catch {
      // Git not available — skip
    }

    console.log();
  }
}

/**
 * Activate a SubCrew by writing .crew-workstream file.
 */
function activateSubCrew(cwd: string, name: string): void {
  const config = loadSubCrewsConfig(cwd);

  // Validate the SubCrew exists in config (warn if not, but still allow)
  if (config) {
    const found = config.workstreams.find(s => s.name === name);
    if (!found) {
      console.log(`${YELLOW}⚠${RESET} SubCrew "${name}" not found in .crew/streams.json`);
      console.log(`  Available: ${config.workstreams.map(s => s.name).join(', ')}`);
      console.log(`  Writing .crew-workstream anyway...\n`);
    }
  }

  const workstreamFilePath = path.join(cwd, '.crew-workstream');
  storage.writeSync(workstreamFilePath, name + '\n');
  console.log(`${GREEN}✓${RESET} Activated SubCrew: ${BOLD}${name}${RESET}`);
  console.log(`  Written to: ${workstreamFilePath}`);
  console.log(`${DIM}  (This file is gitignored — it's local to your machine/Codespace)${RESET}\n`);
}
