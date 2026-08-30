import { describe, expect, it } from "vitest";
import { summarizePipeline } from "./incremental-decision.ts";
import { emptySearchPipelineProfile } from "../search-profile.ts";

describe("Stage 16 pipeline summary", () => {
  it("считает unique scoring share и replaced misses без магического cutoff", () => {
    const profile = emptySearchPipelineProfile();
    profile.candidateGeneration.durationMs = 20;
    profile.fullScoring.durationMs = 10;
    profile.incrementalScoring.durationMs = 5;
    profile.scoreCacheMisses.count = 100;
    const summary = summarizePipeline([
      {
        caseId: "G",
        totalMs: 100,
        profile,
        localSearchMs: 0,
        jointMs: 0,
        repairMs: 0,
        cacheOnlyMs: 110,
        incrementalMs: 100,
        incrementalAttempts: 40,
        incrementalSuccesses: 40,
        incrementalFallbacks: 0,
      },
    ]);
    expect(summary.uniqueScoringShare).toBeCloseTo(0.15);
    expect(summary.candidateGenerationShare).toBeCloseTo(0.2);
    expect(summary.replacedMissShare).toBeCloseTo(0.4);
    expect(summary.attempts).toBe(40);
    expect(summary.successes + summary.fallbacks).toBe(summary.attempts);
    expect(summary.fasterCaseIds).toEqual(["G"]);
  });
});
