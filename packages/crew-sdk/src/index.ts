/**
 * Crew SDK — Public API barrel export.
 * This module has ZERO side effects. Safe to import as a library.
 * CLI entry point lives in src/cli-entry.ts.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pkg = require('../package.json');
export const VERSION: string = pkg.version;

// Export public API
export { resolveCrew, resolveGlobalCrewPath, resolvePersonalCrewDir, ensurePersonalCrewDir, ensureCrewPath, ensureCrewPathTriple, loadDirConfig, isConsultMode, scratchDir, scratchFile, deriveProjectKey, resolveExternalStateDir, resolveCrewHome, ensureCrewHome, resolvePresetsDir, resolveCrewState, clearResolveCrewCache } from './resolution.js';
export type { ResolvedCrewPaths, CrewDirConfig, CrewStateContext } from './resolution.js';
export * from './config/index.js';
export * from './agents/onboarding.js';
export { resolvePersonalAgents, mergeSessionCast } from './agents/personal.js';
export type { PersonalAgentMeta, PersonalAgentManifest } from './agents/personal.js';
export * from './casting/index.js';
export * from './skills/index.js';
export { selectResponseTier, getTier } from './coordinator/response-tiers.js';
export type { ResponseTier, TierName, TierContext, ModelTierSuggestion } from './coordinator/response-tiers.js';
export { loadConfig, loadConfigSync } from './runtime/config.js';
export type { ConfigLoadResult, ConfigValidationError } from './runtime/config.js';
export { MODELS, TIMEOUTS, AGENT_ROLES } from './runtime/constants.js';
export type { AgentRole } from './runtime/constants.js';
export * from './runtime/streaming.js';
export * from './runtime/cost-tracker.js';
export * from './runtime/telemetry.js';
export * from './runtime/offline.js';
export * from './runtime/i18n.js';
export * from './runtime/benchmarks.js';
export * from './runtime/otel-init.js';
export * from './runtime/otel-metrics.js';
export * from './runtime/rework.js';
export { getMeter, getTracer } from './runtime/otel.js';
export { safeTimestamp } from './utils/safe-timestamp.js';
export { EventBus as RuntimeEventBus } from './runtime/event-bus.js';
export {
  type CrewManifest,
  type CrewContact,
  type AcceptedWorkType,
  type DiscoveredCrew,
  type CrossCrewIssueOptions,
  type CrossCrewIssueResult,
  type CrossCrewWorkStatus,
  type RegistryEntry,
  type AddRegistryEntryResult,
  validateManifest,
  readManifest,
  discoverCrews,
  discoverFromUpstreams,
  discoverFromRegistry,
  readCrewRegistry,
  writeCrewRegistry,
  addRegistryEntry,
  removeRegistryEntry,
  buildDelegationArgs,
  buildStatusCheckArgs,
  parseIssueStatus,
  formatDiscoveryTable,
  findCrewByName,
} from './runtime/cross-crew.js';

export * from './marketplace/index.js';
export * from './build/index.js';
export * from './sharing/index.js';
export * from './upstream/index.js';
export * from './remote/index.js';
export * from './streams/index.js';

// Builder functions (SDK-First Crew Mode)
export {
  defineTeam,
  defineAgent,
  defineBudget,
  defineRouting,
  defineCeremony,
  defineHooks,
  defineCasting,
  defineTelemetry,
  defineDefaults,
  defineSkill,
  defineCrew,
  BuilderValidationError,
} from './builders/index.js';
export type {
  AgentRef,
  ScheduleExpression,
  BuilderModelId,
  BudgetDefinition,
  ModelPreference,
  DefaultsDefinition,
  TeamDefinition,
  AgentCapability,
  AgentDefinition,
  RoutingRule as BuilderRoutingRule,
  RoutingDefinition,
  CeremonyDefinition,
  HooksDefinition,
  CastingDefinition,
  TelemetryDefinition,
  SkillDefinition as BuilderSkillDefinition,
  SkillTool as BuilderSkillTool,
  CrewSDKConfig,
} from './builders/index.js';
// Base Roles (built-in role catalog)
export * from './roles/index.js';
export * from './platform/index.js';
export * from './storage/index.js';
export * from './memory/index.js';

// Git-native state backends (Issue #807, hardened in #864)
export type { StateBackend, StateBackendType, StateBackendConfig } from './state-backend.js';
export { WorktreeBackend, GitNotesBackend, OrphanBranchBackend, TwoLayerBackend, CircuitBreaker, GitExecError, resolveStateBackend, validateStateKey, StateBackendStorageAdapter, verifyStateBackend } from './state-backend.js';
export type { PromoteNotesResult } from './state-backend.js';
export { addCrewStateGitignoreBlock, removeCrewStateGitignoreBlock, CREW_STATE_GITIGNORE_OPEN_MARKER, CREW_STATE_GITIGNORE_CLOSE_MARKER } from './config/gitignore-state.js';

// State facade (Phase 2) — namespaced to avoid conflicts with existing config/sharing exports
export {
  // Error classes
  StateError,
  NotFoundError,
  ParseError,
  WriteConflictError,
  ProviderError,
  // Schema
  COLLECTION_PATHS,
  resolveCollectionPath,
  // Handle factory
  createAgentHandle,
  // Collection facades
  AgentsCollection,
  ConfigCollection,
  DecisionsCollection,
  LogCollection,
  RoutingCollection,
  SkillsCollection,
  TeamCollection,
  TemplatesCollection,
  // Top-level facade
  CrewState,
} from './state/index.js';
export type { ConfigFileData } from './state/index.js';
export type {
  Agent,
  Decision,
  LogEntry,
  RoutingConfigRule,
  CrewStateConfig,
  StateErrorKind,
  TeamMember,
  Template,
  CollectionEntityMap,
  CollectionName,
  AgentHandle,
  CollectionPathResolver,
} from './state/index.js';
