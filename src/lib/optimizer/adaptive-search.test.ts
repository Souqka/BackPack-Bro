import { describe, expect, it } from "vitest";
import { runAdaptiveOptimizer } from "./adaptive-search.ts";
import { normalizeWidthLadder, resolveAdaptiveSearchOptions, zipSearchLevels } from "./adaptive-options.ts";
import { STAGE9_BENCHMARK_CASES, STAGE11_BENCHMARK_CASES } from "./benchmarks/cases.ts";
import { runBenchmarkCase } from "./benchmarks/runner.ts";
import { loadProductionCatalog } from "./load-catalog.ts";
import { getOptimizerStateSignature, runOptimizer } from "./optimizer.ts";
import { DEFAULT_BACKPACK } from "./types.ts";

const catalog = loadProductionCatalog();

const cheapAdaptive = {
  enableItemLocalSearch: false,
  enableBagLocalSearch: false,
  maxBagSeeds: 3,
  bagBeamWidths: [1, 2, 5],
  itemBeamWidths: [1, 2, 5],
  stableLevelsBeforeStop: false as const,
};

describe("escalation ladder", () => {
  it("сортирует ширины и убирает дубликаты", () => {
    expect(normalizeWidthLadder([5, 1, 1, 20, 2, 0, -3])).toEqual([1, 2, 5, 20]);
  });

  it("initial width входит в ladder один раз", () => {
    const resolved = resolveAdaptiveSearchOptions({
      initialBagBeamWidth: 2,
      bagBeamWidths: [2, 5, 2, 10],
      itemBeamWidths: [2, 5],
    });
    expect(resolved.bagBeamWidths).toEqual([2, 5, 10]);
    expect(zipSearchLevels(resolved.bagBeamWidths, resolved.itemBeamWidths)).toEqual([
      { bagBeamWidth: 2, itemBeamWidth: 2 },
      { bagBeamWidth: 5, itemBeamWidth: 5 },
      { bagBeamWidth: 10, itemBeamWidth: 5 },
    ]);
  });

  it("stable result останавливает escalation", () => {
    const result = runAdaptiveOptimizer(
      {
        backpack: DEFAULT_BACKPACK,
        bags: [{ instanceId: "bag", itemId: "medium_bag" }],
        items: [
          { instanceId: "ore-1", itemId: "adamantite_ore" },
          { instanceId: "ore-2", itemId: "adamantite_ore" },
        ],
        catalog,
      },
      {
        ...cheapAdaptive,
        bagBeamWidths: [1, 2, 5, 10, 20],
        itemBeamWidths: [1, 2, 5, 10, 20],
        stableLevelsBeforeStop: 2,
        stopWhenComplete: false,
      },
    );
    expect(result.adaptive.stopReason).toBe("stable_result");
    expect(result.adaptive.stoppedEarly).toBe(true);
    expect(result.adaptive.levelsRun).toBeLessThan(5);
    expect(result.adaptive.escalationSteps).toBeLessThan(4);
  });

  it("max escalation: полный ladder если stable выключен", () => {
    const result = runAdaptiveOptimizer(
      {
        backpack: DEFAULT_BACKPACK,
        bags: [{ instanceId: "bag", itemId: "medium_bag" }],
        items: [
          { instanceId: "ore-1", itemId: "adamantite_ore" },
          { instanceId: "ore-2", itemId: "adamantite_ore" },
        ],
        catalog,
      },
      {
        ...cheapAdaptive,
        bagBeamWidths: [1, 2, 5],
        itemBeamWidths: [1, 2, 5],
        stableLevelsBeforeStop: false,
        stopWhenComplete: false,
      },
    );
    expect(result.adaptive.stopReason).toBe("max_escalation_reached");
    expect(result.adaptive.stoppedEarly).toBe(false);
    expect(result.adaptive.levelsRun).toBe(3);
  });

  it("early stop disabled: stopWhenComplete=false не режет complete layout", () => {
    const result = runAdaptiveOptimizer(
      {
        backpack: DEFAULT_BACKPACK,
        bags: [{ instanceId: "bag", itemId: "medium_bag" }],
        items: [{ instanceId: "ore", itemId: "adamantite_ore" }],
        catalog,
      },
      {
        ...cheapAdaptive,
        bagBeamWidths: [1, 2],
        itemBeamWidths: [1, 2],
        stopWhenComplete: false,
        stableLevelsBeforeStop: false,
      },
    );
    expect(result.complete).toBe(true);
    expect(result.adaptive.levelsRun).toBe(2);
    expect(result.adaptive.stopReason).toBe("max_escalation_reached");
  });

  it("early stop enabled: complete_layout", () => {
    const result = runAdaptiveOptimizer(
      {
        backpack: DEFAULT_BACKPACK,
        bags: [{ instanceId: "bag", itemId: "medium_bag" }],
        items: [{ instanceId: "ore", itemId: "adamantite_ore" }],
        catalog,
      },
      {
        ...cheapAdaptive,
        bagBeamWidths: [1, 2, 5, 10],
        itemBeamWidths: [1, 2, 5, 10],
        stopWhenComplete: true,
        stableLevelsBeforeStop: false,
      },
    );
    expect(result.complete).toBe(true);
    expect(result.adaptive.stopReason).toBe("complete_layout");
    expect(result.adaptive.stoppedEarly).toBe(true);
    expect(result.adaptive.levelsRun).toBe(1);
  });
});

describe("multi-start adaptive", () => {
  it("несколько seeds, merge, dedup, ranking", () => {
    const result = runAdaptiveOptimizer(
      {
        backpack: DEFAULT_BACKPACK,
        bags: [
          { instanceId: "bag-a", itemId: "medium_bag" },
          { instanceId: "bag-b", itemId: "fanny_pack" },
        ],
        items: [
          { instanceId: "bar", itemId: "adamantite_bar" },
          { instanceId: "ore", itemId: "adamantite_ore" },
          { instanceId: "bloom", itemId: "starbloom" },
        ],
        catalog,
        options: { resultCount: 5 },
      },
      {
        ...cheapAdaptive,
        maxBagSeeds: 3,
        bagBeamWidths: [1, 2, 5],
        itemBeamWidths: [1, 2, 5],
        resultCount: 5,
      },
    );
    expect(result.adaptive.bagSeedsSelected).toBeGreaterThanOrEqual(1);
    const signatures = [getOptimizerStateSignature(result.bestState), ...result.alternatives.map((a) => a.signature)];
    expect(new Set(signatures).size).toBe(signatures.length);
    const ids = result.placedItems.map((item) => item.instanceId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("instanceId одинаковых itemId не смешиваются", () => {
    const result = runAdaptiveOptimizer(
      {
        backpack: DEFAULT_BACKPACK,
        bags: [{ instanceId: "bag", itemId: "medium_bag" }],
        items: [
          { instanceId: "ore-1", itemId: "adamantite_ore" },
          { instanceId: "ore-2", itemId: "adamantite_ore" },
        ],
        catalog,
      },
      { ...cheapAdaptive, bagBeamWidths: [1], itemBeamWidths: [1], stableLevelsBeforeStop: false },
    );
    const ores = result.placedItems.filter((item) => item.itemId === "adamantite_ore");
    expect(ores.map((item) => item.instanceId).sort()).toEqual(["ore-1", "ore-2"]);
  });
});

describe("adaptive metrics", () => {
  it("counters, stop reason, stoppedEarly, escalation steps", () => {
    const result = runAdaptiveOptimizer(
      {
        backpack: DEFAULT_BACKPACK,
        bags: [{ instanceId: "bag", itemId: "medium_bag" }],
        items: [
          { instanceId: "ore-1", itemId: "adamantite_ore" },
          { instanceId: "ore-2", itemId: "adamantite_ore" },
        ],
        catalog,
      },
      {
        ...cheapAdaptive,
        bagBeamWidths: [1, 2, 5],
        itemBeamWidths: [1, 2, 5],
        stableLevelsBeforeStop: 2,
      },
    );
    expect(result.adaptive.totalStatesGenerated).toBe(
      result.stats.bagStatesGenerated + result.stats.itemStatesGenerated,
    );
    expect(result.adaptive.candidatesGenerated).toBe(result.stats.candidatesGenerated);
    expect(result.adaptive.levelsRun).toBe(result.adaptive.levels.length);
    expect(result.adaptive.escalationSteps).toBe(Math.max(0, result.adaptive.levelsRun - 1));
    expect(result.adaptive.stopReason).toMatch(/stable_result|max_escalation_reached|complete_layout|no_more_unique_bag_seeds/);
    expect(result.metrics.algorithm).toBe("adaptive");
  });

  it("детерминирован: layout, stop reason, metrics", () => {
    const input = {
      backpack: DEFAULT_BACKPACK,
      bags: [
        { instanceId: "bag-a", itemId: "medium_bag" },
        { instanceId: "bag-b", itemId: "fanny_pack" },
      ],
      items: [
        { instanceId: "bar", itemId: "adamantite_bar" },
        { instanceId: "ore", itemId: "adamantite_ore" },
        { instanceId: "bloom", itemId: "starbloom" },
      ],
      catalog,
    };
    const options = {
      ...cheapAdaptive,
      bagBeamWidths: [1, 2],
      itemBeamWidths: [1, 2],
      maxBagSeeds: 2,
    };
    const a = runAdaptiveOptimizer(input, options);
    const b = runAdaptiveOptimizer(input, options);
    expect(getOptimizerStateSignature(a.bestState)).toBe(getOptimizerStateSignature(b.bestState));
    expect(a.adaptive.stopReason).toBe(b.adaptive.stopReason);
    expect(a.adaptive.bagSeedsSelected).toBe(b.adaptive.bagSeedsSelected);
    expect(a.adaptive.escalationSteps).toBe(b.adaptive.escalationSteps);
    expect(a.score.score).toBe(b.score.score);
  });
});

describe("Stage 11 regression G–O", () => {
  it("runOptimizer не сломан на G", () => {
    const g = STAGE9_BENCHMARK_CASES.find((entry) => entry.id === "G-competing-stars")!;
    const beam = runBenchmarkCase(g, catalog, {
      algorithm: "beam",
      bagBeamWidth: 4,
      itemBeamWidth: 4,
      localSearch: false,
      bagLocalSearch: false,
    });
    expect(beam.placedBags.length).toBeGreaterThan(0);
    expect(beam.metrics?.algorithm).toBe("beam");
  });

  it("Adaptive улучшает Beam(1) на N или корректно эскалирует", () => {
    const n = STAGE11_BENCHMARK_CASES.find((entry) => entry.id === "N-escalation")!;
    const beam1 = runOptimizer({
      inventory: n.inventory,
      bags: n.bags,
      items: n.items,
      catalog,
      options: { bagBeamWidth: 1, itemBeamWidth: 1, localSearch: false, bagLocalSearch: false },
    });
    const adaptive = runAdaptiveOptimizer(
      { inventory: n.inventory, bags: n.bags, items: n.items, catalog },
      {
        enableItemLocalSearch: true,
        enableBagLocalSearch: true,
        bagBeamWidths: [1, 2, 5, 10],
        itemBeamWidths: [1, 2, 5, 10],
        maxBagSeeds: 3,
        stableLevelsBeforeStop: 2,
      },
    );
    const betterScore = adaptive.metrics.finalScore > (beam1.metrics?.finalScore ?? 0);
    const betterComplete = adaptive.complete && !beam1.complete;
    expect(betterScore || betterComplete || adaptive.adaptive.escalationSteps > 0).toBe(true);
    expect(adaptive.adaptive.levelsRun).toBeGreaterThan(1);
  });

  it("M: escalation останавливается раньше максимального уровня", () => {
    const m = STAGE11_BENCHMARK_CASES.find((entry) => entry.id === "M-stable-stop")!;
    const adaptive = runAdaptiveOptimizer(
      { inventory: m.inventory, bags: m.bags, items: m.items, catalog },
      {
        enableItemLocalSearch: false,
        enableBagLocalSearch: false,
        bagBeamWidths: [1, 2, 5, 10, 20],
        itemBeamWidths: [1, 2, 5, 10, 20],
        stableLevelsBeforeStop: 2,
      },
    );
    expect(adaptive.complete).toBe(true);
    expect(adaptive.adaptive.stoppedEarly).toBe(true);
    expect(adaptive.adaptive.lastBagBeamWidth).toBeLessThan(20);
    expect(["stable_result", "complete_layout", "no_more_unique_bag_seeds"]).toContain(
      adaptive.adaptive.stopReason,
    );
  });

  it("L/O запускаются на production itemId", () => {
    for (const id of ["L-multistart", "O-multi-bag-repair"] as const) {
      const entry = STAGE11_BENCHMARK_CASES.find((caseEntry) => caseEntry.id === id)!;
      const result = runAdaptiveOptimizer(
        { inventory: entry.inventory, bags: entry.bags, items: entry.items, catalog },
        {
          ...cheapAdaptive,
          bagBeamWidths: [1, 2],
          itemBeamWidths: [1, 2],
          enableBagLocalSearch: true,
          enableItemLocalSearch: true,
          maxBagSeeds: 3,
        },
      );
      expect(result.placedBags.length).toBeGreaterThan(0);
      expect(result.adaptive.bagSeedsSelected).toBeGreaterThanOrEqual(1);
    }
  });
});
