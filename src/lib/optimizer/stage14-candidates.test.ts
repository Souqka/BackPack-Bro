import { describe, expect, it } from "vitest";
import { runAdaptiveOptimizer } from "./adaptive-search.ts";
import { STAGE11_BENCHMARK_CASES } from "./benchmarks/cases.ts";
import { withBaselineCandidateGeneration } from "./candidates.ts";
import { loadProductionCatalog } from "./load-catalog.ts";
import { getOptimizerStateSignature, runOptimizer } from "./optimizer.ts";
import type { OptimizerResult } from "./search-types.ts";
import type { AdaptiveOptimizerResult } from "./adaptive-types.ts";

const catalog = loadProductionCatalog();

function expectSameLayout(optimized: OptimizerResult, baseline: OptimizerResult): void {
  expect(optimized.complete).toBe(baseline.complete);
  expect(optimized.score.valid).toBe(baseline.score.valid);
  expect(optimized.score.score).toBe(baseline.score.score);
  expect(optimized.score.breakdown.activatedStars).toBe(baseline.score.breakdown.activatedStars);
  expect(optimized.score.effectCoverage.normalizedEffects).toBe(
    baseline.score.effectCoverage.normalizedEffects,
  );
  expect(optimized.placedItems.length).toBe(baseline.placedItems.length);
  expect(optimized.unplacedItems.length).toBe(baseline.unplacedItems.length);
  expect(getOptimizerStateSignature(optimized.bestState)).toBe(getOptimizerStateSignature(baseline.bestState));
  expect(optimized.alternatives.map((entry) => entry.signature)).toEqual(
    baseline.alternatives.map((entry) => entry.signature),
  );
}

describe("Stage 14 candidate generation: optimizer identity", () => {
  it("Beam G enabled optimized === baseline generator", () => {
    const g = STAGE11_BENCHMARK_CASES.find((entry) => entry.id === "G-competing-stars")!;
    const input = {
      inventory: g.inventory,
      bags: g.bags,
      items: g.items,
      catalog,
      options: { algorithm: "beam" as const, bagBeamWidth: 2, itemBeamWidth: 4, localSearch: true, resultCount: 5 },
    };
    const optimized = runOptimizer(input);
    const baseline = withBaselineCandidateGeneration(() => runOptimizer(input));
    expectSameLayout(optimized, baseline);
  });
});

describe("Stage 14 Adaptive identity G–O vs baseline generator", () => {
  const cheap = {
    bagBeamWidths: [1, 2, 5],
    itemBeamWidths: [1, 2, 5],
    maxBagSeeds: 3,
    stableLevelsBeforeStop: 2 as const,
  };

  function expectSameAdaptive(optimized: AdaptiveOptimizerResult, baseline: AdaptiveOptimizerResult): void {
    expectSameLayout(optimized, baseline);
    expect(optimized.adaptive.stopReason).toBe(baseline.adaptive.stopReason);
  }

  for (const entry of STAGE11_BENCHMARK_CASES) {
    it(`${entry.id.split("-")[0]} optimized === baseline`, () => {
      const input = { inventory: entry.inventory, bags: entry.bags, items: entry.items, catalog };
      const extra = entry.id === "M-stable-stop" ? { enableItemLocalSearch: false, enableBagLocalSearch: false } : {};
      const optimized = runAdaptiveOptimizer(input, { ...cheap, ...extra });
      const baseline = withBaselineCandidateGeneration(() =>
        runAdaptiveOptimizer(input, { ...cheap, ...extra }),
      );
      expectSameAdaptive(optimized, baseline);
    });
  }
});
