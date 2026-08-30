/**
 * Optional search-pipeline timing for Stage 16 decision profiling.
 *
 * Null sink: one branch, no counters. Does not change scoring or search
 * semantics. Times exclusive leaf work so candidate generation and unique
 * scoring are not double-counted with Local Search inclusive durations.
 */

import {
  emptyCandidateGenerationProfile,
  withCandidateGenerationProfile,
  type CandidateGenerationProfile,
} from "./candidate-profile.ts";

export interface TimedCount {
  count: number;
  durationMs: number;
}

export interface SearchPipelineProfile {
  scoreCacheHits: TimedCount;
  scoreCacheMisses: TimedCount;
  fullScoring: TimedCount;
  incrementalScoring: TimedCount;
  incrementalSuccesses: number;
  incrementalFallbacks: number;
  heuristicCalls: number;
  candidateGeneration: CandidateGenerationProfile;
}

let sink: Omit<SearchPipelineProfile, "candidateGeneration"> | null = null;

export function emptySearchPipelineProfile(): SearchPipelineProfile {
  return {
    scoreCacheHits: { count: 0, durationMs: 0 },
    scoreCacheMisses: { count: 0, durationMs: 0 },
    fullScoring: { count: 0, durationMs: 0 },
    incrementalScoring: { count: 0, durationMs: 0 },
    incrementalSuccesses: 0,
    incrementalFallbacks: 0,
    heuristicCalls: 0,
    candidateGeneration: emptyCandidateGenerationProfile(),
  };
}

export function isSearchPipelineProfiling(): boolean {
  return sink !== null;
}

export function withSearchPipelineProfile<T>(fn: () => T): {
  result: T;
  profile: SearchPipelineProfile;
} {
  const scoring = {
    scoreCacheHits: { count: 0, durationMs: 0 },
    scoreCacheMisses: { count: 0, durationMs: 0 },
    fullScoring: { count: 0, durationMs: 0 },
    incrementalScoring: { count: 0, durationMs: 0 },
    incrementalSuccesses: 0,
    incrementalFallbacks: 0,
    heuristicCalls: 0,
  };
  const previous = sink;
  sink = scoring;
  try {
    const wrapped = withCandidateGenerationProfile(fn);
    return {
      result: wrapped.result,
      profile: { ...scoring, candidateGeneration: wrapped.profile },
    };
  } finally {
    sink = previous;
  }
}

export function recordScoreCacheHit(durationMs: number): void {
  if (!sink) return;
  sink.scoreCacheHits.count += 1;
  sink.scoreCacheHits.durationMs += durationMs;
}

export function recordScoreCacheMiss(durationMs: number): void {
  if (!sink) return;
  sink.scoreCacheMisses.count += 1;
  sink.scoreCacheMisses.durationMs += durationMs;
}

export function recordFullScoring(durationMs: number): void {
  if (!sink) return;
  sink.fullScoring.count += 1;
  sink.fullScoring.durationMs += durationMs;
}

export function recordIncrementalScoring(
  durationMs: number,
  mode: "incremental" | "full_fallback",
): void {
  if (!sink) return;
  sink.incrementalScoring.count += 1;
  sink.incrementalScoring.durationMs += durationMs;
  if (mode === "incremental") sink.incrementalSuccesses += 1;
  else sink.incrementalFallbacks += 1;
}

export function recordHeuristicCall(): void {
  if (!sink) return;
  sink.heuristicCalls += 1;
}

export function uniqueScoringMs(profile: SearchPipelineProfile): number {
  return profile.fullScoring.durationMs + profile.incrementalScoring.durationMs;
}
