/**
 * Heuristic partial state для Beam Search.
 *
 * Это оценка перспективности ветки, не Final Score и не DPS.
 * Боевые величины Wiki в очки не переводятся.
 *
 * heuristic = 10×structural + 1×effectCoverage + 1×futurePotential
 *           + 1×placementQuality − 2×remainingPenalty
 *
 * Коэффициенты — поисковые, не игровые. Их нельзя крутить без benchmark:
 * structural доминирует, чтобы ветка с уже активной Star не проигрывала
 * ветке «больше предметов, но без активации». remainingPenalty отсекает
 * откладывание сложных Items на потом.
 */

import { positionKey } from "../inventory/geometry.ts";
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

/**
 * Оценка ещё не полученных Star-взаимодействий.
 *
 * Считаем только геометрию и известные Star activation rules
 * (`matchingStarRuleIndexes` / `itemCouldActivateStar`).
 *
 * Почему не «все пары placed×remaining»:
 * - Star, которая уже занята Item-клеткой, не даст вторую активацию;
 * - Star вне availableCells (в том числе за 6×9) нельзя накрыть Item —
 *   Items живут только на клетках Bags внутри рюкзака;
 * - raw / unsupported / unknown mechanic не становятся «потенциальной синергией»;
 * - пары remaining×remaining не считаем: без позиции это выдуманная плотность.
 *
 * remaining source → placed occupant: +1, если у remaining есть Star geometry
 * и хотя бы одно известное правило подходит к уже стоящему предмету.
 * Полный Scoring Engine здесь не вызывается.
 */
export function countFutureStarPotential(
  state: OptimizerState,
  remainingItems: ItemToPlace[],
  catalog: Map<string, Item>,
): number {
  const remainingCatalog: Item[] = [];
  for (const remaining of remainingItems) {
    const item = catalog.get(remaining.itemId);
    if (item) remainingCatalog.push(item);
  }

  let potential = 0;
  const occupied = state.items.occupiedCells;
  const available = state.bags.availableCells;

  for (const placed of state.items.items) {
    const source = catalog.get(placed.itemId);
    if (!source) continue;
    const geometry = state.items.itemGeometries.get(placed.instanceId);
    const stars = geometry?.stars ?? [];
    const fillableStars = stars.filter((star) => {
      const key = positionKey(star);
      return !occupied.has(key) && available.has(key);
    });
    if (fillableStars.length === 0) continue;
    const matchingRemaining = remainingCatalog.filter((item) => itemCouldActivateStar(source, item));
    if (matchingRemaining.length === 0) continue;
    potential += Math.min(fillableStars.length, matchingRemaining.length);
  }

  for (const remaining of remainingCatalog) {
    if (remaining.geometry.stars.length === 0) continue;
    if (!remaining.star || remaining.star.rules.length === 0) continue;
    const matchesPlaced = state.items.items.some((placed) => {
      const occupant = catalog.get(placed.itemId);
      return occupant !== undefined && itemCouldActivateStar(remaining, occupant);
    });
    if (matchesPlaced) potential += 1;
  }

  return potential;
}
