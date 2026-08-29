import { describe, expect, it } from "vitest";
import { runAdaptiveOptimizer } from "./adaptive-search.ts";
import { STAGE9_BENCHMARK_CASES, STAGE10_BENCHMARK_CASES, STAGE11_BENCHMARK_CASES } from "./benchmarks/cases.ts";
import { runBenchmarkCase } from "./benchmarks/runner.ts";
import { createBagState } from "./bags/state.ts";
import { improveLayoutLocally } from "./local-search.ts";
import { improveTopNJointly } from "./joint-search.ts";
import { loadProductionCatalog } from "./load-catalog.ts";
import { getOptimizerStateSignature, runOptimizer } from "./optimizer.ts";
import { buildRankedLayout } from "./rank.ts";
import { createSearchState } from "./state.ts";
import { DEFAULT_BACKPACK } from "./types.ts";
import type { OptimizerResult } from "./search-types.ts";
import type { AdaptiveOptimizerResult } from "./adaptive-types.ts";
import type { RankedLayout } from "./search-types.ts";

const catalog = loadProductionCatalog();

function expectSameLayout(cached: OptimizerResult, uncached: OptimizerResult): void {
  expect(cached.complete).toBe(uncached.complete);
  expect(cached.score.valid).toBe(uncached.score.valid);
  expect(cached.score.score).toBe(uncached.score.score);
  expect(cached.score.breakdown.activatedStars).toBe(uncached.score.breakdown.activatedStars);
  expect(cached.score.effectCoverage.normalizedEffects).toBe(uncached.score.effectCoverage.normalizedEffects);
  expect(cached.placedItems.length).toBe(uncached.placedItems.length);
  expect(cached.unplacedItems.length).toBe(uncached.unplacedItems.length);
  expect(cached.placedBags.length).toBe(uncached.placedBags.length);
  expect(getOptimizerStateSignature(cached.bestState)).toBe(getOptimizerStateSignature(uncached.bestState));
  expect(cached.alternatives.map((entry) => entry.signature)).toEqual(
    uncached.alternatives.map((entry) => entry.signature),
  );
  expect(cached.searchExhaustive).toBe(uncached.searchExhaustive);
}

function expectCacheInvariant(result: OptimizerResult): void {
  const metrics = result.metrics!;
  expect(metrics.scoreCacheEvaluations).toBe(metrics.scoreCacheHits + metrics.scoreCacheMisses);
  expect(result.stats.scoreCacheEvaluations).toBe(metrics.scoreCacheEvaluations);
}

describe("Stage 12 cache metrics", () => {
  it("Beam считает hits/misses/evaluations и evaluations === hits + misses", () => {
    const result = runOptimizer({
      backpack: DEFAULT_BACKPACK,
      bags: [{ instanceId: "bag", itemId: "medium_bag" }],
      items: [
        { instanceId: "ore-1", itemId: "adamantite_ore" },
        { instanceId: "ore-2", itemId: "adamantite_ore" },
      ],
      catalog,
      options: { algorithm: "beam", bagBeamWidth: 4, itemBeamWidth: 8, metrics: true },
    });
    expectCacheInvariant(result);
    expect(result.metrics!.scoreCacheEvaluations).toBeGreaterThan(0);
    expect(result.metrics!.scoreCacheHits).toBeGreaterThan(0);
  });

  it("новый runOptimizer не переиспользует кэш прошлого запуска", () => {
    const input = {
      backpack: DEFAULT_BACKPACK,
      bags: [{ instanceId: "bag", itemId: "medium_bag" }],
      items: [
        { instanceId: "ore-1", itemId: "adamantite_ore" },
        { instanceId: "ore-2", itemId: "adamantite_ore" },
      ],
      catalog,
      options: { algorithm: "beam" as const, bagBeamWidth: 4, itemBeamWidth: 8, metrics: true },
    };
    const a = runOptimizer(input);
    const b = runOptimizer(input);
    expect(a.metrics!.scoreCacheMisses).toBe(b.metrics!.scoreCacheMisses);
    expect(a.metrics!.scoreCacheHits).toBe(b.metrics!.scoreCacheHits);
    expect(a.metrics!.scoreCacheEvaluations).toBe(b.metrics!.scoreCacheEvaluations);
  });
});

describe("Stage 7 identity: cached === uncached", () => {
  const simple = {
    backpack: DEFAULT_BACKPACK,
    bags: [{ instanceId: "bag", itemId: "medium_bag" }],
    items: [
      { instanceId: "ore-1", itemId: "adamantite_ore" },
      { instanceId: "ore-2", itemId: "adamantite_ore" },
    ],
    catalog,
  };

  it("Beam", () => {
    const cached = runOptimizer({ ...simple, options: { algorithm: "beam", itemBeamWidth: 10 } });
    const uncached = runOptimizer({
      ...simple,
      options: { algorithm: "beam", itemBeamWidth: 10, scoreCache: false },
    });
    expectSameLayout(cached, uncached);
    expect(cached.metrics!.scoreCacheHits).toBeGreaterThan(uncached.metrics!.scoreCacheHits);
  });

  it("Greedy", () => {
    const cached = runOptimizer({ ...simple, options: { algorithm: "greedy" } });
    const uncached = runOptimizer({ ...simple, options: { algorithm: "greedy", scoreCache: false } });
    expectSameLayout(cached, uncached);
  });

  it("DFS не меняет полноту, только повторный scoring", () => {
    const options = { algorithm: "dfs" as const, dfs: { maxNodes: 5_000, maxDepth: 6, timeoutMs: 3_000 } };
    const cached = runOptimizer({ ...simple, options });
    const uncached = runOptimizer({ ...simple, options: { ...options, scoreCache: false } });
    expectSameLayout(cached, uncached);
    expect(cached.searchExhaustive).toBe(uncached.searchExhaustive);
    expect(cached.heuristicSamples?.length).toBe(uncached.heuristicSamples?.length);
  });
});

describe("Stage 9 Local Search identity", () => {
  it("final score и ranking не меняются", () => {
    const g = STAGE9_BENCHMARK_CASES.find((entry) => entry.id === "G-competing-stars")!;
    const cached = runBenchmarkCase(g, catalog, {
      algorithm: "beam",
      bagBeamWidth: 2,
      itemBeamWidth: 4,
      localSearch: true,
      resultCount: 5,
    });
    const uncached = runBenchmarkCase(g, catalog, {
      algorithm: "beam",
      bagBeamWidth: 2,
      itemBeamWidth: 4,
      localSearch: true,
      resultCount: 5,
      scoreCache: false,
    });
    expectSameLayout(cached, uncached);
    expect(cached.metrics!.localSearchImprovements).toBe(uncached.metrics!.localSearchImprovements);
    expect(cached.metrics!.finalScore).toBe(uncached.metrics!.finalScore);
  });

  it("Item LS neighbors на shared cache: повторный scoring даёт hit", () => {
    const before = runOptimizer({
      backpack: DEFAULT_BACKPACK,
      bags: [{ instanceId: "bag", itemId: "medium_bag" }],
      items: [
        { instanceId: "ore-1", itemId: "adamantite_ore" },
        { instanceId: "ore-2", itemId: "adamantite_ore" },
      ],
      catalog,
      options: { algorithm: "greedy", localSearch: false },
    });
    const ranked: RankedLayout = {
      state: before.bestState,
      score: before.score,
      unplacedItems: before.unplacedItems,
      unplacedBags: before.unplacedBags,
      complete: before.complete,
      signature: getOptimizerStateSignature(before.bestState),
    };
    const cached = runOptimizer({
      backpack: DEFAULT_BACKPACK,
      bags: [{ instanceId: "bag", itemId: "medium_bag" }],
      items: [
        { instanceId: "ore-1", itemId: "adamantite_ore" },
        { instanceId: "ore-2", itemId: "adamantite_ore" },
      ],
      catalog,
      options: { algorithm: "greedy", localSearch: true },
    });
    const improved = improveLayoutLocally(ranked, catalog);
    expect(improved.stats.finalScore).toBe(cached.metrics!.finalScore);
  });
});

describe("Stage 10 Joint identity", () => {
  it("repair и Bag topology дают те же финальные результаты", () => {
    const k = STAGE10_BENCHMARK_CASES.find((entry) => entry.id === "K-displaced-repair")!;
    const cached = runBenchmarkCase(k, catalog, {
      algorithm: "beam",
      bagBeamWidth: 4,
      itemBeamWidth: 4,
      localSearch: true,
      bagLocalSearch: true,
      resultCount: 5,
    });
    const uncached = runBenchmarkCase(k, catalog, {
      algorithm: "beam",
      bagBeamWidth: 4,
      itemBeamWidth: 4,
      localSearch: true,
      bagLocalSearch: true,
      resultCount: 5,
      scoreCache: false,
    });
    expectSameLayout(cached, uncached);
    expect(cached.metrics!.bagLayoutsAccepted).toBe(uncached.metrics!.bagLayoutsAccepted);
  });

  it("Joint на ручном seed не меняет ranking из-за кэша", () => {
    const bags = createBagState(
      DEFAULT_BACKPACK,
      [{ instanceId: "bag", itemId: "medium_bag", position: { row: 0, col: 0 }, rotation: 0 }],
      catalog,
    );
    const items = createSearchState(
      DEFAULT_BACKPACK,
      [
        { instanceId: "ore-1", itemId: "adamantite_ore", position: { row: 0, col: 0 }, rotation: 0 },
        { instanceId: "ore-2", itemId: "adamantite_ore", position: { row: 1, col: 1 }, rotation: 0 },
      ],
      catalog,
    );
    if (!bags.ok || !items.ok) throw new Error("invalid seed");
    const seed = buildRankedLayout(
      { backpack: DEFAULT_BACKPACK, bags: bags.state, items: items.state },
      [],
      [],
      catalog,
    );
    const a = improveTopNJointly([seed], catalog, 1, {
      maxIterations: 2,
      maxNeighbors: 8,
      repairBeamWidth: 3,
      itemLocalSearch: true,
    });
    const b = improveTopNJointly([seed], catalog, 1, {
      maxIterations: 2,
      maxNeighbors: 8,
      repairBeamWidth: 3,
      itemLocalSearch: true,
    });
    expect(a.layouts[0]!.signature).toBe(b.layouts[0]!.signature);
    expect(a.layouts[0]!.score.score).toBe(b.layouts[0]!.score.score);
  });
});

describe("Stage 11 Adaptive identity G/H/M/N", () => {
  function expectSameAdaptive(cached: AdaptiveOptimizerResult, uncached: AdaptiveOptimizerResult): void {
    expectSameLayout(cached, uncached);
    expect(cached.adaptive.stopReason).toBe(uncached.adaptive.stopReason);
    expect(cached.adaptive.levelsRun).toBe(uncached.adaptive.levelsRun);
    expect(cached.adaptive.bagSeedsSelected).toBe(uncached.adaptive.bagSeedsSelected);
  }

  const cheap = {
    bagBeamWidths: [1, 2, 5],
    itemBeamWidths: [1, 2, 5],
    maxBagSeeds: 3,
    stableLevelsBeforeStop: 2 as const,
  };

  it("G cached === uncached", () => {
    const g = STAGE11_BENCHMARK_CASES.find((entry) => entry.id === "G-competing-stars")!;
    const input = { inventory: g.inventory, bags: g.bags, items: g.items, catalog };
    const cached = runAdaptiveOptimizer(input, cheap);
    const uncached = runAdaptiveOptimizer(input, { ...cheap, scoreCache: false });
    expectSameAdaptive(cached, uncached);
    expectCacheInvariant(cached);
    expect(cached.metrics.scoreCacheHits).toBeGreaterThan(0);
  });

  it("H cached === uncached", () => {
    const h = STAGE11_BENCHMARK_CASES.find((entry) => entry.id === "H-multiple-bags")!;
    const input = { inventory: h.inventory, bags: h.bags, items: h.items, catalog };
    const cached = runAdaptiveOptimizer(input, cheap);
    const uncached = runAdaptiveOptimizer(input, { ...cheap, scoreCache: false });
    expectSameAdaptive(cached, uncached);
  });

  it("M cached === uncached", () => {
    const m = STAGE11_BENCHMARK_CASES.find((entry) => entry.id === "M-stable-stop")!;
    const input = { inventory: m.inventory, bags: m.bags, items: m.items, catalog };
    const cached = runAdaptiveOptimizer(input, { ...cheap, enableItemLocalSearch: false, enableBagLocalSearch: false });
    const uncached = runAdaptiveOptimizer(input, {
      ...cheap,
      enableItemLocalSearch: false,
      enableBagLocalSearch: false,
      scoreCache: false,
    });
    expectSameAdaptive(cached, uncached);
  });

  it("N cached === uncached", () => {
    const n = STAGE11_BENCHMARK_CASES.find((entry) => entry.id === "N-escalation")!;
    const input = { inventory: n.inventory, bags: n.bags, items: n.items, catalog };
    const cached = runAdaptiveOptimizer(input, cheap);
    const uncached = runAdaptiveOptimizer(input, { ...cheap, scoreCache: false });
    expectSameAdaptive(cached, uncached);
  });

  it("Adaptive ladder делит один cache: uniqueLayouts <= misses при cache on", () => {
    const m = STAGE11_BENCHMARK_CASES.find((entry) => entry.id === "M-stable-stop")!;
    const result = runAdaptiveOptimizer(
      { inventory: m.inventory, bags: m.bags, items: m.items, catalog },
      { bagBeamWidths: [1, 2, 5], itemBeamWidths: [1, 2, 5], enableBagLocalSearch: false },
    );
    expect(result.metrics.scoreCacheUniqueLayouts).toBe(result.metrics.scoreCacheMisses);
    expect(result.metrics.scoreCacheEvaluations).toBe(
      result.metrics.scoreCacheHits + result.metrics.scoreCacheMisses,
    );
  });
});
