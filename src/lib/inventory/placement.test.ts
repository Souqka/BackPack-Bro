import { describe, expect, it } from "vitest";
import { catalogFromItems } from "./inventory.ts";
import { isInsideInventory, isPlacementInsideInventory, findOutOfBounds } from "./placement.ts";
import { testItem } from "./test-item.ts";
import type { Inventory, PlacedItem } from "./types.ts";

const inventory: Inventory = { rows: 8, cols: 10 };

const rod = testItem({
  id: "rod",
  geometry: {
    cells: [
      [0, 0],
      [0, 1],
    ],
    stars: [[0, 3]],
  },
});

describe("boundary", () => {
  it("клетка внутри / снаружи inventory", () => {
    expect(isInsideInventory({ row: 0, col: 0 }, inventory)).toBe(true);
    expect(isInsideInventory({ row: 7, col: 9 }, inventory)).toBe(true);
    expect(isInsideInventory({ row: 8, col: 0 }, inventory)).toBe(false);
    expect(isInsideInventory({ row: 0, col: -1 }, inventory)).toBe(false);
  });

  it("Item полностью внутри", () => {
    const placed: PlacedItem = {
      instanceId: "1",
      itemId: "rod",
      position: { row: 3, col: 3 },
      rotation: 0,
    };
    expect(isPlacementInsideInventory(rod, placed, inventory)).toBe(true);
  });

  it("Item частично за границей", () => {
    const placed: PlacedItem = {
      instanceId: "1",
      itemId: "rod",
      position: { row: 7, col: 9 },
      rotation: 0,
    };
    expect(isPlacementInsideInventory(rod, placed, inventory)).toBe(false);
    const issues = findOutOfBounds([placed], catalogFromItems([rod]), inventory);
    expect(issues[0]?.code).toBe("out_of_bounds");
  });

  it("Star за границей, Item внутри → placement валиден", () => {
    const placed: PlacedItem = {
      instanceId: "1",
      itemId: "rod",
      position: { row: 0, col: 7 },
      rotation: 0,
    };
    // cells at (0,7) (0,8); star at (0,10) — за cols=10
    expect(isPlacementInsideInventory(rod, placed, inventory)).toBe(true);
    expect(findOutOfBounds([placed], catalogFromItems([rod]), inventory)).toEqual([]);
  });
});
