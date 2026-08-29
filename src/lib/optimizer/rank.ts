/**
 * Детерминированное сравнение layout.
 *
 * Partial heuristic сюда не входит: ранжирование финальных кандидатов
 * идёт только по Scoring Engine и структурным tie-break.
 *
 * Порядок:
 * 1) complete layout > incomplete (полная расстановка важнее локально высокого score);
 * 2) finalScore DESC;
 * 3) activatedStars DESC;
 * 4) effectCoverage (normalizedEffects, затем totalActiveEffects) DESC;
 * 5) placedItems DESC;
 * 6) occupiedCells DESC — больше занятой площади при равном score обычно значит
 *    меньше «пустых» клеток Bags, это стабильный геометрический tie-break;
 * 7) canonicalSignature ASC.
 */

import type { Item } from "../inventory/types.ts";
import { emptyEffectCoverage, invalidBreakdown } from "../scoring/score.ts";
import { INVALID_PLACEMENT_SCORE } from "../scoring/weights.ts";
import { scoreLayout } from "./score-cache.ts";
import type { OptimizerState, RankedLayout } from "./search-types.ts";
import { getOptimizerStateSignature } from "./signature.ts";
import type { ItemToPlace } from "./types.ts";

export function compareRankedLayouts(a: RankedLayout, b: RankedLayout): number {
  if (a.complete !== b.complete) return a.complete ? -1 : 1;

  const scoreA = finiteScore(a);
  const scoreB = finiteScore(b);
  if (scoreA !== scoreB) return scoreB - scoreA;

  const starsA = a.score.breakdown.activatedStars;
  const starsB = b.score.breakdown.activatedStars;
  if (starsA !== starsB) return starsB - starsA;

  const covA = a.score.effectCoverage.normalizedEffects;
  const covB = b.score.effectCoverage.normalizedEffects;
  if (covA !== covB) return covB - covA;

  const totalA = a.score.effectCoverage.totalActiveEffects;
  const totalB = b.score.effectCoverage.totalActiveEffects;
  if (totalA !== totalB) return totalB - totalA;

  const placedA = a.state.items.items.length;
  const placedB = b.state.items.items.length;
  if (placedA !== placedB) return placedB - placedA;

  const occA = a.score.breakdown.occupiedCells;
  const occB = b.score.breakdown.occupiedCells;
  if (occA !== occB) return occB - occA;

  if (a.signature < b.signature) return -1;
  if (a.signature > b.signature) return 1;
  return 0;
}

export function sortRankedLayouts(layouts: RankedLayout[]): RankedLayout[] {
  return [...layouts].sort(compareRankedLayouts);
}

/**
 * Строгое улучшение качества без signature.
 *
 * Local Search не должен ходить между layout с одинаковым score
 * только потому, что каноническая подпись лексикографически меньше —
 * иначе возникнет бесконечный обход эквивалентных геометрий.
 */
export function isStrictlyBetterLayout(candidate: RankedLayout, current: RankedLayout): boolean {
  if (candidate.complete !== current.complete) return candidate.complete;

  const scoreA = finiteScore(candidate);
  const scoreB = finiteScore(current);
  if (scoreA !== scoreB) return scoreA > scoreB;

  const starsA = candidate.score.breakdown.activatedStars;
  const starsB = current.score.breakdown.activatedStars;
  if (starsA !== starsB) return starsA > starsB;

  const covA = candidate.score.effectCoverage.normalizedEffects;
  const covB = current.score.effectCoverage.normalizedEffects;
  if (covA !== covB) return covA > covB;

  const totalA = candidate.score.effectCoverage.totalActiveEffects;
  const totalB = current.score.effectCoverage.totalActiveEffects;
  if (totalA !== totalB) return totalA > totalB;

  const placedA = candidate.state.items.items.length;
  const placedB = current.state.items.items.length;
  if (placedA !== placedB) return placedA > placedB;

  const occA = candidate.score.breakdown.occupiedCells;
  const occB = current.score.breakdown.occupiedCells;
  if (occA !== occB) return occA > occB;

  return false;
}

function finiteScore(layout: RankedLayout): number {
  if (!layout.score.valid) return Number.NEGATIVE_INFINITY;
  return layout.score.score;
}

export function buildRankedLayout(
  state: OptimizerState,
  unplacedItems: ItemToPlace[],
  unplacedBags: ItemToPlace[],
  catalog: Map<string, Item>,
): RankedLayout {
  const score =
    state.items.items.length === 0 && state.bags.bags.length === 0
      ? {
          valid: false as const,
          score: INVALID_PLACEMENT_SCORE,
          breakdown: invalidBreakdown("Нет валидного Bag layout"),
          effectCoverage: emptyEffectCoverage(),
          synergies: [],
          graph: { nodes: [], edges: [] },
        }
      : scoreLayout(state, catalog);
  return {
    state,
    score,
    unplacedItems,
    unplacedBags,
    complete:
      unplacedItems.length === 0 && unplacedBags.length === 0 && state.bags.bags.length > 0,
    signature: getOptimizerStateSignature(state),
  };
}
