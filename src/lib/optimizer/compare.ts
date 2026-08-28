/**
 * Сравнение двух запусков optimizer.
 *
 * Нужно, чтобы benchmark показывал не «кто быстрее», а разницу по
 * Final Score, Star и coverage. Gap считается только когда есть
 * DFS-reference с конечным score: −∞ означает «нет валидного layout»,
 * а не «очень плохой score», и вычитать из него нельзя.
 */

import type {
  OptimizerComparison,
  OptimizerComparisonSnapshot,
  OptimizerResult,
} from "./search-types.ts";

export function compareOptimizerResults(a: OptimizerResult, b: OptimizerResult): OptimizerComparison {
  const snapA = snapshot(a);
  const snapB = snapshot(b);
  const comparison: OptimizerComparison = {
    a: snapA,
    b: snapB,
    scoreDelta: snapA.finalScore - snapB.finalScore,
    activatedStarsDelta: snapA.activatedStars - snapB.activatedStars,
    effectCoverageDelta: snapA.effectCoverage - snapB.effectCoverage,
    placedItemsDelta: snapA.placedItems - snapB.placedItems,
    occupiedCellsDelta: snapA.occupiedCells - snapB.occupiedCells,
    durationMsDelta: snapA.durationMs - snapB.durationMs,
  };

  const dfs = pickByAlgorithm(a, b, "dfs");
  const beam = pickByAlgorithm(a, b, "beam");
  if (dfs && beam) {
    const referenceScore = dfs.score.valid ? dfs.score.score : Number.NEGATIVE_INFINITY;
    comparison.referenceExhaustive = dfs.searchExhaustive;
    if (referenceScore !== Number.NEGATIVE_INFINITY) {
      const beamScore = beam.score.valid ? beam.score.score : Number.NEGATIVE_INFINITY;
      comparison.gap = referenceScore - beamScore;
    }
  }

  return comparison;
}

function snapshot(result: OptimizerResult): OptimizerComparisonSnapshot {
  return {
    algorithm: result.metrics?.algorithm,
    finalScore: result.score.valid ? result.score.score : Number.NEGATIVE_INFINITY,
    activatedStars: result.score.breakdown.activatedStars,
    effectCoverage: result.score.effectCoverage.normalizedEffects,
    placedItems: result.placedItems.length,
    occupiedCells: result.score.breakdown.occupiedCells,
    durationMs: result.stats.durationMs,
    complete: result.complete,
    searchExhaustive: result.searchExhaustive,
  };
}

function pickByAlgorithm(
  a: OptimizerResult,
  b: OptimizerResult,
  algorithm: "beam" | "greedy" | "dfs",
): OptimizerResult | undefined {
  if (a.metrics?.algorithm === algorithm) return a;
  if (b.metrics?.algorithm === algorithm) return b;
  return undefined;
}
