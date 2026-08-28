import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeInventory, catalogFromItems } from "../inventory/inventory.ts";
import type { Item } from "../inventory/types.ts";
import { addBagCandidate } from "./bags/state.ts";
import { generateBagCandidates } from "./bags/candidates.ts";
import { emptyBagState } from "./bags/state.ts";
import { getUniqueRotations } from "./rotations.ts";
import { getOptimizerStateSignature, runOptimizer } from "./optimizer.ts";
import { orderItemsForSearch } from "./ordering.ts";
import { createSearchState } from "./state.ts";
import { DEFAULT_BACKPACK } from "./types.ts";

function loadCatalog(): Map<string, Item> {
  const raw = readFileSync(path.join(process.cwd(), "data/normalized/items.json"), "utf8");
  return catalogFromItems((JSON.parse(raw) as { items: Item[] }).items);
}

describe("Bag layer", () => {
  it("генерирует валидные placements medium_bag внутри 6×9", () => {
    const catalog = loadCatalog();
    const candidates = generateBagCandidates(
      { instanceId: "bag-1", itemId: "medium_bag" },
      emptyBagState(),
      DEFAULT_BACKPACK,
      catalog,
    );
    expect(candidates.length).toBe(40);
    expect(candidates.every((c) => c.cells.every((cell) => cell.row < 6 && cell.col < 9))).toBe(true);
    expect(new Set(candidates.map((c) => c.placement.rotation)).size).toBe(1);
  });

  it("Bag + Bag на одной клетке — collision", () => {
    const catalog = loadCatalog();
    const first = generateBagCandidates(
      { instanceId: "a", itemId: "medium_bag" },
      emptyBagState(),
      DEFAULT_BACKPACK,
      catalog,
    );
    const origin = first.find(
      (c) =>
        c.placement.position.row === 0 &&
        c.placement.position.col === 0 &&
        c.placement.rotation === 0,
    );
    expect(origin).toBeDefined();
    const withFirst = addBagCandidate(emptyBagState(), origin!, DEFAULT_BACKPACK);
    const second = generateBagCandidates(
      { instanceId: "b", itemId: "medium_bag" },
      withFirst,
      DEFAULT_BACKPACK,
      catalog,
    );
    expect(
      second.some(
        (c) =>
          c.placement.position.row === 0 &&
          c.placement.position.col === 0 &&
          c.placement.rotation === 0,
      ),
    ).toBe(false);
    expect(second.length).toBeLessThan(first.length);
  });
});

describe("runOptimizer", () => {
  it("1 Bag + 3 Items размещает все на availableCells", () => {
    const catalog = loadCatalog();
    const result = runOptimizer({
      backpack: DEFAULT_BACKPACK,
      bags: [{ instanceId: "bag", itemId: "warrior_backpack" }],
      items: [
        { instanceId: "ore", itemId: "adamantite_ore" },
        { instanceId: "bar", itemId: "adamantite_bar" },
        { instanceId: "bloom", itemId: "starbloom" },
      ],
      catalog,
      options: { bagBeamWidth: 8, itemBeamWidth: 12 },
    });
    expect(result.placedBags).toHaveLength(1);
    expect(result.unplacedItems).toEqual([]);
    expect(result.placedItems).toHaveLength(3);
    expect(result.complete).toBe(true);
    const analysis = analyzeInventory(
      { inventory: DEFAULT_BACKPACK, items: result.placedItems },
      catalog,
    );
    expect(analysis.valid).toBe(true);
    for (const placed of result.placedItems) {
      const geo = result.bestState.items.itemGeometries.get(placed.instanceId);
      expect(geo).toBeDefined();
      expect(geo!.cells.every((cell) => result.bestState.bags.availableCells.has(`${cell.row}:${cell.col}`))).toBe(
        true,
      );
    }
  });

  it("Star: Bar + Ore дают synergy в Scoring Engine", () => {
    const catalog = loadCatalog();
    const result = runOptimizer({
      backpack: DEFAULT_BACKPACK,
      bags: [{ instanceId: "bag", itemId: "warrior_backpack" }],
      items: [
        { instanceId: "bar", itemId: "adamantite_bar" },
        { instanceId: "ore", itemId: "adamantite_ore" },
      ],
      catalog,
      options: { bagBeamWidth: 8, itemBeamWidth: 20 },
    });
    expect(result.complete).toBe(true);
    expect(result.score.valid).toBe(true);
    expect(result.score.score).toBeGreaterThanOrEqual(1);
    expect(result.score.breakdown.activatedStars).toBeGreaterThanOrEqual(1);
    expect(result.score.synergies.some((s) => s.type === "star_activation" && s.status === "active")).toBe(
      true,
    );
  });

  it("2 Bags + 5 Items", () => {
    const catalog = loadCatalog();
    const result = runOptimizer({
      backpack: DEFAULT_BACKPACK,
      bags: [
        { instanceId: "bag-a", itemId: "medium_bag" },
        { instanceId: "bag-b", itemId: "fanny_pack" },
      ],
      items: [
        { instanceId: "o1", itemId: "adamantite_ore" },
        { instanceId: "o2", itemId: "adamantite_ore" },
        { instanceId: "o3", itemId: "adamantite_ore" },
        { instanceId: "o4", itemId: "adamantite_ore" },
        { instanceId: "o5", itemId: "adamantite_ore" },
      ],
      catalog,
      options: { bagBeamWidth: 10, itemBeamWidth: 10 },
    });
    expect(result.placedBags).toHaveLength(2);
    expect(result.placedItems).toHaveLength(5);
    expect(result.unplacedItems).toEqual([]);
    expect(result.complete).toBe(true);
    const analysis = analyzeInventory(
      { inventory: DEFAULT_BACKPACK, items: result.placedItems },
      catalog,
    );
    expect(analysis.valid).toBe(true);
    expect(analysis.collisions).toEqual([]);
  });

  it("невозможный Item не бросает exception", () => {
    const catalog = loadCatalog();
    const result = runOptimizer({
      backpack: DEFAULT_BACKPACK,
      bags: [{ instanceId: "bag", itemId: "bolstering_bag" }],
      items: [{ instanceId: "bar", itemId: "adamantite_bar" }],
      catalog,
      options: { bagBeamWidth: 5, itemBeamWidth: 5 },
    });
    expect(result.placedBags).toHaveLength(1);
    expect(result.unplacedItems.map((i) => i.itemId)).toContain("adamantite_bar");
    expect(result.complete).toBe(false);
  });

  it("невалидный final state не возвращается (нет Item collision)", () => {
    const catalog = loadCatalog();
    const result = runOptimizer({
      backpack: DEFAULT_BACKPACK,
      bags: [{ instanceId: "bag", itemId: "medium_bag" }],
      items: [
        { instanceId: "a", itemId: "adamantite_ore" },
        { instanceId: "b", itemId: "adamantite_ore" },
      ],
      catalog,
      options: { bagBeamWidth: 5, itemBeamWidth: 5 },
    });
    const analysis = analyzeInventory(
      { inventory: DEFAULT_BACKPACK, items: result.placedItems },
      catalog,
    );
    expect(analysis.valid).toBe(true);
    expect(analysis.collisions).toEqual([]);
  });

  it("детерминирован: два прогона совпадают", () => {
    const catalog = loadCatalog();
    const input = {
      backpack: DEFAULT_BACKPACK,
      bags: [{ instanceId: "bag", itemId: "warrior_backpack" }],
      items: [
        { instanceId: "bar", itemId: "adamantite_bar" },
        { instanceId: "ore", itemId: "adamantite_ore" },
      ],
      catalog,
      options: { bagBeamWidth: 8, itemBeamWidth: 12 },
    };
    const a = runOptimizer(input);
    const b = runOptimizer(input);
    expect(getOptimizerStateSignature(a.bestState)).toBe(getOptimizerStateSignature(b.bestState));
    expect(a.score.score).toBe(b.score.score);
    expect(a.placedItems).toEqual(b.placedItems);
    expect(a.placedBags).toEqual(b.placedBags);
  });

  it("beamWidth 1 и 10 дают валидный результат", () => {
    const catalog = loadCatalog();
    const base = {
      backpack: DEFAULT_BACKPACK,
      bags: [{ instanceId: "bag", itemId: "medium_bag" }],
      items: [
        { instanceId: "a", itemId: "adamantite_ore" },
        { instanceId: "b", itemId: "adamantite_ore" },
      ],
      catalog,
    };
    const narrow = runOptimizer({ ...base, options: { bagBeamWidth: 1, itemBeamWidth: 1 } });
    const wide = runOptimizer({ ...base, options: { bagBeamWidth: 10, itemBeamWidth: 10 } });
    expect(narrow.placedItems.length).toBeGreaterThan(0);
    expect(wide.placedItems.length).toBeGreaterThan(0);
    expect(
      analyzeInventory({ inventory: DEFAULT_BACKPACK, items: narrow.placedItems }, catalog).valid,
    ).toBe(true);
    expect(
      analyzeInventory({ inventory: DEFAULT_BACKPACK, items: wide.placedItems }, catalog).valid,
    ).toBe(true);
  });

  it("нехватка площади → unplacedItems без crash", () => {
    const catalog = loadCatalog();
    const result = runOptimizer({
      backpack: DEFAULT_BACKPACK,
      bags: [{ instanceId: "bag", itemId: "bolstering_bag" }],
      items: [
        { instanceId: "a", itemId: "adamantite_ore" },
        { instanceId: "b", itemId: "adamantite_ore" },
      ],
      catalog,
      options: { bagBeamWidth: 4, itemBeamWidth: 4 },
    });
    expect(result.placedItems.length + result.unplacedItems.length).toBe(2);
    expect(result.unplacedItems.length).toBeGreaterThan(0);
    expect(result.complete).toBe(false);
  });

  it("без Bags не притворяется пустой сеткой", () => {
    const catalog = loadCatalog();
    const result = runOptimizer({
      backpack: DEFAULT_BACKPACK,
      bags: [],
      items: [{ instanceId: "ore", itemId: "adamantite_ore" }],
      catalog,
    });
    expect(result.placedBags).toEqual([]);
    expect(result.placedItems).toEqual([]);
    expect(result.complete).toBe(false);
  });

  it("unknown itemId — понятная ошибка", () => {
    const catalog = loadCatalog();
    expect(() =>
      runOptimizer({
        backpack: DEFAULT_BACKPACK,
        bags: [{ instanceId: "bag", itemId: "medium_bag" }],
        items: [{ instanceId: "x", itemId: "not_a_real_item" }],
        catalog,
      }),
    ).toThrow(/Неизвестный itemId/);
  });
});

describe("ordering and unique rotations", () => {
  it("квадратный Bag имеет 1 unique rotation", () => {
    const catalog = loadCatalog();
    const bag = catalog.get("medium_bag");
    expect(bag).toBeDefined();
    expect(getUniqueRotations(bag!)).toEqual([0]);
  });

  it("orderItemsForSearch ставит более тесный Item раньше", () => {
    const catalog = loadCatalog();
    const itemsState = createSearchState(DEFAULT_BACKPACK);
    expect(itemsState.ok).toBe(true);
    if (!itemsState.ok) return;
    const bags = generateBagCandidates(
      { instanceId: "bag", itemId: "warrior_backpack" },
      emptyBagState(),
      DEFAULT_BACKPACK,
      catalog,
    );
    const origin = bags.find((c) => c.placement.position.row === 0 && c.placement.position.col === 0);
    expect(origin).toBeDefined();
    const bagState = addBagCandidate(emptyBagState(), origin!, DEFAULT_BACKPACK);
    const ordered = orderItemsForSearch(
      [
        { instanceId: "ore", itemId: "adamantite_ore" },
        { instanceId: "bar", itemId: "adamantite_bar" },
      ],
      {
        catalog,
        state: { backpack: DEFAULT_BACKPACK, bags: bagState, items: itemsState.state },
      },
    );
    expect(ordered[0]?.itemId).toBe("adamantite_bar");
  });
});
