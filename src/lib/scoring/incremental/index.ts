export type {
  AffectedRegion,
  BagRelocateMove,
  BagRotateMove,
  BagSwapMove,
  GeometrySnapshot,
  IncrementalScoreContext,
  IncrementalScoreResult,
  ItemGeometryChange,
  ItemPlaceMove,
  ItemRelocateMove,
  ItemRemoveMove,
  ItemRotateMove,
  ItemSwapMove,
  LayoutMove,
  LayoutMoveKind,
  RepairMove,
} from "./types.ts";

export {
  createBagRelocateMove,
  createBagRotateMove,
  createBagSwapMove,
  createItemPlaceMove,
  createItemRelocateMove,
  createItemRemoveMove,
  createItemRotateMove,
  createItemSwapMove,
  createRepairMove,
  geometryFingerprint,
  itemGeometryChanges,
  relocateOrRotateMove,
  snapshotFromCandidate,
  snapshotGeometry,
  snapshotPlaced,
} from "./move.ts";

export { collectAffectedRegion } from "./affected.ts";
export { tryIncrementalPlacementScore } from "./recompute.ts";
export {
  assertEquivalentPlacementScore,
  placementScoreDiff,
  placementScoresEquivalent,
} from "./verify.ts";
export {
  getIncrementalScoringOptions,
  isIncrementalScoringEnabled,
  isIncrementalVerificationEnabled,
  withIncrementalScoring,
} from "./options.ts";
