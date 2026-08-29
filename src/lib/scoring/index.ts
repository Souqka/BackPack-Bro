/**
 * Публичный API Scoring Engine.
 *
 * Не экспортирует разбор Condition и сборку индекса клеток.
 */

export type {
  ActiveStarFact,
  EffectClassification,
  EffectCoverage,
  InactiveStarFact,
  PlacementFacts,
  PlacementScore,
  ScoreBreakdown,
  ScoreComponent,
  Synergy,
  SynergyEdge,
  SynergyGraph,
  SynergyNode,
  SynergyStatus,
  SynergyType,
} from "./types.ts";

export type { ScoringWeights } from "./weights.ts";
export { DEFAULT_SCORING_WEIGHTS, INVALID_PLACEMENT_SCORE, resolveWeights } from "./weights.ts";

export { analyzePlacementScore, scoreInventory, scoreInventoryAnalysis } from "./analyzer.ts";
export {
  assertEquivalentPlacementScore,
  placementScoresEquivalent,
  tryIncrementalPlacementScore,
} from "./incremental/index.ts";
export type { IncrementalScoreContext, IncrementalScoreResult, LayoutMove } from "./incremental/index.ts";
export { buildPlacementFacts, classifyEffect } from "./rules.ts";
export { buildSynergies } from "./synergies.ts";
export { buildSynergyGraph } from "./graph.ts";
export { calculateEffectCoverage, calculateStructuralScore } from "./score.ts";
