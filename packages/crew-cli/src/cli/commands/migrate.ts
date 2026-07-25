/**
 * Crew Migrate Command — converts between markdown-only and SDK-First formats
 * @module cli/commands/migrate
 */

import path from 'node:path';
import { FSStorageProvider } from '@blacklite/crew-sdk';

const storage = new FSStorageProvider();
import { success, warn, dim, bold, BOLD, RESET, DIM } from '../core/output.js';
import { fatal, CrewError } from '../core/errors.js';
import { migrateDirectory } from '../core/migrate-directory.js';
import type {
  AgentDefinition,
  TeamDefinition,
  RoutingDefinition,
  CastingDefinition,
} from '@blacklite/crew-sdk';

export interface MigrateOptions {
  to?: 'sdk' | 'markdown';
  from?: 'ai-team';
  dryRun?: boolean;
}

interface ParsedTeam {
  name: string;
  description: string;
  projectContext: string;
  members: string[];
}

interface ParsedAgent {
  name: string;
  role: string;
  charter: string;
  status: 'active' | 'inactive' | 'retired';
}

interface ParsedRoutingRule {
  pattern: string;
  agents: string[];
  description?: string;
}

interface ParsedCasting {
  allowlistUniverses: string[];
  overflowStrategy: 'reject' | 'generic' | 'rotate';
  capacity?: Record<string, number>;
}

/**
 * Detect current crew mode
 */
function detectMode(cwd: string): 'sdk' | 'markdown' | 'legacy' | 'none' {
  const hasConfigTs = storage.existsSync(path.join(cwd, 'crew.config.ts'));
  const hasConfigJs = storage.existsSync(path.join(cwd, 'crew.config.js'));
  const hasCrewDir = storage.existsSync(path.join(cwd, '.crew'));
  const hasAiTeamDir = storage.existsSync(path.join(cwd, '.ai-team'));

  if (hasConfigTs || hasConfigJs) return 'sdk';
  if (hasCrewDir) return 'markdown';
  if (hasAiTeamDir) return 'legacy';
  return 'none';
}

/**
 * Parse team.md
 */
function parseTeamMd(crewDir: string): ParsedTeam {
  const teamPath = path.join(crewDir, 'team.md');
  if (!storage.existsSync(teamPath)) {
    fatal('No .crew/team.md found — cannot migrate');
  }

  const content = storage.readSync(teamPath) ?? '';
  const lines = content.split('\n');

  let name = 'untitled-crew';
  let description = '';
  let projectContext = '';
  const members: string[] = [];

  // Parse header (first h1 after front matter)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.startsWith('# Crew Team')) {
      const match = line.match(/# Crew Team — (.+)/);
      if (match) name = match[1]!;
      break;
    }
  }

  // Parse description (blockquote after header)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.startsWith('> ')) {
      description = line.slice(2).trim();
      break;
    }
  }

  // Parse ## Members table
  let inMembersTable = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    
    if (line.startsWith('## Members')) {
      inMembersTable = true;
      continue;
    }
    
    if (inMembersTable && line.startsWith('##')) {
      inMembersTable = false;
      break;
    }
    
    if (inMembersTable && line.startsWith('|') && !line.includes('---') && !line.includes('Name')) {
      const cells = line.split('|').map(s => s.trim()).filter(Boolean);
      if (cells.length >= 4) {
        const memberName = cells[0]!.toLowerCase();
        const status = cells[3]!;
        // Only include active members
        if (status.includes('Active') || status.includes('✅')) {
          members.push(memberName);
        }
      }
    }
  }

  // Parse ## Project Context
  let inProjectContext = false;
  const contextLines: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    
    if (line.startsWith('## Project Context')) {
      inProjectContext = true;
      continue;
    }
    
    if (inProjectContext && line.startsWith('##')) {
      break;
    }
    
    if (inProjectContext && line.trim()) {
      contextLines.push(line);
    }
  }
  projectContext = contextLines.join('\n');

  return { name, description, projectContext, members };
}

/**
 * Parse routing.md
 */
function parseRoutingMd(crewDir: string): { rules: ParsedRoutingRule[]; defaultAgent: string } {
  const routingPath = path.join(crewDir, 'routing.md');
  if (!storage.existsSync(routingPath)) {
    return { rules: [], defaultAgent: '@coordinator' };
  }

  const content = storage.readSync(routingPath) ?? '';
  const lines = content.split('\n');
  const rules: ParsedRoutingRule[] = [];

  let inWorkTypeTable = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    
    if (line.startsWith('## Work Type')) {
      inWorkTypeTable = true;
      continue;
    }
    
    if (inWorkTypeTable && line.startsWith('##')) {
      break;
    }
    
    if (inWorkTypeTable && line.startsWith('|') && !line.includes('---') && !line.includes('Work Type')) {
      const cells = line.split('|').map(s => s.trim()).filter(Boolean);
      if (cells.length >= 3) {
        const workType = cells[0]!;
        const agentCell = cells[1]!;
        const examples = cells[2]!;
        
        // Extract agent name (remove emoji)
        const agentMatch = agentCell.match(/^(\w+)/);
        if (agentMatch) {
          const agentName = agentMatch[1]!.toLowerCase();
          const pattern = workType.toLowerCase().replace(/\s+/g, '-').replace(/&/g, '');
          
          rules.push({
            pattern,
            agents: [`@${agentName}`],
            description: examples,
          });
        }
      }
    }
  }

  return { rules, defaultAgent: '@coordinator' };
}

/**
 * Parse agent charter metadata
 */
function parseAgentCharter(crewDir: string, agentName: string): ParsedAgent {
  const charterPath = path.join(crewDir, 'agents', agentName, 'charter.md');
  const role = agentName.charAt(0).toUpperCase() + agentName.slice(1);
  
  if (!storage.existsSync(charterPath)) {
    return {
      name: agentName,
      role,
      charter: `.crew/agents/${agentName}/charter.md`,
      status: 'active',
    };
  }

  const content = storage.readSync(charterPath) ?? '';
  const lines = content.split('\n');
  
  let parsedRole = role;
  
  // Parse first h1 for role (e.g., "# Edie — TypeScript Engineer")
  for (const line of lines) {
    if (line.startsWith('# ')) {
      const match = line.match(/# \w+ — (.+)/);
      if (match) {
        parsedRole = match[1]!;
        break;
      }
    }
  }

  return {
    name: agentName,
    role: parsedRole,
    charter: `.crew/agents/${agentName}/charter.md`,
    status: 'active',
  };
}

/**
 * Parse casting/policy.json
 */
function parseCastingPolicy(crewDir: string): ParsedCasting | undefined {
  const policyPath = path.join(crewDir, 'casting', 'policy.json');
  if (!storage.existsSync(policyPath)) {
    return undefined;
  }

  try {
    const content = storage.readSync(policyPath) ?? '';
    const policy = JSON.parse(content) as {
      allowlist_universes?: string[];
      universe_capacity?: Record<string, number>;
    };

    return {
      allowlistUniverses: policy.allowlist_universes ?? [],
      overflowStrategy: 'generic',
      capacity: policy.universe_capacity,
    };
  } catch {
    warn('Failed to parse casting/policy.json — skipping casting config');
    return undefined;
  }
}

/**
 * Generate crew.config.ts content
 */
function generateCrewConfig(
  team: ParsedTeam,
  agents: ParsedAgent[],
  routing: { rules: ParsedRoutingRule[]; defaultAgent: string },
  casting?: ParsedCasting,
): string {
  const lines: string[] = [];
  
  lines.push("import {");
  lines.push("  defineCrew,");
  lines.push("  defineTeam,");
  lines.push("  defineAgent,");
  lines.push("  defineRouting,");
  if (casting) {
    lines.push("  defineCasting,");
  }
  lines.push("} from '@blacklite/crew-sdk';");
  lines.push("");
  lines.push("/**");
  lines.push(" * Crew Configuration");
  lines.push(" *");
  lines.push(" * Migrated from .crew/ markdown to SDK-first builder syntax.");
  lines.push(" * Run `crew build` to regenerate .crew/*.md from this file.");
  lines.push(" */");
  lines.push("export default defineCrew({");
  lines.push("  version: '1.0.0',");
  lines.push("");
  
  // Team section
  lines.push("  team: defineTeam({");
  lines.push(`    name: '${escapeString(team.name)}',`);
  if (team.description) {
    lines.push(`    description: '${escapeString(team.description)}',`);
  }
  if (team.projectContext) {
    const contextLines = team.projectContext.split('\n');
    if (contextLines.length === 1) {
      lines.push(`    projectContext: '${escapeString(team.projectContext)}',`);
    } else {
      lines.push("    projectContext:");
      contextLines.forEach((line, idx) => {
        const isLast = idx === contextLines.length - 1;
        lines.push(`      '${escapeString(line)}'${isLast ? ',' : ' +'}`);
      });
    }
  }
  lines.push(`    members: [${team.members.map(m => `'${m}'`).join(', ')}],`);
  lines.push("  }),");
  lines.push("");
  
  // Agents section
  lines.push("  agents: [");
  agents.forEach((agent, idx) => {
    const isLast = idx === agents.length - 1;
    lines.push(`    defineAgent({ name: '${agent.name}', role: '${escapeString(agent.role)}', charter: '${agent.charter}', status: '${agent.status}' })${isLast ? '' : ','}`);
  });
  lines.push("  ],");
  lines.push("");
  
  // Routing section
  if (routing.rules.length > 0) {
    lines.push("  routing: defineRouting({");
    lines.push("    rules: [");
    routing.rules.forEach((rule, idx) => {
      const isLast = idx === routing.rules.length - 1;
      const agentsStr = `[${rule.agents.map(a => `'${a}'`).join(', ')}]`;
      const desc = rule.description ? `, description: '${escapeString(rule.description)}'` : '';
      lines.push(`      { pattern: '${rule.pattern}', agents: ${agentsStr}${desc} }${isLast ? '' : ','}`);
    });
    lines.push("    ],");
    lines.push(`    defaultAgent: '${routing.defaultAgent}',`);
    lines.push("    fallback: 'coordinator',");
    lines.push("  }),");
    lines.push("");
  }
  
  // Casting section
  if (casting) {
    lines.push("  casting: defineCasting({");
    lines.push(`    allowlistUniverses: [${casting.allowlistUniverses.map(u => `'${escapeString(u)}'`).join(', ')}],`);
    lines.push(`    overflowStrategy: '${casting.overflowStrategy}',`);
    if (casting.capacity) {
      lines.push("    capacity: {");
      Object.entries(casting.capacity).forEach(([universe, count], idx, arr) => {
        const isLast = idx === arr.length - 1;
        lines.push(`      '${escapeString(universe)}': ${count}${isLast ? '' : ','}`);
      });
      lines.push("    },");
    }
    lines.push("  }),");
  }
  
  lines.push("});");
  lines.push("");
  
  return lines.join('\n');
}

/**
 * Escape single quotes in string literals
 */
function escapeString(str: string): string {
  return str.replace(/'/g, "\\'").replace(/\n/g, '\\n');
}

/**
 * Main migrate command handler
 */
export async function runMigrate(cwd: string, options: MigrateOptions): Promise<void> {
  const mode = detectMode(cwd);
  
  // Handle --from ai-team (subsume upgrade --migrate-directory)
  if (options.from === 'ai-team') {
    if (mode !== 'legacy') {
      fatal('--from ai-team requires a .ai-team/ directory');
    }
    
    console.log(`\n${BOLD}Crew Migrate${RESET} — .ai-team/ → .crew/\n`);
    await migrateDirectory(cwd);
    
    console.log(`\n${dim('Next:')} Run ${BOLD}crew migrate --to sdk${RESET} to convert to SDK-First mode.`);
    return;
  }
  
  // Handle --to markdown (reverse migration)
  if (options.to === 'markdown') {
    if (mode !== 'sdk') {
      fatal('--to markdown requires a crew.config.ts or crew.config.js file');
    }
    
    console.log(`\n${BOLD}Crew Migrate${RESET} — SDK-First → markdown-only\n`);
    
    // Run crew build to ensure .crew/ is up to date
    dim('Regenerating .crew/ markdown from config...');
    const { runBuild } = await import('./build.js');
    await runBuild(cwd, { check: false, dryRun: false, watch: false });
    
    const configPath = storage.existsSync(path.join(cwd, 'crew.config.ts'))
      ? path.join(cwd, 'crew.config.ts')
      : path.join(cwd, 'crew.config.js');
    
    if (!options.dryRun) {
      // Backup the config file
      const backupPath = configPath + '.bak';
      storage.renameSync(configPath, backupPath);
      success(`Moved ${path.basename(configPath)} → ${path.basename(backupPath)}`);
      
      console.log();
      console.log(`${BOLD}✅ Converted to markdown-only.${RESET}`);
      console.log();
      console.log('Your .crew/ directory is now the source of truth.');
      console.log(`The config backup is at ${dim(path.basename(backupPath))}`);
      console.log();
    } else {
      console.log();
      console.log(`${DIM}[DRY RUN]${RESET} Would move ${path.basename(configPath)} → ${path.basename(configPath)}.bak`);
      console.log(`${DIM}[DRY RUN]${RESET} Your .crew/ directory would become the source of truth.`);
      console.log();
    }
    
    return;
  }
  
  // Handle --to sdk (markdown → SDK-First)
  if (options.to === 'sdk') {
    if (mode === 'none') {
      fatal('No crew found. Run `crew init` first.');
    }
    if (mode === 'legacy') {
      fatal('Found .ai-team/ directory. Run `crew migrate --from ai-team` first.');
    }
    if (mode === 'sdk') {
      fatal('Already in SDK-First mode (crew.config.ts exists)');
    }
    
    console.log(`\n${BOLD}Crew Migrate${RESET} — markdown → SDK-First\n`);
    
    const crewDir = path.join(cwd, '.crew');
    
    // Parse markdown files
    dim('Parsing .crew/ markdown files...');
    const team = parseTeamMd(crewDir);
    const routing = parseRoutingMd(crewDir);
    const casting = parseCastingPolicy(crewDir);
    
    const agents: ParsedAgent[] = [];
    for (const memberName of team.members) {
      agents.push(parseAgentCharter(crewDir, memberName));
    }
    
    success(`Parsed ${team.members.length} agents, ${routing.rules.length} routing rules`);
    
    // Generate crew.config.ts
    dim('Generating crew.config.ts...');
    const configContent = generateCrewConfig(team, agents, routing, casting);
    
    if (options.dryRun) {
      console.log();
      console.log(`${BOLD}[DRY RUN]${RESET} Generated crew.config.ts:\n`);
      console.log(dim('─'.repeat(80)));
      console.log(configContent);
      console.log(dim('─'.repeat(80)));
      console.log();
      return;
    }
    
    const configPath = path.join(cwd, 'crew.config.ts');
    storage.writeSync(configPath, configContent);
    success('Created crew.config.ts');
    
    console.log();
    console.log(`${BOLD}✅ Converted to SDK-First mode.${RESET}`);
    console.log();
    console.log(`Next steps:`);
    console.log(`  1. Review ${dim('crew.config.ts')}`);
    console.log(`  2. Run ${BOLD}crew build${RESET} to verify it regenerates .crew/ correctly`);
    console.log(`  3. Commit both the config and updated .crew/ files`);
    console.log();
    
    return;
  }
  
  // No --to flag → interactive mode (detect and suggest)
  console.log(`\n${BOLD}Crew Migrate${RESET} — convert between formats\n`);
  
  if (mode === 'none') {
    console.log('No crew found. Run `crew init` to create one.');
  } else if (mode === 'legacy') {
    console.log(`Current mode: ${BOLD}.ai-team/${RESET} (legacy)`);
    console.log();
    console.log('Suggested: Run `crew migrate --from ai-team` to upgrade to .crew/');
  } else if (mode === 'markdown') {
    console.log(`Current mode: ${BOLD}markdown-only${RESET}`);
    console.log();
    console.log('Your .crew/ directory is the source of truth.');
    console.log();
    console.log('To convert to SDK-First mode, run:');
    console.log(`  ${BOLD}crew migrate --to sdk${RESET}`);
  } else if (mode === 'sdk') {
    console.log(`Current mode: ${BOLD}SDK-First${RESET}`);
    console.log();
    console.log('Your crew.config.ts is the source of truth.');
    console.log();
    console.log('To convert back to markdown-only, run:');
    console.log(`  ${BOLD}crew migrate --to markdown${RESET}`);
  }
  
  console.log();
}
