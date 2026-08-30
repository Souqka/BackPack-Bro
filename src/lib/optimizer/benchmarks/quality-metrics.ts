/**
 * Снимки качества поиска: score / stars / cost / Adaptive / Local Search.
 *
 * Dummy-метрики не добавляются — Adaptive и LS поля появляются
 * только если соответствующий алгоритм реально запускался.
 */

import type { AdaptiveOptimizerResult } from "../adaptive-types.ts";
import { scoreCacheHitRate } from "../score-cache.ts";
import type { OptimizerResult, RankedLayout } from "../search-types.ts";
import { finiteScore, rankedLayoutFromResult } from "./quality.ts";
import type {
  AdaptiveQualityMetrics,
  BestKnownSource,
  LocalSearchQualityMetrics,
  SearchQualitySnapshot,
} from "./quality-types.ts";

export function snapshotFromLayout(
  layout: RankedLayout,
  args: {
    algorithmId: string;
    label: string;
    source: BestKnownSource;
    beamWidth?: number;
    durationMs: number;
    unplacedItems: number;
    searchExhaustive?: boolean;
    cost?: SearchQualitySnapshot["cost"];
    localSearch?: LocalSearchQualityMetrics;
    adaptive?: AdaptiveQualityMetrics;
  },
): SearchQualitySnapshot {
  return {
    algorithmId: args.algorithmId,
    label: args.label,
    source: args.source,
    beamWidth: args.beamWidth,
    complete: layout.complete,
    score: finiteScore(layout),
    activatedStars: layout.score.breakdown.activatedStars,
    effectCoverage: layout.score.effectCoverage.normalizedEffects,
    placedItems: layout.state.items.items.length,
    unplacedItems: args.unplacedItems,
    canonicalSignature: layout.signature,
    durationMs: args.durationMs,
    searchExhaustive: args.searchExhaustive,
    cost: args.cost ?? { statesGenerated: 0, statesPruned: 0, candidatesGenerated: 0 },
    ...(args.localSearch ? { localSearch: args.localSearch } : {}),
    ...(args.adaptive ? { adaptive: args.adaptive } : {}),
  };
}

export function snapshotFromResult(
  result: OptimizerResult,
  args: {
    algorithmId: string;
    label: string;
    source: BestKnownSource;
    beamWidth?: number;
    durationMs?: number;
    localSearch?: LocalSearchQualityMetrics;
    adaptive?: AdaptiveQualityMetrics;
  },
): SearchQualitySnapshot {
  const layout = rankedLayoutFromResult(result);
  const metrics = result.metrics;
  const evaluations = metrics?.scoreCacheEvaluations ?? 0;
  const hits = metrics?.scoreCacheHits;
  const misses = metrics?.scoreCacheMisses;
  return {
    algorithmId: args.algorithmId,
    label: args.label,
    source: args.source,
    beamWidth: args.beamWidth,
    complete: layout.complete,
    score: finiteScore(layout),
    activatedStars: layout.score.breakdown.activatedStars,
    effectCoverage: layout.score.effectCoverage.normalizedEffects,
    placedItems: layout.state.items.items.length,
    unplacedItems: result.unplacedItems.length,
    canonicalSignature: layout.signature,
    durationMs: args.durationMs ?? result.stats.durationMs,
    searchExhaustive: result.searchExhaustive,
    cost: {
      statesGenerated: metrics?.statesGenerated ?? result.stats.itemStatesGenerated + result.stats.bagStatesGenerated,
      statesPruned: metrics?.statesPruned ?? result.stats.itemStatesPruned + result.stats.bagStatesPruned,
      candidatesGenerated: metrics?.candidatesGenerated ?? result.stats.candidatesGenerated,
      ...(evaluations > 0 || (hits ?? 0) > 0 || (misses ?? 0) > 0
        ? {
            scoreCacheHits: hits ?? result.stats.scoreCacheHits,
            scoreCacheMisses: misses ?? result.stats.scoreCacheMisses,
            scoreCacheHitRate: scoreCacheHitRate({
              hits: hits ?? result.stats.scoreCacheHits,
              evaluations: evaluations || result.stats.scoreCacheEvaluations,
            }),
          }
        : {}),
    },
    ...(args.localSearch ? { localSearch: args.localSearch } : {}),
    ...(args.adaptive ? { adaptive: args.adaptive } : {}),
  };
}

export function snapshotFromAdaptive(result: AdaptiveOptimizerResult, durationMs?: number): SearchQualitySnapshot {
  return snapshotFromResult(result, {
    algorithmId: "adaptive",
    label: "Adaptive",
    source: "adaptive",
    durationMs: durationMs ?? result.adaptive.durationMs,
    adaptive: {
      escalation: result.adaptive.escalationSteps,
      stopReason: result.adaptive.stopReason,
      bagSeeds: result.adaptive.bagSeedsSelected,
    },
  });
}

export function itemLsMetricsFromResult(result: OptimizerResult): LocalSearchQualityMetrics | undefined {
  const metrics = result.metrics;
  if (!metrics?.localSearchEnabled) return undefined;
  return {
    initialScore: metrics.initialScore,
    scoreDelta: metrics.scoreDelta,
    iterations: metrics.localSearchIterations,
    neighbors: metrics.localSearchNeighbors,
    acceptedMoves: metrics.localSearchImprovements,
  };
}

export function jointLsMetricsFromResult(result: OptimizerResult): LocalSearchQualityMetrics | undefined {
  const metrics = result.metrics;
  if (!metrics?.bagLocalSearchEnabled) return undefined;
  return {
    initialScore: metrics.bagLocalSearchInitialScore,
    scoreDelta: metrics.bagLocalSearchScoreDelta,
    iterations: metrics.bagLocalSearchIterations,
    neighbors: metrics.bagNeighborsVisited,
    acceptedMoves: metrics.bagLayoutsAccepted,
  };
}
