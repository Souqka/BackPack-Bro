import { describe, expect, it } from "vitest";
import { createBagState } from "./bags/state.ts";
import { loadProductionCatalog } from "./load-catalog.ts";
import { findDisplacedItems, findKeptItems, itemIsDisplaced, repairItemLayout } from "./repair.ts";
import { createSearchState } from "./state.ts";
import { DEFAULT_BACKPACK } from "./types.ts";
import type { OptimizerState } from "./search-types.ts";
import type { PlacedBag } from "./bags/types.ts";
import type { PlacedItem } from "./types.ts";

const catalog = loadProductionCatalog();

function makeState(placedBags: PlacedBag[], placedItems: PlacedItem[]): OptimizerState {
  const bags = createBagState(DEFAULT_BACKPACK, placedBags, catalog);
  const items = createSearchState(DEFAULT_BACKPACK, placedItems, catalog);
  if (!bags.ok) throw new Error(bags.issues.join("; "));
  if (!items.ok) throw new Error(items.issues.map((issue) => issue.message).join("; "));
  return { backpack: DEFAULT_BACKPACK, bags: bags.state, items: items.state };
}

describe("displaced items", () => {
  it("Item полностью внутри новой Bag area остаётся", () => {
    const state = makeState(
      [{ instanceId: "bag-a", itemId: "medium_bag", position: { row: 0, col: 0 }, rotation: 0 }],
      [{ instanceId: "ore", itemId: "adamantite_ore", position: { row: 0, col: 0 }, rotation: 0 }],
    );
    expect(itemIsDisplaced(state.items.items[0]!, state)).toBe(false);
    expect(findKeptItems(state)).toHaveLength(1);
    expect(findDisplacedItems(state)).toHaveLength(0);
  });

  it("Item частично вне availableCells → displaced", () => {
    const origin = makeState(
      [
        { instanceId: "bag-a", itemId: "medium_bag", position: { row: 0, col: 1 }, rotation: 0 },
        { instanceId: "bag-b", itemId: "fanny_pack", position: { row: 3, col: 0 }, rotation: 0 },
      ],
      [{ instanceId: "bar", itemId: "adamantite_bar", position: { row: 0, col: 0 }, rotation: 0 }],
    );
    expect(findDisplacedItems(origin)).toHaveLength(0);

    const movedBags = createBagState(
      DEFAULT_BACKPACK,
      [
        { instanceId: "bag-a", itemId: "medium_bag", position: { row: 0, col: 0 }, rotation: 0 },
        { instanceId: "bag-b", itemId: "fanny_pack", position: { row: 3, col: 0 }, rotation: 0 },
      ],
      catalog,
    );
    if (!movedBags.ok) throw new Error(movedBags.issues.join("; "));
    const moved: OptimizerState = { ...origin, bags: movedBags.state };
    expect(findDisplacedItems(moved).map((item) => item.instanceId)).toEqual(["bar"]);
  });

  it("Star вне Bag area при cells внутри → НЕ displaced", () => {
    const state = makeState(
      [{ instanceId: "bag-a", itemId: "medium_bag", position: { row: 0, col: 1 }, rotation: 0 }],
      [{ instanceId: "bar", itemId: "adamantite_bar", position: { row: 0, col: 0 }, rotation: 0 }],
    );
    const bar = state.items.items[0]!;
    const geometry = state.items.itemGeometries.get("bar")!;
    expect(geometry.cells.every((cell) => state.bags.availableCells.has(`${cell.row}:${cell.col}`))).toBe(true);
    expect(geometry.stars.some((star) => !state.bags.availableCells.has(`${star.row}:${star.col}`))).toBe(true);
    expect(itemIsDisplaced(bar, state)).toBe(false);
  });

  it("несколько displaced Items", () => {
    const origin = makeState(
      [
        { instanceId: "bag-a", itemId: "medium_bag", position: { row: 0, col: 0 }, rotation: 0 },
        { instanceId: "bag-b", itemId: "medium_bag", position: { row: 0, col: 4 }, rotation: 0 },
      ],
      [
        { instanceId: "ore-1", itemId: "adamantite_ore", position: { row: 0, col: 0 }, rotation: 0 },
        { instanceId: "ore-2", itemId: "adamantite_ore", position: { row: 1, col: 0 }, rotation: 0 },
        { instanceId: "ore-3", itemId: "adamantite_ore", position: { row: 0, col: 4 }, rotation: 0 },
      ],
    );
    const movedBags = createBagState(
      DEFAULT_BACKPACK,
      [
        { instanceId: "bag-a", itemId: "medium_bag", position: { row: 3, col: 0 }, rotation: 0 },
        { instanceId: "bag-b", itemId: "medium_bag", position: { row: 0, col: 4 }, rotation: 0 },
      ],
      catalog,
    );
    if (!movedBags.ok) throw new Error(movedBags.issues.join("; "));
    const moved: OptimizerState = { ...origin, bags: movedBags.state };
    expect(findDisplacedItems(moved).map((item) => item.instanceId).sort()).toEqual(["ore-1", "ore-2"]);
    expect(findKeptItems(moved).map((item) => item.instanceId)).toEqual(["ore-3"]);
  });
});

describe("item repair", () => {
  it("displaced Item успешно возвращается", () => {
    const origin = makeState(
      [{ instanceId: "bag-a", itemId: "medium_bag", position: { row: 0, col: 0 }, rotation: 0 }],
      [{ instanceId: "ore", itemId: "adamantite_ore", position: { row: 0, col: 0 }, rotation: 0 }],
    );
    const movedBags = createBagState(
      DEFAULT_BACKPACK,
      [{ instanceId: "bag-a", itemId: "medium_bag", position: { row: 2, col: 3 }, rotation: 0 }],
      catalog,
    );
    if (!movedBags.ok) throw new Error(movedBags.issues.join("; "));
    const repaired = repairItemLayout({ ...origin, bags: movedBags.state }, [], catalog, { beamWidth: 4 });
    expect(repaired.displaced).toHaveLength(1);
    expect(repaired.repaired).toHaveLength(1);
    expect(repaired.unrepaired).toHaveLength(0);
    expect(repaired.state.items.items).toHaveLength(1);
    const geo = repaired.state.items.itemGeometries.get("ore")!;
    expect(geo.cells.every((cell) => repaired.state.bags.availableCells.has(`${cell.row}:${cell.col}`))).toBe(true);
  });

  it("несколько displaced Items repair-ятся без collision", () => {
    const origin = makeState(
      [
        { instanceId: "bag-a", itemId: "medium_bag", position: { row: 0, col: 0 }, rotation: 0 },
        { instanceId: "bag-b", itemId: "medium_bag", position: { row: 0, col: 4 }, rotation: 0 },
      ],
      [
        { instanceId: "ore-1", itemId: "adamantite_ore", position: { row: 0, col: 0 }, rotation: 0 },
        { instanceId: "ore-2", itemId: "adamantite_ore", position: { row: 1, col: 1 }, rotation: 0 },
        { instanceId: "keep", itemId: "adamantite_ore", position: { row: 0, col: 4 }, rotation: 0 },
      ],
    );
    const movedBags = createBagState(
      DEFAULT_BACKPACK,
      [
        { instanceId: "bag-a", itemId: "medium_bag", position: { row: 3, col: 0 }, rotation: 0 },
        { instanceId: "bag-b", itemId: "medium_bag", position: { row: 0, col: 4 }, rotation: 0 },
      ],
      catalog,
    );
    if (!movedBags.ok) throw new Error(movedBags.issues.join("; "));
    const repaired = repairItemLayout({ ...origin, bags: movedBags.state }, [], catalog, { beamWidth: 4 });
    expect(repaired.kept.map((item) => item.instanceId)).toEqual(["keep"]);
    expect(repaired.displaced).toHaveLength(2);
    expect(repaired.repaired).toHaveLength(2);
    expect(repaired.state.items.items).toHaveLength(3);
    const occupied = [...repaired.state.items.occupiedCells.keys()];
    expect(new Set(occupied).size).toBe(occupied.length);
    for (const placed of repaired.state.items.items) {
      const geo = repaired.state.items.itemGeometries.get(placed.instanceId)!;
      expect(geo.cells.every((cell) => repaired.state.bags.availableCells.has(`${cell.row}:${cell.col}`))).toBe(true);
    }
  });

  it("Item невозможно вернуть → unplaced", () => {
    const origin = makeState(
      [
        { instanceId: "bag-a", itemId: "fanny_pack", position: { row: 0, col: 0 }, rotation: 0 },
        { instanceId: "bag-b", itemId: "fanny_pack", position: { row: 1, col: 0 }, rotation: 0 },
      ],
      [{ instanceId: "cat", itemId: "black_cat", position: { row: 0, col: 0 }, rotation: 0 }],
    );
    expect(findDisplacedItems(origin)).toHaveLength(0);

    const movedBags = createBagState(
      DEFAULT_BACKPACK,
      [
        { instanceId: "bag-a", itemId: "fanny_pack", position: { row: 0, col: 6 }, rotation: 0 },
        { instanceId: "bag-b", itemId: "fanny_pack", position: { row: 1, col: 0 }, rotation: 0 },
      ],
      catalog,
    );
    if (!movedBags.ok) throw new Error(movedBags.issues.join("; "));
    const repaired = repairItemLayout({ ...origin, bags: movedBags.state }, [], catalog, { beamWidth: 4 });
    expect(repaired.displaced.map((item) => item.instanceId)).toEqual(["cat"]);
    expect(repaired.repaired).toHaveLength(0);
    expect(repaired.unrepaired.map((item) => item.instanceId)).toEqual(["cat"]);
    expect(repaired.state.items.items).toHaveLength(0);
  });

  it("unaffected Items сохраняются", () => {
    const origin = makeState(
      [
        { instanceId: "bag-a", itemId: "medium_bag", position: { row: 0, col: 0 }, rotation: 0 },
        { instanceId: "bag-b", itemId: "medium_bag", position: { row: 0, col: 4 }, rotation: 0 },
      ],
      [
        { instanceId: "moved", itemId: "adamantite_ore", position: { row: 0, col: 0 }, rotation: 0 },
        { instanceId: "stay", itemId: "adamantite_ore", position: { row: 0, col: 4 }, rotation: 0 },
      ],
    );
    const movedBags = createBagState(
      DEFAULT_BACKPACK,
      [
        { instanceId: "bag-a", itemId: "medium_bag", position: { row: 4, col: 0 }, rotation: 0 },
        { instanceId: "bag-b", itemId: "medium_bag", position: { row: 0, col: 4 }, rotation: 0 },
      ],
      catalog,
    );
    if (!movedBags.ok) throw new Error(movedBags.issues.join("; "));
    const repaired = repairItemLayout({ ...origin, bags: movedBags.state }, [], catalog, { beamWidth: 4 });
    const stay = repaired.state.items.items.find((item) => item.instanceId === "stay");
    expect(stay).toEqual(origin.items.items.find((item) => item.instanceId === "stay"));
  });
});
