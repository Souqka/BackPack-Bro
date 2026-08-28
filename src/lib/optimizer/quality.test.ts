import { describe, expect, it } from "vitest";
import { analyzeInventory } from "../inventory/inventory.ts";
import { compareOptimizerResults } from "./compare.ts";
import { loadProductionCatalog } from "./load-catalog.ts";
import { getOptimizerStateSignature, runOptimizer } from "./optimizer.ts";
import { DEFAULT_BACKPACK } from "./types.ts";

const catalog = loadProductionCatalog();

describe("bags", () => {
  it("1 Bag даёт availableCells и позволяет поставить Item", () => {
    const result = runOptimizer({
      inventory: DEFAULT_BACKPACK,
      bags: [{ instanceId: "bag", itemId: "medium_bag" }],
      items: [{ instanceId: "ore", itemId: "adamantite_ore" }],
      catalog,
    });
    expect(result.placedBags).toHaveLength(1);
    expect(result.placedItems).toHaveLength(1);
    expect(result.complete).toBe(true);
    expect(result.bestState.bags.availableCells.size).toBe(4);
  });

  it("2 Bags меняют availableCells относительно одной Bag", () => {
    const one = runOptimizer({
      backpack: DEFAULT_BACKPACK,
      bags: [{ instanceId: "bag", itemId: "medium_bag" }],
      items: [{ instanceId: "ore", itemId: "adamantite_ore" }],
      catalog,
    });
    const two = runOptimizer({
      backpack: DEFAULT_BACKPACK,
      bags: [
        { instanceId: "bag-a", itemId: "medium_bag" },
        { instanceId: "bag-b", itemId: "fanny_pack" },
      ],
      items: [{ instanceId: "ore", itemId: "adamantite_ore" }],
      catalog,
    });
    expect(two.placedBags).toHaveLength(2);
    expect(two.bestState.bags.availableCells.size).toBeGreaterThan(one.bestState.bags.availableCells.size);
  });

  it("невозможный набор Bags → unplacedBags без exception", () => {
    const bags = Array.from({ length: 7 }, (_, index) => ({
      instanceId: `trawl-${index}`,
      itemId: "bottom_trawl",
    }));
    const result = runOptimizer({
      backpack: DEFAULT_BACKPACK,
      bags,
      items: [],
      catalog,
      options: { bagBeamWidth: 4 },
    });
    expect(result.placedBags.length + result.unplacedBags.length).toBe(7);
    expect(result.unplacedBags.length).toBeGreaterThan(0);
    expect(result.complete).toBe(false);
  });

  it("без Bags пустой 6×9 не считается игровым layout", () => {
    const result = runOptimizer({
      backpack: DEFAULT_BACKPACK,
      bags: [],
      items: [{ instanceId: "ore", itemId: "adamantite_ore" }],
      catalog,
    });
    expect(result.placedBags).toEqual([]);
    expect(result.placedItems).toEqual([]);
    expect(result.complete).toBe(false);
    expect(result.score.valid).toBe(false);
  });
});

describe("items", () => {
  it("один Item", () => {
    const result = runOptimizer({
      backpack: DEFAULT_BACKPACK,
      bags: [{ instanceId: "bag", itemId: "medium_bag" }],
      items: [{ instanceId: "ore", itemId: "adamantite_ore" }],
      catalog,
    });
    expect(result.placedItems).toHaveLength(1);
    expect(result.unplacedItems).toEqual([]);
  });

  it("несколько одинаковых Items", () => {
    const result = runOptimizer({
      backpack: DEFAULT_BACKPACK,
      bags: [{ instanceId: "bag", itemId: "warrior_backpack" }],
      items: [
        { instanceId: "a", itemId: "adamantite_ore" },
        { instanceId: "b", itemId: "adamantite_ore" },
        { instanceId: "c", itemId: "adamantite_ore" },
      ],
      catalog,
    });
    expect(result.placedItems).toHaveLength(3);
    expect(new Set(result.placedItems.map((item) => item.instanceId)).size).toBe(3);
  });

  it("сложная геометрия (L-shape black_cat)", () => {
    const result = runOptimizer({
      backpack: DEFAULT_BACKPACK,
      bags: [{ instanceId: "bag", itemId: "bottom_trawl" }],
      items: [{ instanceId: "cat", itemId: "black_cat" }],
      catalog,
    });
    expect(result.placedItems).toHaveLength(1);
    expect(result.complete).toBe(true);
  });

  it("asymmetric Stars (big_chocolate_gift_box) не ломают placement", () => {
    const result = runOptimizer({
      backpack: DEFAULT_BACKPACK,
      bags: [{ instanceId: "bag", itemId: "bottom_trawl" }],
      items: [{ instanceId: "box", itemId: "big_chocolate_gift_box" }],
      catalog,
    });
    expect(result.placedItems).toHaveLength(1);
    const analysis = analyzeInventory(
      { inventory: DEFAULT_BACKPACK, items: result.placedItems },
      catalog,
    );
    expect(analysis.valid).toBe(true);
  });

  it("невозможный Item → unplacedItems, complete false", () => {
    const result = runOptimizer({
      backpack: DEFAULT_BACKPACK,
      bags: [{ instanceId: "bag", itemId: "bolstering_bag" }],
      items: [{ instanceId: "bar", itemId: "adamantite_bar" }],
      catalog,
    });
    expect(result.unplacedItems.map((item) => item.itemId)).toContain("adamantite_bar");
    expect(result.complete).toBe(false);
  });

  it("частично заполненный рюкзак: часть Items не влезает", () => {
    const result = runOptimizer({
      backpack: DEFAULT_BACKPACK,
      bags: [{ instanceId: "bag", itemId: "fanny_pack" }],
      items: [
        { instanceId: "a", itemId: "adamantite_ore" },
        { instanceId: "b", itemId: "adamantite_ore" },
        { instanceId: "c", itemId: "adamantite_bar" },
      ],
      catalog,
    });
    expect(result.placedItems.length + result.unplacedItems.length).toBe(3);
    expect(result.unplacedItems.length).toBeGreaterThan(0);
    expect(result.complete).toBe(false);
  });
});

describe("top-N и compare", () => {
  it("resultCount > 1 возвращает уникальные alternatives, отсортированные по score", () => {
    const result = runOptimizer({
      backpack: DEFAULT_BACKPACK,
      bags: [{ instanceId: "bag", itemId: "warrior_backpack" }],
      items: [
        { instanceId: "bar", itemId: "adamantite_bar" },
        { instanceId: "ore", itemId: "adamantite_ore" },
      ],
      catalog,
      options: { resultCount: 10, bagBeamWidth: 12, itemBeamWidth: 30 },
    });
    expect(result.layout.items).toEqual(result.placedItems);
    expect(result.alternatives.length).toBeGreaterThan(0);
    const altSigs = result.alternatives.map((entry) => entry.signature);
    expect(new Set(altSigs).size).toBe(altSigs.length);
    expect(altSigs.includes(getOptimizerStateSignature(result.bestState))).toBe(false);
    for (let i = 1; i < result.alternatives.length; i++) {
      expect(result.alternatives[i - 1]!.score.score).toBeGreaterThanOrEqual(
        result.alternatives[i]!.score.score,
      );
    }
  });

  it("compareOptimizerResults считает gap для DFS reference", () => {
    const input = {
      backpack: DEFAULT_BACKPACK,
      bags: [{ instanceId: "bag", itemId: "medium_bag" }],
      items: [
        { instanceId: "ore-1", itemId: "adamantite_ore" },
        { instanceId: "ore-2", itemId: "adamantite_ore" },
      ],
      catalog,
    };
    const beam = runOptimizer({ ...input, options: { algorithm: "beam", itemBeamWidth: 10 } });
    const dfs = runOptimizer({
      ...input,
      options: { algorithm: "dfs", dfs: { maxNodes: 8_000, timeoutMs: 3_000 } },
    });
    const comparison = compareOptimizerResults(dfs, beam);
    expect(comparison.a.finalScore).toBe(dfs.score.score);
    expect(comparison.b.finalScore).toBe(beam.score.score);
    if (dfs.score.valid) {
      expect(comparison.gap).toBe(dfs.score.score - beam.score.score);
    }
  });
});
