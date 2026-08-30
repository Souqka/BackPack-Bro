/**
 * Compact Stage 17 production-API benchmark on existing suite cases.
 */

import type { Item } from "../../../inventory/types.ts";
import { optimizeInventory } from "../../api/service.ts";
import type { ProductionQuality } from "../../api/types.ts";
import { getBenchmarkCase } from "../cases.ts";
import type { OptimizerBenchmarkCase } from "../types.ts";

export const STAGE17_CASE_IDS = [
  "A-simple",
  "G-competing-stars",
  "J-bag-item-topology",
  "E-tight-space",
  "H-multiple-bags",
] as const;

export const STAGE17_PRESETS: ProductionQuality[] = ["fast", "balanced", "high"];

export interface Stage17Row {
  caseId: string;
  preset: ProductionQuality;
  score: number | null;
  stars: number;
  complete: boolean;
  durationMs: number;
  stopReason: string;
  resultCount: number;
  ok: true;
}

export interface Stage17FailureRow {
  caseId: string;
  preset: ProductionQuality;
  ok: false;
  errorCode: string;
  message: string;
}

export interface Stage17Report {
  elapsedMs: number;
  rows: Array<Stage17Row | Stage17FailureRow>;
}

export function stage17Cases(): OptimizerBenchmarkCase[] {
  return STAGE17_CASE_IDS.map((id) => getBenchmarkCase(id));
}

export function buildStage17Report(catalog: Map<string, Item>): Stage17Report {
  const started = Date.now();
  const rows: Stage17Report["rows"] = [];
  for (const entry of stage17Cases()) {
    for (const preset of STAGE17_PRESETS) {
      const result = optimizeInventory(
        {
          rows: entry.inventory.rows,
          cols: entry.inventory.cols,
          bagItemIds: entry.bags.map((bag) => bag.itemId),
          itemIds: entry.items.map((item) => item.itemId),
          options: { quality: preset, resultCount: 3 },
        },
        catalog,
      );
      if (!result.ok) {
        rows.push({
          caseId: entry.id,
          preset,
          ok: false,
          errorCode: result.error.code,
          message: result.error.message,
        });
        continue;
      }
      rows.push({
        caseId: entry.id,
        preset,
        ok: true,
        score: result.score.structuralScore,
        stars: result.score.activatedStars,
        complete: result.complete,
        durationMs: result.execution.durationMs,
        stopReason: result.execution.stopReason,
        resultCount: result.results.length,
      });
    }
  }
  return { elapsedMs: Date.now() - started, rows };
}
