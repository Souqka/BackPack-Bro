import { describe, expect, it } from "vitest";
import { runAdaptiveOptimizer } from "./adaptive-search.ts";
import { STAGE11_BENCHMARK_CASES } from "./benchmarks/cases.ts";
import { runBenchmarkCase } from "./benchmarks/runner.ts";
import { loadProductionCatalog } from "./load-catalog.ts";
import { getOptimizerStateSignature, runOptimizer } from "./optimizer.ts";
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

describe("Stage 13 transposition metrics", () => {
  it("evaluations invariant кэша сохраняется, transposition counters согласованы", () => {
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
    const metrics = result.metrics!;
    expect(metrics.scoreCacheEvaluations).toBe(metrics.scoreCacheHits + metrics.scoreCacheMisses);
    expect(metrics.transpositionHits).toBe(metrics.transpositionPruned + metrics.transpositionReplacements);
    expect(metrics.transpositionAccepted + metrics.transpositionPruned).toBeGreaterThanOrEqual(
      metrics.transpositionAccepted,
    );
  });

  it("disabled transposition даёт нулевые prune counters", () => {
    const result = runOptimizer({
      backpack: DEFAULT_BACKPACK,
      bags: [{ instanceId: "bag", itemId: "medium_bag" }],
      items: [
        { instanceId: "ore-1", itemId: "adamantite_ore" },
        { instanceId: "ore-2", itemId: "adamantite_ore" },
      ],
      catalog,
      options: { algorithm: "beam", itemBeamWidth: 8, transposition: false, metrics: true },
    });
    expect(result.metrics!.transpositionPruned).toBe(0);
    expect(result.metrics!.transpositionHits).toBe(0);
  });
});

describe("Stage 13 identity: enabled === disabled", () => {
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
    const enabled = runOptimizer({ ...simple, options: { algorithm: "beam", itemBeamWidth: 10 } });
    const disabled = runOptimizer({
      ...simple,
      options: { algorithm: "beam", itemBeamWidth: 10, transposition: false },
    });
    expectSameLayout(enabled, disabled);
  });

  it("Greedy не меняет результат", () => {
    const enabled = runOptimizer({ ...simple, options: { algorithm: "greedy" } });
    const disabled = runOptimizer({ ...simple, options: { algorithm: "greedy", transposition: false } });
    expectSameLayout(enabled, disabled);
  });

  it("DFS completeness не меняется", () => {
    const options = { algorithm: "dfs" as const, dfs: { maxNodes: 5_000, maxDepth: 6, timeoutMs: 3_000 } };
    const enabled = runOptimizer({ ...simple, options });
    const disabled = runOptimizer({ ...simple, options: { ...options, transposition: false } });
    expectSameLayout(enabled, disabled);
    expect(enabled.searchExhaustive).toBe(disabled.searchExhaustive);
  });

  it("dynamicOrdering детерминирован и совпадает с disabled", () => {
    const enabled = runOptimizer({
      ...simple,
      options: { algorithm: "beam", itemBeamWidth: 8, dynamicOrdering: true },
    });
    const disabled = runOptimizer({
      ...simple,
      options: { algorithm: "beam", itemBeamWidth: 8, dynamicOrdering: true, transposition: false },
    });
    expectSameLayout(enabled, disabled);
    const again = runOptimizer({
      ...simple,
      options: { algorithm: "beam", itemBeamWidth: 8, dynamicOrdering: true },
    });
    expect(getOptimizerStateSignature(enabled.bestState)).toBe(getOptimizerStateSignature(again.bestState));
  });
});

describe("Stage 13 Adaptive identity G/H/M/N", () => {
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
      const disabled = runAdaptiveOptimizer(input, { ...cheap, ...extra, transposition: false });
      expectSameAdaptive(enabled, disabled);
    });
  }
});

describe("Stage 13 Local Search / Joint не ломают ranking", () => {
  it("G Beam+LS enabled === disabled", () => {
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
      transposition: false,
    });
    expectSameLayout(enabled, disabled);
  });
});
