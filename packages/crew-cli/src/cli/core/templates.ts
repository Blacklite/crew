/**
 * Template system types and manifest for Crew initialization.
 * @module cli/core/templates
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { FSStorageProvider } from '@blacklite/crew-sdk';

const storage = new FSStorageProvider();

/** Template file descriptor */
export interface TemplateFile {
  /** Source path relative to templates/ */
  source: string;
  /** Destination path relative to .crew/ directory */
  destination: string;
  /** Whether this file should be overwritten on upgrade */
  overwriteOnUpgrade: boolean;
  /** Description for logging */
  description: string;
}

/**
 * Template manifest — all files that init copies.
 * 
 * Categorization:
 * - Crew-owned (overwriteOnUpgrade: true): crew.agent.md, workflows, template files, casting data
 * - User-owned (overwriteOnUpgrade: false): team.md, routing.md, decisions.md, ceremonies.md, agent history/identity
 */
export const TEMPLATE_MANIFEST: TemplateFile[] = [
  // Core coordinator
  {
    source: 'crew.agent.md.template',
    destination: '../.github/agents/crew.agent.md',
    overwriteOnUpgrade: true,
    description: 'Crew coordinator agent prompt',
  },
  
  // Casting system (crew-owned, overwrite on upgrade)
  // NOTE: These JSON files are read at runtime by the SDK and many agent
  // skills via their flat `.crew/casting-*.json` paths — do NOT route into
  // a subdirectory without coordinated updates across the SDK + skill docs.
  {
    source: 'casting-history.json',
    destination: 'casting-history.json',
    overwriteOnUpgrade: true,
    description: 'Casting history tracking',
  },
  {
    source: 'casting-policy.json',
    destination: 'casting-policy.json',
    overwriteOnUpgrade: true,
    description: 'Casting policy configuration',
  },
  {
    source: 'casting-registry.json',
    destination: 'casting-registry.json',
    overwriteOnUpgrade: true,
    description: 'Universe-based character registry',
  },
  
  // Template files (crew-owned, overwrite on upgrade) — routed to
  // .crew/templates/ so upgrade doesn't dump ~20 generic *.md docs
  // into the .crew/ root.
  {
    source: 'charter.md',
    destination: 'templates/charter.md',
    overwriteOnUpgrade: true,
    description: 'Agent charter template',
  },
  {
    source: 'constraint-tracking.md',
    destination: 'templates/constraint-tracking.md',
    overwriteOnUpgrade: true,
    description: 'Constraint tracking template',
  },
  {
    source: 'copilot-instructions.md',
    destination: 'templates/copilot-instructions.md',
    overwriteOnUpgrade: true,
    description: 'Copilot instructions template',
  },
  {
    source: 'history.md',
    destination: 'templates/history.md',
    overwriteOnUpgrade: true,
    description: 'Agent history template',
  },
  {
    source: 'mcp-config.md',
    destination: 'templates/mcp-config.md',
    overwriteOnUpgrade: true,
    description: 'MCP configuration template',
  },
  {
    source: 'multi-agent-format.md',
    destination: 'templates/multi-agent-format.md',
    overwriteOnUpgrade: true,
    description: 'Multi-agent format specification',
  },
  {
    source: 'orchestration-log.md',
    destination: 'templates/orchestration-log.md',
    overwriteOnUpgrade: true,
    description: 'Orchestration log template',
  },
  {
    source: 'plugin-marketplace.md',
    destination: 'templates/plugin-marketplace.md',
    overwriteOnUpgrade: true,
    description: 'Plugin marketplace template',
  },
  {
    source: 'raw-agent-output.md',
    destination: 'templates/raw-agent-output.md',
    overwriteOnUpgrade: true,
    description: 'Raw agent output template',
  },
  {
    source: 'roster.md',
    destination: 'templates/roster.md',
    overwriteOnUpgrade: true,
    description: 'Team roster template',
  },
  {
    source: 'run-output.md',
    destination: 'templates/run-output.md',
    overwriteOnUpgrade: true,
    description: 'Run output template',
  },
  {
    source: 'scribe-charter.md',
    destination: 'templates/scribe-charter.md',
    overwriteOnUpgrade: true,
    description: 'Scribe charter template',
  },
  {
    source: 'Rai-charter.md',
    destination: 'templates/Rai-charter.md',
    overwriteOnUpgrade: true,
    description: 'Rai RAI reviewer charter template',
  },
  {
    source: 'rai-policy.md',
    destination: 'templates/rai-policy.md',
    overwriteOnUpgrade: true,
    description: 'Default RAI policy template',
  },
  {
    source: 'fact-checker-charter.md',
    destination: 'templates/fact-checker-charter.md',
    overwriteOnUpgrade: true,
    description: 'Fact checker charter template',
  },
  {
    source: 'fact-checker-policy.md',
    destination: 'templates/fact-checker-policy.md',
    overwriteOnUpgrade: true,
    description: 'Fact checker policy template (verification + DA methodology)',
  },
  {
    source: 'skill.md',
    destination: 'templates/skill.md',
    overwriteOnUpgrade: true,
    description: 'Skill definition template',
  },
  
  // User-owned files (never overwrite)
  {
    source: 'ceremonies.md',
    destination: 'ceremonies.md',
    overwriteOnUpgrade: false,
    description: 'Team ceremonies configuration',
  },
  {
    source: 'routing.md',
    destination: 'routing.md',
    overwriteOnUpgrade: false,
    description: 'Agent routing rules',
  },
  
  // Identity subdirectory (user-owned)
  {
    source: 'identity/now.md',
    destination: 'identity/now.md',
    overwriteOnUpgrade: false,
    description: 'Agent current focus',
  },
  {
    source: 'identity/wisdom.md',
    destination: 'identity/wisdom.md',
    overwriteOnUpgrade: false,
    description: 'Agent accumulated wisdom',
  },
  
  // Issue lifecycle (crew-owned)
  {
    source: 'issue-lifecycle.md',
    destination: 'templates/issue-lifecycle.md',
    overwriteOnUpgrade: true,
    description: 'Issue lifecycle process template',
  },

  // Skills subdirectory (crew-owned)
  {
    source: 'skills/crew-conventions/SKILL.md',
    destination: '../.github/skills/crew-conventions/SKILL.md',
    overwriteOnUpgrade: true,
    description: 'Crew conventions skill definition',
  },
  {
    source: 'skills/error-recovery/SKILL.md',
    destination: '../.github/skills/error-recovery/SKILL.md',
    overwriteOnUpgrade: true,
    description: 'Graceful error recovery patterns',
  },
  {
    source: 'skills/secret-handling/SKILL.md',
    destination: '../.github/skills/secret-handling/SKILL.md',
    overwriteOnUpgrade: true,
    description: 'Secrets management and credential safety',
  },
  {
    source: 'skills/git-workflow/SKILL.md',
    destination: '../.github/skills/git-workflow/SKILL.md',
    overwriteOnUpgrade: true,
    description: 'Git workflow conventions and branch management',
  },
  {
    source: 'skills/session-recovery/SKILL.md',
    destination: '../.github/skills/session-recovery/SKILL.md',
    overwriteOnUpgrade: true,
    description: 'Session checkpoint and recovery patterns',
  },
  {
    source: 'skills/reviewer-protocol/SKILL.md',
    destination: '../.github/skills/reviewer-protocol/SKILL.md',
    overwriteOnUpgrade: true,
    description: 'Code review protocol and reviewer gate patterns',
  },
  {
    source: 'skills/test-discipline/SKILL.md',
    destination: '../.github/skills/test-discipline/SKILL.md',
    overwriteOnUpgrade: true,
    description: 'Test-first discipline and coverage expectations',
  },
  {
    source: 'skills/agent-collaboration/SKILL.md',
    destination: '../.github/skills/agent-collaboration/SKILL.md',
    overwriteOnUpgrade: true,
    description: 'Multi-agent collaboration and handoff patterns',
  },
  {
    source: 'skills/crew/SKILL.md',
    destination: '../.github/skills/crew/SKILL.md',
    overwriteOnUpgrade: true,
    description: 'Crew command catalog — invokable via /crew slash command',
  },
  {
    source: 'skills/crew-version-check/SKILL.md',
    destination: '../.github/skills/crew-version-check/SKILL.md',
    overwriteOnUpgrade: true,
    description: 'Crew CLI internals — version stamping & upgrade mechanics',
  },
  {
    source: 'skills/crew-help/SKILL.md',
    destination: '../.github/skills/crew-help/SKILL.md',
    overwriteOnUpgrade: true,
    description: 'How to actually use Crew — agent vs skill vs slash command (#1297 redirect)',
  },
  {
    source: 'skills/cross-crew-communication/SKILL.md',
    destination: '../.github/skills/cross-crew-communication/SKILL.md',
    overwriteOnUpgrade: true,
    description: 'Cross-crew delegation — calling another crew as a sub-agent',
  },
  {
    source: 'skills/tiered-memory/SKILL.md',
    destination: '../.github/skills/tiered-memory/SKILL.md',
    overwriteOnUpgrade: true,
    description: 'Tiered-memory access patterns (hot/cold/wiki)',
  },
  {
    source: 'skills/iterative-retrieval/SKILL.md',
    destination: '../.github/skills/iterative-retrieval/SKILL.md',
    overwriteOnUpgrade: true,
    description: 'Iterative retrieval for long-running crew work',
  },
  {
    source: 'skills/reflect/SKILL.md',
    destination: '../.github/skills/reflect/SKILL.md',
    overwriteOnUpgrade: true,
    description: 'Reflection skill for capturing session learnings',
  },
  {
    source: 'skills/cross-crew/SKILL.md',
    destination: '../.github/skills/cross-crew/SKILL.md',
    overwriteOnUpgrade: true,
    description: 'Cross-crew discovery — finding peer crews via registry/upstream',
  },
  {
    source: 'skills/coordinator-source-of-truth/SKILL.md',
    destination: '../.github/skills/coordinator-source-of-truth/SKILL.md',
    overwriteOnUpgrade: true,
    description: 'Crew file-by-file source-of-truth hierarchy (extracted from crew.agent.md, #1308)',
  },
  {
    source: 'skills/coordinator-response-mode/SKILL.md',
    destination: '../.github/skills/coordinator-response-mode/SKILL.md',
    overwriteOnUpgrade: true,
    description: 'Response Mode Selection (Direct/Lightweight/Standard/Full) — full decision table + Lightweight spawn template',
  },
  {
    source: 'skills/coordinator-init-mode/SKILL.md',
    destination: '../.github/skills/coordinator-init-mode/SKILL.md',
    overwriteOnUpgrade: true,
    description: 'Init Mode two-phase protocol — propose team (Phase 1) then create .crew/ scaffolding (Phase 2)',
  },

  // Session init reference (crew-owned, coordinator reads at session start)
  {
    source: 'session-init-reference.md',
    destination: 'templates/session-init-reference.md',
    overwriteOnUpgrade: true,
    description: 'Session init reference — coordinator procedures run at session start',
  },
  
  // Workflows (crew-owned, overwrite on upgrade)
  {
    source: 'workflows/crew-ci.yml',
    destination: '../.github/workflows/crew-ci.yml',
    overwriteOnUpgrade: true,
    description: 'Crew CI workflow',
  },
  {
    source: 'workflows/crew-docs.yml',
    destination: '../.github/workflows/crew-docs.yml',
    overwriteOnUpgrade: true,
    description: 'Crew docs workflow',
  },
  {
    source: 'workflows/crew-heartbeat.yml',
    destination: '../.github/workflows/crew-heartbeat.yml',
    overwriteOnUpgrade: true,
    description: 'Crew heartbeat workflow',
  },
  {
    source: 'workflows/crew-insider-release.yml',
    destination: '../.github/workflows/crew-insider-release.yml',
    overwriteOnUpgrade: true,
    description: 'Crew insider release workflow',
  },
  {
    source: 'workflows/crew-issue-assign.yml',
    destination: '../.github/workflows/crew-issue-assign.yml',
    overwriteOnUpgrade: true,
    description: 'Crew issue auto-assignment workflow',
  },
  {
    source: 'workflows/crew-label-enforce.yml',
    destination: '../.github/workflows/crew-label-enforce.yml',
    overwriteOnUpgrade: true,
    description: 'Crew label enforcement workflow',
  },
  {
    source: 'workflows/crew-preview.yml',
    destination: '../.github/workflows/crew-preview.yml',
    overwriteOnUpgrade: true,
    description: 'Crew preview workflow',
  },
  {
    source: 'workflows/crew-promote.yml',
    destination: '../.github/workflows/crew-promote.yml',
    overwriteOnUpgrade: true,
    description: 'Crew promotion workflow',
  },
  {
    source: 'workflows/crew-release.yml',
    destination: '../.github/workflows/crew-release.yml',
    overwriteOnUpgrade: true,
    description: 'Crew release workflow',
  },
  {
    source: 'workflows/crew-triage.yml',
    destination: '../.github/workflows/crew-triage.yml',
    overwriteOnUpgrade: true,
    description: 'Crew issue triage workflow',
  },
  {
    source: 'workflows/sync-crew-labels.yml',
    destination: '../.github/workflows/sync-crew-labels.yml',
    overwriteOnUpgrade: true,
    description: 'Crew label sync workflow',
  },
];

/**
 * Get the templates directory path.
 * Walks up from the current file to find templates/ — works both
 * from compiled dist/cli/core/templates.js and from a bundled cli.js at the root.
 */
export function getTemplatesDir(): string {
  const currentFile = fileURLToPath(import.meta.url);
  let dir = dirname(currentFile);
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, 'templates');
    if (storage.existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('Templates directory not found — installation may be corrupted');
}
