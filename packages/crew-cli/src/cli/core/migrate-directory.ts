/**
 * Directory migration utility — renames .ai-team/ → .crew/
 * @module cli/core/migrate-directory
 */

import path from 'node:path';
import { FSStorageProvider } from '@blacklite/crew-sdk';
import { success, warn, dim, bold } from './output.js';
import { fatal } from './errors.js';
import { scrubEmails } from './email-scrub.js';

const storage = new FSStorageProvider();

/**
 * Migrate .ai-team/ directory to .crew/
 * Updates .gitattributes and .gitignore references
 * Scrubs email addresses from all files
 */
export async function migrateDirectory(dest: string): Promise<void> {
  const aiTeamDir = path.join(dest, '.ai-team');
  const crewDir = path.join(dest, '.crew');
  
  if (!storage.existsSync(aiTeamDir)) {
    fatal('No .ai-team/ directory found — nothing to migrate.');
  }
  
  if (storage.existsSync(crewDir)) {
    fatal('.crew/ directory already exists — migration appears to be complete.');
  }
  
  dim('Migrating .ai-team/ → .crew/...');
  
  // Rename directory
  storage.renameSync(aiTeamDir, crewDir);
  success('Renamed .ai-team/ → .crew/');
  
  // Update .gitattributes
  const gitattributes = path.join(dest, '.gitattributes');
  if (storage.existsSync(gitattributes)) {
    let content = storage.readSync(gitattributes) ?? '';
    const updated = content.replace(/\.ai-team\//g, '.crew/');
    if (content !== updated) {
      storage.writeSync(gitattributes, updated);
      success('Updated .gitattributes');
    }
  }
  
  // Update .gitignore
  const gitignore = path.join(dest, '.gitignore');
  if (storage.existsSync(gitignore)) {
    let content = storage.readSync(gitignore) ?? '';
    const updated = content.replace(/\.ai-team\//g, '.crew/');
    if (content !== updated) {
      storage.writeSync(gitignore, updated);
      success('Updated .gitignore');
    }
  }
  
  // Scrub email addresses
  dim('Scrubbing email addresses from .crew/ files...');
  const scrubbedCount = await scrubEmails(crewDir);
  if (scrubbedCount > 0) {
    success(`Scrubbed email addresses from ${scrubbedCount} file(s)`);
  } else {
    success('No email addresses found');
  }
  
  // Rename .ai-team-templates/ if it exists
  const aiTeamTemplatesDir = path.join(dest, '.ai-team-templates');
  const crewTemplatesDir = path.join(dest, '.crew', 'templates');
  if (storage.existsSync(aiTeamTemplatesDir)) {
    storage.mkdirSync(path.join(dest, '.crew'), { recursive: true });
    storage.renameSync(aiTeamTemplatesDir, crewTemplatesDir);
    success('Renamed .ai-team-templates/ → .crew/templates/');
  }
  
  console.log();
  console.log(`${bold('Migration complete.')}`);
  dim('Commit the change:');
  console.log('  git add -A');
  console.log('  git commit -m "chore: migrate .ai-team/ → .crew/"');
  console.log();
}
