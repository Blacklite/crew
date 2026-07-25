/**
 * SubCrew-Aware Issue Filtering
 *
 * Filters GitHub issues to only those matching a SubCrew's labelFilter.
 * Intended to scope work to the active SubCrew during triage.
 *
 * @module streams/filter
 */

import type { ResolvedSubCrew } from './types.js';

/** Minimal issue shape for filtering. */
export interface SubCrewIssue {
  number: number;
  title: string;
  labels: Array<{ name: string }>;
}

/** @deprecated Use SubCrewIssue instead */
export type WorkstreamIssue = SubCrewIssue;

/** @deprecated Use SubCrewIssue instead */
export type StreamIssue = SubCrewIssue;

/**
 * Filter issues to only those matching the SubCrew's label filter.
 *
 * Matching is case-insensitive. If the SubCrew has no labelFilter,
 * all issues are returned (passthrough).
 *
 * @param issues - Array of issues to filter
 * @param subcrew - The resolved SubCrew to filter by
 * @returns Filtered array of issues matching the SubCrew's label
 */
export function filterIssuesBySubCrew(
  issues: SubCrewIssue[],
  subcrew: ResolvedSubCrew,
): SubCrewIssue[] {
  const filter = subcrew.definition.labelFilter;
  if (!filter) {
    return issues;
  }

  const normalizedFilter = filter.toLowerCase();
  return issues.filter(issue =>
    issue.labels.some(label => label.name.toLowerCase() === normalizedFilter),
  );
}

/** @deprecated Use filterIssuesBySubCrew instead */
export const filterIssuesByWorkstream = filterIssuesBySubCrew;

/** @deprecated Use filterIssuesBySubCrew instead */
export const filterIssuesByStream = filterIssuesBySubCrew;
