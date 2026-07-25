/**
 * Consult mode SDK — setup, extraction, license detection, learning classification.
 *
 * This module provides the complete SDK surface for consult mode:
 *
 * High-level operations (mirror CLI commands):
 * - setupConsultMode(): Initialize consult mode in a project
 * - extractLearnings(): Extract learnings from a consult session
 *
 * Low-level utilities (used by high-level operations):
 * - detectLicense(): Identify project license type (permissive/copyleft/unknown)
 * - logConsultation(): Write/append consultation log entries
 * - mergeToPersonalCrew(): Merge generic learnings to personal crew
 *
 * @module sharing/consult
 */

import { cpSync } from 'node:fs'; // cpSync retained for recursive directory copy — StorageProvider.copySync is file-only
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { FSStorageProvider } from '../storage/fs-storage-provider.js';
import type { AgentHistory, HistoryEntry } from './history-split.js';
import { resolveGlobalCrewPath } from '../resolution.js';

const storage = new FSStorageProvider();

// Re-export types for convenience
export type { AgentHistory, HistoryEntry } from './history-split.js';

// ============================================================================
// Typed Errors
// ============================================================================

/**
 * Thrown when setupConsultMode is called but no personal crew exists.
 * Consumers can catch this specifically to prompt users to run `crew init --global`.
 */
export class PersonalCrewNotFoundError extends Error {
  constructor() {
    super('No personal crew found. Run `crew init --global` first to create your personal crew.');
    this.name = 'PersonalCrewNotFoundError';
  }
}

/**
 * Error thrown when extraction is disabled for a consult session.
 * Consumers can catch this specifically to suggest using --force.
 */
export class ExtractionDisabledError extends Error {
  constructor() {
    super(
      'Extraction is disabled for this consult session.\n' +
      'This was configured in your personal crew settings.\n' +
      'Use --force to override.',
    );
    this.name = 'ExtractionDisabledError';
  }
}

// ============================================================================
// Consult Mode Agent File
// ============================================================================

/**
 * Consult mode preamble to inject after frontmatter in crew.agent.md.
 * This tells Crew it's in consult mode and should skip Init Mode.
 */
const CONSULT_MODE_PREAMBLE = `
<!-- consult-mode: true -->

## ⚡ Consult Mode Active

This project is in **consult mode**. Your personal crew has been copied into \`.crew/\` for this session.

**Key differences from normal mode:**
- **Skip Init Mode** — The team already exists (copied from your personal crew)
- **Isolated changes** — All changes stay local until you run \`crew extract\`
- **Invisible to project** — Both \`.crew/\` and this agent file are in \`.git/info/exclude\`

**When done:** Run \`crew extract\` to review learnings and merge generic ones back to your personal crew.

---

`;

/**
 * Get the full crew.agent.md template path.
 * Looks in the SDK package's templates directory.
 */
function getCrewAgentTemplatePath(): string | null {
  // Use fileURLToPath for cross-platform compatibility (handles Windows drive letters, URL encoding)
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  
  // Try relative to this file (in dist/)
  const distPath = path.resolve(currentDir, '../../templates/crew.agent.md.template');
  if (storage.existsSync(distPath)) {
    return distPath;
  }
  
  // Try relative to package root
  const pkgPath = path.resolve(currentDir, '../../../templates/crew.agent.md.template');
  if (storage.existsSync(pkgPath)) {
    return pkgPath;
  }
  
  return null;
}

/**
 * Get the git remote URL for a repository.
 * Converts SSH URLs to HTTPS format for display.
 */
function getGitRemoteUrl(projectRoot: string): string | undefined {
  try {
    const remoteUrl = execSync('git remote get-url origin', {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    // Convert SSH URL to HTTPS for readability
    // git@github.com:owner/repo.git → https://github.com/owner/repo
    if (remoteUrl.startsWith('git@')) {
      const match = remoteUrl.match(/git@([^:]+):(.+?)(\.git)?$/);
      if (match) {
        return `https://${match[1]}/${match[2]}`;
      }
    }

    // Remove .git suffix if present
    return remoteUrl.replace(/\.git$/, '');
  } catch {
    return undefined;
  }
}

/**
 * Generate crew.agent.md for consult mode.
 * Uses the full template with consult mode preamble injected.
 */
function getConsultAgentContent(projectName: string): string {
  const templatePath = getCrewAgentTemplatePath();
  
  if (templatePath && storage.existsSync(templatePath)) {
    const template = storage.readSync(templatePath) ?? '';
    
    // Find the end of frontmatter (second ---)
    const frontmatterEnd = template.indexOf('---', template.indexOf('---') + 3);
    if (frontmatterEnd !== -1) {
      const insertPoint = frontmatterEnd + 3;
      const before = template.slice(0, insertPoint);
      const after = template.slice(insertPoint);
      
      // Update description in frontmatter for consult mode
      const updatedBefore = before.replace(
        /description:\s*"[^"]*"/,
        `description: "Your AI team. Consulting on ${projectName} using your personal crew."`
      );
      
      return updatedBefore + '\n' + CONSULT_MODE_PREAMBLE + after;
    }
    
    // Fallback: prepend preamble
    return template + '\n' + CONSULT_MODE_PREAMBLE;
  }
  
  // Fallback: minimal agent if template not found
  return `---
name: Crew
description: "Your AI team. Consulting on ${projectName} using your personal crew."
---

${CONSULT_MODE_PREAMBLE}

You are **Crew (Consultant)** — working on **${projectName}** using a copy of your personal crew.

### Available Context (local copy in .crew/)

- **Team:** \`.crew/team.md\` for roster and roles
- **Routing:** \`.crew/routing.md\` for task routing rules  
- **Decisions:** \`.crew/decisions.md\` for your established patterns
- **Skills:** \`.copilot/skills/\` for reusable capabilities
- **Agents:** \`.crew/agents/\` for your crew agents

Work as you would with your personal crew, but in this external codebase.
`;
}

// ============================================================================
// Scribe Charter Patching for Consult Mode
// ============================================================================

/**
 * Consult mode instructions to append to Scribe charter.
 * This enables Scribe to classify decisions as generic or project-specific.
 */
const CONSULT_MODE_SCRIBE_PATCH = `

---

## Consult Mode Extraction

**This crew is in consult mode.** When merging decisions from the inbox, also classify each decision:

### Classification

For each decision in \`.crew/decisions/inbox/\`:

1. **Generic** (applies to any project) → Copy to \`.crew/extract/\` with the same filename
   - Signals: "always use", "never use", "prefer X over Y", "best practice", coding standards, patterns that work anywhere
   - These will be extracted to the personal crew via \`crew extract\`

2. **Project-specific** (only applies here) → Keep in local \`decisions.md\` only
   - Signals: Contains file paths from this project, references "this project/codebase/repo", mentions project-specific config/APIs/schemas

Generic decisions go to BOTH \`.crew/decisions.md\` (for this session) AND \`.crew/extract/\` (for later extraction).

### Extract Directory

\`\`\`
.crew/extract/           # Generic learnings staged for personal crew
├── decision-1.md         # Ready for extraction
└── pattern-auth.md       # Ready for extraction
\`\`\`

Run \`crew extract\` to review and merge these to your personal crew.
`;

/**
 * Patch the Scribe charter in the copied crew with consult mode instructions.
 */
function patchScribeCharterForConsultMode(crewDir: string): void {
  const charterPath = path.join(crewDir, 'agents', 'scribe', 'charter.md');
  
  if (!storage.existsSync(charterPath)) {
    // No scribe charter to patch — skip silently
    return;
  }

  const existing = storage.readSync(charterPath) ?? '';
  
  // Don't patch if already patched
  if (existing.includes('Consult Mode Extraction')) {
    return;
  }

  storage.appendSync(charterPath, CONSULT_MODE_SCRIBE_PATCH);
}

/**
 * List files recursively in a directory.
 */
function listFilesInDir(dir: string, basePath = ''): string[] {
  if (!storage.existsSync(dir)) return [];
  
  const files: string[] = [];
  const entries = storage.listSync(dir);
  
  for (const entry of entries) {
    const relativePath = basePath ? path.join(basePath, entry) : entry;
    if (storage.isDirectorySync(path.join(dir, entry))) {
      files.push(...listFilesInDir(path.join(dir, entry), relativePath));
    } else {
      files.push(relativePath);
    }
  }
  
  return files;
}

// ============================================================================
// Setup Consult Mode
// ============================================================================

/**
 * Options for setting up consult mode.
 */
export interface SetupConsultModeOptions {
  /** Project root directory (default: cwd) */
  projectRoot?: string;
  /** Path to personal crew root (auto-resolved if not provided) */
  personalCrewRoot?: string;
  /** If true, don't modify any files — just return what would happen */
  dryRun?: boolean;
  /** Override project name (default: basename of projectRoot). Useful for worktrees. */
  projectName?: string;
  /** If true, disable extraction back to personal crew (read-only consultation) */
  extractionDisabled?: boolean;
}

/**
 * Result of setupConsultMode().
 */
export interface SetupConsultModeResult {
  /** Path to project .crew/ directory */
  crewDir: string;
  /** Path to personal crew root */
  personalCrewRoot: string;
  /** Path to git exclude file */
  gitExclude: string;
  /** Project name (basename of project root) */
  projectName: string;
  /** Whether this was a dry run */
  dryRun: boolean;
  /** Path to created agent file (.github/agents/crew.agent.md) */
  agentFile: string;
  /** List of created file paths (relative to crewDir) */
  createdFiles: string[];
  /** Whether extraction is disabled for this consult session */
  extractionDisabled: boolean;
}

/**
 * Get the personal crew root path.
 * Returns {globalCrewPath}/personal-crew/
 */
export function getPersonalCrewRoot(): string {
  return path.resolve(resolveGlobalCrewPath(), 'personal-crew');
}

/**
 * Resolve the git exclude path using git rev-parse (handles worktrees/submodules).
 *
 * @param cwd - Working directory inside the git repo
 * @throws Error if not a git repository
 */
export function resolveGitExcludePath(cwd: string): string {
  try {
    return execSync('git rev-parse --git-path info/exclude', {
      cwd,
      encoding: 'utf-8',
    }).trim();
  } catch {
    throw new Error('Not a git repository. Consult mode requires git.');
  }
}

/**
 * Set up consult mode in a project.
 *
 * Creates .crew/ with consult: true, pointing to your personal crew.
 * Creates .github/agents/crew.agent.md for `gh copilot --agent crew` support.
 * Both are hidden via .git/info/exclude (never committed).
 *
 * @param options - Setup options
 * @returns Setup result with paths and metadata
 * @throws Error if not a git repo, personal crew missing, or already crewified
 */
export async function setupConsultMode(
  options: SetupConsultModeOptions = {},
): Promise<SetupConsultModeResult> {
  const projectRoot = options.projectRoot || process.cwd();
  const personalCrewRoot = options.personalCrewRoot || getPersonalCrewRoot();
  const dryRun = options.dryRun ?? false;

  const crewDir = path.resolve(projectRoot, '.crew');
  const projectName = options.projectName || path.basename(projectRoot);
  const agentFile = path.resolve(projectRoot, '.github', 'agents', 'crew.agent.md');

  // Check if we're in a git repository (handle worktrees/submodules where .git is a file)
  const gitPath = path.resolve(projectRoot, '.git');
  if (!storage.existsSync(gitPath)) {
    throw new Error('Not a git repository. Consult mode requires git.');
  }

  // Resolve exclude path via git rev-parse (handles worktrees/submodules)
  // Normalize to absolute path in case it's relative
  const gitExclude = (() => {
    const excludePath = resolveGitExcludePath(projectRoot);
    return path.isAbsolute(excludePath) ? excludePath : path.resolve(projectRoot, excludePath);
  })();

  // Check if personal crew exists
  if (!storage.existsSync(personalCrewRoot)) {
    throw new PersonalCrewNotFoundError();
  }

  // Read source crew's config to inherit extractionDisabled setting
  // Option takes precedence, then fall back to source config
  let extractionDisabled = options.extractionDisabled ?? false;
  const sourceConfigPath = path.join(personalCrewRoot, 'config.json');
  if (storage.existsSync(sourceConfigPath)) {
    try {
      const sourceConfig = JSON.parse(storage.readSync(sourceConfigPath) ?? '{}');
      // Inherit from source unless explicitly overridden in options
      if (options.extractionDisabled === undefined && sourceConfig.extractionDisabled) {
        extractionDisabled = true;
      }
    } catch {
      // Ignore malformed config
    }
  }

  // Check if project already has .crew/
  if (storage.existsSync(crewDir)) {
    throw new Error(
      'This project already has a .crew/ directory. Cannot use consult mode on crewified projects.',
    );
  }

  // List files in personal crew (for dry run preview or later count)
  const sourceFiles = listFilesInDir(personalCrewRoot);

  if (!dryRun) {
    // Copy personal crew contents into project's .crew/
    // This isolates changes during the consult session
    cpSync(personalCrewRoot, crewDir, { recursive: true });

    // Write/overwrite config.json with consult: true
    // Include CrewDirConfig fields so loadDirConfig() can read it
    // Note: version must be numeric for loadDirConfig() compatibility
    const config = {
      version: 1,
      teamRoot: personalCrewRoot,
      consult: true,
      sourceCrew: personalCrewRoot,
      projectName,
      createdAt: new Date().toISOString(),
      extractionDisabled,
    };
    storage.writeSync(
      path.join(crewDir, 'config.json'),
      JSON.stringify(config, null, 2),
    );

    // Create sessions directory for tracking (if not copied)
    const sessionsDir = path.join(crewDir, 'sessions');
    if (!storage.existsSync(sessionsDir)) {
      storage.mkdirSync(sessionsDir, { recursive: true });
    }

    // Create extract/ directory for staging generic learnings
    const extractDir = path.join(crewDir, 'extract');
    storage.mkdirSync(extractDir, { recursive: true });

    // Patch scribe-charter.md with consult mode extraction instructions
    patchScribeCharterForConsultMode(crewDir);

    // Create .github/agents/crew.agent.md for `gh copilot --agent crew`
    const agentDir = path.dirname(agentFile);
    if (!storage.existsSync(agentDir)) {
      storage.mkdirSync(agentDir, { recursive: true });
    }
    storage.writeSync(agentFile, getConsultAgentContent(projectName));

    // Add .crew/ and .github/agents/crew.agent.md to .git/info/exclude
    const excludeDir = path.dirname(gitExclude);
    if (!storage.existsSync(excludeDir)) {
      storage.mkdirSync(excludeDir, { recursive: true });
    }
    const excludeContent = storage.existsSync(gitExclude)
      ? storage.readSync(gitExclude) ?? ''
      : '';
    const excludeLines: string[] = [];
    if (!excludeContent.includes('.crew/')) {
      excludeLines.push('.crew/');
    }
    if (!excludeContent.includes('.github/agents/crew.agent.md')) {
      excludeLines.push('.github/agents/crew.agent.md');
    }
    if (excludeLines.length > 0) {
      storage.appendSync(gitExclude, '\n# Crew consult mode (local only)\n' + excludeLines.join('\n') + '\n');
    }
  }

  // List files created (from crew dir after copy, or from source for dry run)
  const createdFiles = dryRun ? sourceFiles : listFilesInDir(crewDir);

  return {
    crewDir,
    personalCrewRoot,
    gitExclude,
    projectName,
    dryRun,
    agentFile,
    createdFiles,
    extractionDisabled,
  };
}

// ============================================================================
// Extract Learnings
// ============================================================================

/**
 * Options for extracting learnings from a consult session.
 */
export interface ExtractLearningsOptions {
  /** Project root directory (default: cwd) */
  projectRoot?: string;
  /** Path to personal crew root (auto-resolved if not provided) */
  personalCrewRoot?: string;
  /** If true, don't modify files — just return staged learnings */
  dryRun?: boolean;
  /** If true, delete project .crew/ after extraction */
  clean?: boolean;
  /** If true, allow extraction from copyleft-licensed projects */
  acceptRisks?: boolean;
  /** Optional callback to select which learnings to extract (for interactive mode) */
  selectLearnings?: (learnings: StagedLearning[]) => Promise<StagedLearning[]>;
  /** Override project name (default: basename of projectRoot). Useful for worktrees. */
  projectName?: string;
  /** If true, override extractionDisabled setting in config */
  force?: boolean;
}

/**
 * Full result of extractLearnings().
 */
export interface ExtractLearningsResult extends ExtractionResult {
  /** Whether extraction was blocked by license */
  blocked: boolean;
  /** Number of decisions merged */
  decisionsMerged: number;
  /** Number of skills created (future) */
  skillsCreated: number;
  /** Path to consultation log file */
  consultationLogPath?: string;
  /** Whether project .crew/ was cleaned up */
  cleaned: boolean;
}

/**
 * Load session history from .crew/sessions/ directory.
 *
 * @param crewDir - Path to project .crew/ directory
 * @returns AgentHistory with entries from session files
 */
export function loadSessionHistory(crewDir: string): AgentHistory {
  const sessionsDir = path.join(crewDir, 'sessions');
  const entries: HistoryEntry[] = [];

  if (!storage.existsSync(sessionsDir)) {
    return { entries };
  }

  const files = storage.listSync(sessionsDir)
    .filter(f => f.endsWith('.json'))
    .sort();

  for (const file of files) {
    try {
      const content = storage.readSync(path.join(sessionsDir, file)) ?? '';
      const session = JSON.parse(content);

      // Extract learnings from session data
      if (session.learnings && Array.isArray(session.learnings)) {
        for (const learning of session.learnings) {
          entries.push({
            id: learning.id || `${file}-${entries.length}`,
            timestamp: learning.timestamp || session.timestamp || new Date().toISOString(),
            type: learning.type || 'pattern',
            content: learning.content || String(learning),
            agent: learning.agent,
          });
        }
      }

      // Extract decisions
      if (session.decisions && Array.isArray(session.decisions)) {
        for (const decision of session.decisions) {
          entries.push({
            id: decision.id || `${file}-decision-${entries.length}`,
            timestamp: decision.timestamp || session.timestamp || new Date().toISOString(),
            type: 'decision',
            content: decision.content || String(decision),
            agent: decision.agent,
          });
        }
      }
    } catch {
      // Skip malformed session files
    }
  }

  return { entries };
}

/**
 * Extract learnings from a consult mode session.
 *
 * Reads staged learnings from .crew/extract/ (classified by Scribe during session)
 * and optionally merges approved items to your personal crew.
 *
 * @param options - Extraction options
 * @returns Extraction result with learnings, merge stats, and paths
 * @throws Error if not in consult mode or license blocks extraction
 */
export async function extractLearnings(
  options: ExtractLearningsOptions = {},
): Promise<ExtractLearningsResult> {
  const projectRoot = options.projectRoot || process.cwd();
  const personalCrewRoot = options.personalCrewRoot || getPersonalCrewRoot();
  const dryRun = options.dryRun ?? false;
  const clean = options.clean ?? false;
  const acceptRisks = options.acceptRisks ?? false;
  const force = options.force ?? false;

  const crewDir = path.resolve(projectRoot, '.crew');
  const projectName = options.projectName || path.basename(projectRoot);

  // Check if we're in consult mode
  if (!storage.existsSync(crewDir)) {
    throw new Error('Not in consult mode. No .crew/ directory found.');
  }

  const configPath = path.join(crewDir, 'config.json');
  if (!storage.existsSync(configPath)) {
    throw new Error('Invalid consult mode: missing config.json');
  }

  const config = JSON.parse(storage.readSync(configPath) ?? '{}');
  if (!config.consult) {
    throw new Error(
      'This project has a .crew/ but is not in consult mode. Use normal crew commands.',
    );
  }

  // Check if extraction is disabled for this consult session
  if (config.extractionDisabled && !force) {
    throw new ExtractionDisabledError();
  }

  // Detect license
  const licensePath = path.join(projectRoot, 'LICENSE');
  const licenseContent = storage.existsSync(licensePath)
    ? storage.readSync(licensePath) ?? ''
    : '';
  const license = detectLicense(licenseContent);

  // Block copyleft extraction unless --accept-risks
  const blocked = license.type === 'copyleft' && !acceptRisks;

  // Get repository URL for logging
  const repoUrl = getGitRemoteUrl(projectRoot);

  if (blocked) {
    return {
      extracted: [],
      skipped: [],
      license,
      projectName,
      repoUrl,
      timestamp: new Date().toISOString(),
      acceptedRisks: false,
      blocked: true,
      decisionsMerged: 0,
      skillsCreated: 0,
      cleaned: false,
    };
  }

  // Load staged learnings from .crew/extract/
  let staged = loadStagedLearnings(crewDir);

  // If interactive selection callback provided, let user choose
  let skipped: StagedLearning[] = [];
  if (options.selectLearnings && staged.length > 0) {
    const selected = await options.selectLearnings(staged);
    const selectedFilenames = new Set(selected.map(l => l.filename));
    skipped = staged.filter(l => !selectedFilenames.has(l.filename));
    staged = selected;
  }

  const result: ExtractionResult = {
    extracted: staged,
    skipped,
    license,
    projectName,
    repoUrl,
    timestamp: new Date().toISOString(),
    acceptedRisks: acceptRisks,
  };

  let decisionsMerged = 0;
  let skillsCreated = 0;
  let consultationLogPath: string | undefined;
  let cleaned = false;

  if (!dryRun && staged.length > 0) {
    // Merge to personal crew
    const mergeResult = await mergeToPersonalCrew(staged, personalCrewRoot);
    decisionsMerged = mergeResult.decisions;
    skillsCreated = mergeResult.skills;

    // Log consultation
    consultationLogPath = await logConsultation(personalCrewRoot, result);

    // Remove extracted files from .crew/extract/
    for (const learning of staged) {
      storage.deleteSync(learning.filepath);
    }
  }

  // Clean up entire .crew/ if requested
  if (clean && !dryRun) {
    storage.deleteDirSync(crewDir);
    cleaned = true;
  }

  return {
    ...result,
    blocked: false,
    decisionsMerged,
    skillsCreated,
    consultationLogPath,
    cleaned,
  };
}

// ============================================================================
// License Detection
// ============================================================================

/**
 * License classification result.
 */
export interface LicenseInfo {
  type: 'permissive' | 'copyleft' | 'unknown';
  spdxId?: string;
  name?: string;
  filePath?: string;
}

const COPYLEFT_LICENSES = [
  'GPL',
  'AGPL',
  'LGPL',
  'MPL',
  'EPL',
  'CDDL',
  'CC-BY-SA',
] as const;

const PERMISSIVE_LICENSES = [
  'MIT',
  'Apache',
  'BSD',
  'ISC',
  'Unlicense',
  'CC0',
  'WTFPL',
] as const;

/**
 * Escape a string so it can be safely used inside a RegExp pattern.
 */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Detect license type from LICENSE file content.
 *
 * @param licenseContent - Raw content of the LICENSE file
 * @returns License classification with type, optional SPDX ID, and name
 */
export function detectLicense(licenseContent: string): LicenseInfo {
  const content = licenseContent;
  const upperContent = licenseContent.toUpperCase();

  // 1. Prefer SPDX identifiers when present.
  const spdxMatch = content.match(/SPDX-License-Identifier:\s*([^\s*]+)/i);
  if (spdxMatch && spdxMatch[1]) {
    const spdxId = spdxMatch[1];
    const spdxIdUpper = spdxId.toUpperCase();

    const copyleftUpper = COPYLEFT_LICENSES.map(id => id.toUpperCase());
    const permissiveUpper = PERMISSIVE_LICENSES.map(id => id.toUpperCase());

    // Check for copyleft first (LGPL should match before GPL)
    for (const license of copyleftUpper) {
      if (spdxIdUpper.includes(license)) {
        return { type: 'copyleft', spdxId, name: spdxId };
      }
    }
    for (const license of permissiveUpper) {
      if (spdxIdUpper.includes(license)) {
        return { type: 'permissive', spdxId, name: spdxId };
      }
    }
    return { type: 'unknown', spdxId, name: spdxId };
  }

  // 2. Fallback: word-boundary regex, longest-first to avoid
  //    misclassifying e.g. "LGPL" as "GPL".
  const detectFromList = (
    licenses: readonly string[],
    type: LicenseInfo['type'],
  ): LicenseInfo | null => {
    const sorted = [...licenses].sort((a, b) => b.length - a.length);
    for (const license of sorted) {
      const pattern = new RegExp(
        `\\b${escapeRegex(license.toUpperCase())}\\b`,
        'i',
      );
      if (pattern.test(upperContent)) {
        return { type, spdxId: license, name: license };
      }
    }
    return null;
  };

  // Check copyleft first (more restrictive)
  const copyleftMatch = detectFromList(COPYLEFT_LICENSES, 'copyleft');
  if (copyleftMatch) return copyleftMatch;

  const permissiveMatch = detectFromList(PERMISSIVE_LICENSES, 'permissive');
  if (permissiveMatch) return permissiveMatch;

  return { type: 'unknown' };
}

// ============================================================================
// Staged Learnings (from .crew/extract/)
// ============================================================================

/**
 * A learning staged by Scribe for extraction to personal crew.
 * Files in .crew/extract/ are markdown files with decision content.
 */
export interface StagedLearning {
  /** Filename (e.g., "use-zod-validation.md") */
  filename: string;
  /** Full path to the file */
  filepath: string;
  /** Content of the file */
  content: string;
}

/**
 * Load staged learnings from .crew/extract/ directory.
 * These are generic learnings that Scribe classified during the session.
 *
 * @param crewDir - Path to project .crew/ directory
 * @returns Array of staged learnings
 */
export function loadStagedLearnings(crewDir: string): StagedLearning[] {
  const extractDir = path.join(crewDir, 'extract');
  const learnings: StagedLearning[] = [];

  if (!storage.existsSync(extractDir)) {
    return learnings;
  }

  const files = storage.listSync(extractDir).filter(f => f.endsWith('.md'));

  for (const file of files) {
    const filepath = path.join(extractDir, file);
    try {
      const content = storage.readSync(filepath) ?? '';
      learnings.push({
        filename: file,
        filepath,
        content,
      });
    } catch {
      // Skip unreadable files
    }
  }

  return learnings;
}

// ============================================================================
// Extraction Result
// ============================================================================

/**
 * Result of the extraction process.
 */
export interface ExtractionResult {
  /** Learnings extracted to personal crew */
  extracted: StagedLearning[];
  /** Learnings rejected by user */
  skipped: StagedLearning[];
  /** Project license info */
  license: LicenseInfo;
  /** Project name (for consultation log) */
  projectName: string;
  /** Extraction timestamp (ISO 8601) */
  timestamp: string;
  /** Whether --accept-risks was used */
  acceptedRisks: boolean;
  /** Repository URL (GitHub, etc.) */
  repoUrl?: string;
}

// ============================================================================
// Consultation Logging
// ============================================================================

/**
 * Write or append a consultation log entry to the personal crew.
 *
 * Creates the consultations directory if it doesn't exist.
 * For new projects, creates a full header; for existing projects, appends session entry.
 *
 * @param personalCrewRoot - Path to personal crew root (resolved via
 *   `getPersonalCrewRoot()` if not provided). Platform defaults:
 *   - macOS:   `~/Library/Application Support/crew/personal-crew`
 *   - Linux:   `~/.config/crew/personal-crew`
 *   - Windows: `%APPDATA%/crew/personal-crew`
 * @param result - Extraction result with learnings and metadata
 * @returns Path to the consultation log file
 */
export async function logConsultation(
  personalCrewRoot: string,
  result: ExtractionResult,
): Promise<string> {
  const consultDir = path.join(personalCrewRoot, 'consultations');
  const logPath = path.join(consultDir, `${result.projectName}.md`);

  // Create consultations directory if needed
  if (!storage.existsSync(consultDir)) {
    storage.mkdirSync(consultDir, { recursive: true });
  }

  const today = result.timestamp.split('T')[0] ?? new Date().toISOString().split('T')[0]!; // YYYY-MM-DD format

  if (storage.existsSync(logPath)) {
    // Append to existing log — update "Last session" and add new entry
    let content = storage.readSync(logPath) ?? '';

    // Update "Last session" date
    content = content.replace(
      /\*\*Last session:\*\* \d{4}-\d{2}-\d{2}/,
      `**Last session:** ${today}`,
    );

    // Build session entry
    const sessionEntry = formatSessionEntry(result, today);

    // Append to file
    storage.writeSync(logPath, content + sessionEntry);
  } else {
    // Create new consultation log with full header
    const header = formatLogHeader(result, today);
    const sessionEntry = formatSessionEntry(result, today);
    storage.writeSync(logPath, header + sessionEntry);
  }

  return logPath;
}

/**
 * Format the header for a new consultation log file.
 */
function formatLogHeader(result: ExtractionResult, date: string): string {
  const repoLine = result.repoUrl
    ? `**Repository:** ${result.repoUrl}\n`
    : '';
  const licenseName = result.license.spdxId || result.license.name || result.license.type;

  return `# ${result.projectName}

${repoLine}**First consulted:** ${date}
**Last session:** ${date}
**License:** ${licenseName}

## Extracted Learnings

`;
}

/**
 * Format a session entry for the consultation log.
 */
function formatSessionEntry(result: ExtractionResult, date: string): string {
  if (result.extracted.length === 0) {
    return `### ${date}
- No learnings extracted

`;
  }

  // Just list titles/filenames, not content
  const lines = result.extracted.map(l => `- ${l.filename}`);

  return `### ${date}
${lines.join('\n')}

`;
}

// ============================================================================
// Merge to Personal Crew
// ============================================================================

/**
 * Check if content looks like a skill (has YAML frontmatter with skill markers).
 */
function isSkillContent(content: string): boolean {
  // Skills have YAML frontmatter with name/confidence/domain
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch || !frontmatterMatch[1]) return false;

  const frontmatter = frontmatterMatch[1];
  // Must have at least name and confidence to be a skill
  return frontmatter.includes('name:') && frontmatter.includes('confidence:');
}

/**
 * Extract skill name from YAML frontmatter.
 */
function extractSkillName(content: string): string | null {
  const match = content.match(/^---\n[\s\S]*?name:\s*["']?([^"'\n]+)["']?/);
  return match && match[1] ? match[1].trim() : null;
}

/**
 * Merge staged learnings into personal crew.
 *
 * Routes skills to personal crew directory via resolveGlobalCrewPath() to .copilot/skills/{name}/SKILL.md
 * Routes decisions to decisions.md in personal crew directory (with smart merge)
 *
 * @param learnings - Staged learnings to merge
 * @param personalCrewRoot - Path to personal crew root
 */
export async function mergeToPersonalCrew(
  learnings: StagedLearning[],
  personalCrewRoot: string,
): Promise<{ decisions: number; skills: number }> {
  if (learnings.length === 0) {
    return { decisions: 0, skills: 0 };
  }

  let decisionsAdded = 0;
  let skillsAdded = 0;

  const decisions: StagedLearning[] = [];
  const skills: StagedLearning[] = [];

  // Classify learnings
  for (const learning of learnings) {
    if (isSkillContent(learning.content)) {
      skills.push(learning);
    } else {
      decisions.push(learning);
    }
  }

  // Route skills to personal crew directory (via resolveGlobalCrewPath()) at .copilot/skills/{name}/SKILL.md
  const skillsDir = path.join(path.dirname(personalCrewRoot), '.copilot', 'skills');
  for (const skill of skills) {
    const skillName = extractSkillName(skill.content) || skill.filename.replace('.md', '');
    const skillDir = path.join(skillsDir, skillName);

    // Create skill directory if needed
    if (!storage.existsSync(skillDir)) {
      storage.mkdirSync(skillDir, { recursive: true });
    }

    const skillPath = path.join(skillDir, 'SKILL.md');

    // Write skill (overwrites if exists — newer extraction wins)
    storage.writeSync(skillPath, skill.content);
    skillsAdded++;
  }

  // Route decisions to personal crew directory at decisions.md
  if (decisions.length > 0) {
    const decisionsPath = path.join(personalCrewRoot, 'decisions.md');
    const newContent = decisions.map(d => d.content.trim()).join('\n\n');

    if (storage.existsSync(decisionsPath)) {
      const existing = storage.readSync(decisionsPath) ?? '';

      // Check if we already have an "Extracted from Consultations" section
      if (existing.includes('## Extracted from Consultations')) {
        // Append under the existing section (before any subsequent ## heading)
        const parts = existing.split('## Extracted from Consultations');
        const beforeSection = parts[0];
        const afterSection = parts[1] ?? '';

        // Find where the next section starts (if any)
        const nextSectionMatch = afterSection.match(/\n## /);
        if (nextSectionMatch && nextSectionMatch.index !== undefined) {
          // Insert before next section
          const sectionContent = afterSection.slice(0, nextSectionMatch.index);
          const rest = afterSection.slice(nextSectionMatch.index);
          storage.writeSync(
            decisionsPath,
            beforeSection +
              '## Extracted from Consultations' +
              sectionContent.trimEnd() +
              '\n\n' +
              newContent +
              '\n' +
              rest,
          );
        } else {
          // No next section — append to end
          storage.writeSync(
            decisionsPath,
            existing.trimEnd() + '\n\n' + newContent + '\n',
          );
        }
      } else {
        // No extraction section yet — create one
        storage.writeSync(
          decisionsPath,
          existing.trimEnd() + '\n\n## Extracted from Consultations\n\n' + newContent + '\n',
        );
      }
    } else {
      // Create new decisions file
      storage.writeSync(
        decisionsPath,
        `# Crew Decisions\n\n## Extracted from Consultations\n\n${newContent}\n`,
      );
    }
    decisionsAdded = decisions.length;
  }

  return { decisions: decisionsAdded, skills: skillsAdded };
}
