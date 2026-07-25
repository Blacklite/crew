/**
 * Economy mode command — toggle cost-conscious model selection.
 *
 * Usage:
 *   crew economy on    — enable economy mode (persisted to config.json)
 *   crew economy off   — disable economy mode
 *   crew economy       — show current status
 */

import { join } from 'node:path';
import { FSStorageProvider } from '@blacklite/crew-sdk';
import { writeEconomyMode, readEconomyMode } from '@blacklite/crew-sdk/config';

const storage = new FSStorageProvider();
import { fatal } from '../core/errors.js';
import { BOLD, RESET, GREEN, DIM } from '../core/output.js';

function resolveCrewDir(cwd: string): string | null {
  // Walk up to find .crew/
  let dir = cwd;
  for (let i = 0; i < 10; i++) {
    const candidate = join(dir, '.crew');
    if (storage.existsSync(candidate)) {
      return candidate;
    }
    const parent = join(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export async function runEconomy(cwd: string, subArgs: string[]): Promise<void> {
  const crewDir = resolveCrewDir(cwd);
  if (!crewDir) {
    fatal('No crew found. Run "crew init" first.');
    return;
  }

  const sub = subArgs[0]?.toLowerCase();

  if (sub === 'on') {
    writeEconomyMode(crewDir, true);
    console.log(`${GREEN}✓${RESET} Economy mode ${BOLD}enabled${RESET} — cheaper models will be used for auto-selection.`);
    console.log(`  Saved to: ${DIM}${join(crewDir, 'config.json')}${RESET}`);
    return;
  }

  if (sub === 'off') {
    writeEconomyMode(crewDir, false);
    console.log(`${GREEN}✓${RESET} Economy mode ${BOLD}disabled${RESET} — returning to standard model selection.`);
    console.log(`  Saved to: ${DIM}${join(crewDir, 'config.json')}${RESET}`);
    return;
  }

  // Status display
  const enabled = readEconomyMode(crewDir);
  console.log(`\n${BOLD}Economy Mode${RESET}\n`);
  console.log(`  Status: ${enabled ? `${GREEN}enabled${RESET}` : `${DIM}disabled${RESET}`}`);
  console.log(`  Config: ${DIM}${join(crewDir, 'config.json')}${RESET}\n`);
  if (enabled) {
    console.log(`  When active, auto-selected models are downgraded:`);
    console.log(`    ${DIM}claude-opus-4.6   → claude-sonnet-4.5  (architecture/review)${RESET}`);
    console.log(`    ${DIM}claude-sonnet-4.6 → gpt-5-mini         (code writing)${RESET}`);
    console.log(`    ${DIM}claude-haiku-4.5  → gpt-5-mini         (docs/mechanical)${RESET}`);
    console.log(`  Explicit overrides (config.json, charter) are never changed.\n`);
  } else {
    console.log(`  Usage: crew economy on | off\n`);
  }
}
