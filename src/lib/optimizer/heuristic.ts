/**
 * Heuristic partial state для Beam Search.
 *
 * Это оценка перспективности ветки, не Final Score и не DPS.
 * Боевые величины Wiki в очки не переводятся.
 *
 * heuristic = structural + effectCoverage + futurePotential + placementQuality - remainingPenalty
 */

import type { Item } from "../inventory/types.ts";
import { analyzePlacementScore } from "../scoring/analyzer.ts";
import { itemCouldActivateStar } from "./ordering.ts";
import type { OptimizerState, PartialStateScore } from "./search-types.ts";
import type { ItemToPlace } from "./types.ts";

export interface HeuristicWeights {
  structural: number;
  effectCoverage: number;
  futurePotential: number;
  placementQuality: number;
  remainingPenalty: number;
}

/** Коэффициенты поиска, не игровые статы. */
export const DEFAULT_HEURISTIC_WEIGHTS: HeuristicWeights = {
  structural: 10,
  effectCoverage: 1,
  futurePotential: 1,
  placementQuality: 1,
  remainingPenalty: 2,
};

export function resolveHeuristicWeights(partial?: Partial<HeuristicWeights>): HeuristicWeights {
  return { ...DEFAULT_HEURISTIC_WEIGHTS, ...partial };
}

export function evaluatePartialState(
  state: OptimizerState,
  remainingItems: ItemToPlace[],
  catalog: Map<string, Item>,
  weights?: Partial<HeuristicWeights>,
): PartialStateScore {
  const w = resolveHeuristicWeights(weights);
  const freeCells = state.bags.availableCells.size - state.items.occupiedCells.size;
  const remainingCells = remainingItemCells(remainingItems, catalog);
  const feasible = remainingCells <= freeCells && freeCells >= 0;

  const placement = analyzePlacementScore(
    { inventory: state.backpack, items: state.items.items },
    catalog,
  );
  const structural = placement.valid ? placement.score : 0;
  const effectCoverage = placement.effectCoverage.normalizedEffects;
  const placementQuality = state.items.items.length;
  const futurePotential = countFutureStarPotential(state, remainingItems, catalog);
  const remainingPenalty = remainingItems.length;

  const total = feasible
    ? w.structural * structural +
      w.effectCoverage * effectCoverage +
      w.futurePotential * futurePotential +
      w.placementQuality * placementQuality -
      w.remainingPenalty * remainingPenalty
    : Number.NEGATIVE_INFINITY;

  return {
    total,
    structural,
    effectCoverage,
    placementQuality,
    futurePotential,
    remainingPenalty,
    feasible,
  };
}

export function remainingItemCells(items: ItemToPlace[], catalog: Map<string, Item>): number {
  let total = 0;
  for (const item of items) {
    const catalogItem = catalog.get(item.itemId);
    if (!catalogItem) return Number.POSITIVE_INFINITY;
    total += catalogItem.geometry.cells.length;
  }
  return total;
}

function countFutureStarPotential(
  state: OptimizerState,
  remainingItems: ItemToPlace[],
  catalog: Map<string, Item>,
): number {
  let potential = 0;
  const placed = state.items.items;
  for (const remaining of remainingItems) {
    const remainingItem = catalog.get(remaining.itemId);
    if (!remainingItem) continue;
    for (const placedItem of placed) {
      const source = catalog.get(placedItem.itemId);
      if (!source) continue;
      if (itemCouldActivateStar(source, remainingItem)) potential += 1;
      if (itemCouldActivateStar(remainingItem, source)) potential += 1;
    }
  }
  return potential;
}
