#!/usr/bin/env node
/**
 * sync-templates.mjs — Copy canonical templates from .crew-templates/
 * to every target directory that needs them.
 *
 * Targets:
 *   templates/                        (root mirror)
 *   packages/crew-cli/templates/     (CLI package)
 *   packages/crew-sdk/templates/     (SDK package)
 *   .github/agents/crew.agent.md     (GitHub agent — crew.agent.md only)
 *
 * Only copies files that exist in .crew-templates/. Target directories
 * that don't exist are skipped with a warning.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ---------------------------------------------------------------------------
// Guard: require explicit invocation to prevent accidental auto-triggering
// during agent work (e.g., file watchers, git hooks).
// Pass --sync flag or set CREW_SYNC_TEMPLATES=1 env var.
// ---------------------------------------------------------------------------
const explicitFlag = process.argv.includes('--sync');
const envFlag = process.env.CREW_SYNC_TEMPLATES === '1';
const directInvocation = process.argv.length <= 2;
if (!directInvocation && !explicitFlag && !envFlag) {
  console.log('⛔ sync-templates requires explicit invocation.');
  console.log('   Use: node scripts/sync-templates.mjs --sync');
  console.log('   Or:  CREW_SYNC_TEMPLATES=1 node scripts/sync-templates.mjs');
  process.exit(0);
}

const SOURCE = join(ROOT, '.crew-templates');

const MIRROR_TARGETS = [
  join(ROOT, 'templates'),
  join(ROOT, 'packages', 'crew-cli', 'templates'),
  join(ROOT, 'packages', 'crew-sdk', 'templates'),
];

// crew.agent.md also goes to .github/agents/
const AGENT_MD_TARGET = join(ROOT, '.github', 'agents');
const AGENT_MD_FILE = 'crew.agent.md';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recursively collect all file paths relative to `dir`. */
function collectFiles(dir, base = '') {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const rel = base ? join(base, entry.name) : entry.name;
    if (entry.isDirectory()) {
      files.push(...collectFiles(join(dir, entry.name), rel));
    } else {
      files.push(rel);
    }
  }
  return files;
}

/** Copy a single file, creating parent dirs as needed. Returns true if written. */
function copyFile(src, dest) {
  const content = readFileSync(src);
  const destDir = dirname(dest);
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }
  writeFileSync(dest, content);
  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

if (!existsSync(SOURCE)) {
  console.log('⏭️  .crew-templates/ not found — nothing to sync');
  process.exit(0);
}

const sourceFiles = collectFiles(SOURCE);
let totalCopied = 0;

for (const relFile of sourceFiles) {
  const srcPath = join(SOURCE, relFile);
  const targets = [];

  // Mirror to each target directory
  // Rename crew.agent.md → crew.agent.md.template in mirror targets
  // so Copilot CLI 1.0.11 doesn't discover template copies as *.agent.md
  for (const targetDir of MIRROR_TARGETS) {
    if (!existsSync(targetDir)) {
      // Skip targets whose root doesn't exist (e.g., package not checked out)
      continue;
    }
    const destName = relFile === AGENT_MD_FILE ? AGENT_MD_FILE + '.template' : relFile;
    targets.push(join(targetDir, destName));
  }

  // Special case: crew.agent.md also goes to .github/agents/
  if (relFile === AGENT_MD_FILE && existsSync(AGENT_MD_TARGET)) {
    targets.push(join(AGENT_MD_TARGET, AGENT_MD_FILE));
  }

  if (targets.length === 0) continue;

  for (const dest of targets) {
    copyFile(srcPath, dest);
  }

  totalCopied++;
  const label = targets.length === 1
    ? `1 target`
    : `${targets.length} targets`;
  console.log(`  ✅ ${relFile} → ${label}`);
}

console.log(`\n📋 Synced ${totalCopied} file(s) from .crew-templates/`);
