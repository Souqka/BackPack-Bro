/**
 * Defaults for Joint Bag + Item Local Search.
 * Single source so iterations / repair width are not copied across files.
 */

import type { BagLocalSearchOptions } from "./search-types.ts";

export const DEFAULT_BAG_LOCAL_SEARCH_OPTIONS: Required<BagLocalSearchOptions> = {
  maxIterations: 5,
  maxNeighbors: 16,
  repairBeamWidth: 4,
  itemLocalSearch: true,
};

export function resolveBagLocalSearchOptions(
  value?: boolean | BagLocalSearchOptions,
  aliases?: { iterations?: number; repairBeamWidth?: number },
): Required<BagLocalSearchOptions> | null {
  if (value === undefined || value === false) return null;
  const base =
    value === true
      ? { ...DEFAULT_BAG_LOCAL_SEARCH_OPTIONS }
      : { ...DEFAULT_BAG_LOCAL_SEARCH_OPTIONS, ...value };
  if (aliases?.iterations !== undefined) base.maxIterations = aliases.iterations;
  if (aliases?.repairBeamWidth !== undefined) base.repairBeamWidth = aliases.repairBeamWidth;
  return base;
}

export interface BagLocalSearchStats {
  iterations: number;
  bagNeighborsGenerated: number;
  bagNeighborsVisited: number;
  bagNeighborsPruned: number;
  bagLayoutsAccepted: number;
  displacedItems: number;
  repairedItems: number;
  unrepairedItems: number;
  repairStatesGenerated: number;
  repairStatesPruned: number;
  visitedBagLayouts: number;
  initialScore: number;
  finalScore: number;
  scoreDelta: number;
  durationMs: number;
  repairDurationMs: number;
  itemLocalSearchDurationMs: number;
}

export function emptyBagLocalSearchStats(initialScore = Number.NEGATIVE_INFINITY): BagLocalSearchStats {
  return {
    iterations: 0,
    bagNeighborsGenerated: 0,
    bagNeighborsVisited: 0,
    bagNeighborsPruned: 0,
    bagLayoutsAccepted: 0,
    displacedItems: 0,
    repairedItems: 0,
    unrepairedItems: 0,
    repairStatesGenerated: 0,
    repairStatesPruned: 0,
    visitedBagLayouts: 0,
    initialScore,
    finalScore: initialScore,
    scoreDelta: 0,
    durationMs: 0,
    repairDurationMs: 0,
    itemLocalSearchDurationMs: 0,
  };
}

export function mergeBagLocalSearchStats(parts: BagLocalSearchStats[]): BagLocalSearchStats {
  if (parts.length === 0) return emptyBagLocalSearchStats();
  const first = parts[0]!;
  const merged = emptyBagLocalSearchStats(first.initialScore);
  let bestFinal = first.finalScore;
  for (const part of parts) {
    merged.iterations += part.iterations;
    merged.bagNeighborsGenerated += part.bagNeighborsGenerated;
    merged.bagNeighborsVisited += part.bagNeighborsVisited;
    merged.bagNeighborsPruned += part.bagNeighborsPruned;
    merged.bagLayoutsAccepted += part.bagLayoutsAccepted;
    merged.displacedItems += part.displacedItems;
    merged.repairedItems += part.repairedItems;
    merged.unrepairedItems += part.unrepairedItems;
    merged.repairStatesGenerated += part.repairStatesGenerated;
    merged.repairStatesPruned += part.repairStatesPruned;
    merged.visitedBagLayouts += part.visitedBagLayouts;
    merged.durationMs += part.durationMs;
    merged.repairDurationMs += part.repairDurationMs;
    merged.itemLocalSearchDurationMs += part.itemLocalSearchDurationMs;
    if (part.finalScore > bestFinal) bestFinal = part.finalScore;
  }
  merged.finalScore = bestFinal;
  merged.scoreDelta =
    merged.initialScore === Number.NEGATIVE_INFINITY || bestFinal === Number.NEGATIVE_INFINITY
      ? 0
      : bestFinal - merged.initialScore;
  return merged;
}
