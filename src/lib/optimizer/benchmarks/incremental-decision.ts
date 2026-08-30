/**
 * Агрегация Stage 16 profiling. Решение YES/NO не зашито процентом —
 * его пишет отчёт после реальных цифр.
 */

import type { SearchPipelineProfile } from "../search-profile.ts";
import { uniqueScoringMs } from "../search-profile.ts";

export interface PipelineCaseMeasurement {
  caseId: string;
  totalMs: number;
  profile: SearchPipelineProfile;
  localSearchMs: number;
  jointMs: number;
  repairMs: number;
  cacheOnlyMs?: number;
  incrementalMs?: number;
  incrementalAttempts: number;
  incrementalSuccesses: number;
  incrementalFallbacks: number;
}

export interface PipelineSummary {
  totalMs: number;
  uniqueScoringMs: number;
  uniqueScoringShare: number;
  candidateGenerationMs: number;
  candidateGenerationShare: number;
  cacheHitMs: number;
  cacheHitShare: number;
  residualShare: number;
  medianUniqueShare: number;
  attempts: number;
  successes: number;
  fallbacks: number;
  misses: number;
  replacedMissShare: number;
  wallClockDeltaMs: number | null;
  fasterCaseIds: string[];
  slowerCaseIds: string[];
}

export function uniqueScoringShare(row: PipelineCaseMeasurement): number {
  if (row.totalMs <= 0) return 0;
  return uniqueScoringMs(row.profile) / row.totalMs;
}

export function summarizePipeline(rows: PipelineCaseMeasurement[]): PipelineSummary {
  const totalMs = sum(rows.map((row) => row.totalMs));
  const uniqueMs = sum(rows.map((row) => uniqueScoringMs(row.profile)));
  const candidateMs = sum(rows.map((row) => row.profile.candidateGeneration.durationMs));
  const hitMs = sum(rows.map((row) => row.profile.scoreCacheHits.durationMs));
  const shares = rows.map(uniqueScoringShare).sort((a, b) => a - b);
  const attempts = sum(rows.map((row) => row.incrementalAttempts));
  const successes = sum(rows.map((row) => row.incrementalSuccesses));
  const fallbacks = sum(rows.map((row) => row.incrementalFallbacks));
  const misses = sum(rows.map((row) => row.profile.scoreCacheMisses.count));

  const fasterCaseIds: string[] = [];
  const slowerCaseIds: string[] = [];
  let wallClockDeltaMs: number | null = null;
  const withClock = rows.filter(
    (row) => row.cacheOnlyMs !== undefined && row.incrementalMs !== undefined,
  );
  if (withClock.length > 0) {
    wallClockDeltaMs = 0;
    for (const row of withClock) {
      const delta = row.cacheOnlyMs! - row.incrementalMs!;
      wallClockDeltaMs += delta;
      if (delta > 1) fasterCaseIds.push(row.caseId);
      else if (delta < -1) slowerCaseIds.push(row.caseId);
    }
  }

  return {
    totalMs,
    uniqueScoringMs: uniqueMs,
    uniqueScoringShare: totalMs <= 0 ? 0 : uniqueMs / totalMs,
    candidateGenerationMs: candidateMs,
    candidateGenerationShare: totalMs <= 0 ? 0 : candidateMs / totalMs,
    cacheHitMs: hitMs,
    cacheHitShare: totalMs <= 0 ? 0 : hitMs / totalMs,
    residualShare: totalMs <= 0 ? 1 : Math.max(0, 1 - uniqueMs / totalMs - candidateMs / totalMs - hitMs / totalMs),
    medianUniqueShare: percentile(shares, 0.5),
    attempts,
    successes,
    fallbacks,
    misses,
    replacedMissShare: misses === 0 ? 0 : successes / misses,
    wallClockDeltaMs,
    fasterCaseIds,
    slowerCaseIds,
  };
}

function sum(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}

function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * fraction)));
  return sorted[index]!;
}
