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

import type { RankedLayout } from "./search-types.ts";

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

function finiteScore(layout: RankedLayout): number {
  if (!layout.score.valid) return Number.NEGATIVE_INFINITY;
  return layout.score.score;
}
