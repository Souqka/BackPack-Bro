/**
 * Метрики benchmark: проекция OptimizerResult → строки отчёта.
 */

import type { OptimizerMetrics, OptimizerResult } from "../search-types.ts";
import type { BeamWidthRow } from "./types.ts";

export function requireMetrics(result: OptimizerResult): OptimizerMetrics {
  if (!result.metrics) {
    throw new Error("Нет metrics: запустите runOptimizer с options.metrics !== false");
  }
  return result.metrics;
}

export function toBeamWidthRow(caseId: string, beamWidth: number, result: OptimizerResult): BeamWidthRow {
  const metrics = requireMetrics(result);
  return {
    caseId,
    beamWidth,
    score: metrics.finalScore,
    activatedStars: metrics.activatedStars,
    effectCoverage: metrics.normalizedEffects,
    placedItems: metrics.placedItems,
    complete: metrics.complete,
    durationMs: metrics.durationMs,
    statesGenerated: metrics.statesGenerated,
    statesPruned: metrics.statesPruned,
    candidatesGenerated: metrics.candidatesGenerated,
  };
}
