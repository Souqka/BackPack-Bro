import { describe, expect, it } from "vitest";
import { runAdaptiveOptimizer } from "./adaptive-search.ts";
import { STAGE11_BENCHMARK_CASES } from "./benchmarks/cases.ts";
import { loadProductionCatalog } from "./load-catalog.ts";
import { getOptimizerStateSignature } from "./optimizer.ts";
import { isSearchPipelineProfiling, withSearchPipelineProfile } from "./search-profile.ts";

const catalog = loadProductionCatalog();

describe("search pipeline profiler", () => {
  it("выключен по умолчанию", () => {
    expect(isSearchPipelineProfiling()).toBe(false);
  });

  it("M: считает candidates, cache и heuristic, не меняя layout", () => {
    const entry = STAGE11_BENCHMARK_CASES.find((item) => item.id === "M-stable-stop")!;
    const input = {
      inventory: entry.inventory,
      bags: entry.bags,
      items: entry.items,
      catalog,
      options: { metrics: true as const },
    };
    const plain = runAdaptiveOptimizer(input);
    const profiled = withSearchPipelineProfile(() => runAdaptiveOptimizer(input));
    expect(getOptimizerStateSignature(profiled.result.bestState)).toBe(
      getOptimizerStateSignature(plain.bestState),
    );
    expect(profiled.result.score.score).toBe(plain.score.score);
    expect(profiled.profile.candidateGeneration.calls).toBeGreaterThan(0);
    expect(profiled.profile.heuristicCalls).toBeGreaterThan(0);
    expect(
      profiled.profile.scoreCacheHits.count + profiled.profile.scoreCacheMisses.count,
    ).toBeGreaterThan(0);
    expect(isSearchPipelineProfiling()).toBe(false);
  });
});
