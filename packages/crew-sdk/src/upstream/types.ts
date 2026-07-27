/**
 * Upstream types — configuration and resolved state for upstream Crew sources.
 *
 * An upstream is another Crew repo (org-level, team-level, or any repo with .crew/)
 * whose context (skills, decisions, wisdom, casting policy, routing) is read live
 * by the coordinator at session start.
 *
 * @module upstream/types
 */

/** Source type for an upstream Crew repo. */
export type UpstreamType = 'local' | 'git' | 'export';

/** A declared upstream source from upstream.json. */
export interface UpstreamSource {
  /** Display name for this upstream (e.g., "org", "team-platform"). */
  name: string;
  /** How to access this upstream. */
  type: UpstreamType;
  /** Path, URL, or export file location. */
  source: string;
  /** Git ref to use (only for type: "git"). */
  ref?: string;
  /** ISO timestamp of when this upstream was added. */
  added_at: string;
  /**
   * ISO timestamp of last successful sync/validation.
   *
   * @deprecated Legacy field. Sync timestamps are mutable machine-local state and
   * are no longer stored in the tracked `upstream.json` — writing them there made
   * the file dirty on every sync (and `crew upstream sync` runs from the
   * post-checkout/post-merge git hooks, so that was every pull and every branch
   * switch). They now live in `.crew/_upstream_repos/.sync-state.json`, which is
   * gitignored. Still read for backward compatibility: the CLI migrates this key
   * out of `upstream.json` the next time an `upstream` command runs.
   */
  last_synced?: string | null;
}

/** The upstream.json config file format. */
export interface UpstreamConfig {
  upstreams: UpstreamSource[];
}

/**
 * Machine-local sync state, persisted to `.crew/_upstream_repos/.sync-state.json`.
 *
 * Kept out of `upstream.json` so the tracked config stays byte-stable across syncs.
 * The `_upstream_repos/` directory is gitignored, so nothing here is ever committed.
 */
export interface UpstreamSyncState {
  /** Schema version for this file. */
  version: 1;
  /** Upstream name → ISO timestamp of its last successful sync/validation. */
  last_synced: Record<string, string>;
}

/** Resolved content from a single upstream source. */
export interface ResolvedUpstream {
  /** Name from the config. */
  name: string;
  /** Source type. */
  type: UpstreamType;
  /** Skills found in this upstream. */
  skills: Array<{ name: string; content: string }>;
  /** Decisions markdown content, or null if not found. */
  decisions: string | null;
  /** Wisdom markdown content, or null if not found. */
  wisdom: string | null;
  /** Casting policy object, or null if not found. */
  castingPolicy: Record<string, unknown> | null;
  /** Routing markdown content, or null if not found. */
  routing: string | null;
}

/** Result of resolving all upstreams for a crew directory. */
export interface UpstreamResolution {
  upstreams: ResolvedUpstream[];
}
