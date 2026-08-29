/**
 * Публичный анализатор расстановки: Placement Engine один раз, затем scoring.
 *
 * Асимптотика: O(клетки + Stars) на analysis + O(активные взаимодействия + эффекты)
 * на scoring. Геометрия для каждой scoring-rule повторно не считается.
 */

import { analyzeInventory } from "../inventory/inventory.ts";
import type { InventoryAnalysis, InventoryState, Item } from "../inventory/types.ts";
import { bindInventoryAnalysis } from "./analysis-bind.ts";
import { buildSynergyGraph } from "./graph.ts";
import { buildPlacementFacts } from "./rules.ts";
import {
  calculateEffectCoverage,
  calculateStructuralScore,
  emptyEffectCoverage,
  invalidBreakdown,
} from "./score.ts";
import { buildSynergies } from "./synergies.ts";
import type { PlacementScore } from "./types.ts";
import { INVALID_PLACEMENT_SCORE, resolveWeights, type ScoringWeights } from "./weights.ts";

export function analyzePlacementScore(
  state: InventoryState,
  catalog: Map<string, Item>,
  weights?: Partial<ScoringWeights>,
): PlacementScore {
  const analysis = analyzeInventory(state, catalog);
  return scoreInventoryAnalysis(analysis, state, catalog, weights);
}

/**
 * Canonical scoring from an already-built InventoryAnalysis.
 * Incremental scoring must call this rather than inventing a second score.
 */
export function scoreInventoryAnalysis(
  analysis: InventoryAnalysis,
  state: InventoryState,
  catalog: Map<string, Item>,
  weights?: Partial<ScoringWeights>,
): PlacementScore {
  const resolvedWeights = resolveWeights(weights);

  if (!analysis.valid) {
    const reason = invalidReason(analysis.collisions.length, analysis.outOfBounds.length);
    const invalid: PlacementScore = {
      valid: false,
      score: INVALID_PLACEMENT_SCORE,
      breakdown: invalidBreakdown(reason),
      effectCoverage: emptyEffectCoverage(),
      synergies: [],
      graph: { nodes: [], edges: [] },
    };
    bindInventoryAnalysis(invalid, analysis);
    return invalid;
  }

  const facts = buildPlacementFacts(analysis, state, catalog);
  const synergies = buildSynergies(facts, catalog, resolvedWeights);
  const graph = buildSynergyGraph(state, synergies);
  const { score, breakdown } = calculateStructuralScore(synergies, state, catalog);
  const effectCoverage = calculateEffectCoverage(facts, catalog);

  const result: PlacementScore = {
    valid: true,
    score,
    breakdown,
    effectCoverage,
    synergies,
    graph,
  };
  bindInventoryAnalysis(result, analysis);
  return result;
}

/** То же, что analyzePlacementScore: оценка конкретной расстановки. */
export function scoreInventory(
  state: InventoryState,
  catalog: Map<string, Item>,
  weights?: Partial<ScoringWeights>,
): PlacementScore {
  return analyzePlacementScore(state, catalog, weights);
}

function invalidReason(collisionCount: number, outOfBoundsCount: number): string {
  if (collisionCount > 0 && outOfBoundsCount > 0) {
    return "Расстановка невалидна: коллизии и выход за границы";
  }
  if (collisionCount > 0) return "Расстановка невалидна: коллизия Item-клеток";
  return "Расстановка невалидна: Item выходит за границы рюкзака";
}
