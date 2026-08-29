/**
 * Local-move kinds that incremental scoring may attempt.
 *
 * Success is not guaranteed: Bag+repair or missing context still falls
 * back to analyzePlacementScore. Approximate / heuristic deltas remain
 * forbidden.
 */

export type LayoutChangeKind =
  | "item_place"
  | "item_relocate"
  | "item_rotate"
  | "item_swap"
  | "item_remove"
  | "bag_relocate"
  | "bag_rotate"
  | "bag_swap"
  | "repair";

export interface LayoutChange {
  kind: LayoutChangeKind;
}

const SUPPORTED: ReadonlySet<LayoutChangeKind> = new Set([
  "item_place",
  "item_relocate",
  "item_rotate",
  "item_swap",
  "item_remove",
  "bag_relocate",
  "bag_rotate",
  "bag_swap",
  "repair",
]);

/**
 * Whether incremental scoring may be attempted for this kind of local move.
 * A true result does not skip the score cache or forbid a full fallback.
 */
export function incrementalScoringSupported(change: LayoutChange): boolean {
  return SUPPORTED.has(change.kind);
}
