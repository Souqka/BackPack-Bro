/**
 * Optional candidate-generation timing for Stage 14 profiling.
 *
 * Null sink: one branch, no counters. Not a score cache.
 */

export interface CandidateGenerationProfile {
  calls: number;
  durationMs: number;
  accepted: number;
}

let sink: CandidateGenerationProfile | null = null;

export function emptyCandidateGenerationProfile(): CandidateGenerationProfile {
  return { calls: 0, durationMs: 0, accepted: 0 };
}

export function withCandidateGenerationProfile<T>(fn: () => T): {
  result: T;
  profile: CandidateGenerationProfile;
} {
  const previous = sink;
  const profile = emptyCandidateGenerationProfile();
  sink = profile;
  try {
    const result = fn();
    return { result, profile };
  } finally {
    sink = previous;
  }
}

export function recordCandidateGeneration(durationMs: number, accepted: number): void {
  if (!sink) return;
  sink.calls += 1;
  sink.durationMs += durationMs;
  sink.accepted += accepted;
}

export function isCandidateGenerationProfiling(): boolean {
  return sink !== null;
}
