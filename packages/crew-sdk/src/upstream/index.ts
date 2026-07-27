/**
 * Upstream module — public API.
 *
 * @module upstream
 */

export type {
  UpstreamType,
  UpstreamSource,
  UpstreamConfig,
  UpstreamSyncState,
  ResolvedUpstream,
  UpstreamResolution,
} from './types.js';

export {
  readUpstreamConfig,
  resolveUpstreams,
  buildInheritedContextBlock,
  buildSessionDisplay,
} from './resolver.js';
