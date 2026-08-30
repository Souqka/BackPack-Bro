/**
 * Map already-scored star activations onto a JSON-safe explanation DTO.
 * Does not re-run Placement Engine, Scoring Engine, or Adaptive Search.
 */

import type { InventoryState, Item } from "../../inventory/types.ts";
import { getBoundInventoryAnalysis } from "../../scoring/analysis-bind.ts";
import { buildPlacementFacts } from "../../scoring/rules.ts";
import type { PlacementScore } from "../../scoring/types.ts";
import type { OptimizerLayout } from "../search-types.ts";
import type { OptimizedStarActivation, OptimizerExplanation } from "./types.ts";

export function extractOptimizerExplanation(
  score: PlacementScore,
  layout: OptimizerLayout,
  catalog: Map<string, Item>,
  rows: number,
  cols: number,
): OptimizerExplanation {
  if (!score.valid) return { activatedStars: [] };
  const analysis = getBoundInventoryAnalysis(score);
  if (!analysis) return { activatedStars: [] };

  const state: InventoryState = {
    inventory: { rows, cols },
    items: layout.items,
  };
  const facts = buildPlacementFacts(analysis, state, catalog);
  const activatedStars: OptimizedStarActivation[] = facts.activeStars.map((fact) => ({
    sourceInstanceId: fact.sourceInstanceId,
    sourceItemId: fact.sourceItemId,
    targetInstanceId: fact.targetInstanceId,
    targetItemId: fact.targetItemId,
    row: fact.starPosition.row,
    col: fact.starPosition.col,
  }));
  return { activatedStars };
}
