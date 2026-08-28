/**
 * Сбор OptimizerMetrics из результата поиска.
 *
 * Final Score всегда из PlacementScore (Scoring Engine).
 * statesGenerated/Pruned — сумма bag- и item-фаз: так benchmark видит
 * стоимость всего двухслойного поиска, а не только Items.
 */

import type {
  HeuristicInversionReport,
  HeuristicSample,
  OptimizerMetrics,
  OptimizerResult,
  OptimizerStats,
} from "./search-types.ts";

export function createEmptyStats(): OptimizerStats {
  return {
    bagStatesGenerated: 0,
    bagStatesPruned: 0,
    itemStatesGenerated: 0,
    itemStatesPruned: 0,
    candidatesGenerated: 0,
    searchDepth: 0,
    durationMs: 0,
  };
}

export function toOptimizerMetrics(
  result: Omit<OptimizerResult, "metrics">,
  algorithm: OptimizerMetrics["algorithm"],
  searchExhaustive: boolean,
  extra?: {
    beamWidth?: number;
    bagBeamWidth?: number;
    localSearch?: {
      enabled: boolean;
      iterations: number;
      neighbors: number;
      improvements: number;
      initialScore: number;
    };
  },
): OptimizerMetrics {
  const score = result.score.valid ? result.score.score : Number.NEGATIVE_INFINITY;
  const initialScore = extra?.localSearch?.initialScore ?? score;
  return {
    algorithm,
    durationMs: result.stats.durationMs,
    statesGenerated: result.stats.bagStatesGenerated + result.stats.itemStatesGenerated,
    statesPruned: result.stats.bagStatesPruned + result.stats.itemStatesPruned,
    candidatesGenerated: result.stats.candidatesGenerated,
    searchDepth: result.stats.searchDepth,
    finalScore: score,
    activatedStars: result.score.breakdown.activatedStars,
    normalizedEffects: result.score.effectCoverage.normalizedEffects,
    rawEffects: result.score.effectCoverage.rawEffects,
    occupiedCells: result.score.breakdown.occupiedCells,
    emptyCells: result.score.breakdown.emptyCells,
    placedItems: result.placedItems.length,
    unplacedItems: result.unplacedItems.length,
    complete: result.complete,
    searchExhaustive,
    beamWidth: extra?.beamWidth,
    bagBeamWidth: extra?.bagBeamWidth,
    localSearchEnabled: extra?.localSearch?.enabled ?? false,
    localSearchIterations: extra?.localSearch?.iterations ?? 0,
    localSearchNeighbors: extra?.localSearch?.neighbors ?? 0,
    localSearchImprovements: extra?.localSearch?.improvements ?? 0,
    initialScore,
    scoreDelta: score === Number.NEGATIVE_INFINITY || initialScore === Number.NEGATIVE_INFINITY
      ? 0
      : score - initialScore,
  };
}

/**
 * Ищет пары partial-state, где heuristic врёт относительно финального score.
 *
 * Сравнивать разные depth нельзя: у более глубокого узла heuristic почти всегда
 * выше из-за placementQuality и меньшего remainingPenalty. Поэтому inversionRate
 * считается и по всем парам, и отдельно по одному depth.
 *
 * Эвристика не обязана быть точной: ненулевой sameDepthInversionRate — норма,
 * а не повод крутить коэффициенты без benchmark.
 */
export function analyzeHeuristicInversions(samples: HeuristicSample[]): HeuristicInversionReport {
  const pair = countInversions(samples);
  const byDepth = new Map<number, HeuristicSample[]>();
  for (const sample of samples) {
    const list = byDepth.get(sample.depth) ?? [];
    list.push(sample);
    byDepth.set(sample.depth, list);
  }
  let sameDepthPairCount = 0;
  let sameDepthInversionCount = 0;
  for (const group of byDepth.values()) {
    const counted = countInversions(group);
    sameDepthPairCount += counted.pairCount;
    sameDepthInversionCount += counted.inversionCount;
  }
  return {
    sampleCount: samples.length,
    pairCount: pair.pairCount,
    inversionCount: pair.inversionCount,
    inversionRate: pair.pairCount === 0 ? 0 : pair.inversionCount / pair.pairCount,
    sameDepthPairCount,
    sameDepthInversionCount,
    sameDepthInversionRate:
      sameDepthPairCount === 0 ? 0 : sameDepthInversionCount / sameDepthPairCount,
  };
}

function countInversions(samples: HeuristicSample[]): { pairCount: number; inversionCount: number } {
  let pairCount = 0;
  let inversionCount = 0;
  for (let i = 0; i < samples.length; i++) {
    for (let j = i + 1; j < samples.length; j++) {
      const a = samples[i]!;
      const b = samples[j]!;
      if (a.heuristic === b.heuristic || a.finalScore === b.finalScore) continue;
      pairCount += 1;
      if (a.heuristic > b.heuristic && a.finalScore < b.finalScore) inversionCount += 1;
      if (b.heuristic > a.heuristic && b.finalScore < a.finalScore) inversionCount += 1;
    }
  }
  return { pairCount, inversionCount };
}
