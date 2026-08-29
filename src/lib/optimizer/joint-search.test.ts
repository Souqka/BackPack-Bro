import { describe, expect, it } from "vitest";
import { analyzeInventory } from "../inventory/inventory.ts";
import { STAGE10_BENCHMARK_CASES } from "./benchmarks/cases.ts";
import { runBenchmarkCase } from "./benchmarks/runner.ts";
import { DEFAULT_BAG_LOCAL_SEARCH_OPTIONS } from "./bag-local-search.ts";
import { createBagState } from "./bags/state.ts";
import { improveTopNJointly, runJointLocalSearch } from "./joint-search.ts";
import { loadProductionCatalog } from "./load-catalog.ts";
import { getOptimizerStateSignature, runOptimizer } from "./optimizer.ts";
import { buildRankedLayout, isStrictlyBetterLayout } from "./rank.ts";
import { createSearchState } from "./state.ts";
import { DEFAULT_BACKPACK } from "./types.ts";
import type { RankedLayout } from "./search-types.ts";
import type { PlacedBag } from "./bags/types.ts";
import type { ItemToPlace, PlacedItem } from "./types.ts";

const catalog = loadProductionCatalog();

function rankedFrom(
  placedBags: PlacedBag[],
  placedItems: PlacedItem[],
  unplacedItems: ItemToPlace[] = [],
): RankedLayout {
  const bags = createBagState(DEFAULT_BACKPACK, placedBags, catalog);
  const items = createSearchState(DEFAULT_BACKPACK, placedItems, catalog);
  if (!bags.ok) throw new Error(bags.issues.join("; "));
  if (!items.ok) throw new Error(items.issues.map((issue) => issue.message).join("; "));
  return buildRankedLayout(
    { backpack: DEFAULT_BACKPACK, bags: bags.state, items: items.state },
    unplacedItems,
    [],
    catalog,
  );
}

const tightLimits = {
  maxIterations: 2,
  maxNeighbors: 8,
  repairBeamWidth: 3,
  itemLocalSearch: false,
} as const;

describe("joint local search", () => {
  it("улучшает слабый Bag layout", () => {
    const seed = rankedFrom(
      [
        { instanceId: "bag-a", itemId: "fanny_pack", position: { row: 0, col: 0 }, rotation: 0 },
        { instanceId: "bag-b", itemId: "fanny_pack", position: { row: 0, col: 3 }, rotation: 0 },
        { instanceId: "bag-c", itemId: "fanny_pack", position: { row: 0, col: 6 }, rotation: 0 },
      ],
      [
        { instanceId: "ore", itemId: "adamantite_ore", position: { row: 0, col: 0 }, rotation: 0 },
        { instanceId: "bar", itemId: "adamantite_bar", position: { row: 0, col: 2 }, rotation: 0 },
      ],
      [{ instanceId: "bloom", itemId: "starbloom" }],
    );
    expect(seed.complete).toBe(false);
    const improved = runJointLocalSearch(seed, catalog, {
      maxIterations: 3,
      maxNeighbors: 12,
      repairBeamWidth: 4,
      itemLocalSearch: true,
    });
    expect(isStrictlyBetterLayout(improved.layout, seed)).toBe(true);
    expect(improved.layout.complete).toBe(true);
    expect(improved.stats.bagLayoutsAccepted).toBeGreaterThan(0);
    expect(improved.stats.finalScore).toBeGreaterThan(improved.stats.initialScore);
  });

  it("не принимает равный score", () => {
    const seed = rankedFrom(
      [{ instanceId: "bag", itemId: "medium_bag", position: { row: 0, col: 0 }, rotation: 0 }],
      [
        { instanceId: "ore-1", itemId: "adamantite_ore", position: { row: 0, col: 0 }, rotation: 0 },
        { instanceId: "ore-2", itemId: "adamantite_ore", position: { row: 1, col: 1 }, rotation: 0 },
      ],
    );
    const improved = runJointLocalSearch(seed, catalog, tightLimits);
    expect(improved.stats.bagLayoutsAccepted).toBe(0);
    expect(improved.layout.signature).toBe(seed.signature);
    expect(improved.stats.finalScore).toBe(improved.stats.initialScore);
  });

  it("не принимает худший score", () => {
    const result = runOptimizer({
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
      options: { bagBeamWidth: 8, itemBeamWidth: 12, localSearch: false, bagLocalSearch: false },
    });
    const seed: RankedLayout = {
      state: result.bestState,
      score: result.score,
      unplacedItems: result.unplacedItems,
      unplacedBags: result.unplacedBags,
      complete: result.complete,
      signature: getOptimizerStateSignature(result.bestState),
    };
    const improved = runJointLocalSearch(seed, catalog, tightLimits);
    expect(improved.stats.finalScore).toBeGreaterThanOrEqual(improved.stats.initialScore);
    if (improved.layout.signature !== seed.signature) {
      expect(isStrictlyBetterLayout(improved.layout, seed)).toBe(true);
    }
  });

  it("не создаёт цикл", () => {
    const seed = rankedFrom(
      [
        { instanceId: "bag-a", itemId: "medium_bag", position: { row: 0, col: 0 }, rotation: 0 },
        { instanceId: "bag-b", itemId: "fanny_pack", position: { row: 3, col: 0 }, rotation: 0 },
      ],
      [{ instanceId: "ore", itemId: "adamantite_ore", position: { row: 0, col: 0 }, rotation: 0 }],
    );
    const improved = runJointLocalSearch(seed, catalog, {
      ...tightLimits,
      maxIterations: 5,
    });
    expect(improved.stats.iterations).toBeLessThanOrEqual(5);
    expect(improved.stats.bagLayoutsAccepted).toBeLessThanOrEqual(improved.stats.iterations);
    expect(improved.stats.visitedBagLayouts).toBeGreaterThanOrEqual(1);
  });

  it("соблюдает iteration limit", () => {
    const seed = rankedFrom(
      [
        { instanceId: "bag-a", itemId: "fanny_pack", position: { row: 0, col: 0 }, rotation: 0 },
        { instanceId: "bag-b", itemId: "fanny_pack", position: { row: 2, col: 0 }, rotation: 0 },
      ],
      [{ instanceId: "ore", itemId: "adamantite_ore", position: { row: 0, col: 0 }, rotation: 0 }],
    );
    const improved = runJointLocalSearch(seed, catalog, { ...tightLimits, maxIterations: 1 });
    expect(improved.stats.iterations).toBe(1);
    expect(improved.stats.iterations).toBeLessThanOrEqual(DEFAULT_BAG_LOCAL_SEARCH_OPTIONS.maxIterations);
  });

  it("работает с Top-N seeds и своим visited на seed", () => {
    const first = rankedFrom(
      [
        { instanceId: "bag-a", itemId: "medium_bag", position: { row: 0, col: 0 }, rotation: 0 },
        { instanceId: "bag-b", itemId: "fanny_pack", position: { row: 0, col: 4 }, rotation: 0 },
      ],
      [{ instanceId: "ore", itemId: "adamantite_ore", position: { row: 0, col: 0 }, rotation: 0 }],
      [
        { instanceId: "bar", itemId: "adamantite_bar" },
        { instanceId: "bloom", itemId: "starbloom" },
      ],
    );
    const second = rankedFrom(
      [
        { instanceId: "bag-a", itemId: "medium_bag", position: { row: 2, col: 2 }, rotation: 0 },
        { instanceId: "bag-b", itemId: "fanny_pack", position: { row: 4, col: 0 }, rotation: 90 },
      ],
      [{ instanceId: "ore", itemId: "adamantite_ore", position: { row: 2, col: 2 }, rotation: 0 }],
      [
        { instanceId: "bar", itemId: "adamantite_bar" },
        { instanceId: "bloom", itemId: "starbloom" },
      ],
    );
    const merged = improveTopNJointly([first, second], catalog, 2, tightLimits);
    expect(merged.layouts.length).toBeGreaterThanOrEqual(1);
    expect(merged.stats.iterations).toBeGreaterThan(0);
  });

  it("complete layout имеет существующий приоритет", () => {
    const complete = rankedFrom(
      [{ instanceId: "bag", itemId: "medium_bag", position: { row: 0, col: 0 }, rotation: 0 }],
      [
        { instanceId: "ore-1", itemId: "adamantite_ore", position: { row: 0, col: 0 }, rotation: 0 },
        { instanceId: "ore-2", itemId: "adamantite_ore", position: { row: 0, col: 1 }, rotation: 0 },
      ],
    );
    const incomplete = rankedFrom(
      [
        { instanceId: "bag-a", itemId: "warrior_backpack", position: { row: 0, col: 0 }, rotation: 0 },
        { instanceId: "bag-b", itemId: "medium_bag", position: { row: 0, col: 3 }, rotation: 0 },
      ],
      [
        { instanceId: "bar", itemId: "adamantite_bar", position: { row: 0, col: 0 }, rotation: 0 },
        { instanceId: "bloom", itemId: "starbloom", position: { row: 1, col: 0 }, rotation: 0 },
        { instanceId: "ore", itemId: "adamantite_ore", position: { row: 2, col: 0 }, rotation: 0 },
      ],
      [{ instanceId: "extra", itemId: "apple" }],
    );
    expect(complete.complete).toBe(true);
    expect(incomplete.complete).toBe(false);
    expect(isStrictlyBetterLayout(complete, incomplete)).toBe(true);
    expect(isStrictlyBetterLayout(incomplete, complete)).toBe(false);
  });
});

describe("Stage 10 pipeline", () => {
  it("bagLocalSearch по умолчанию выключен", () => {
    const result = runOptimizer({
      backpack: DEFAULT_BACKPACK,
      bags: [{ instanceId: "bag", itemId: "medium_bag" }],
      items: [
        { instanceId: "ore-1", itemId: "adamantite_ore" },
        { instanceId: "ore-2", itemId: "adamantite_ore" },
      ],
      catalog,
      options: { bagBeamWidth: 4, itemBeamWidth: 6 },
    });
    expect(result.metrics?.bagLocalSearchEnabled).toBe(false);
    expect(result.metrics?.bagNeighborsGenerated).toBe(0);
  });

  it("Joint Bag LS детерминирован", () => {
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
      options: {
        algorithm: "beam" as const,
        bagBeamWidth: 1,
        itemBeamWidth: 1,
        localSearch: false,
        bagLocalSearch: {
          maxIterations: 2,
          maxNeighbors: 6,
          repairBeamWidth: 3,
          itemLocalSearch: false,
        },
        resultCount: 3,
      },
    };
    const a = runOptimizer(input);
    const b = runOptimizer(input);
    expect(getOptimizerStateSignature(a.bestState)).toBe(getOptimizerStateSignature(b.bestState));
    expect(a.score.score).toBe(b.score.score);
    expect(a.metrics?.bagNeighborsGenerated).toBe(b.metrics?.bagNeighborsGenerated);
  });

  it("placement остаётся внутри availableCells после Joint LS", () => {
    const result = runOptimizer({
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
      options: {
        bagBeamWidth: 4,
        itemBeamWidth: 8,
        bagLocalSearch: { maxIterations: 2, maxNeighbors: 6, repairBeamWidth: 3, itemLocalSearch: true },
        resultCount: 3,
      },
    });
    expect(result.placedBags.length).toBeGreaterThan(0);
    if (result.placedItems.length > 0) {
      expect(
        analyzeInventory({ inventory: DEFAULT_BACKPACK, items: result.placedItems }, catalog).valid,
      ).toBe(true);
    }
    for (const placed of result.placedItems) {
      const geo = result.bestState.items.itemGeometries.get(placed.instanceId);
      expect(geo).toBeDefined();
      expect(
        geo!.cells.every((cell) => result.bestState.bags.availableCells.has(`${cell.row}:${cell.col}`)),
      ).toBe(true);
    }
  });

  it("Case K существует и запускается", () => {
    const k = STAGE10_BENCHMARK_CASES.find((entry) => entry.id === "K-displaced-repair");
    expect(k).toBeDefined();
    const result = runBenchmarkCase(k!, catalog, {
      algorithm: "beam",
      bagBeamWidth: 4,
      itemBeamWidth: 6,
      localSearch: false,
      bagLocalSearch: false,
    });
    expect(result.placedBags).toHaveLength(2);
    expect(result.metrics).toBeDefined();
  });

  it("H/I/J: Joint Bag LS улучшает Beam(1)+Item LS", () => {
    const ids = ["H-multiple-bags", "I-geometry-trap", "J-bag-item-topology"] as const;
    for (const id of ids) {
      const entry = STAGE10_BENCHMARK_CASES.find((caseEntry) => caseEntry.id === id)!;
      const itemLs = runBenchmarkCase(entry, catalog, {
        algorithm: "beam",
        bagBeamWidth: 1,
        itemBeamWidth: 1,
        localSearch: true,
        bagLocalSearch: false,
        resultCount: 10,
      });
      const joint = runBenchmarkCase(entry, catalog, {
        algorithm: "beam",
        bagBeamWidth: 1,
        itemBeamWidth: 1,
        localSearch: true,
        bagLocalSearch: true,
        resultCount: 10,
      });
      const betterScore = joint.metrics!.finalScore > itemLs.metrics!.finalScore;
      const betterComplete = joint.complete && !itemLs.complete;
      expect(betterScore || betterComplete).toBe(true);
      expect(joint.metrics!.bagLocalSearchEnabled).toBe(true);
      expect(joint.metrics!.displacedItems).toBeGreaterThan(0);
    }
  });
});
