/**
 * SubCrew Types — Type definitions for Crew SubCrews.
 *
 * SubCrews enable horizontal scaling by allowing multiple Crew instances
 * (e.g., in different Codespaces) to each handle a scoped subset of work.
 *
 * @module streams/types
 */

/** Definition of a single SubCrew (team partition). */
export interface SubCrewDefinition {
  /** SubCrew name, e.g., "ui-team", "backend-team" */
  name: string;
  /** GitHub label to filter issues by, e.g., "team:ui" */
  labelFilter: string;
  /** Optional folder restrictions, e.g., ["apps/web"] */
  folderScope?: string[];
  /** Workflow mode. Default: branch-per-issue */
  workflow?: 'branch-per-issue' | 'direct';
  /** Human-readable description of this SubCrew's purpose */
  description?: string;
}

/** @deprecated Use SubCrewDefinition instead */
export type WorkstreamDefinition = SubCrewDefinition;

/** @deprecated Use SubCrewDefinition instead */
export type StreamDefinition = SubCrewDefinition;

/** Top-level SubCrews configuration (stored in .crew/streams.json). */
export interface SubCrewConfig {
  /** All configured SubCrews */
  workstreams: SubCrewDefinition[];
  /** Default workflow for SubCrews that don't specify one */
  defaultWorkflow: 'branch-per-issue' | 'direct';
}

/** @deprecated Use SubCrewConfig instead */
export type WorkstreamConfig = SubCrewConfig;

/** @deprecated Use SubCrewConfig instead */
export type StreamConfig = SubCrewConfig;

/** A resolved SubCrew with provenance information. */
export interface ResolvedSubCrew {
  /** SubCrew name */
  name: string;
  /** Full SubCrew definition */
  definition: SubCrewDefinition;
  /** How this SubCrew was resolved */
  source: 'env' | 'file' | 'config';
}

/** @deprecated Use ResolvedSubCrew instead */
export type ResolvedWorkstream = ResolvedSubCrew;

/** @deprecated Use ResolvedSubCrew instead */
export type ResolvedStream = ResolvedSubCrew;
