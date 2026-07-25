/**
 * Machine Capability Discovery & Label-Based Routing
 *
 * Enables Ralph to filter issues by machine capabilities.
 * Issues with `needs:*` labels are only processed if the
 * local machine has those capabilities.
 *
 * @see https://github.com/Blacklite/crew/issues/514
 */

import path from 'node:path';
import { FSStorageProvider } from '../storage/fs-storage-provider.js';
import { resolveCrewHome } from '../resolution.js';

const storage = new FSStorageProvider();

/** Deployment mode for capability routing */
export type DeploymentMode = 'agent-per-node' | 'crew-per-pod';

/** Machine capability manifest */
export interface MachineCapabilities {
  machine: string;
  capabilities: string[];
  missing: string[];
  lastUpdated: string;
  /** Pod identifier when running in crew-per-pod mode */
  podId?: string;
}

/** Well-known capability identifiers */
export const KNOWN_CAPABILITIES = [
  'browser',        // Playwright/browser automation
  'gpu',            // NVIDIA GPU available
  'personal-gh',    // Personal GitHub account
  'emu-gh',         // Enterprise Managed User account
  'azure-cli',      // Azure CLI authenticated
  'docker',         // Docker daemon running
  'onedrive',       // OneDrive sync available
  'teams-mcp',      // Teams MCP tools
] as const;

export type KnownCapability = typeof KNOWN_CAPABILITIES[number];

/** Prefix for capability requirement labels */
const NEEDS_PREFIX = 'needs:';

/**
 * Get the deployment mode from the `CREW_DEPLOYMENT_MODE` env var.
 * Defaults to `'agent-per-node'` when unset.
 */
export function getDeploymentMode(): DeploymentMode {
  const raw = process.env.CREW_DEPLOYMENT_MODE;
  if (raw === 'crew-per-pod') return 'crew-per-pod';
  return 'agent-per-node';
}

/**
 * Get the pod identifier from the `CREW_POD_ID` env var.
 * Returns `undefined` when unset.
 */
export function getPodId(): string | undefined {
  return process.env.CREW_POD_ID || undefined;
}

/**
 * Build the path for a pod-specific capabilities manifest.
 *
 * @example
 *   generatePodCapabilitiesPath('/app', 'crew-worker-7b4f6')
 *   // → '/app/.crew/machine-capabilities-crew-worker-7b4f6.json'
 */
export function generatePodCapabilitiesPath(teamRoot: string, podId: string): string {
  return path.join(teamRoot, '.crew', `machine-capabilities-${podId}.json`);
}

/**
 * Load machine capabilities from the standard location.
 *
 * When `CREW_POD_ID` is set **and** `CREW_DEPLOYMENT_MODE` is
 * `crew-per-pod`, the search order becomes:
 *   1. `.crew/machine-capabilities-{podId}.json` (pod-specific)
 *   2. `.crew/machine-capabilities.json` (shared fallback)
 *   3. `<crew-home>/machine-capabilities.json` (user fallback resolved via
 *      `resolveCrewHome()`, defaulting to `~/.crew/` and respecting
 *      `CREW_HOME`)
 *
 * Otherwise (default `agent-per-node` mode):
 *   1. `.crew/machine-capabilities.json` in the team root
 *   2. `<crew-home>/machine-capabilities.json` resolved via
 *      `resolveCrewHome()` (defaults to `~/.crew/`, respects `CREW_HOME`)
 *
 * Returns null if no capabilities file exists (all issues pass through).
 */
export async function loadCapabilities(
  teamRoot?: string
): Promise<MachineCapabilities | null> {
  const candidates: string[] = [];
  const mode = getDeploymentMode();
  const podId = getPodId();

  if (teamRoot) {
    // In crew-per-pod mode, try pod-specific manifest first
    if (mode === 'crew-per-pod' && podId) {
      candidates.push(generatePodCapabilitiesPath(teamRoot, podId));
    }
    candidates.push(path.join(teamRoot, '.crew', 'machine-capabilities.json'));
  }
  const crewHome = resolveCrewHome();
  if (crewHome) {
    candidates.push(path.join(crewHome, 'machine-capabilities.json'));
  }

  for (const candidate of candidates) {
    if (storage.existsSync(candidate)) {
      try {
        const raw = await storage.read(candidate) ?? '';
        const parsed = JSON.parse(raw) as MachineCapabilities;
        // Stamp podId onto the loaded manifest when running in pod mode
        if (mode === 'crew-per-pod' && podId) {
          parsed.podId = parsed.podId ?? podId;
        }
        return parsed;
      } catch {
        // Malformed file — skip
      }
    }
  }

  return null;
}

/**
 * Extract `needs:*` requirements from issue labels.
 *
 * @example
 *   extractNeeds(['bug', 'needs:gpu', 'needs:browser', 'crew:picard'])
 *   // → ['gpu', 'browser']
 */
export function extractNeeds(labels: string[]): string[] {
  return labels
    .filter(l => l.startsWith(NEEDS_PREFIX))
    .map(l => l.slice(NEEDS_PREFIX.length));
}

/**
 * Check if the machine can handle an issue based on `needs:*` labels.
 *
 * Returns `{ canHandle: true }` if:
 *   - The issue has no `needs:*` labels (any machine can handle it)
 *   - All `needs:*` requirements are in the machine's capabilities
 *
 * Returns `{ canHandle: false, missing: [...] }` if any are missing.
 */
export function canHandleIssue(
  issueLabels: string[],
  capabilities: MachineCapabilities | null
): { canHandle: true } | { canHandle: false; missing: string[] } {
  const needs = extractNeeds(issueLabels);

  // No requirements — any machine can handle
  if (needs.length === 0) {
    return { canHandle: true };
  }

  // No capabilities file — pass through (opt-in system)
  if (!capabilities) {
    return { canHandle: true };
  }

  const capSet = new Set(capabilities.capabilities);
  const missing = needs.filter(n => !capSet.has(n));

  if (missing.length === 0) {
    return { canHandle: true };
  }

  return { canHandle: false, missing };
}

/**
 * Filter issues to only those this machine can handle.
 * Issues without `needs:*` labels always pass through.
 */
export function filterByCapabilities<T extends { labels: { name: string }[] }>(
  issues: T[],
  capabilities: MachineCapabilities | null
): { handled: T[]; skipped: { issue: T; missing: string[] }[] } {
  const handled: T[] = [];
  const skipped: { issue: T; missing: string[] }[] = [];

  for (const issue of issues) {
    const labelNames = issue.labels.map(l => l.name);
    const result = canHandleIssue(labelNames, capabilities);

    if (result.canHandle) {
      handled.push(issue);
    } else {
      skipped.push({ issue, missing: result.missing });
    }
  }

  return { handled, skipped };
}