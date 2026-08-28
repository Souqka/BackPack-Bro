import { describe, expect, it } from "vitest";
import { catalogFromItems } from "../inventory/inventory.ts";
import { testItem, universalStarRule } from "../inventory/test-item.ts";
import type { InventoryState } from "../inventory/types.ts";
import { analyzePlacementScore } from "./analyzer.ts";

describe("synergy graph", () => {
  it("строит nodes и edges source → target только по Star interaction", () => {
    const source = testItem({
      id: "source",
      geometry: { cells: [[0, 0]], stars: [[0, 1]] },
      star: { rules: [universalStarRule()] },
    });
    const target = testItem({ id: "target" });
    const other = testItem({ id: "other" });
    const state: InventoryState = {
      inventory: { rows: 4, cols: 4 },
      items: [
        { instanceId: "item-1", itemId: "source", position: { row: 0, col: 0 }, rotation: 0 },
        { instanceId: "item-2", itemId: "target", position: { row: 0, col: 1 }, rotation: 0 },
        { instanceId: "item-3", itemId: "other", position: { row: 3, col: 3 }, rotation: 0 },
      ],
    };
    const result = analyzePlacementScore(state, catalogFromItems([source, target, other]));
    expect(result.graph.nodes.map((n) => n.id).sort()).toEqual(["item-1", "item-2", "item-3"]);
    expect(result.graph.edges).toHaveLength(1);
    expect(result.graph.edges[0]).toMatchObject({
      source: "item-1",
      target: "item-2",
      type: "star_activation",
      active: true,
    });
  });

  it("соседние предметы без Star overlap не получают edge", () => {
    const a = testItem({ id: "a", geometry: { cells: [[0, 0]], stars: [] } });
    const b = testItem({ id: "b", geometry: { cells: [[0, 0]], stars: [] } });
    const state: InventoryState = {
      inventory: { rows: 4, cols: 4 },
      items: [
        { instanceId: "a", itemId: "a", position: { row: 0, col: 0 }, rotation: 0 },
        { instanceId: "b", itemId: "b", position: { row: 0, col: 1 }, rotation: 0 },
      ],
    };
    const result = analyzePlacementScore(state, catalogFromItems([a, b]));
    expect(result.graph.edges).toEqual([]);
    expect(result.score).toBe(0);
  });
});
