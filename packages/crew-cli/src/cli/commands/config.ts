/**
 * Config command — manage crew configuration.
 *
 * Usage:
 *   crew config model                          — show current model configuration
 *   crew config model <model-name>             — set default model for all agents
 *   crew config model <model-name> --agent <n> — pin model to a specific agent
 *   crew config model --clear                  — clear default model override
 *   crew config model --clear --agent <n>      — clear a specific agent's override
 *   crew config context-tier                          — show current context tier configuration
 *   crew config context-tier <tier>                   — set default context tier for all agents
 *   crew config context-tier <tier> --agent <n>       — pin context tier to a specific agent
 *   crew config context-tier --clear                  — clear default context tier override
 *   crew config context-tier --clear --agent <n>      — clear a specific agent's override
 */

import { join } from 'node:path';
import { existsSync, readdirSync } from 'node:fs';
import {
  readModelPreference,
  writeModelPreference,
  readAgentModelOverrides,
  writeAgentModelOverrides,
  readContextTier,
  writeContextTier,
  readAgentContextTierOverrides,
  writeAgentContextTierOverrides,
  VALID_CONTEXT_TIERS,
  MODEL_CATALOG,
} from '@blacklite/crew-sdk/config';
import { fatal } from '../core/errors.js';
import { BOLD, RESET, GREEN, DIM, RED, YELLOW } from '../core/output.js';

function resolveCrewDir(cwd: string): string | null {
  let dir = cwd;
  for (let i = 0; i < 10; i++) {
    const candidate = join(dir, '.crew');
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = join(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function listAgents(crewDir: string): string[] {
  const agentsDir = join(crewDir, 'agents');
  if (!existsSync(agentsDir)) return [];
  return readdirSync(agentsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
}

function isValidModel(name: string): boolean {
  return MODEL_CATALOG.some(m => m.id === name);
}

function showAvailableModels(): void {
  console.log(`\n  Available models:`);
  const byTier = new Map<string, string[]>();
  for (const m of MODEL_CATALOG) {
    const list = byTier.get(m.tier) ?? [];
    list.push(m.id);
    byTier.set(m.tier, list);
  }
  for (const [tier, models] of byTier) {
    console.log(`    ${BOLD}${tier}${RESET}: ${DIM}${models.join(', ')}${RESET}`);
  }
  console.log();
}

function isValidTier(name: string): boolean {
  return (VALID_CONTEXT_TIERS as readonly string[]).includes(name);
}

function showAvailableTiers(): void {
  console.log(`\n  Available context tiers: ${DIM}${VALID_CONTEXT_TIERS.join(', ')}${RESET}\n`);
}

function parseFlags(args: string[]): { clear: boolean; agent: string | null; positional: string[] } {
  let clear = false;
  let agent: string | null = null;
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--clear') {
      clear = true;
    } else if (arg === '--agent') {
      agent = args[++i] ?? null;
      if (!agent) {
        fatal('--agent requires a name argument.');
      }
    } else if (arg && !arg.startsWith('-')) {
      positional.push(arg);
    }
  }
  return { clear, agent, positional };
}

async function runModelSubcommand(crewDir: string, subArgs: string[]): Promise<void> {
  const { clear, agent, positional } = parseFlags(subArgs);
  const modelArg = positional[0] ?? null;

  // --- Clear ---
  if (clear) {
    if (agent) {
      const agents = listAgents(crewDir);
      if (agents.length > 0 && !agents.includes(agent)) {
        fatal(
          `Unknown agent "${agent}".\n` +
          `       Known agents: ${agents.join(', ')}`,
        );
      }
      const overrides = readAgentModelOverrides(crewDir);
      delete overrides[agent];
      writeAgentModelOverrides(crewDir, overrides);
      console.log(`${GREEN}✓${RESET} Model override for ${BOLD}${agent}${RESET} cleared.`);
    } else {
      writeModelPreference(crewDir, null);
      console.log(`${GREEN}✓${RESET} Default model override cleared (reverted to auto-selection).`);
    }
    return;
  }

  // --- Set model ---
  if (modelArg) {
    if (!isValidModel(modelArg)) {
      console.error(`${RED}✗${RESET} Unknown model: ${BOLD}${modelArg}${RESET}`);
      showAvailableModels();
      process.exit(1);
    }

    if (agent) {
      const agents = listAgents(crewDir);
      if (agents.length > 0 && !agents.includes(agent)) {
        fatal(
          `Unknown agent "${agent}".\n` +
          `       Known agents: ${agents.join(', ')}`,
        );
      }
      const overrides = readAgentModelOverrides(crewDir);
      overrides[agent] = modelArg;
      writeAgentModelOverrides(crewDir, overrides);
      console.log(`${GREEN}✓${RESET} Model for ${BOLD}${agent}${RESET} set to ${BOLD}${modelArg}${RESET}`);
    } else {
      writeModelPreference(crewDir, modelArg);
      console.log(`${GREEN}✓${RESET} Default model set to ${BOLD}${modelArg}${RESET}`);
    }
    return;
  }

  // --- Show current config ---
  const defaultModel = readModelPreference(crewDir);
  const overrides = readAgentModelOverrides(crewDir);
  const overrideEntries = Object.entries(overrides);

  console.log(`\n${BOLD}Model configuration:${RESET}`);
  console.log(`  Default model: ${defaultModel ? BOLD + defaultModel + RESET : `${DIM}(auto)${RESET}`}`);

  if (overrideEntries.length > 0) {
    console.log(`\n  Agent overrides:`);
    for (const [name, model] of overrideEntries) {
      console.log(`    ${name} ${DIM}→${RESET} ${model}`);
    }
  } else {
    console.log(`\n  ${DIM}No agent overrides configured.${RESET}`);
  }
  console.log();
}

async function runContextTierSubcommand(crewDir: string, subArgs: string[]): Promise<void> {
  const { clear, agent, positional } = parseFlags(subArgs);
  const tierArg = positional[0] ?? null;

  // --- Clear ---
  if (clear) {
    if (agent) {
      const agents = listAgents(crewDir);
      if (agents.length > 0 && !agents.includes(agent)) {
        fatal(
          `Unknown agent "${agent}".\n` +
          `       Known agents: ${agents.join(', ')}`,
        );
      }
      const overrides = readAgentContextTierOverrides(crewDir);
      delete overrides[agent];
      writeAgentContextTierOverrides(crewDir, overrides);
      console.log(`${GREEN}✓${RESET} Context tier override for ${BOLD}${agent}${RESET} cleared.`);
    } else {
      writeContextTier(crewDir, null);
      console.log(`${GREEN}✓${RESET} Default context tier cleared (reverted to model default).`);
    }
    return;
  }

  // --- Set context tier ---
  if (tierArg) {
    if (!isValidTier(tierArg)) {
      console.error(`${RED}✗${RESET} Unknown context tier: ${BOLD}${tierArg}${RESET}`);
      showAvailableTiers();
      process.exit(1);
    }

    if (agent) {
      const agents = listAgents(crewDir);
      if (agents.length > 0 && !agents.includes(agent)) {
        fatal(
          `Unknown agent "${agent}".\n` +
          `       Known agents: ${agents.join(', ')}`,
        );
      }
      const overrides = readAgentContextTierOverrides(crewDir);
      overrides[agent] = tierArg;
      writeAgentContextTierOverrides(crewDir, overrides);
      console.log(`${GREEN}✓${RESET} Context tier for ${BOLD}${agent}${RESET} set to ${BOLD}${tierArg}${RESET}`);
    } else {
      writeContextTier(crewDir, tierArg);
      console.log(`${GREEN}✓${RESET} Default context tier set to ${BOLD}${tierArg}${RESET}`);
    }
    return;
  }

  // --- Show current config ---
  const defaultTier = readContextTier(crewDir);
  const overrides = readAgentContextTierOverrides(crewDir);
  const overrideEntries = Object.entries(overrides);

  console.log(`\n${BOLD}Context tier configuration:${RESET}`);
  console.log(`  Default context tier: ${defaultTier ? BOLD + defaultTier + RESET : `${DIM}(model default)${RESET}`}`);

  if (overrideEntries.length > 0) {
    console.log(`\n  Agent overrides:`);
    for (const [name, tier] of overrideEntries) {
      console.log(`    ${name} ${DIM}→${RESET} ${tier}`);
    }
  } else {
    console.log(`\n  ${DIM}No agent overrides configured.${RESET}`);
  }
  showAvailableTiers();
}

export async function runConfig(cwd: string, subArgs: string[]): Promise<void> {
  const crewDir = resolveCrewDir(cwd);
  if (!crewDir) {
    fatal('No crew found. Run "crew init" first.');
    return;
  }

  const sub = subArgs[0]?.toLowerCase();

  if (sub === 'model') {
    await runModelSubcommand(crewDir, subArgs.slice(1));
    return;
  }

  if (sub === 'context-tier') {
    await runContextTierSubcommand(crewDir, subArgs.slice(1));
    return;
  }

  // No subcommand or unknown — show usage
  console.log(`\n${BOLD}crew config${RESET} — manage crew configuration\n`);
  console.log(`  ${BOLD}crew config model${RESET}                          — show current model config`);
  console.log(`  ${BOLD}crew config model <model>${RESET}                  — set default model`);
  console.log(`  ${BOLD}crew config model <model> --agent <name>${RESET}   — pin model to agent`);
  console.log(`  ${BOLD}crew config model --clear${RESET}                  — clear default model`);
  console.log(`  ${BOLD}crew config model --clear --agent <name>${RESET}   — clear agent override\n`);
  console.log(`  ${BOLD}crew config context-tier${RESET}                    — show current context-tier config`);
  console.log(`  ${BOLD}crew config context-tier <tier>${RESET}             — set default context tier`);
  console.log(`  ${BOLD}crew config context-tier <tier> --agent <name>${RESET} — pin context tier to agent`);
  console.log(`  ${BOLD}crew config context-tier --clear${RESET}            — clear default context tier`);
  console.log(`  ${BOLD}crew config context-tier --clear --agent <name>${RESET} — clear agent override\n`);
}
