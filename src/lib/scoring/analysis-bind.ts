/**
 * Associates a PlacementScore with the InventoryAnalysis it was built from.
 *
 * Incremental scoring reuses previous overlaps from this binding. The map
 * is keyed by object identity of the score (including frozen cache entries).
 * It is not a second score cache.
 */

import type { InventoryAnalysis } from "../inventory/types.ts";
import type { PlacementScore } from "./types.ts";

const analysisByScore = new WeakMap<PlacementScore, InventoryAnalysis>();

export function bindInventoryAnalysis(score: PlacementScore, analysis: InventoryAnalysis): void {
  analysisByScore.set(score, analysis);
}

export function getBoundInventoryAnalysis(score: PlacementScore): InventoryAnalysis | undefined {
  return analysisByScore.get(score);
}
