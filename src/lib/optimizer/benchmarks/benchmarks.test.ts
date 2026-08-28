import { describe, expect, it } from "vitest";
import { analyzeInventory } from "../../inventory/inventory.ts";
import {
  BEAM_WIDTHS,
  OPTIMIZER_BENCHMARK_CASES,
  SMOKE_BENCHMARK_CASES,
  compareAlgorithms,
  runBeamWidthSweep,
  runBenchmarkCase,
} from "./index.ts";
import { loadProductionCatalog } from "../load-catalog.ts";
import { getOptimizerStateSignature, runOptimizer } from "../optimizer.ts";

const catalog = loadProductionCatalog();

describe("benchmark cases A–F", () => {
  it("все обязательные cases запускаются без exception", () => {
    for (const benchmarkCase of OPTIMIZER_BENCHMARK_CASES) {
      const result = runBenchmarkCase(benchmarkCase, catalog, { algorithm: "beam" });
      expect(result.metrics).toBeDefined();
      expect(result.layout.bags).toEqual(result.placedBags);
      expect(result.placedItems.length + result.unplacedItems.length).toBe(benchmarkCase.items.length);
      if (result.placedItems.length > 0) {
        expect(
          analyzeInventory(
            { inventory: benchmarkCase.inventory, items: result.placedItems },
            catalog,
          ).valid,
        ).toBe(true);
      }
    }
  });

  it("case A: beam vs greedy vs dfs", () => {
    const row = compareAlgorithms(OPTIMIZER_BENCHMARK_CASES[0]!, catalog);
    expect(row.beam).toBeDefined();
    expect(row.greedy).toBeDefined();
    expect(row.dfs).toBeDefined();
    expect(row.beam!.complete).toBe(true);
    expect(row.dfs!.complete).toBe(true);
  });

  it("case B активирует Star", () => {
    const result = runBenchmarkCase(OPTIMIZER_BENCHMARK_CASES[1]!, catalog);
    expect(result.score.valid).toBe(true);
    expect(result.score.breakdown.activatedStars).toBeGreaterThanOrEqual(1);
  });

  it("case E не падает и оставляет unplacedItems", () => {
    const result = runBenchmarkCase(OPTIMIZER_BENCHMARK_CASES[4]!, catalog);
    expect(result.complete).toBe(false);
    expect(result.unplacedItems.length).toBeGreaterThan(0);
  });

  it("case F: две Bags размещены, Items только на availableCells", () => {
    const result = runBenchmarkCase(OPTIMIZER_BENCHMARK_CASES[5]!, catalog);
    expect(result.placedBags.length).toBe(2);
    for (const placed of result.placedItems) {
      const geo = result.bestState.items.itemGeometries.get(placed.instanceId);
      expect(geo).toBeDefined();
      expect(geo!.cells.every((cell) => result.bestState.bags.availableCells.has(`${cell.row}:${cell.col}`))).toBe(
        true,
      );
    }
  });

  it("case F: Beam находит лучший score, чем Greedy (layout Bags влияет на Items)", () => {
    const row = compareAlgorithms(OPTIMIZER_BENCHMARK_CASES[5]!, catalog);
    expect(row.beam?.finalScore).toBe(3);
    expect(row.greedy?.finalScore).toBe(2);
    expect(row.beam!.finalScore).toBeGreaterThan(row.greedy!.finalScore);
  });
});

describe("beam width sweep", () => {
  it("case A сравнивает ширины 1..100", () => {
    const rows = runBeamWidthSweep(OPTIMIZER_BENCHMARK_CASES[0]!, catalog, BEAM_WIDTHS);
    expect(rows).toHaveLength(BEAM_WIDTHS.length);
    for (const row of rows) {
      expect(Number.isFinite(row.score) || row.score === Number.NEGATIVE_INFINITY).toBe(true);
      expect(row.durationMs).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("smoke realistic sets", () => {
  it("5 / 10 / 20 Items: optimizer не падает, детерминирован, valid layout", () => {
    for (const smoke of SMOKE_BENCHMARK_CASES) {
      const a = runBenchmarkCase(smoke, catalog, { algorithm: "beam" });
      const b = runBenchmarkCase(smoke, catalog, { algorithm: "beam" });
      expect(getOptimizerStateSignature(a.bestState)).toBe(getOptimizerStateSignature(b.bestState));
      expect(a.score.valid === b.score.valid).toBe(true);
      if (a.placedItems.length > 0) {
        expect(
          analyzeInventory({ inventory: smoke.inventory, items: a.placedItems }, catalog).valid,
        ).toBe(true);
      }
      expect(a.stats.durationMs).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("inventory alias API", () => {
  it("принимает inventory вместо backpack", () => {
    const result = runOptimizer({
      inventory: { rows: 6, cols: 9 },
      bags: [{ instanceId: "bag", itemId: "medium_bag" }],
      items: [{ instanceId: "ore", itemId: "adamantite_ore" }],
      catalog,
      options: {
        bagBeamWidth: 8,
        itemBeamWidth: 10,
        algorithm: "beam",
        resultCount: 1,
        dynamicOrdering: false,
        metrics: true,
      },
    });
    expect(result.complete).toBe(true);
    expect(result.layout.bags).toHaveLength(1);
    expect(result.metrics).toBeDefined();
  });
});
