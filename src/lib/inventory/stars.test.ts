import { describe, expect, it } from "vitest";
import { catalogFromItems } from "./inventory.ts";
import { findStarOverlaps } from "./stars.ts";
import { testItem } from "./test-item.ts";
import type { PlacedItem } from "./types.ts";

const starItem = testItem({
  id: "star_item",
  geometry: { cells: [[0, 0]], stars: [[0, 1], [1, 0]] },
});

const target = testItem({
  id: "target",
  types: ["melee_weapon"],
  geometry: { cells: [[0, 0], [0, 1]], stars: [] },
});

const catalog = catalogFromItems([starItem, target]);

describe("star overlap", () => {
  it("Star совпадает с Item cell другого экземпляра", () => {
    const items: PlacedItem[] = [
      { instanceId: "src", itemId: "star_item", position: { row: 0, col: 0 }, rotation: 0 },
      { instanceId: "tgt", itemId: "target", position: { row: 0, col: 1 }, rotation: 0 },
    ];
    const overlaps = findStarOverlaps(items, catalog);
    expect(overlaps).toEqual([
      {
        sourceInstanceId: "src",
        starPosition: { row: 0, col: 1 },
        targetInstanceId: "tgt",
        targetCell: { row: 0, col: 1 },
      },
    ]);
  });

  it("Star не совпадает ни с одной Item-клеткой", () => {
    const items: PlacedItem[] = [
      { instanceId: "src", itemId: "star_item", position: { row: 0, col: 0 }, rotation: 0 },
      { instanceId: "tgt", itemId: "target", position: { row: 5, col: 5 }, rotation: 0 },
    ];
    expect(findStarOverlaps(items, catalog)).toEqual([]);
  });

  it("несколько Star на разных Item", () => {
    const second = testItem({
      id: "second",
      geometry: { cells: [[0, 0]], stars: [] },
    });
    const items: PlacedItem[] = [
      { instanceId: "src", itemId: "star_item", position: { row: 0, col: 0 }, rotation: 0 },
      { instanceId: "t1", itemId: "target", position: { row: 0, col: 1 }, rotation: 0 },
      { instanceId: "t2", itemId: "second", position: { row: 1, col: 0 }, rotation: 0 },
    ];
    const overlaps = findStarOverlaps(items, catalogFromItems([starItem, target, second]));
    expect(overlaps).toHaveLength(2);
    expect(overlaps.map((o) => o.targetInstanceId).sort()).toEqual(["t1", "t2"]);
  });

  it("несколько Star на одном target Item", () => {
    const wide = testItem({
      id: "wide",
      geometry: {
        cells: [
          [0, 1],
          [1, 0],
        ],
        stars: [],
      },
    });
    const items: PlacedItem[] = [
      { instanceId: "src", itemId: "star_item", position: { row: 0, col: 0 }, rotation: 0 },
      { instanceId: "tgt", itemId: "wide", position: { row: 0, col: 0 }, rotation: 0 },
    ];
    const overlaps = findStarOverlaps(items, catalogFromItems([starItem, wide]));
    expect(overlaps).toHaveLength(2);
    expect(overlaps.every((o) => o.targetInstanceId === "tgt")).toBe(true);
  });

  it("Star собственного Item игнорируется", () => {
    const selfStar = testItem({
      id: "self",
      geometry: { cells: [[0, 0]], stars: [[0, 0]] },
    });
    const items: PlacedItem[] = [
      { instanceId: "only", itemId: "self", position: { row: 2, col: 2 }, rotation: 0 },
    ];
    expect(findStarOverlaps(items, catalogFromItems([selfStar]))).toEqual([]);
  });
});
