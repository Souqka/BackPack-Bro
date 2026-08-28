/**
 * Публичный API optimizer: кандидаты Stage 6 + двухслойный Beam Search Stage 7.
 */

export type {
  Backpack,
  CandidateInvalidReason,
  CandidateValidationResult,
  ItemToPlace,
  OccupiedCell,
  PlacementCandidate,
  SearchState,
  SearchStateIssue,
  SearchStateResult,
} from "./types.ts";
export { DEFAULT_BACKPACK } from "./types.ts";

export { getUniqueRotations } from "./rotations.ts";
export { createSearchState, addCandidate, removePlacement } from "./state.ts";
export { canPlaceCandidate } from "./constraints.ts";
export { generatePlacementCandidates } from "./candidates.ts";
export { getStateSignature, getCandidateSignature } from "./deduplication.ts";

export type { BagState, OccupiedBagCell, PlacedBag } from "./bags/types.ts";
export { generateBagCandidates } from "./bags/candidates.ts";
export { addBagCandidate, createBagState, emptyBagState, getBagStateSignature } from "./bags/state.ts";

export type {
  BeamSearchOptions,
  OptimizerOptions,
  OptimizerResult,
  OptimizerState,
  OptimizerStats,
  PartialStateScore,
  RunOptimizerInput,
} from "./search-types.ts";
export { DEFAULT_OPTIMIZER_OPTIONS } from "./search-types.ts";

export { evaluatePartialState, DEFAULT_HEURISTIC_WEIGHTS } from "./heuristic.ts";
export type { HeuristicWeights } from "./heuristic.ts";
export { orderItemsForSearch } from "./ordering.ts";
export { runBeamSearch, runOptimizer, getOptimizerStateSignature } from "./optimizer.ts";
export { selectBeam } from "./beam-search.ts";
