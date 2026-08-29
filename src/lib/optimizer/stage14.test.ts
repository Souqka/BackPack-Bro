import { describe, expect, it } from "vitest";
import { runAdaptiveOptimizer } from "./adaptive-search.ts";
import { STAGE11_BENCHMARK_CASES } from "./benchmarks/cases.ts";
import { runBenchmarkCase } from "./benchmarks/runner.ts";
import { improveLayoutLocally } from "./local-search.ts";
import { loadProductionCatalog } from "./load-catalog.ts";
import { getOptimizerStateSignature, runOptimizer } from "./optimizer.ts";
import { buildRankedLayout } from "./rank.ts";
import { createScoreCache, scoreLayout, withActiveScoreCache } from "./score-cache.ts";
import { DEFAULT_BACKPACK } from "./types.ts";
import type { OptimizerResult } from "./search-types.ts";
import type { AdaptiveOptimizerResult } from "./adaptive-types.ts";

const catalog = loadProductionCatalog();

function expectSameLayout(enabled: OptimizerResult, disabled: OptimizerResult): void {
  expect(enabled.complete).toBe(disabled.complete);
  expect(enabled.score.valid).toBe(disabled.score.valid);
  expect(enabled.score.score).toBe(disabled.score.score);
  expect(enabled.score.breakdown.activatedStars).toBe(disabled.score.breakdown.activatedStars);
  expect(enabled.score.effectCoverage.normalizedEffects).toBe(
    disabled.score.effectCoverage.normalizedEffects,
  );
  expect(enabled.placedItems.length).toBe(disabled.placedItems.length);
  expect(enabled.unplacedItems.length).toBe(disabled.unplacedItems.length);
  expect(getOptimizerStateSignature(enabled.bestState)).toBe(getOptimizerStateSignature(disabled.bestState));
  expect(enabled.alternatives.map((entry) => entry.signature)).toEqual(
    disabled.alternatives.map((entry) => entry.signature),
  );
  expect(enabled.searchExhaustive).toBe(disabled.searchExhaustive);
}

describe("Stage 14 incremental metrics", () => {
  it("evaluations === hits + misses, incremental не смешивается с cache", () => {
    const result = runOptimizer({
      backpack: DEFAULT_BACKPACK,
      bags: [{ instanceId: "bag", itemId: "warrior_backpack" }],
      items: [
        { instanceId: "bar", itemId: "adamantite_bar" },
        { instanceId: "ore", itemId: "adamantite_ore" },
      ],
      catalog,
      options: { algorithm: "beam", bagBeamWidth: 8, itemBeamWidth: 12, localSearch: true, metrics: true },
    });
    const metrics = result.metrics!;
    expect(metrics.scoreCacheEvaluations).toBe(metrics.scoreCacheHits + metrics.scoreCacheMisses);
    expect(metrics.incrementalScoreAttempts).toBe(
      metrics.incrementalScoreSuccesses + metrics.incrementalScoreFallbacks,
    );
  });

  it("disabled incremental даёт нулевые incremental counters", () => {
    const result = runOptimizer({
      backpack: DEFAULT_BACKPACK,
      bags: [{ instanceId: "bag", itemId: "medium_bag" }],
      items: [
        { instanceId: "ore-1", itemId: "adamantite_ore" },
        { instanceId: "ore-2", itemId: "adamantite_ore" },
      ],
      catalog,
      options: {
        algorithm: "beam",
        itemBeamWidth: 8,
        localSearch: true,
        incrementalScore: false,
        metrics: true,
      },
    });
    expect(result.metrics!.incrementalScoreAttempts).toBe(0);
    expect(result.metrics!.incrementalScoreSuccesses).toBe(0);
    expect(result.metrics!.incrementalScoreFallbacks).toBe(0);
  });
});

describe("Stage 14 identity: enabled === disabled", () => {
  const simple = {
    backpack: DEFAULT_BACKPACK,
    bags: [{ instanceId: "bag", itemId: "medium_bag" }],
    items: [
      { instanceId: "ore-1", itemId: "adamantite_ore" },
      { instanceId: "ore-2", itemId: "adamantite_ore" },
    ],
    catalog,
  };

  it("Beam + Local Search", () => {
    const enabled = runOptimizer({
      ...simple,
      options: { algorithm: "beam", itemBeamWidth: 10, localSearch: true },
    });
    const disabled = runOptimizer({
      ...simple,
      options: { algorithm: "beam", itemBeamWidth: 10, localSearch: true, incrementalScore: false },
    });
    expectSameLayout(enabled, disabled);
  });

  it("Greedy", () => {
    const enabled = runOptimizer({ ...simple, options: { algorithm: "greedy", localSearch: true } });
    const disabled = runOptimizer({
      ...simple,
      options: { algorithm: "greedy", localSearch: true, incrementalScore: false },
    });
    expectSameLayout(enabled, disabled);
  });
});

describe("Stage 14 Adaptive identity G/H/M/N", () => {
  const cheap = {
    bagBeamWidths: [1, 2, 5],
    itemBeamWidths: [1, 2, 5],
    maxBagSeeds: 3,
    stableLevelsBeforeStop: 2 as const,
  };

  function expectSameAdaptive(enabled: AdaptiveOptimizerResult, disabled: AdaptiveOptimizerResult): void {
    expectSameLayout(enabled, disabled);
    expect(enabled.adaptive.stopReason).toBe(disabled.adaptive.stopReason);
    expect(enabled.adaptive.levelsRun).toBe(disabled.adaptive.levelsRun);
    expect(enabled.adaptive.bagSeedsSelected).toBe(disabled.adaptive.bagSeedsSelected);
  }

  for (const id of ["G-competing-stars", "H-multiple-bags", "M-stable-stop", "N-escalation"] as const) {
    it(`${id.split("-")[0]} enabled === disabled`, () => {
      const entry = STAGE11_BENCHMARK_CASES.find((caseEntry) => caseEntry.id === id)!;
      const input = { inventory: entry.inventory, bags: entry.bags, items: entry.items, catalog };
      const extra = id === "M-stable-stop" ? { enableItemLocalSearch: false, enableBagLocalSearch: false } : {};
      const enabled = runAdaptiveOptimizer(input, { ...cheap, ...extra });
      const disabled = runAdaptiveOptimizer(input, { ...cheap, ...extra, incrementalScore: false });
      expectSameAdaptive(enabled, disabled);
    });
  }
});

describe("Stage 14 Local Search uses incremental path", () => {
  it("G Beam+LS enabled === disabled и LS даёт incremental successes", () => {
    const g = STAGE11_BENCHMARK_CASES.find((entry) => entry.id === "G-competing-stars")!;
    const enabled = runBenchmarkCase(g, catalog, {
      algorithm: "beam",
      bagBeamWidth: 2,
      itemBeamWidth: 4,
      localSearch: true,
      resultCount: 5,
    });
    const disabled = runBenchmarkCase(g, catalog, {
      algorithm: "beam",
      bagBeamWidth: 2,
      itemBeamWidth: 4,
      localSearch: true,
      resultCount: 5,
      incrementalScore: false,
    });
    expectSameLayout(enabled, disabled);
    expect(enabled.metrics!.incrementalScoreSuccesses).toBeGreaterThan(0);
  });

  it("improveLayoutLocally пишет incremental result в run-scoped cache", () => {
    const result = runOptimizer({
      backpack: DEFAULT_BACKPACK,
      bags: [{ instanceId: "bag", itemId: "warrior_backpack" }],
      items: [
        { instanceId: "bar", itemId: "adamantite_bar" },
        { instanceId: "ore", itemId: "adamantite_ore" },
      ],
      catalog,
      options: { algorithm: "beam", bagBeamWidth: 8, itemBeamWidth: 12, localSearch: false },
    });
    const seed = buildRankedLayout(result.bestState, result.unplacedItems, result.unplacedBags, catalog);
    const cache = createScoreCache();
    scoreLayout(seed.state, catalog, cache);
    const improved = withActiveScoreCache(cache, () => improveLayoutLocally(seed, catalog, { maxNeighbors: 40 }));
    const snapshot = cache.snapshot();
    expect(snapshot.evaluations).toBe(snapshot.hits + snapshot.misses);
    expect(snapshot.incrementalScoreAttempts).toBeGreaterThan(0);
    expect(improved.stats.finalScore).toBeGreaterThanOrEqual(improved.stats.initialScore);
  });
});
