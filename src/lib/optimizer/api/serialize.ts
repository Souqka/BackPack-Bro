/**
 * Sole mapper from AdaptiveOptimizerResult onto the production DTO.
 * Do not serialize Adaptive results in optimizer.ts, adaptive.ts, or callers.
 */

import type { AdaptiveOptimizerResult } from "../adaptive-types.ts";
import { getOptimizerStateSignature } from "../signature.ts";
import type { OptimizerAlternative, OptimizerLayout } from "../search-types.ts";
import type { PlacementScore } from "../../scoring/types.ts";
import type { ItemToPlace, PlacedItem } from "../types.ts";
import type { PlacedBag } from "../bags/types.ts";
import { extractActiveStats } from "./active-stats.ts";
import { extractBagBonuses } from "./bag-bonuses.ts";
import type { Item } from "../../inventory/types.ts";
import type {
  OptimizedInstance,
  OptimizedLayout,
  OptimizedLayoutResult,
  OptimizedPlacement,
  OptimizedScore,
  OptimizeInventorySuccess,
} from "./types.ts";

export function serializeOptimizerResult(
  result: AdaptiveOptimizerResult,
  publicResultCount: number,
  catalog: Map<string, Item>,
): OptimizeInventorySuccess {
  const rows = result.bestState.backpack.rows;
  const cols = result.bestState.backpack.cols;
  const ranked: OptimizedLayoutResult[] = [
    toLayoutResult(
      result.layout,
      result.score,
      result.complete,
      result.unplacedItems,
      result.unplacedBags,
      getOptimizerStateSignature(result.bestState),
      rows,
      cols,
      catalog,
    ),
    ...result.alternatives.map((entry) => alternativeToLayoutResult(entry, rows, cols, catalog)),
  ].slice(0, publicResultCount);

  const best = ranked[0]!;
  return {
    ok: true,
    layout: best.layout,
    score: best.score,
    complete: best.complete,
    signature: best.signature,
    results: ranked,
    execution: {
      stopReason: result.adaptive.stopReason,
      durationMs: result.adaptive.durationMs,
    },
  };
}

function alternativeToLayoutResult(
  entry: OptimizerAlternative,
  rows: number,
  cols: number,
  catalog: Map<string, Item>,
): OptimizedLayoutResult {
  return toLayoutResult(
    entry.layout,
    entry.score,
    entry.complete,
    entry.unplacedItems,
    entry.unplacedBags,
    entry.signature,
    rows,
    cols,
    catalog,
  );
}

function toLayoutResult(
  layout: OptimizerLayout,
  score: PlacementScore,
  complete: boolean,
  unplacedItems: ItemToPlace[],
  unplacedBags: ItemToPlace[],
  signature: string,
  rows: number,
  cols: number,
  catalog: Map<string, Item>,
): OptimizedLayoutResult {
  return {
    layout: {
      rows,
      cols,
      bags: layout.bags.map(toPlacement),
      items: layout.items.map(toPlacement),
      unplacedItems: unplacedItems.map(toInstance),
      unplacedBags: unplacedBags.map(toInstance),
    },
    score: toScore(score, layout, catalog, rows, cols),
    bagBonuses: extractBagBonuses(layout, catalog),
    complete,
    signature,
  };
}

function toPlacement(placed: PlacedItem | PlacedBag): OptimizedPlacement {
  return {
    instanceId: placed.instanceId,
    itemId: placed.itemId,
    row: placed.position.row,
    col: placed.position.col,
    rotation: placed.rotation,
  };
}

function toInstance(entry: ItemToPlace): OptimizedInstance {
  return { instanceId: entry.instanceId, itemId: entry.itemId };
}

function toScore(
  score: PlacementScore,
  layout: OptimizerLayout,
  catalog: Map<string, Item>,
  rows: number,
  cols: number,
): OptimizedScore {
  return {
    valid: score.valid,
    structuralScore: Number.isFinite(score.score) ? score.score : null,
    activatedStars: score.breakdown.activatedStars,
    effectCoverage: score.effectCoverage.normalizedEffects,
    activeStats: extractActiveStats(score, layout, catalog, rows, cols),
  };
}
