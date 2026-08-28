import { describe, expect, it } from "vitest";
import { findCollisions, hasCollision } from "./collision.ts";
import { catalogFromItems } from "./inventory.ts";
import { testItem } from "./test-item.ts";
import type { PlacedItem } from "./types.ts";

const ore = testItem({
  id: "ore",
  geometry: { cells: [[0, 0]], stars: [[0, 1]] },
});

const catalog = catalogFromItems([ore]);

describe("collision", () => {
  it("две Item-клетки на одной позиции → collision", () => {
    const items: PlacedItem[] = [
      { instanceId: "a", itemId: "ore", position: { row: 1, col: 1 }, rotation: 0 },
      { instanceId: "b", itemId: "ore", position: { row: 1, col: 1 }, rotation: 0 },
    ];
    expect(hasCollision(items, catalog)).toBe(true);
    const collisions = findCollisions(items, catalog);
    expect(collisions).toEqual([
      { cell: { row: 1, col: 1 }, instanceIds: ["a", "b"] },
    ]);
  });

  it("несколько одинаковых instance без перекрытия → нет collision", () => {
    const items: PlacedItem[] = [
      { instanceId: "a", itemId: "ore", position: { row: 0, col: 0 }, rotation: 0 },
      { instanceId: "b", itemId: "ore", position: { row: 0, col: 2 }, rotation: 0 },
      { instanceId: "c", itemId: "ore", position: { row: 1, col: 0 }, rotation: 0 },
    ];
    expect(hasCollision(items, catalog)).toBe(false);
  });

  it("Item + Star на одной клетке → нет collision", () => {
    const items: PlacedItem[] = [
      { instanceId: "a", itemId: "ore", position: { row: 0, col: 0 }, rotation: 0 },
      { instanceId: "b", itemId: "ore", position: { row: 0, col: 1 }, rotation: 0 },
    ];
    // a.star at (0,1) совпадает с b.cell — это overlap, не collision
    expect(hasCollision(items, catalog)).toBe(false);
  });
});
