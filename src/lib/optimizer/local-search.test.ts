import { describe, expect, it } from "vitest";
import { analyzeInventory } from "../inventory/inventory.ts";
import { resolvePlacedGeometry } from "../inventory/geometry.ts";
import { improveLayoutLocally } from "./local-search.ts";
import { loadProductionCatalog } from "./load-catalog.ts";
import { getOptimizerStateSignature, runOptimizer } from "./optimizer.ts";
import { DEFAULT_BACKPACK } from "./types.ts";
import type { RankedLayout } from "./search-types.ts";

const catalog = loadProductionCatalog();

function rankedFromResult(result: ReturnType<typeof runOptimizer>): RankedLayout {
  return {
    state: result.bestState,
    score: result.score,
    unplacedItems: result.unplacedItems,
    unplacedBags: result.unplacedBags,
    complete: result.complete,
    signature: getOptimizerStateSignature(result.bestState),
  };
}

describe("local search", () => {
  it("не ухудшает layout", () => {
    const before = runOptimizer({
      backpack: DEFAULT_BACKPACK,
      bags: [{ instanceId: "bag", itemId: "warrior_backpack" }],
      items: [
        { instanceId: "bar", itemId: "adamantite_bar" },
        { instanceId: "ore", itemId: "adamantite_ore" },
      ],
      catalog,
      options: { algorithm: "beam", bagBeamWidth: 8, itemBeamWidth: 12, localSearch: false },
    });
    const after = improveLayoutLocally(rankedFromResult(before), catalog);
    expect(after.stats.finalScore).toBeGreaterThanOrEqual(after.stats.initialScore);
    expect(
      analyzeInventory({ inventory: DEFAULT_BACKPACK, items: after.layout.state.items.items }, catalog).valid,
    ).toBe(true);
  });

  it("не принимает equal-score state (две Ore в Medium Bag)", () => {
    const result = runOptimizer({
      backpack: DEFAULT_BACKPACK,
      bags: [{ instanceId: "bag", itemId: "medium_bag" }],
      items: [
        { instanceId: "ore-1", itemId: "adamantite_ore" },
        { instanceId: "ore-2", itemId: "adamantite_ore" },
      ],
      catalog,
      options: { algorithm: "greedy", localSearch: false },
    });
    const improved = improveLayoutLocally(rankedFromResult(result), catalog, {
      maxIterations: 10,
      maxNeighbors: 100,
    });
    expect(improved.stats.improved).toBe(false);
    expect(improved.layout.signature).toBe(getOptimizerStateSignature(result.bestState));
    expect(improved.stats.finalScore).toBe(improved.stats.initialScore);
  });

  it("не создаёт collision и не выходит за availableCells", () => {
    const result = runOptimizer({
      backpack: DEFAULT_BACKPACK,
      bags: [{ instanceId: "bag", itemId: "bottom_trawl" }],
      items: [
        { instanceId: "cat", itemId: "black_cat" },
        { instanceId: "bar", itemId: "adamantite_bar" },
        { instanceId: "ore", itemId: "adamantite_ore" },
      ],
      catalog,
      options: { localSearch: true, bagBeamWidth: 8, itemBeamWidth: 20 },
    });
    const analysis = analyzeInventory(
      { inventory: DEFAULT_BACKPACK, items: result.placedItems },
      catalog,
    );
    expect(analysis.valid).toBe(true);
    expect(analysis.collisions).toEqual([]);
    for (const placed of result.placedItems) {
      const geo = result.bestState.items.itemGeometries.get(placed.instanceId);
      expect(geo).toBeDefined();
      expect(
        geo!.cells.every((cell) => result.bestState.bags.availableCells.has(`${cell.row}:${cell.col}`)),
      ).toBe(true);
    }
  });

  it("Star geometry вращается вместе с Item", () => {
    const result = runOptimizer({
      backpack: DEFAULT_BACKPACK,
      bags: [{ instanceId: "bag", itemId: "warrior_backpack" }],
      items: [
        { instanceId: "bar", itemId: "adamantite_bar" },
        { instanceId: "ore", itemId: "adamantite_ore" },
      ],
      catalog,
      options: { localSearch: true, bagBeamWidth: 8, itemBeamWidth: 12 },
    });
    for (const placed of result.placedItems) {
      const item = catalog.get(placed.itemId)!;
      const resolved = resolvePlacedGeometry(item, placed);
      const stored = result.bestState.items.itemGeometries.get(placed.instanceId);
      expect(stored?.stars).toEqual(resolved.stars);
      expect(stored?.cells).toEqual(resolved.cells);
    }
  });

  it("canonical signature предотвращает циклы: visitedStates растёт, повтор не зацикливает", () => {
    const result = runOptimizer({
      backpack: DEFAULT_BACKPACK,
      bags: [{ instanceId: "bag", itemId: "medium_bag" }],
      items: [
        { instanceId: "a", itemId: "adamantite_ore" },
        { instanceId: "b", itemId: "adamantite_ore" },
      ],
      catalog,
      options: { algorithm: "beam", itemBeamWidth: 8, localSearch: false },
    });
    const improved = improveLayoutLocally(rankedFromResult(result), catalog, {
      maxIterations: 20,
      maxNeighbors: 50,
    });
    expect(improved.stats.visitedStates).toBeGreaterThanOrEqual(1);
    expect(improved.stats.iterations).toBeLessThanOrEqual(20);
  });

  it("maxIterations ограничивает шаги", () => {
    const result = runOptimizer({
      backpack: DEFAULT_BACKPACK,
      bags: [
        { instanceId: "bag-a", itemId: "warrior_backpack" },
        { instanceId: "bag-b", itemId: "medium_bag" },
      ],
      items: [
        { instanceId: "bar-1", itemId: "adamantite_bar" },
        { instanceId: "bar-2", itemId: "adamantite_bar" },
        { instanceId: "bloom-1", itemId: "starbloom" },
        { instanceId: "bloom-2", itemId: "starbloom" },
      ],
      catalog,
      options: { algorithm: "beam", bagBeamWidth: 1, itemBeamWidth: 1, localSearch: false },
    });
    const improved = improveLayoutLocally(rankedFromResult(result), catalog, {
      maxIterations: 1,
      maxNeighbors: 100,
    });
    expect(improved.stats.iterations).toBeLessThanOrEqual(1);
  });

  it("maxNeighbors ограничивает оценку соседей за шаг", () => {
    const result = runOptimizer({
      backpack: DEFAULT_BACKPACK,
      bags: [{ instanceId: "bag", itemId: "bottom_trawl" }],
      items: [
        { instanceId: "bar", itemId: "adamantite_bar" },
        { instanceId: "ore", itemId: "adamantite_ore" },
      ],
      catalog,
      options: { localSearch: false, itemBeamWidth: 8 },
    });
    const improved = improveLayoutLocally(rankedFromResult(result), catalog, {
      maxIterations: 3,
      maxNeighbors: 2,
    });
    expect(improved.stats.neighborsEvaluated).toBeLessThanOrEqual(3 * 2);
  });

  it("rotation учитывается: relocate перебирает unique rotations", () => {
    const without = runOptimizer({
      backpack: DEFAULT_BACKPACK,
      bags: [{ instanceId: "bag", itemId: "warrior_backpack" }],
      items: [
        { instanceId: "bar", itemId: "adamantite_bar" },
        { instanceId: "ore", itemId: "adamantite_ore" },
      ],
      catalog,
      options: { algorithm: "greedy", localSearch: false },
    });
    const withLs = runOptimizer({
      backpack: DEFAULT_BACKPACK,
      bags: [{ instanceId: "bag", itemId: "warrior_backpack" }],
      items: [
        { instanceId: "bar", itemId: "adamantite_bar" },
        { instanceId: "ore", itemId: "adamantite_ore" },
      ],
      catalog,
      options: { algorithm: "greedy", localSearch: true },
    });
    expect(withLs.score.score).toBeGreaterThanOrEqual(without.score.score);
    expect(withLs.placedItems.some((item) => item.itemId === "adamantite_bar")).toBe(true);
  });
});

describe("local search integration", () => {
  it("Beam → Top-N → Local Search → dedup → ranking", () => {
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
        algorithm: "beam",
        bagBeamWidth: 12,
        itemBeamWidth: 20,
        resultCount: 5,
        localSearch: true,
      },
    });
    expect(result.metrics?.localSearchEnabled).toBe(true);
    expect(result.score.valid).toBe(true);
    const signatures = [
      getOptimizerStateSignature(result.bestState),
      ...result.alternatives.map((entry) => entry.signature),
    ];
    expect(new Set(signatures).size).toBe(signatures.length);
    for (let i = 1; i < result.alternatives.length; i++) {
      expect(result.alternatives[i - 1]!.score.score).toBeGreaterThanOrEqual(
        result.alternatives[i]!.score.score,
      );
    }
    expect(
      analyzeInventory({ inventory: DEFAULT_BACKPACK, items: result.placedItems }, catalog).valid,
    ).toBe(true);
  });

  it("детерминирован с Local Search", () => {
    const input = {
      backpack: DEFAULT_BACKPACK,
      bags: [{ instanceId: "bag", itemId: "bottom_trawl" }],
      items: [
        { instanceId: "cat", itemId: "black_cat" },
        { instanceId: "bar", itemId: "adamantite_bar" },
        { instanceId: "ore", itemId: "adamantite_ore" },
      ],
      catalog,
      options: { localSearch: true, bagBeamWidth: 6, itemBeamWidth: 12, resultCount: 3 },
    };
    const a = runOptimizer(input);
    const b = runOptimizer(input);
    expect(getOptimizerStateSignature(a.bestState)).toBe(getOptimizerStateSignature(b.bestState));
    expect(a.score.score).toBe(b.score.score);
    expect(a.alternatives.map((entry) => entry.signature)).toEqual(
      b.alternatives.map((entry) => entry.signature),
    );
  });
});
