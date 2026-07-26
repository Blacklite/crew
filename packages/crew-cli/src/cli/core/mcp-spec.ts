/**
 * Shared helper for resolving the `crew_state` MCP launch spec.
 *
 * Used by BOTH `crew init` and `crew upgrade` so the crew_state entry stays
 * consistent across the repo-root `.mcp.json` writer and the Copilot
 * agent-frontmatter writer.
 *
 * The `crew` CLI is expected to be resolvable as `crew` on PATH — via a
 * global npm install or a PATH entry managed by a version manager (mise,
 * asdf, volta, …). The crew_state MCP server is therefore launched directly
 * as `crew state-mcp`.
 *
 * (Historical: earlier iterations bootstrapped `npx -y <pkg>@<version>
 * state-mcp`, probing the npm registry for the pinned version and falling
 * back to the `@insider` dist-tag. That indirection — and its version-pinning
 * machinery — was removed in favor of invoking the on-PATH `crew` directly.)
 */

export interface CrewStateMcpSpec {
  /** Executable to spawn. */
  command: string;
  /** Argv for the executable. */
  args: string[];
}

/** Resolve the crew_state MCP launch spec: `crew state-mcp`. */
export function resolveCrewStateMcpSpec(): CrewStateMcpSpec {
  return {
    command: 'crew',
    args: ['state-mcp'],
  };
}
