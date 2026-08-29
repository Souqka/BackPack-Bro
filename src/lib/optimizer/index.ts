/**
 * Публичный API optimizer: кандидаты Stage 6, двухслойный поиск Stage 7–8.
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
export { addBagCandidate, createBagState, emptyBagState, getAvailableCells, getBagStateSignature, removeBag } from "./bags/state.ts";

export type {
  BeamSearchOptions,
  DfsSearchLimits,
  HeuristicInversionReport,
  HeuristicSample,
  OptimizerAlgorithm,
  OptimizerAlternative,
  OptimizerComparison,
  OptimizerLayout,
  OptimizerMetrics,
  OptimizerOptions,
  OptimizerResult,
  OptimizerState,
  OptimizerStats,
  PartialStateScore,
  RankedLayout,
  RunOptimizerInput,
} from "./search-types.ts";
export type { LocalSearchOptions, BagLocalSearchOptions } from "./search-types.ts";
export { DEFAULT_DFS_LIMITS, DEFAULT_OPTIMIZER_OPTIONS } from "./search-types.ts";

export { evaluatePartialState, countFutureStarPotential, DEFAULT_HEURISTIC_WEIGHTS } from "./heuristic.ts";
export type { HeuristicWeights } from "./heuristic.ts";
export { orderItemsForSearch } from "./ordering.ts";
export { runBeamSearch, runOptimizer, getOptimizerStateSignature } from "./optimizer.ts";
export { selectBeam } from "./beam-search.ts";
export { runGreedySearch } from "./greedy.ts";
export { runDfsSearch } from "./dfs.ts";
export { compareOptimizerResults } from "./compare.ts";
export { compareRankedLayouts, isStrictlyBetterLayout, sortRankedLayouts } from "./rank.ts";
export { analyzeHeuristicInversions, toOptimizerMetrics } from "./metrics.ts";
export { loadProductionCatalog } from "./load-catalog.ts";
export {
  DEFAULT_LOCAL_SEARCH_OPTIONS,
  improveLayoutLocally,
  improveTopNLocally,
  resolveLocalSearchOptions,
} from "./local-search.ts";
export type { LocalSearchOutcome, LocalSearchStats } from "./local-search.ts";
export {
  DEFAULT_BAG_LOCAL_SEARCH_OPTIONS,
  resolveBagLocalSearchOptions,
} from "./bag-local-search.ts";
export type { BagLocalSearchStats } from "./bag-local-search.ts";
export { canonicalBagSignature, generateBagNeighbors, limitBagNeighbors } from "./bag-neighbors.ts";
export type { BagNeighbor, BagNeighborOperation } from "./bag-neighbors.ts";
export { findDisplacedItems, findKeptItems, itemIsDisplaced, repairItemLayout } from "./repair.ts";
export type { RepairOptions, RepairResult } from "./repair.ts";
export { improveTopNJointly, runJointLocalSearch } from "./joint-search.ts";
