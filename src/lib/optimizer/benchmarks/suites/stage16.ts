/**
 * Stage 16 profiling + cache-only vs incremental identity on G–O.
 *
 * Does not change search semantics. Pipeline timings use the optional
 * search-profile sink (zero cost when unset).
 */

import type { Item } from "../../../inventory/types.ts";
import { runAdaptiveOptimizer } from "../../adaptive-search.ts";
import type { AdaptiveOptimizerResult } from "../../adaptive-types.ts";
import { STAGE11_BENCHMARK_CASES } from "../cases.ts";
import {
  summarizePipeline,
  type PipelineCaseMeasurement,
  type PipelineSummary,
} from "../incremental-decision.ts";
import { getOptimizerStateSignature } from "../../optimizer.ts";
import { scoreCacheHitRate } from "../../score-cache.ts";
import { uniqueScoringMs, withSearchPipelineProfile } from "../../search-profile.ts";
import type { OptimizerBenchmarkCase } from "../types.ts";

export interface Stage16ModeRow {
  label: string;
  score: number;
  stars: number;
  complete: boolean;
  signature: string;
  durationMs: number;
  evaluations: number;
  hits: number;
  misses: number;
  uniqueLayouts: number;
  hitRate: number;
  incrementalAttempts: number;
  incrementalSuccesses: number;
  incrementalFallbacks: number;
  incrementalAffectedItems: number;
  incrementalAffectedInteractions: number;
  incrementalAffectedStars: number;
  stopReason: string;
  placed: number;
  unplaced: number;
}

export interface Stage16CaseReport {
  caseId: string;
  name: string;
  description: string;
  scoreSame: boolean;
  starsSame: boolean;
  completeSame: boolean;
  coverageSame: boolean;
  placedSame: boolean;
  unplacedSame: boolean;
  signatureSame: boolean;
  stopReasonSame: boolean;
  topNSame: boolean;
  cacheOnly: Stage16ModeRow;
  incremental: Stage16ModeRow;
  pipeline: PipelineCaseMeasurement;
}

export interface Stage16Report {
  elapsedMs: number;
  cases: Stage16CaseReport[];
  summary: PipelineSummary;
}

export function buildStage16Report(catalog: Map<string, Item>): Stage16Report {
  const started = performance.now();
  const cases = STAGE11_BENCHMARK_CASES.map((entry) => measureCase(entry, catalog));
  return {
    elapsedMs: performance.now() - started,
    cases,
    summary: summarizePipeline(cases.map((entry) => entry.pipeline)),
  };
}

function measureCase(entry: OptimizerBenchmarkCase, catalog: Map<string, Item>): Stage16CaseReport {
  const input = {
    inventory: entry.inventory,
    bags: entry.bags,
    items: entry.items,
    catalog,
    options: { metrics: true as const, dynamicOrdering: false },
  };

  const cacheOnly = timedAdaptive(input, { incrementalScore: false });
  const incremental = timedAdaptive(input);
  const profileStarted = performance.now();
  const profiled = withSearchPipelineProfile(() => runAdaptiveOptimizer(input));
  const profileMs = performance.now() - profileStarted;

  const cacheRow = modeRow("cache-only", cacheOnly.result, cacheOnly.durationMs);
  const incrementalRow = modeRow("incremental", incremental.result, incremental.durationMs);
  const metrics = incremental.result.metrics;

  return {
    caseId: entry.id,
    name: entry.name,
    description: entry.description,
    scoreSame: incremental.result.metrics.finalScore === cacheOnly.result.metrics.finalScore,
    starsSame: incremental.result.metrics.activatedStars === cacheOnly.result.metrics.activatedStars,
    completeSame: incremental.result.complete === cacheOnly.result.complete,
    coverageSame:
      incremental.result.metrics.normalizedEffects === cacheOnly.result.metrics.normalizedEffects,
    placedSame: incremental.result.metrics.placedItems === cacheOnly.result.metrics.placedItems,
    unplacedSame: incremental.result.metrics.unplacedItems === cacheOnly.result.metrics.unplacedItems,
    signatureSame: incrementalRow.signature === cacheRow.signature,
    stopReasonSame: incremental.result.adaptive.stopReason === cacheOnly.result.adaptive.stopReason,
    topNSame: signaturesOf(incremental.result) === signaturesOf(cacheOnly.result),
    cacheOnly: cacheRow,
    incremental: incrementalRow,
    pipeline: {
      caseId: entry.id,
      totalMs: profileMs,
      profile: profiled.profile,
      localSearchMs: metrics.bagItemLocalSearchDurationMs,
      jointMs: metrics.bagLocalSearchDurationMs,
      repairMs: metrics.repairDurationMs,
      cacheOnlyMs: cacheOnly.durationMs,
      incrementalMs: incremental.durationMs,
      incrementalAttempts: metrics.incrementalScoreAttempts,
      incrementalSuccesses: metrics.incrementalScoreSuccesses,
      incrementalFallbacks: metrics.incrementalScoreFallbacks,
    },
  };
}

function timedAdaptive(
  input: Parameters<typeof runAdaptiveOptimizer>[0],
  extra?: Parameters<typeof runAdaptiveOptimizer>[1],
): { result: AdaptiveOptimizerResult; durationMs: number } {
  const first = timedOne(input, extra);
  const second = timedOne(input, extra);
  return first.durationMs <= second.durationMs ? first : second;
}

function timedOne(
  input: Parameters<typeof runAdaptiveOptimizer>[0],
  extra?: Parameters<typeof runAdaptiveOptimizer>[1],
): { result: AdaptiveOptimizerResult; durationMs: number } {
  const started = performance.now();
  const result = runAdaptiveOptimizer(input, extra);
  return { result, durationMs: performance.now() - started };
}

function modeRow(label: string, result: AdaptiveOptimizerResult, durationMs: number): Stage16ModeRow {
  const metrics = result.metrics;
  return {
    label,
    score: metrics.finalScore,
    stars: metrics.activatedStars,
    complete: result.complete,
    signature: getOptimizerStateSignature(result.bestState),
    durationMs,
    evaluations: metrics.scoreCacheEvaluations,
    hits: metrics.scoreCacheHits,
    misses: metrics.scoreCacheMisses,
    uniqueLayouts: metrics.scoreCacheUniqueLayouts,
    hitRate: scoreCacheHitRate({
      hits: metrics.scoreCacheHits,
      evaluations: metrics.scoreCacheEvaluations,
    }),
    incrementalAttempts: metrics.incrementalScoreAttempts,
    incrementalSuccesses: metrics.incrementalScoreSuccesses,
    incrementalFallbacks: metrics.incrementalScoreFallbacks,
    incrementalAffectedItems: metrics.incrementalAffectedItems,
    incrementalAffectedInteractions: metrics.incrementalAffectedInteractions,
    incrementalAffectedStars: metrics.incrementalAffectedStars,
    stopReason: result.adaptive.stopReason,
    placed: metrics.placedItems,
    unplaced: metrics.unplacedItems,
  };
}

function signaturesOf(result: AdaptiveOptimizerResult): string {
  return [
    getOptimizerStateSignature(result.bestState),
    ...result.alternatives.map((entry) => entry.signature),
  ].join("|");
}

export { uniqueScoringMs };
