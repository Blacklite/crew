/**
 * Crew Initialization Module (M2-6, PRD #98)
 *
 * Creates new Crew projects with typed configuration.
 * Generates crew.config.ts or crew.config.json with agent definitions.
 * Scaffolds directory structure, templates, workflows, and agent files.
 *
 * @module config/init
 */

import { join, dirname, relative as pathRelative, resolve as pathResolve } from 'path';
import { fileURLToPath } from 'url';
import type { StorageProvider } from '../storage/index.js';
import { FSStorageProvider } from '../storage/index.js';
import { execFileSync } from 'node:child_process';
import { MODELS } from '../runtime/constants.js';
import type { CrewConfig, ModelSelectionConfig, RoutingConfig } from '../runtime/config.js';
import type { SubCrewDefinition } from '../streams/types.js';
import { ENGINEERING_ROLE_IDS } from '../roles/catalog.js';
import { getRoleById } from '../roles/index.js';
import { ensureMemoryGovernanceDefaults } from '../memory/index.js';
import { addCrewStateGitignoreBlock, removeCrewStateGitignoreBlock } from './gitignore-state.js';

// ============================================================================
// Manifest-Curated Skills (must stay in sync with TEMPLATE_MANIFEST in CLI)
// ============================================================================

/**
 * The curated built-in skills shipped on init.
 * Only these skills are installed — not the full templates/skills/ directory.
 *
 * Drift policy: every entry MUST have a corresponding directory under
 * packages/crew-sdk/templates/skills/. The install loop (below) throws on
 * missing source dirs instead of silently skipping — see Blacklite/crew#1289
 * for the prior silent-skip bug that shipped two missing skills in v0.10.0.
 */
export const MANIFEST_SKILL_NAMES = [
  'crew-conventions',
  'error-recovery',
  'secret-handling',
  'git-workflow',
  'session-recovery',
  'reviewer-protocol',
  'test-discipline',
  'agent-collaboration',
  'crew',
  'crew-version-check',
  'crew-help',
  'cross-crew-communication',
  'tiered-memory',
  'iterative-retrieval',
  'reflect',
  'cross-crew',
  'coordinator-source-of-truth',
  'coordinator-response-mode',
  'coordinator-init-mode',
] as const;

// ============================================================================
// Template Resolution
// ============================================================================

/**
 * Get the SDK templates directory path.
 */
export function getSDKTemplatesDir(storage: StorageProvider = new FSStorageProvider()): string | null {
  // Use fileURLToPath for cross-platform compatibility (handles Windows drive letters, URL encoding)
  const currentDir = dirname(fileURLToPath(import.meta.url));

  // Try relative to this file (in dist/)
  const distPath = join(currentDir, '../../templates');
  if (storage.existsSync(distPath)) {
    return distPath;
  }

  // Try relative to package root (for dev)
  const pkgPath = join(currentDir, '../../../templates');
  if (storage.existsSync(pkgPath)) {
    return pkgPath;
  }

  return null;
}

/**
 * Copy a directory recursively.
 */
function copyRecursiveSync(src: string, dest: string, storage: StorageProvider = new FSStorageProvider()): void {
  if (!storage.existsSync(dest)) {
    storage.mkdirSync(dest, { recursive: true });
  }

  for (const entry of storage.isDirectorySync(src) ? storage.listSync(src) : []) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);

    if (storage.isDirectorySync(srcPath)) {
      copyRecursiveSync(srcPath, destPath, storage);
    } else {
      storage.copySync(srcPath, destPath);
    }
  }
}

// ============================================================================
// Initialization Types
// ============================================================================

/**
 * Agent specification for initialization.
 */
export interface InitAgentSpec {
  /** Agent name (kebab-case) */
  name: string;
  /** Agent role identifier */
  role: string;
  /** Display name (optional, defaults to titlecased name) */
  displayName?: string;
}

/**
 * Initialization options.
 */
export interface InitOptions {
  /** Root directory for Crew team files */
  teamRoot: string;
  /** Project name */
  projectName: string;
  /** Project description (optional) */
  projectDescription?: string;
  /** Agents to create */
  agents: InitAgentSpec[];
  /** Config format (typescript or json for old format, sdk for new builder syntax, markdown for no config file) */
  configFormat?: 'typescript' | 'json' | 'sdk' | 'markdown';
  /** User name for initial history entries */
  userName?: string;
  /** Skip files that already exist (default: true) */
  skipExisting?: boolean;
  /** Include GitHub workflows (default: true) */
  includeWorkflows?: boolean;
  /** Include .crew/templates/ copy (default: true) */
  includeTemplates?: boolean;
  /** Include sample MCP config (default: true) */
  includeMcpConfig?: boolean;
  /** Where to write sample MCP config (default: copilot-file when includeMcpConfig is true) */
  mcpConfigMode?: McpConfigMode;
  /** Project type for workflow customization */
  projectType?: 'node' | 'python' | 'go' | 'rust' | 'java' | 'csharp' | 'unknown';
  /** Version to stamp in crew.agent.md */
  version?: string;
  /** Project description prompt — stored for REPL auto-casting. */
  prompt?: string;
  /** If true, disable extraction from consult sessions (read-only consultations) */
  extractionDisabled?: boolean;
  /** Optional SubCrew definitions — generates .crew/workstreams.json when provided */
  streams?: SubCrewDefinition[];
  /** If true, use built-in base roles with useRole() in SDK config (default: false) */
  roles?: boolean;
  /** Root directory for the .github/agents/crew.agent.md file.
   *  Defaults to teamRoot. In monorepos, this should be the git root
   *  so Copilot can discover the agent file, while teamRoot stays in
   *  the subfolder where .crew/ lives. */
  agentFileRoot?: string;
  /** ADO work item configuration — used when platform is azure-devops */
  adoConfig?: {
    defaultWorkItemType?: string;
    areaPath?: string;
    iterationPath?: string;
  };
  /**
   * State backend to use for this project.
   * When 'orphan' or 'two-layer', adds a marker-delimited block to .gitignore
   * so .crew/decisions.md and .crew/agents/*\/history.md are not accidentally
   * staged into the working-tree commit graph.
   * When 'local' (or undefined), removes the marker block if present.
   */
  stateBackend?: 'local' | 'orphan' | 'two-layer' | 'external-stub' | string;
}

/**
 * Initialization result.
 */
export interface InitResult {
  /** List of created file paths (relative to teamRoot) */
  createdFiles: string[];
  /** List of skipped file paths (already existed) */
  skippedFiles: string[];
  /** Warnings for degraded operations (e.g. missing templates) */
  warnings?: string[];
  /** Configuration file path */
  configPath: string;
  /** Agent directory paths */
  agentDirs: string[];
  /** Path to crew.agent.md */
  agentFile: string;
  /** Path to .crew/ directory */
  crewDir: string;
}

// ============================================================================
// Default Agent Templates
// ============================================================================

/**
 * Default agent templates for common roles.
 */
const AGENT_TEMPLATES: Record<string, { displayName: string; description: string }> = {
  'lead': {
    displayName: 'Lead',
    description: 'Technical lead responsible for architecture, delegation, and project coordination.'
  },
  'developer': {
    displayName: 'Developer',
    description: 'Software developer focused on feature implementation and code quality.'
  },
  'tester': {
    displayName: 'Tester',
    description: 'Quality assurance specialist responsible for test coverage and validation.'
  },
  'scribe': {
    displayName: 'Scribe',
    description: 'Documentation specialist maintaining history, decisions, and technical records.'
  },
  'ralph': {
    displayName: 'Ralph',
    description: 'Persistent memory agent that maintains context across sessions.'
  },
  'Rai': {
    displayName: 'Rai',
    description: 'Responsible AI reviewer ensuring content safety, bias detection, and ethical standards.'
  },
  'fact-checker': {
    displayName: 'Fact Checker',
    description: 'Devil\'s advocate and verification agent — validates claims, detects hallucinations, and runs counter-hypotheses.'
  }
};

// ============================================================================
// Configuration Templates
// ============================================================================

/**
 * Format a readonly string array as a single-quoted TypeScript array literal.
 */
function formatModelArray(chain: readonly string[]): string {
  return `[${chain.map(m => `'${m}'`).join(', ')}]`;
}

/**
 * Generate TypeScript config file content.
 */
function generateTypeScriptConfig(options: InitOptions): string {
  const { projectName, projectDescription, agents } = options;

  return `import type { CrewConfig } from '@blacklite/crew';

/**
 * Crew Configuration for ${projectName}
 * ${projectDescription ? `\n * ${projectDescription}` : ''}
 */
const config: CrewConfig = {
  version: '1.0.0',

  models: {
    defaultModel: '${MODELS.DEFAULT}',
    defaultTier: 'standard',
    fallbackChains: {
      premium: ${formatModelArray(MODELS.FALLBACK_CHAINS.premium)},
      standard: ${formatModelArray(MODELS.FALLBACK_CHAINS.standard)},
      fast: ${formatModelArray(MODELS.FALLBACK_CHAINS.fast)}
    },
    preferSameProvider: true,
    respectTierCeiling: true,
    nuclearFallback: {
      enabled: false,
      model: '${MODELS.NUCLEAR_FALLBACK}',
      maxRetriesBeforeNuclear: ${MODELS.NUCLEAR_MAX_RETRIES}
    }
  },

  routing: {
    rules: [
      {
        workType: 'feature-dev',
        agents: ['@${agents[0]?.name || 'coordinator'}'],
        confidence: 'high'
      },
      {
        workType: 'bug-fix',
        agents: ['@${agents.find(a => a.role === 'developer')?.name || agents[0]?.name || 'coordinator'}'],
        confidence: 'high'
      },
      {
        workType: 'testing',
        agents: ['@${agents.find(a => a.role === 'tester')?.name || agents[0]?.name || 'coordinator'}'],
        confidence: 'high'
      },
      {
        workType: 'documentation',
        agents: ['@${agents.find(a => a.role === 'scribe')?.name || agents[0]?.name || 'coordinator'}'],
        confidence: 'high'
      }
    ],
    governance: {
      eagerByDefault: true,
      scribeAutoRuns: false,
      allowRecursiveSpawn: false
    }
  },

  casting: {
    allowlistUniverses: [
      'The Usual Suspects',
      'Breaking Bad',
      'The Wire',
      'Firefly'
    ],
    overflowStrategy: 'generic',
    universeCapacity: {}
  },

  platforms: {
    vscode: {
      disableModelSelection: false,
      scribeMode: 'sync'
    }
  }
};

export default config;
`;
}

/**
 * Generate JSON config file content.
 */
function generateJsonConfig(options: InitOptions): string {
  const { agents } = options;

  const config: CrewConfig = {
    version: '1.0.0',
    models: {
      defaultModel: MODELS.DEFAULT,
      defaultTier: 'standard',
      fallbackChains: {
        premium: [...MODELS.FALLBACK_CHAINS.premium],
        standard: [...MODELS.FALLBACK_CHAINS.standard],
        fast: [...MODELS.FALLBACK_CHAINS.fast]
      },
      preferSameProvider: true,
      respectTierCeiling: true,
      nuclearFallback: {
        enabled: false,
        model: MODELS.NUCLEAR_FALLBACK,
        maxRetriesBeforeNuclear: MODELS.NUCLEAR_MAX_RETRIES
      }
    },
    routing: {
      rules: [
        {
          workType: 'feature-dev',
          agents: [`@${agents[0]?.name || 'coordinator'}`],
          confidence: 'high'
        },
        {
          workType: 'bug-fix',
          agents: [`@${agents.find(a => a.role === 'developer')?.name || agents[0]?.name || 'coordinator'}`],
          confidence: 'high'
        },
        {
          workType: 'testing',
          agents: [`@${agents.find(a => a.role === 'tester')?.name || agents[0]?.name || 'coordinator'}`],
          confidence: 'high'
        },
        {
          workType: 'documentation',
          agents: [`@${agents.find(a => a.role === 'scribe')?.name || agents[0]?.name || 'coordinator'}`],
          confidence: 'high'
        }
      ],
      governance: {
        eagerByDefault: true,
        scribeAutoRuns: false,
        allowRecursiveSpawn: false
      }
    },
    casting: {
      allowlistUniverses: [
        'The Usual Suspects',
        'Breaking Bad',
        'The Wire',
        'Firefly'
      ],
      overflowStrategy: 'generic',
      universeCapacity: {}
    },
    platforms: {
      vscode: {
        disableModelSelection: false,
        scribeMode: 'sync'
      }
    }
  };

  return JSON.stringify(config, null, 2);
}

/**
 * Generate SDK builder config file content (new defineCrew() format).
 */
function generateSDKBuilderConfig(options: InitOptions): string {
  const { projectName, projectDescription, agents } = options;

  // Generate imports
  let code = `import {\n  defineCrew,\n  defineTeam,\n  defineAgent,\n} from '@blacklite/crew-sdk';\n\n`;

  code += `/**\n * Crew Configuration — ${projectName}\n`;
  if (projectDescription) {
    code += ` *\n * ${projectDescription}\n`;
  }
  code += ` */\n`;

  // Generate agent definitions
  for (const agent of agents) {
    const displayName = agent.displayName || titleCase(agent.name);
    code += `const ${agent.name} = defineAgent({\n`;
    code += `  name: '${agent.name}',\n`;
    code += `  role: '${agent.role}',\n`;
    code += `  description: '${displayName}',\n`;
    code += `  status: 'active',\n`;
    code += `});\n\n`;
  }

  // Generate crew config
  code += `export default defineCrew({\n`;
  code += `  version: '1.0.0',\n\n`;
  code += `  team: defineTeam({\n`;
  code += `    name: '${projectName}',\n`;
  if (projectDescription) {
    code += `    description: '${projectDescription.replace(/'/g, "\\'")}',\n`;
  }
  code += `    members: [${agents.map(a => `'${a.name}'`).join(', ')}],\n`;
  code += `  }),\n\n`;
  code += `  agents: [${agents.map(a => a.name).join(', ')}],\n`;
  code += `});\n`;

  return code;
}

/** Default starter roles used when --sdk --roles is specified. */
const SDK_ROLES_STARTER_TEAM = ['lead', 'backend', 'frontend', 'tester'];

/**
 * Generate SDK builder config using useRole() for base roles.
 *
 * Produces a crew.config.ts that imports useRole from the SDK and
 * references built-in base role definitions instead of plain
 * defineAgent() calls.
 */
function generateSDKBuilderConfigWithRoles(options: InitOptions): string {
  const { projectName, projectDescription, agents } = options;

  // Partition agents into base-role agents and non-role agents
  const roleAgents = agents.filter(a => getRoleById(a.role));
  const plainAgents = agents.filter(a => !getRoleById(a.role));

  // If caller didn't provide any base-role agents, generate a
  // starter team from the default set.
  const effectiveRoleAgents = roleAgents.length > 0
    ? roleAgents
    : SDK_ROLES_STARTER_TEAM.map(id => {
        const role = getRoleById(id)!;
        return { name: id, role: id, displayName: role.title };
      });

  const needsDefineAgent = plainAgents.length > 0;
  const needsUseRole = effectiveRoleAgents.length > 0;

  // Build import list
  const imports = ['defineCrew', 'defineTeam'];
  if (needsDefineAgent) imports.push('defineAgent');
  if (needsUseRole) imports.push('useRole');

  let code = `import {\n${imports.map(i => `  ${i},`).join('\n')}\n} from '@blacklite/crew-sdk';\n\n`;

  code += `/**\n * Crew Configuration — ${projectName}\n`;
  if (projectDescription) {
    code += ` *\n * ${projectDescription}\n`;
  }
  code += ` *\n * Uses built-in base roles from the role catalog.\n`;
  code += ` * Customize names and overrides for your project.\n`;
  code += ` */\n\n`;

  // Generate useRole() definitions
  for (const agent of effectiveRoleAgents) {
    const varName = agent.name.replace(/-/g, '_');
    code += `const ${varName} = useRole('${agent.role}', {\n`;
    code += `  name: '${agent.name}',\n`;
    code += `});\n\n`;
  }

  // Generate plain defineAgent() definitions (for system agents like scribe/ralph)
  for (const agent of plainAgents) {
    const displayName = agent.displayName || titleCase(agent.name);
    code += `const ${agent.name} = defineAgent({\n`;
    code += `  name: '${agent.name}',\n`;
    code += `  role: '${agent.role}',\n`;
    code += `  description: '${displayName}',\n`;
    code += `  status: 'active',\n`;
    code += `});\n\n`;
  }

  // All agent variable names in order
  const allVarNames = [
    ...effectiveRoleAgents.map(a => a.name.replace(/-/g, '_')),
    ...plainAgents.map(a => a.name),
  ];
  const allNames = [
    ...effectiveRoleAgents.map(a => `'${a.name}'`),
    ...plainAgents.map(a => `'${a.name}'`),
  ];

  code += `export default defineCrew({\n`;
  code += `  version: '1.0.0',\n\n`;
  code += `  team: defineTeam({\n`;
  code += `    name: '${projectName}',\n`;
  if (projectDescription) {
    code += `    description: '${projectDescription.replace(/'/g, "\\'")}',\n`;
  }
  code += `    members: [${allNames.join(', ')}],\n`;
  code += `  }),\n\n`;
  code += `  agents: [${allVarNames.join(', ')}],\n`;
  code += `});\n`;

  return code;
}

// ============================================================================
// Agent Template Generation
// ============================================================================

/**
 * Generate charter.md content for an agent.
 */
function generateCharter(agent: InitAgentSpec, projectName: string, projectDescription?: string): string {
  const template = AGENT_TEMPLATES[agent.role];
  const displayName = agent.displayName || template?.displayName || titleCase(agent.name);
  const description = template?.description || 'Team member focused on their assigned responsibilities.';

  return `# ${displayName} — ${titleCase(agent.role)}

${description}

## Project Context

**Project:** ${projectName}
${projectDescription ? `**Description:** ${projectDescription}\n` : ''}

## Responsibilities

- Collaborate with team members on assigned work
- Maintain code quality and project standards
- Document decisions and progress in history

## Work Style

- Read project context and team decisions before starting work
- Communicate clearly with team members
- Follow established patterns and conventions
`;
}

/**
 * Generate initial history.md content for an agent.
 */
function generateInitialHistory(
  agent: InitAgentSpec,
  projectName: string,
  projectDescription?: string,
  userName?: string
): string {
  const displayName = agent.displayName || AGENT_TEMPLATES[agent.role]?.displayName || titleCase(agent.name);
  const now = new Date().toISOString().split('T')[0];

  return `# Project Context

${userName ? `- **Owner:** ${userName}\n` : ''}- **Project:** ${projectName}
${projectDescription ? `- **Description:** ${projectDescription}\n` : ''}- **Created:** ${now}

## Core Context

Agent ${displayName} initialized and ready for work.

## Recent Updates

📌 Team initialized on ${now}

## Learnings

Initial setup complete.
`;
}

/**
 * Convert kebab-case or snake_case to Title Case.
 */
function titleCase(str: string): string {
  return str
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// ============================================================================
// Initialization Functions
// ============================================================================

/**
 * Stamp version into crew.agent.md content.
 * Replaces three locations: HTML comment, Identity Version line, and {version} placeholder.
 */
function stampVersionInContent(content: string, version: string): string {
  // HTML comment: <!-- version: X.Y.Z -->
  content = content.replace(
    /<!-- version: [^>]* -->/,
    `<!-- version: ${version} -->`
  );
  // Identity section: - **Version:** X.Y.Z
  content = content.replace(
    /- \*\*Version:\*\* [0-9.]+(?:-[a-z]+(?:\.\d+)?)?/m,
    `- **Version:** ${version}`
  );
  // Greeting placeholder: `Crew v{version}`
  content = content.replace(
    /`Crew v\{version\}`/g,
    `\`Crew v${version}\``
  );
  return content;
}

type McpConfigMode = 'copilot-file' | 'agent-frontmatter' | 'none';

interface McpServerSpec {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

function buildMcpServerSpecs(isGitHub: boolean, _cliVersion?: string): McpServerSpec[] {
  // The crew_state MCP server is launched via the on-PATH `crew` CLI
  // (`crew state-mcp`) — no npx bootstrap / version pinning.
  const servers: McpServerSpec[] = [
    {
      name: 'crew_state',
      command: 'crew',
      args: ['state-mcp'],
    },
  ];

  servers.push(isGitHub
    ? {
        name: 'EXAMPLE-github',
        command: 'npx',
        args: ['-y', '@anthropic/github-mcp-server'],
        env: { GITHUB_TOKEN: '${GITHUB_TOKEN}' },
      }
    : {
        name: 'EXAMPLE-azure-devops',
        command: 'npx',
        args: ['-y', '@azure/devops-mcp-server'],
        env: {
          AZURE_DEVOPS_ORG: '${AZURE_DEVOPS_ORG}',
          AZURE_DEVOPS_PAT: '${AZURE_DEVOPS_PAT}',
        },
      });

  return servers;
}

function buildMcpConfigJson(servers: McpServerSpec[]): Record<string, unknown> {
  return {
    mcpServers: Object.fromEntries(servers.map(({ name, ...server }) => [name, server])),
  };
}

function yamlSingleQuoted(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function yamlEnvValue(value: string): string {
  if (/^\$\{[A-Z0-9_]+\}$/.test(value)) {
    return value;
  }
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function buildMcpFrontmatterBlock(servers: McpServerSpec[]): string {
  const lines = ['mcp-servers:'];

  for (const server of servers) {
    lines.push(`  ${server.name}:`);
    lines.push('    type: local');
    lines.push(`    command: ${server.command}`);
    lines.push(`    args: [${server.args.map(yamlSingleQuoted).join(', ')}]`);
    lines.push('    tools: ["*"]');

    if (server.env && Object.keys(server.env).length > 0) {
      lines.push('    env:');
      for (const [key, value] of Object.entries(server.env)) {
        lines.push(`      ${key}: ${yamlEnvValue(value)}`);
      }
    }
  }

  return lines.join('\n');
}

function injectMcpFrontmatter(content: string, servers: McpServerSpec[]): string {
  const closingStart = content.indexOf('\n---', 4);
  if (!content.startsWith('---') || closingStart === -1) {
    return content;
  }

  return content.slice(0, closingStart)
    + '\n'
    + buildMcpFrontmatterBlock(servers)
    + content.slice(closingStart);
}

/**
 * Initialize a new Crew project.
 *
 * Creates:
 * - .crew/ directory structure (agents, casting, decisions, skills, identity, etc.)
 * - crew.config.ts or crew.config.json
 * - Agent directories with charter.md and history.md
 * - .gitattributes for merge drivers
 * - .gitignore entries for logs
 * - .github/agents/crew.agent.md
 * - .github/workflows/ (optional)
 * - .crew/templates/ (optional)
 * - .copilot/mcp-config.json (optional)
 * - Identity files (now.md, wisdom.md)
 * - ceremonies.md
 *
 * @param options - Initialization options
 * @returns Result with created file paths
 */

/**
 * Workflow files that are part of the Crew framework and should always be installed.
 * Other workflows in templates/workflows/ are generic CI/CD scaffolding and are opt-in.
 */
const FRAMEWORK_WORKFLOWS = [
  'crew-heartbeat.yml',
  'crew-issue-assign.yml',
  'crew-triage.yml',
  'crew-claude.yml',
  'sync-crew-labels.yml',
];

export async function initCrew(options: InitOptions, storage: StorageProvider = new FSStorageProvider()): Promise<InitResult> {
  const {
    teamRoot,
    projectName,
    projectDescription,
    agents,
    configFormat = 'typescript',
    userName,
    skipExisting = true,
    includeWorkflows = true,
    includeTemplates = true,
    includeMcpConfig = true,
    mcpConfigMode = includeMcpConfig ? 'copilot-file' : 'none',
    projectType = 'unknown',
    version = '0.0.0',
  } = options;

  const createdFiles: string[] = [];
  const skippedFiles: string[] = [];
  const warnings: string[] = [];
  const agentDirs: string[] = [];

  // Validate inputs
  if (!teamRoot) {
    throw new Error('teamRoot is required');
  }
  if (!projectName) {
    throw new Error('projectName is required');
  }
  if (!agents || agents.length === 0) {
    throw new Error('At least one agent is required');
  }

  // Get templates directory
  const templatesDir = getSDKTemplatesDir();

  // Helper to convert absolute path to relative
  const toRelativePath = (absolutePath: string): string => {
    // Use path.relative for correct cross-root handling (monorepo: agentFileRoot != teamRoot)
    const rel = pathRelative(teamRoot, absolutePath);
    // path.relative returns '' for same path, use '.' instead
    return rel || '.';
  };

  // Helper to write file (respects skipExisting)
  const writeIfNotExists = async (filePath: string, content: string): Promise<boolean> => {
    if (storage.existsSync(filePath) && skipExisting) {
      skippedFiles.push(toRelativePath(filePath));
      return false;
    }
    await storage.write(filePath, content);
    createdFiles.push(toRelativePath(filePath));
    return true;
  };

  // Helper to copy file (respects skipExisting)
  const copyIfNotExists = async (src: string, dest: string): Promise<boolean> => {
    if (storage.existsSync(dest) && skipExisting) {
      skippedFiles.push(toRelativePath(dest));
      return false;
    }
    await storage.mkdir(dirname(dest), { recursive: true });
    storage.copySync(src, dest);
    createdFiles.push(toRelativePath(dest));
    return true;
  };

  // -------------------------------------------------------------------------
  // Create .crew/ directory structure
  // -------------------------------------------------------------------------

  const crewDir = join(teamRoot, '.crew');
  const directories = [
    join(crewDir, 'agents'),
    join(crewDir, 'casting'),
    join(crewDir, 'decisions'),
    join(crewDir, 'decisions', 'inbox'),
    join(crewDir, 'memory'),
    join(teamRoot, '.github', 'skills'),
    join(crewDir, 'plugins'),
    join(crewDir, 'identity'),
    join(crewDir, 'orchestration-log'),
    join(crewDir, 'log'),
    join(crewDir, 'rai'),
    join(crewDir, '.scratch'),
  ];

  for (const dir of directories) {
    if (!storage.existsSync(dir)) {
      await storage.mkdir(dir, { recursive: true });
    }
  }

  for (const created of await ensureMemoryGovernanceDefaults(storage, teamRoot)) {
    createdFiles.push(created);
  }

  // -------------------------------------------------------------------------
  // Scaffold .crew/casting/ files (policy, registry, history)
  // -------------------------------------------------------------------------

  const castingDir = join(crewDir, 'casting');
  const castingFiles: Array<{ name: string; templateName: string; fallback: string }> = [
    { name: 'policy.json', templateName: 'casting-policy.json', fallback: JSON.stringify({ casting_policy_version: '1.1', allowlist_universes: [], universe_capacity: {} }, null, 2) + '\n' },
    { name: 'registry.json', templateName: 'casting-registry.json', fallback: JSON.stringify({ agents: {} }, null, 2) + '\n' },
    { name: 'history.json', templateName: 'casting-history.json', fallback: JSON.stringify({ universe_usage_history: [], assignment_cast_snapshots: {} }, null, 2) + '\n' },
  ];

  for (const cf of castingFiles) {
    const dest = join(castingDir, cf.name);
    if (!storage.existsSync(dest)) {
      // Try to copy from SDK templates first, fall back to inline defaults
      const templateSrc = templatesDir ? join(templatesDir, cf.templateName) : null;
      if (templateSrc && storage.existsSync(templateSrc)) {
        storage.copySync(templateSrc, dest);
      } else {
        await storage.write(dest, cf.fallback);
      }
      createdFiles.push(toRelativePath(dest));
    } else {
      skippedFiles.push(toRelativePath(dest));
    }
  }

  // -------------------------------------------------------------------------
  // Seed .crew/rai/ files (policy and audit trail)
  // -------------------------------------------------------------------------

  const raiDir = join(crewDir, 'rai');
  const raiPolicyPath = join(raiDir, 'policy.md');
  if (!storage.existsSync(raiPolicyPath)) {
    const templateSrc = templatesDir ? join(templatesDir, 'rai-policy.md') : null;
    if (templateSrc && storage.existsSync(templateSrc)) {
      storage.copySync(templateSrc, raiPolicyPath);
    } else {
      const raiPolicyFallback = `# RAI Policy

> Responsible AI policy for this project. Rai enforces these standards.

## Critical Violations (Always Blocked)

- Hardcoded credentials, API keys, tokens, passwords
- SQL injection, command injection, path traversal
- Harmful content (hate speech, violence, self-harm)
- Deceptive content (ungrounded claims, hallucinated citations)
- Instructions that bypass AI safety guidelines

## Advisory Concerns (Flagged, Not Blocked)

- PII in logs or responses
- Bias indicators in algorithms
- Exclusionary language
- Missing rate limiting on user-facing endpoints
- Insufficient input validation

## Terminology Standards

| Avoid | Prefer |
|-------|--------|
| whitelist/blacklist | allowlist/blocklist |
| master/slave | primary/replica |
| sanity check | validation, smoke test |
| dummy value | placeholder, sample |

## Opt-Out Model

- Cannot disable critical checks (credentials, harmful content, injection)
- Can disable advisory checks with justification logged to audit trail
- Temporary opt-down supported (auto re-enables after 30 days)
`;
      await storage.write(raiPolicyPath, raiPolicyFallback);
    }
    createdFiles.push(toRelativePath(raiPolicyPath));
  } else {
    skippedFiles.push(toRelativePath(raiPolicyPath));
  }

  const raiAuditTrailPath = join(raiDir, 'audit-trail.md');
  if (!storage.existsSync(raiAuditTrailPath)) {
    await storage.write(
      raiAuditTrailPath,
      '# RAI Audit Trail\n\n> Append-only evidence log. Entries are redacted — never contains raw secrets or harmful content.\n\n<!-- Rai appends findings below -->\n',
    );
    createdFiles.push(toRelativePath(raiAuditTrailPath));
  } else {
    skippedFiles.push(toRelativePath(raiAuditTrailPath));
  }

  // -------------------------------------------------------------------------
  // Seed .crew/fact-checker/ files (policy and audit trail)
  //
  // Mirrors the Rai pattern above. Fact Checker is an always-on built-in
  // (per Blacklite/crew#789 + #1254 — single agent, dual operating mode:
  // Verification + Devil's Advocate) and gets its own state dir so its
  // policy + audit trail are first-class artifacts the coordinator can
  // reference, not embedded inside the agent's charter file.
  //
  // See Blacklite/crew#1299 for the design rationale.
  // -------------------------------------------------------------------------

  const factCheckerDir = join(crewDir, 'fact-checker');
  const factCheckerPolicyPath = join(factCheckerDir, 'policy.md');
  if (!storage.existsSync(factCheckerPolicyPath)) {
    const templateSrc = templatesDir ? join(templatesDir, 'fact-checker-policy.md') : null;
    if (templateSrc && storage.existsSync(templateSrc)) {
      storage.copySync(templateSrc, factCheckerPolicyPath);
    } else {
      // Minimal fallback if the template was stripped from the install (e.g.,
      // pre-1299 crew-sdk). The full template at
      // .crew-templates/fact-checker-policy.md is the canonical source.
      const factCheckerPolicyFallback = `# Fact Checker Policy

> Verification & devil's-advocate methodology for this project.

## Verification Mode

Check claims about URLs, package names, API endpoints, file paths, function signatures, quoted text, and cross-references to team decisions. Issue one of:

- ✅ Verified — confirmed via source
- ⚠️ Unverified — plausible but could not confirm (flag, do not block)
- ❌ Contradicted — evidence contradicts the claim (**blocking** at Pre-Ship)
- 🔍 Needs Investigation — beyond current scope

## Devil's Advocate Mode

Produce briefs that include: steelman of the opposition, load-bearing assumptions, pre-mortem in 30 days, alternative approach, risk acceptance.

## Hard Rules

- Never cite a URL/package/API without verifying it exists
- Never invent measurement data or "production results"
- Never fabricate a counter-hypothesis
- Never block on opinion — only on ❌ Contradicted findings

## Audit Trail

All findings logged to \`.crew/fact-checker/audit-trail.md\` (append-only, succinct — verdict + citation, never raw source).
`;
      await storage.write(factCheckerPolicyPath, factCheckerPolicyFallback);
    }
    createdFiles.push(toRelativePath(factCheckerPolicyPath));
  } else {
    skippedFiles.push(toRelativePath(factCheckerPolicyPath));
  }

  const factCheckerAuditTrailPath = join(factCheckerDir, 'audit-trail.md');
  if (!storage.existsSync(factCheckerAuditTrailPath)) {
    await storage.write(
      factCheckerAuditTrailPath,
      '# Fact Checker Audit Trail\n\n> Append-only evidence log. Entries are succinct — verdict + citation, never raw source material.\n\n<!-- Fact Checker appends findings below -->\n',
    );
    createdFiles.push(toRelativePath(factCheckerAuditTrailPath));
  } else {
    skippedFiles.push(toRelativePath(factCheckerAuditTrailPath));
  }

  // -------------------------------------------------------------------------
  // Create .crew/config.json for crew settings
  // -------------------------------------------------------------------------

  const crewConfigPath = join(crewDir, 'config.json');
  if (!storage.existsSync(crewConfigPath)) {
    // Detect platform from git remote for config
    let detectedPlatform: string | undefined;
    try {
      const remoteUrl = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: teamRoot, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
      const remoteUrlLower = remoteUrl.toLowerCase();
      if (remoteUrlLower.includes('dev.azure.com') || remoteUrlLower.includes('visualstudio.com') || remoteUrlLower.includes('ssh.dev.azure.com')) {
        detectedPlatform = 'azure-devops';
      }
    } catch {
      // No git remote — skip platform detection
    }
    const crewConfig: Record<string, unknown> = {
      version: 1,
    };
    if (detectedPlatform) {
      crewConfig.platform = detectedPlatform;
    }
    if (detectedPlatform === 'azure-devops') {
      // ADO work item defaults — attempt to introspect the process template
      // to discover available work item types for the project.
      let introspectedTypes: string[] | undefined;
      try {
        const remoteUrl = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: teamRoot, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
        // Parse org/project from remote URL for introspection
        const httpsMatch = remoteUrl.match(/dev\.azure\.com\/([^/]+)\/([^/]+)\/_git/i);
        const sshMatch = remoteUrl.match(/ssh\.dev\.azure\.com:v3\/([^/]+)\/([^/]+)\//i);
        const vsMatch = remoteUrl.match(/([^/.]+)\.visualstudio\.com\/([^/]+)\/_git/i);
        const parsed = httpsMatch ?? sshMatch ?? vsMatch;
        if (parsed && parsed[1] && parsed[2]) {
          const { getAvailableWorkItemTypes } = await import('../platform/azure-devops.js');
          const types = getAvailableWorkItemTypes(parsed[1], parsed[2]);
          const enabled = types.filter((t) => !t.disabled).map((t) => t.name);
          if (enabled.length > 0) {
            introspectedTypes = enabled;
          }
        }
      } catch {
        // Introspection failed — skip and use commented-out defaults
      }

      // Build the ADO config section: explicit options > introspected > commented defaults
      const adoSection: Record<string, unknown> = {};
      if (options.adoConfig?.defaultWorkItemType) {
        adoSection.defaultWorkItemType = options.adoConfig.defaultWorkItemType;
      }
      if (options.adoConfig?.areaPath) {
        adoSection.areaPath = options.adoConfig.areaPath;
      }
      if (options.adoConfig?.iterationPath) {
        adoSection.iterationPath = options.adoConfig.iterationPath;
      }

      crewConfig.ado = adoSection;

      // If introspection found types, store them so the user knows what's available
      if (introspectedTypes?.length) {
        adoSection._availableTypes = introspectedTypes;
      }
    }
    // Only include extractionDisabled if explicitly set
    if (options.extractionDisabled) {
      crewConfig.extractionDisabled = true;
    }
    if (mcpConfigMode === 'agent-frontmatter') {
      crewConfig.mcpConfigMode = mcpConfigMode;
    }
    await storage.write(crewConfigPath, JSON.stringify(crewConfig, null, 2));
    createdFiles.push(toRelativePath(crewConfigPath));
  }

  // -------------------------------------------------------------------------
  // Create configuration file
  // -------------------------------------------------------------------------

  // When configFormat is 'markdown', skip config file generation entirely
  let configPath: string;
  if (configFormat !== 'markdown') {
    const configFileName = configFormat === 'sdk' ? 'crew.config.ts' :
                           configFormat === 'typescript' ? 'crew.config.ts' : 'crew.config.json';
    configPath = join(teamRoot, configFileName);
    const configContent = (configFormat === 'sdk' && options.roles) ? generateSDKBuilderConfigWithRoles(options) :
                          configFormat === 'sdk' ? generateSDKBuilderConfig(options) :
                          configFormat === 'typescript' ? generateTypeScriptConfig(options) :
                          generateJsonConfig(options);

    await writeIfNotExists(configPath, configContent);
  } else {
    // No config file for markdown-only mode
    configPath = '';
  }

  // -------------------------------------------------------------------------
  // Create agent directories and files
  // -------------------------------------------------------------------------

  const agentsDir = join(crewDir, 'agents');
  for (const agent of agents) {
    const agentDir = join(agentsDir, agent.name);
    agentDirs.push(agentDir);

    // Create charter.md
    //
    // Built-in always-on agents (Rai, fact-checker) ship with rich
    // charter templates at `templates/{role}-charter.md`. If a template
    // exists for this agent's role, use that instead of the generic
    // role-based stub — this gives the agent its full operating manual
    // (verdict protocol, audit-trail rules, dual-mode declarations) from
    // day one of `crew init`, matching the behavior of `crew upgrade`'s
    // `ensureBuiltinAgents` path. See Blacklite/crew#1299.
    const charterPath = join(agentDir, 'charter.md');
    let charterContent: string | null = null;
    if (templatesDir) {
      // Lookup priority: exact role / name first, then their lowercase
      // variants. This is needed because rich-charter files in `templates/`
      // are stored lowercase-hyphenated (`rai-charter.md`,
      // `fact-checker-charter.md`) while agent specs may use mixed case
      // (e.g. role/name = "Rai"). On case-sensitive filesystems (Linux CI)
      // the mixed-case lookup misses without the toLowerCase() fallback,
      // and the agent silently falls back to the 478-byte generic stub —
      // exactly the regression #1299 was fixing. Each candidate is only
      // added if non-empty to avoid `-charter.md` lookups from blank names.
      const seen = new Set<string>();
      const candidates: string[] = [];
      for (const key of [agent.role, agent.name, agent.role?.toLowerCase(), agent.name?.toLowerCase()]) {
        if (!key) continue;
        const filename = `${key}-charter.md`;
        if (seen.has(filename)) continue;
        seen.add(filename);
        candidates.push(join(templatesDir, filename));
      }
      for (const candidate of candidates) {
        if (storage.existsSync(candidate)) {
          charterContent = storage.readSync(candidate) ?? null;
          if (charterContent) break;
        }
      }
    }
    if (charterContent === null) {
      // Fall back to the generic role-based charter for user-defined agents
      // that don't have a rich template (everyone except Rai + fact-checker).
      charterContent = generateCharter(agent, projectName, projectDescription);
    }
    await writeIfNotExists(charterPath, charterContent);

    // Create history.md
    const historyPath = join(agentDir, 'history.md');
    const historyContent = generateInitialHistory(agent, projectName, projectDescription, userName);
    await writeIfNotExists(historyPath, historyContent);
  }

  // -------------------------------------------------------------------------
  // Create identity files (now.md, wisdom.md)
  // -------------------------------------------------------------------------

  const identityDir = join(crewDir, 'identity');
  const nowMdPath = join(identityDir, 'now.md');
  const wisdomMdPath = join(identityDir, 'wisdom.md');

  const nowContent = `---
updated_at: ${new Date().toISOString()}
focus_area: Initial setup
active_issues: []
---

# What We're Focused On

Getting started. Updated by coordinator at session start.
`;

  const wisdomContent = `---
last_updated: ${new Date().toISOString()}
---

# Team Wisdom

Reusable patterns and heuristics learned through work. NOT transcripts — each entry is a distilled, actionable insight.

## Patterns

<!-- Append entries below. Format: **Pattern:** description. **Context:** when it applies. -->
`;

  await writeIfNotExists(nowMdPath, nowContent);
  await writeIfNotExists(wisdomMdPath, wisdomContent);

  // -------------------------------------------------------------------------
  // Create ceremonies.md
  // -------------------------------------------------------------------------

  const ceremoniesDest = join(crewDir, 'ceremonies.md');
  if (templatesDir && storage.existsSync(join(templatesDir, 'ceremonies.md'))) {
    await copyIfNotExists(join(templatesDir, 'ceremonies.md'), ceremoniesDest);
  }

  // -------------------------------------------------------------------------
  // Create decisions.md (canonical location at crew root)
  // -------------------------------------------------------------------------

  const decisionsPath = join(crewDir, 'decisions.md');
  const decisionsContent = `# Crew Decisions

## Active Decisions

No decisions recorded yet.

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
`;

  await writeIfNotExists(decisionsPath, decisionsContent);

  // -------------------------------------------------------------------------
  // Create team.md (required by shell lifecycle)
  // -------------------------------------------------------------------------

  const teamPath = join(crewDir, 'team.md');
  const teamContent = `# Crew Team

> ${projectDescription || projectName}

## Coordinator

| Name | Role | Notes |
|------|------|-------|
| Crew | Coordinator | Routes work, enforces handoffs and reviewer gates. |

## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|

## Project Context

- **Project:** ${projectName}
${projectDescription ? `- **Description:** ${projectDescription}\n` : ''}- **Created:** ${new Date().toISOString().split('T')[0]}
`;

  await writeIfNotExists(teamPath, teamContent);

  // -------------------------------------------------------------------------
  // Create routing.md
  // -------------------------------------------------------------------------

  const routingPath = join(crewDir, 'routing.md');
  if (templatesDir && storage.existsSync(join(templatesDir, 'routing.md'))) {
    await copyIfNotExists(join(templatesDir, 'routing.md'), routingPath);
  } else {
    const routingContent = `# Crew Routing

## Work Type Rules

| Work Type | Primary Agent | Fallback |
|-----------|---------------|----------|

## Governance

- Route based on work type and agent expertise
- Update this file as team capabilities evolve
`;
    await writeIfNotExists(routingPath, routingContent);
  }

  // -------------------------------------------------------------------------
  // Copy starter skills
  //
  // Skills live at `.github/skills/{name}/SKILL.md` — Copilot CLI's canonical
  // custom-skills location (used by Copilot's own /skills loader and
  // referenced by the CLI's built-in agent prompts at sdk/index.js:2246,
  // 2252, 2595). Earlier versions of Crew installed to `.copilot/skills/`;
  // `crew upgrade` migrates any leftover manifest skills to the new
  // location (see upgrade.ts).
  //
  // Blacklite/crew#1126 (canonical issue; PR #1304) — adopt the canonical
  // .github/skills/ path.
  // -------------------------------------------------------------------------

  const skillsDir = join(teamRoot, '.github', 'skills');
  if (templatesDir && storage.existsSync(join(templatesDir, 'skills'))) {
    const skillsSrc = join(templatesDir, 'skills');
    const existingSkills = storage.existsSync(skillsDir) ? storage.listSync(skillsDir) : [];
    if (existingSkills.length === 0) {
      // Pre-check drift BEFORE writing any skill file so a manifest/template
      // mismatch fails atomically with no partial install left on disk. The
      // earlier shape ran the copy loop first and threw at the end — users
      // saw 8 of 10 skills appear, then an error, with no clean rollback.
      const missing: string[] = [];
      for (const skillName of MANIFEST_SKILL_NAMES) {
        if (!storage.existsSync(join(skillsSrc, skillName))) {
          missing.push(skillName);
        }
      }
      if (missing.length > 0) {
        // Manifest/templates drift — fail loudly so v0.10.0-style silent-skip
        // regressions (#1289) cannot reach users. End-users see this when an
        // installed @blacklite/crew-sdk ships with its templates dir
        // missing skills the SDK code knows about — almost always a packaging
        // bug. The fix is to upgrade to a non-broken SDK version
        // (`crew upgrade`); the dev-facing sync-skill-templates.mjs script
        // is referenced only as the contributor-side root cause.
        throw new Error(
          `Skill template drift in installed @blacklite/crew-sdk: ` +
          `MANIFEST_SKILL_NAMES references ${missing.length} skill(s) ` +
          `missing from the SDK templates dir (${skillsSrc}): ${missing.join(', ')}. ` +
          `This is a packaging bug — try \`crew upgrade\` or reinstall the SDK; ` +
          `if it persists, please report it at https://github.com/Blacklite/crew/issues. ` +
          `(Contributors: re-run \`node scripts/sync-skill-templates.mjs\` from the repo root before packaging.)`
        );
      }
      storage.mkdirSync(skillsDir, { recursive: true });
      for (const skillName of MANIFEST_SKILL_NAMES) {
        const srcSkill = join(skillsSrc, skillName);
        copyRecursiveSync(srcSkill, join(skillsDir, skillName), storage);
      }
      createdFiles.push('.github/skills');
    }
  }

  // -------------------------------------------------------------------------
  // Claude Code harness support — mirror skills into .claude/skills/
  //
  // Crew is dual-harness: the same team runs under GitHub Copilot or under
  // Claude Code. Claude Code discovers project skills at `.claude/skills/`
  // (invoked via /<skill-name>), so the manifest skills are mirrored there.
  // `.mcp.json` (written below/by the CLI) is auto-loaded by BOTH harnesses,
  // so crew state tools work identically.
  // -------------------------------------------------------------------------

  const claudeSkillsDir = join(teamRoot, '.claude', 'skills');
  if (templatesDir && storage.existsSync(join(templatesDir, 'skills'))) {
    const skillsSrc = join(templatesDir, 'skills');
    const existingClaudeSkills = storage.existsSync(claudeSkillsDir) ? storage.listSync(claudeSkillsDir) : [];
    if (existingClaudeSkills.length === 0) {
      storage.mkdirSync(claudeSkillsDir, { recursive: true });
      for (const skillName of MANIFEST_SKILL_NAMES) {
        const srcSkill = join(skillsSrc, skillName);
        if (storage.existsSync(srcSkill)) {
          copyRecursiveSync(srcSkill, join(claudeSkillsDir, skillName), storage);
        }
      }
      createdFiles.push('.claude/skills');
    }
  }

  // -------------------------------------------------------------------------
  // Claude Code harness support — .claude/agents/crew.md
  //
  // The Copilot side exposes the coordinator as a custom agent
  // (.github/agents/crew.agent.md, `copilot --agent crew`). The Claude Code
  // equivalent is a project subagent at .claude/agents/crew.md; it adopts the
  // same coordinator protocol file so there is a single source of truth.
  // -------------------------------------------------------------------------

  const claudeAgentFile = join(teamRoot, '.claude', 'agents', 'crew.md');
  if (!storage.existsSync(claudeAgentFile) || !skipExisting) {
    const claudeAgentContent = `---
name: crew
description: >-
  Crew coordinator — your AI team. Use this agent to orchestrate the project's
  multi-agent team: routing work to specialist agents, enforcing reviewer
  gates, and logging decisions. Invoke for any request that should be handled
  by the team ("crew, build X", triage, standup, roster changes).
---

You are **Crew (Coordinator)** for this repository.

Load and follow the full coordinator protocol in \`.github/agents/crew.agent.md\`
(the canonical protocol file shared with the GitHub Copilot harness). Apply
these Claude Code–specific adjustments:

- **Dispatch mechanism:** you are running in Claude Code. Spawn team members
  with the \`Task\` (Agent) tool — one Task per specialist, parallel where the
  protocol calls for fan-out. Pass the agent's charter (from
  \`.crew/agents/{name}/charter.md\`) plus TEAM_ROOT, CURRENT_DATETIME, and the
  task in the Task prompt. Do not use \`create_session\` or \`runSubagent\`;
  they do not exist here.
- **Skills:** the protocol's \`skill\` tool calls map to Claude Code skills in
  \`.claude/skills/\` (e.g. invoke \`coordinator-init-mode\` via the Skill tool).
- **State tools:** \`crew_state\`/\`crew_state\` MCP tools load from the repo's
  \`.mcp.json\`, which Claude Code reads automatically. If the tools are not
  available, follow the protocol's state-backend handshake halt rules.
- **User input:** where the protocol says \`ask_user\`, use the AskUserQuestion
  tool when available; otherwise ask in plain text and wait.
`;
    await storage.write(claudeAgentFile, claudeAgentContent);
    createdFiles.push(toRelativePath(claudeAgentFile));
  } else {
    skippedFiles.push(toRelativePath(claudeAgentFile));
  }

  // -------------------------------------------------------------------------
  // Claude Code harness support — CLAUDE.md pointer (marker-delimited block)
  // -------------------------------------------------------------------------

  const claudeMdPath = join(teamRoot, 'CLAUDE.md');
  const crewBlockStart = '<!-- crew:begin -->';
  const crewBlockEnd = '<!-- crew:end -->';
  const crewBlock = `${crewBlockStart}
## Crew — your AI team

This repository is managed by Crew, a multi-agent team runtime that works with
both Claude Code and GitHub Copilot.

- **Coordinator agent:** \`.claude/agents/crew.md\` (protocol source:
  \`.github/agents/crew.agent.md\`). For team work — building features,
  triage, standups, roster changes — act as (or delegate to) the crew
  coordinator rather than working solo.
- **Command catalog:** invoke the \`crew\` skill (/crew) for the interactive
  command menu.
- **Team state:** lives in \`.crew/\` (roster: \`team.md\`, decisions:
  \`decisions.md\`, per-agent charters under \`agents/\`). Respect the
  state-backend rules in the coordinator protocol before writing there.
- **MCP tools:** \`.mcp.json\` at the repo root exposes crew's state tools;
  Claude Code loads it automatically.
${crewBlockEnd}
`;

  let claudeMdContent = storage.existsSync(claudeMdPath) ? (storage.readSync(claudeMdPath) ?? '') : '';
  if (!claudeMdContent.includes(crewBlockStart)) {
    const sep = claudeMdContent && !claudeMdContent.endsWith('\n') ? '\n\n' : claudeMdContent ? '\n' : '';
    await storage.write(claudeMdPath, claudeMdContent + sep + crewBlock);
    createdFiles.push(toRelativePath(claudeMdPath));
  } else {
    skippedFiles.push(toRelativePath(claudeMdPath));
  }

  // -------------------------------------------------------------------------
  // Create .gitattributes for merge drivers
  // Append-only mutable state files use union merge to handle concurrent appends.
  // Note: .crew/casting/* files are identity (not mutable) so they don't need
  // union merge and are NOT listed here.
  // -------------------------------------------------------------------------

  const gitattributesPath = join(teamRoot, '.gitattributes');
  const unionRules = [
    '.crew/decisions.md merge=union',
    '.crew/agents/*/history.md merge=union',
    '.crew/log/** merge=union',
    '.crew/orchestration-log/** merge=union',
    '.crew/rai/audit-trail.md merge=union',
    '.crew/fact-checker/audit-trail.md merge=union',
  ];

  let existingAttrs = '';
  if (storage.existsSync(gitattributesPath)) {
    existingAttrs = storage.readSync(gitattributesPath) ?? '';
  }

  const missingRules = unionRules.filter(rule => !existingAttrs.includes(rule));
  if (missingRules.length > 0) {
    const block = (existingAttrs && !existingAttrs.endsWith('\n') ? '\n' : '')
      + '# Crew: union merge for append-only team state files\n'
      + missingRules.join('\n') + '\n';
    await storage.append(gitattributesPath, block);
    createdFiles.push(toRelativePath(gitattributesPath));
  }

  // -------------------------------------------------------------------------
  // Create .gitignore entries for runtime state (logs, inbox, sessions)
  // These paths are written during normal crew operation but should not be
  // committed to version control (they are runtime state).
  //
  // Note: .crew/casting/* is AUTHORITATIVE IDENTITY (team-defined agent
  // universe, persistent name registry, history). It belongs on 'main', not
  // on the crew-state orphan branch. Do NOT add casting/* to ignoreEntries.
  // -------------------------------------------------------------------------

  const gitignorePath = join(teamRoot, '.gitignore');
  const ignoreEntries = [
    '.crew/orchestration-log/',
    '.crew/log/',
    '.crew/decisions/inbox/',
    '.crew/sessions/',
    '.crew/.scratch/',
    '.crew/.cache/',
  ];

  let existingIgnore = '';
  if (storage.existsSync(gitignorePath)) {
    existingIgnore = storage.readSync(gitignorePath) ?? '';
  }

  const missingIgnore = ignoreEntries.filter(entry => !existingIgnore.includes(entry));
  if (missingIgnore.length > 0) {
    const block = (existingIgnore && !existingIgnore.endsWith('\n') ? '\n' : '')
      + '# Crew: ignore runtime state (logs, inbox, sessions)\n'
      + '# Note: .crew/casting/* is identity and MUST be committed to main, not ignored\n'
      + missingIgnore.join('\n') + '\n';
    await storage.append(gitignorePath, block);
    createdFiles.push(toRelativePath(gitignorePath));
  }

  // -------------------------------------------------------------------------
  // Conditionally add/remove crew-state .gitignore block
  // When stateBackend is 'orphan' or 'two-layer', .crew/decisions.md and
  // .crew/agents/*/history.md are owned by the crew-state branch — add a
  // marker-delimited block so `git add .` cannot accidentally stage them.
  // When stateBackend is 'local' (or undefined), remove the block if present.
  // -------------------------------------------------------------------------

  if (options.stateBackend === 'orphan' || options.stateBackend === 'two-layer') {
    addCrewStateGitignoreBlock(gitignorePath, storage);
  } else {
    removeCrewStateGitignoreBlock(gitignorePath, storage);
  }

  let isGitHub = true;
  try {
    const remoteUrl = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: teamRoot, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    const remoteUrlLower = remoteUrl.toLowerCase();
    if (remoteUrlLower.includes('dev.azure.com') || remoteUrlLower.includes('visualstudio.com') || remoteUrlLower.includes('ssh.dev.azure.com')) {
      isGitHub = false;
    }
  } catch {
    // No git remote — assume GitHub (default)
  }

  const mcpServers = buildMcpServerSpecs(isGitHub, version);

  // -------------------------------------------------------------------------
  // Create .github/agents/crew.agent.md
  // -------------------------------------------------------------------------

  const agentFile = join(options.agentFileRoot ?? teamRoot, '.github', 'agents', 'crew.agent.md');
  if (!storage.existsSync(agentFile) || !skipExisting) {
    if (templatesDir && storage.existsSync(join(templatesDir, 'crew.agent.md.template'))) {
      let agentContent = storage.readSync(join(templatesDir, 'crew.agent.md.template')) ?? '';
      if (mcpConfigMode === 'agent-frontmatter') {
        agentContent = injectMcpFrontmatter(agentContent, mcpServers);
      }
      agentContent = stampVersionInContent(agentContent, version);
      await storage.write(agentFile, agentContent);
      createdFiles.push(toRelativePath(agentFile));
    } else {
      warnings.push(`crew.agent.md template not found (${join(templatesDir || '.crew/templates', 'crew.agent.md.template')}) — Copilot agent file was not created or not refreshed`);
    }
  } else {
    skippedFiles.push(toRelativePath(agentFile));
  }

  // -------------------------------------------------------------------------
  // Copy .crew/templates/ (optional)
  // -------------------------------------------------------------------------

  if (includeTemplates && templatesDir) {
    const templatesDest = join(teamRoot, '.crew', 'templates');
    if (!storage.existsSync(templatesDest)) {
      copyRecursiveSync(templatesDir, templatesDest, storage);
      createdFiles.push(toRelativePath(templatesDest));
    } else {
      skippedFiles.push(toRelativePath(templatesDest));
    }
  }

  // -------------------------------------------------------------------------
  // Copy workflows (optional) — skip for ADO repos
  // -------------------------------------------------------------------------

  if (includeWorkflows && isGitHub && templatesDir && storage.existsSync(join(templatesDir, 'workflows'))) {
    // In monorepo mode (agentFileRoot != teamRoot), skip workflow placement.
    // GitHub Actions only reads from <repo-root>/.github/workflows/ — placing
    // workflows in a subfolder has no effect. Multiple crews in one monorepo
    // would also conflict on the same workflow files. (#939)
    const isMonorepoSubfolder = !!options.agentFileRoot &&
      pathResolve(options.agentFileRoot).toLowerCase() !== pathResolve(teamRoot).toLowerCase();
    if (isMonorepoSubfolder) {
      warnings.push('Skipped GitHub Actions workflows in monorepo-subfolder mode — workflows must be at the git root. Set up workflows manually or use a single shared workflow for all crews.');
    } else {
    const workflowsSrc = join(templatesDir, 'workflows');
    const workflowsDest = join(teamRoot, '.github', 'workflows');

    if (storage.isDirectorySync(workflowsSrc)) {
      const allWorkflowFiles = storage.listSync(workflowsSrc).filter(f => f.endsWith('.yml'));
      const workflowFiles = allWorkflowFiles.filter(f => FRAMEWORK_WORKFLOWS.includes(f));
      await storage.mkdir(workflowsDest, { recursive: true });

      for (const file of workflowFiles) {
        const destFile = join(workflowsDest, file);
        if (!storage.existsSync(destFile) || !skipExisting) {
          storage.copySync(join(workflowsSrc, file), destFile);
          createdFiles.push(toRelativePath(destFile));
        } else {
          skippedFiles.push(toRelativePath(destFile));
        }
      }
    }
    }
  }

  // -------------------------------------------------------------------------
  // Create sample MCP config (optional)
  // -------------------------------------------------------------------------

  if (mcpConfigMode === 'copilot-file') {
    const mcpConfigPath = join(teamRoot, '.copilot', 'mcp-config.json');
    if (!storage.existsSync(mcpConfigPath)) {
      const mcpSample = buildMcpConfigJson(mcpServers);
      await storage.write(mcpConfigPath, JSON.stringify(mcpSample, null, 2) + '\n');
      createdFiles.push(toRelativePath(mcpConfigPath));
    } else {
      skippedFiles.push(toRelativePath(mcpConfigPath));
    }
  }

  // -------------------------------------------------------------------------
  // Generate .crew/workstreams.json (when SubCrews provided)
  // -------------------------------------------------------------------------

  if (options.streams && options.streams.length > 0) {
    const subcrewsConfig = {
      workstreams: options.streams,
      defaultWorkflow: 'branch-per-issue',
    };
    const workstreamsPath = join(crewDir, 'workstreams.json');
    await writeIfNotExists(workstreamsPath, JSON.stringify(subcrewsConfig, null, 2) + '\n');
  }

  // -------------------------------------------------------------------------
  // Add .crew-workstream to .gitignore (SubCrew activation file)
  // -------------------------------------------------------------------------

  {
    const workstreamIgnoreEntry = '.crew-workstream';
    let currentIgnore = '';
    if (storage.existsSync(gitignorePath)) {
      currentIgnore = storage.readSync(gitignorePath) ?? '';
    }
    if (!currentIgnore.includes(workstreamIgnoreEntry)) {
      const block = (currentIgnore && !currentIgnore.endsWith('\n') ? '\n' : '')
        + '# Crew: SubCrew activation file (local to this machine)\n'
        + workstreamIgnoreEntry + '\n';
      await storage.append(gitignorePath, block);
      createdFiles.push(toRelativePath(gitignorePath));
    }
  }

  // -------------------------------------------------------------------------
  // Create .first-run marker
  // -------------------------------------------------------------------------

  const firstRunMarker = join(crewDir, '.first-run');
  if (!storage.existsSync(firstRunMarker)) {
    await storage.write(firstRunMarker, new Date().toISOString() + '\n');
    createdFiles.push(toRelativePath(firstRunMarker));
  }

  // -------------------------------------------------------------------------
  // Store init prompt for REPL auto-casting
  // -------------------------------------------------------------------------

  if (options.prompt) {
    const promptFile = join(crewDir, '.init-prompt');
    await storage.write(promptFile, options.prompt);
    createdFiles.push(toRelativePath(promptFile));
  }

  return {
    createdFiles,
    skippedFiles,
    warnings,
    configPath,
    agentDirs,
    agentFile,
    crewDir,
  };
}

/**
 * Clean up orphan .init-prompt file.
 * Called by CLI on Ctrl+C abort to remove partial state.
 *
 * @param crewDir - Path to the .crew directory
 */
export async function cleanupOrphanInitPrompt(crewDir: string, storage: StorageProvider = new FSStorageProvider()): Promise<void> {
  const promptFile = join(crewDir, '.init-prompt');
  if (storage.existsSync(promptFile)) {
    await storage.delete(promptFile);
  }
}
