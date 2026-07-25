/**
 * crew consult — enter consult mode with your personal crew.
 *
 * Creates .crew/ with consult: true, pointing to your personal crew.
 * The project's .crew/ is hidden via .git/info/exclude (never committed).
 *
 * @module cli/commands/consult
 */

import { resolve, basename } from 'node:path';
import {
  setupConsultMode,
  isConsultMode,
  PersonalCrewNotFoundError,
  FSStorageProvider,
} from '@blacklite/crew-sdk';

const storage = new FSStorageProvider();
import { fatal } from '../core/errors.js';

/**
 * Run the consult command.
 *
 * @param cwd - Current working directory (project root).
 * @param args - Command-line arguments.
 */
export async function runConsult(cwd: string, args: string[]): Promise<void> {
  const showStatus = args.includes('--status');
  const dryRun = args.includes('--check');
  const crewDir = resolve(cwd, '.crew');

  // --status: show current consult mode status (query only, no setup)
  if (showStatus) {
    if (storage.existsSync(crewDir)) {
      try {
        const raw = storage.readSync(resolve(crewDir, 'config.json'));
        if (!raw) {
          console.log('ℹ️  Project has .crew/ but config is invalid');
          return;
        }
        const config = JSON.parse(raw);
        if (isConsultMode(config)) {
          console.log('✅ Consult mode active');
          console.log(`   Team root: ${config.teamRoot ?? config.sourceCrew}`);
          console.log(`   Project: ${basename(cwd)}`);
          if (config.extractionDisabled) {
            console.log('   Extraction: disabled');
          }
        } else {
          console.log('ℹ️  Project has .crew/ but not in consult mode');
        }
      } catch {
        console.log('ℹ️  Project has .crew/ but config is invalid');
      }
    } else {
      console.log('ℹ️  Not in consult mode (no .crew/ directory)');
    }
    return;
  }

  // Setup consult mode via SDK
  // extractionDisabled is inherited from personal crew config
  try {
    const result = await setupConsultMode({
      projectRoot: cwd,
      dryRun,
    });

    if (dryRun) {
      console.log('📋 Dry-run: crew consult would:');
      console.log(`   1. Create ${result.crewDir}/config.json with consult: true`);
      console.log(`   2. Add .crew/ to ${result.gitExclude}`);
      console.log(`   3. Link to personal crew at ${result.personalCrewRoot}`);
      if (result.extractionDisabled) {
        console.log('   4. Extraction disabled (configured in personal crew)');
      }
    } else {
      console.log('✅ Consult mode activated');
      console.log(`   Team: ${result.personalCrewRoot}`);
      console.log(`   Project: ${result.projectName}`);
      if (result.extractionDisabled) {
        console.log('   Extraction: disabled (configured in personal crew)');
      }
      console.log('');
      console.log('   Your crew is now consulting on this project.');
      if (!result.extractionDisabled) {
        console.log('   Run `crew extract` when done to bring learnings home.');
      }
    }
  } catch (error) {
    if (error instanceof PersonalCrewNotFoundError) {
      fatal(
        'No personal crew found.\n' +
          '   Run `crew init --global` first to create your personal crew.',
      );
    }
    // Re-throw other SDK errors with CLI-friendly formatting
    if (error instanceof Error) {
      fatal(error.message);
    }
    throw error;
  }
}
