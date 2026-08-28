/**
 * Structural score и Effect Coverage.
 *
 * Structural: число активных Star × вес. Эффекты в очки не переводятся.
 * Coverage: сколько эффектов активных Star система понимает.
 * occupiedCells / emptyCells — метрики, на score не влияют.
 */

import { positionKey, resolvePlacedGeometry } from "../inventory/geometry.ts";
import type { InventoryState, Item } from "../inventory/types.ts";
import { classifyEffect } from "./rules.ts";
import type {
  ActiveStarFact,
  EffectCoverage,
  PlacementFacts,
  ScoreBreakdown,
  ScoreComponent,
  Synergy,
} from "./types.ts";

export function emptyEffectCoverage(): EffectCoverage {
  return {
    totalActiveEffects: 0,
    normalizedEffects: 0,
    rawEffects: 0,
    unsupportedEffects: 0,
  };
}

export function calculateEffectCoverage(
  facts: PlacementFacts,
  catalog: Map<string, Item>,
): EffectCoverage {
  const coverage = emptyEffectCoverage();
  for (const fact of facts.activeStars) {
    addFactEffects(coverage, fact, catalog);
  }
  return coverage;
}

function addFactEffects(
  coverage: EffectCoverage,
  fact: ActiveStarFact,
  catalog: Map<string, Item>,
): void {
  const source = catalog.get(fact.sourceItemId);
  if (!source?.star) return;
  for (const ruleIndex of fact.matchingRuleIndexes) {
    const rule = source.star.rules[ruleIndex];
    if (!rule) continue;
    for (const wrapped of rule.effects) {
      coverage.totalActiveEffects += 1;
      const kind = classifyEffect(wrapped.effect);
      if (kind === "normalized") coverage.normalizedEffects += 1;
      else if (kind === "raw") coverage.rawEffects += 1;
      else coverage.unsupportedEffects += 1;
    }
  }
}

export function calculateStructuralScore(
  synergies: Synergy[],
  state: InventoryState,
  catalog: Map<string, Item>,
): { score: number; breakdown: ScoreBreakdown } {
  const components: ScoreComponent[] = [];
  let score = 0;
  let activatedStars = 0;
  let unsupportedInteractions = 0;
  let unknownInteractions = 0;

  for (const synergy of synergies) {
    if (synergy.type === "star_effect") continue;

    if (synergy.type === "star_activation" && synergy.status === "active") {
      activatedStars += 1;
      score += synergy.score;
      components.push({
        type: "activated_star",
        score: synergy.score,
        sourceInstanceId: synergy.sourceInstanceId,
        targetInstanceId: synergy.targetInstanceIds[0],
        reason: synergy.reason ?? "Активированная Star",
      });
      continue;
    }

    if (synergy.status === "unsupported") {
      unsupportedInteractions += 1;
      components.push({
        type: "unsupported_interaction",
        score: 0,
        sourceInstanceId: synergy.sourceInstanceId,
        targetInstanceId: synergy.targetInstanceIds[0],
        reason: synergy.reason ?? "Неподдерживаемое взаимодействие",
      });
      continue;
    }

    if (synergy.status === "unknown" || synergy.type === "unknown") {
      unknownInteractions += 1;
      components.push({
        type: "unknown_interaction",
        score: 0,
        sourceInstanceId: synergy.sourceInstanceId,
        targetInstanceId: synergy.targetInstanceIds[0],
        reason: synergy.reason ?? "Неизвестное взаимодействие",
      });
    }
  }

  const { occupiedCells, emptyCells } = occupancyMetrics(state, catalog);

  return {
    score,
    breakdown: {
      total: score,
      activatedStars,
      unsupportedInteractions,
      unknownInteractions,
      itemsPlaced: state.items.length,
      occupiedCells,
      emptyCells,
      components,
    },
  };
}

export function occupancyMetrics(
  state: InventoryState,
  catalog: Map<string, Item>,
): { occupiedCells: number; emptyCells: number } {
  const occupied = new Set<string>();
  for (const placed of state.items) {
    const item = catalog.get(placed.itemId);
    if (!item) continue;
    const geometry = resolvePlacedGeometry(item, placed);
    for (const cell of geometry.cells) {
      if (
        cell.row >= 0 &&
        cell.col >= 0 &&
        cell.row < state.inventory.rows &&
        cell.col < state.inventory.cols
      ) {
        occupied.add(positionKey(cell));
      }
    }
  }
  const total = state.inventory.rows * state.inventory.cols;
  return { occupiedCells: occupied.size, emptyCells: total - occupied.size };
}

export function invalidBreakdown(reason: string): ScoreBreakdown {
  return {
    total: Number.NEGATIVE_INFINITY,
    activatedStars: 0,
    unsupportedInteractions: 0,
    unknownInteractions: 0,
    itemsPlaced: 0,
    occupiedCells: 0,
    emptyCells: 0,
    components: [
      {
        type: "invalid_placement",
        score: Number.NEGATIVE_INFINITY,
        reason,
      },
    ],
  };
}
