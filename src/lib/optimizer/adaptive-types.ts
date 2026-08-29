/**
 * Adaptive Portfolio Search types. Scoring Engine is not involved here
 * except through existing RankedLayout / PlacementScore.
 */

import type { OptimizerMetrics, OptimizerResult } from "./search-types.ts";

export type AdaptiveStopReason =
  | "budget_exhausted"
  | "stable_result"
  | "complete_layout"
  | "max_escalation_reached"
  | "no_more_unique_bag_seeds";

export interface AdaptiveSearchOptions {
  initialBagBeamWidth?: number;
  initialItemBeamWidth?: number;
  bagBeamWidths?: number[];
  itemBeamWidths?: number[];
  maxBagSeeds?: number;
  similarityThreshold?: number;
  enableItemLocalSearch?: boolean;
  enableBagLocalSearch?: boolean;
  stopWhenComplete?: boolean;
  stableLevelsBeforeStop?: number | false;
  resultCount?: number;
  maxDurationMs?: number;
  /**
   * Shared score cache for the whole Adaptive run (all ladder levels).
   * Default true. false is only for uncached benchmark / identity tests.
   */
  scoreCache?: boolean;
}

export interface AdaptiveLevelMetrics {
  bagBeamWidth: number;
  itemBeamWidth: number;
  bagLayoutsGenerated: number;
  bagSeedsSelected: number;
  bagSeedsSkipped: number;
  statesGenerated: number;
  improved: boolean;
}

export interface AdaptiveSearchMetrics {
  bagSeedsGenerated: number;
  bagSeedsSelected: number;
  bagSeedsSkipped: number;
  escalationSteps: number;
  levelsRun: number;
  lastBagBeamWidth: number;
  lastItemBeamWidth: number;
  totalStatesGenerated: number;
  totalStatesPruned: number;
  candidatesGenerated: number;
  localSearchNeighbors: number;
  jointNeighbors: number;
  stoppedEarly: boolean;
  stopReason: AdaptiveStopReason;
  durationMs: number;
  initialScore: number;
  finalScore: number;
  scoreDelta: number;
  jointImproved: boolean;
  levels: AdaptiveLevelMetrics[];
}

export interface AdaptiveOptimizerResult extends OptimizerResult {
  adaptive: AdaptiveSearchMetrics;
  metrics: OptimizerMetrics;
}
