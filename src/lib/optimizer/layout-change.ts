/**
 * Boundaries for a future incremental Scoring Engine.
 *
 * Stage 12 records which local moves exist. It does not compute delta
 * scores: a local move produces a new cache key and falls back to
 * analyzePlacementScore. Approximate / heuristic deltas are forbidden.
 */

export type LayoutChangeKind =
  | "item_place"
  | "item_relocate"
  | "item_rotate"
  | "item_swap"
  | "bag_relocate"
  | "bag_rotate"
  | "bag_swap"
  | "repair";

export interface LayoutChange {
  kind: LayoutChangeKind;
}

/**
 * Incremental scoring is not implemented. Always false: callers must use
 * the full Scoring Engine (via the score cache) for every distinct layout.
 */
export function incrementalScoringSupported(_change: LayoutChange): boolean {
  return false;
}
