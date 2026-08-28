import { describe, expect, it } from "vitest";
import { catalogFromItems } from "../inventory/inventory.ts";
import { occupantRule, testItem, universalStarRule } from "../inventory/test-item.ts";
import type { InventoryState, Item } from "../inventory/types.ts";
import { analyzePlacementScore, scoreInventory } from "./analyzer.ts";
import { INVALID_PLACEMENT_SCORE } from "./weights.ts";

function tile(id: string, stars: Array<[number, number]> = [[0, 1]]): Item {
  return testItem({
    id,
    geometry: { cells: [[0, 0]], stars },
    star: { rules: [universalStarRule()] },
  });
}

describe("invalid inventory", () => {
  it("collision → valid false и invalid score", () => {
    const ore = testItem({ id: "ore" });
    const state: InventoryState = {
      inventory: { rows: 4, cols: 4 },
      items: [
        { instanceId: "a", itemId: "ore", position: { row: 1, col: 1 }, rotation: 0 },
        { instanceId: "b", itemId: "ore", position: { row: 1, col: 1 }, rotation: 0 },
      ],
    };
    const result = scoreInventory(state, catalogFromItems([ore]));
    expect(result.valid).toBe(false);
    expect(result.score).toBe(INVALID_PLACEMENT_SCORE);
    expect(result.score).toBe(Number.NEGATIVE_INFINITY);
    expect(result.synergies).toEqual([]);
  });

  it("outOfBounds → valid false и invalid score", () => {
    const ore = testItem({ id: "ore" });
    const state: InventoryState = {
      inventory: { rows: 2, cols: 2 },
      items: [{ instanceId: "a", itemId: "ore", position: { row: 8, col: 8 }, rotation: 0 }],
    };
    const result = analyzePlacementScore(state, catalogFromItems([ore]));
    expect(result.valid).toBe(false);
    expect(result.score).toBe(INVALID_PLACEMENT_SCORE);
  });

  it("invalid score меньше любого valid score", () => {
    const source = tile("source");
    const target = testItem({ id: "target" });
    const valid: InventoryState = {
      inventory: { rows: 4, cols: 4 },
      items: [
        { instanceId: "s", itemId: "source", position: { row: 0, col: 0 }, rotation: 0 },
        { instanceId: "t", itemId: "target", position: { row: 0, col: 1 }, rotation: 0 },
      ],
    };
    const invalid: InventoryState = {
      inventory: { rows: 4, cols: 4 },
      items: [
        { instanceId: "a", itemId: "target", position: { row: 0, col: 0 }, rotation: 0 },
        { instanceId: "b", itemId: "target", position: { row: 0, col: 0 }, rotation: 0 },
      ],
    };
    const catalog = catalogFromItems([source, target]);
    const good = scoreInventory(valid, catalog);
    const bad = scoreInventory(invalid, catalog);
    expect(good.valid).toBe(true);
    expect(good.score).toBeGreaterThan(bad.score);
  });
});

describe("active stars", () => {
  it("1 активная Star → 1 synergy и structural score +1", () => {
    const source = tile("source");
    const target = testItem({ id: "target" });
    const state: InventoryState = {
      inventory: { rows: 4, cols: 4 },
      items: [
        { instanceId: "s", itemId: "source", position: { row: 0, col: 0 }, rotation: 0 },
        { instanceId: "t", itemId: "target", position: { row: 0, col: 1 }, rotation: 0 },
      ],
    };
    const result = analyzePlacementScore(state, catalogFromItems([source, target]));
    expect(result.valid).toBe(true);
    expect(result.score).toBe(1);
    expect(result.breakdown.activatedStars).toBe(1);
    expect(result.synergies.filter((s) => s.type === "star_activation")).toHaveLength(1);
    expect(result.synergies.find((s) => s.type === "star_activation")?.status).toBe("active");
  });

  it("2 активные Stars → 2 synergies и score +2", () => {
    const source = testItem({
      id: "source",
      geometry: { cells: [[0, 0]], stars: [[0, 1], [1, 0]] },
      star: { rules: [universalStarRule()] },
    });
    const a = testItem({ id: "a" });
    const b = testItem({ id: "b" });
    const state: InventoryState = {
      inventory: { rows: 4, cols: 4 },
      items: [
        { instanceId: "s", itemId: "source", position: { row: 0, col: 0 }, rotation: 0 },
        { instanceId: "a", itemId: "a", position: { row: 0, col: 1 }, rotation: 0 },
        { instanceId: "b", itemId: "b", position: { row: 1, col: 0 }, rotation: 0 },
      ],
    };
    const result = analyzePlacementScore(state, catalogFromItems([source, a, b]));
    expect(result.score).toBe(2);
    expect(result.breakdown.activatedStars).toBe(2);
    expect(result.synergies.filter((s) => s.type === "star_activation" && s.status === "active")).toHaveLength(
      2,
    );
  });

  it("вес activatedStar можно переопределить", () => {
    const source = tile("source");
    const target = testItem({ id: "target" });
    const state: InventoryState = {
      inventory: { rows: 4, cols: 4 },
      items: [
        { instanceId: "s", itemId: "source", position: { row: 0, col: 0 }, rotation: 0 },
        { instanceId: "t", itemId: "target", position: { row: 0, col: 1 }, rotation: 0 },
      ],
    };
    const result = analyzePlacementScore(state, catalogFromItems([source, target]), {
      activatedStar: 5,
    });
    expect(result.score).toBe(5);
  });
});

describe("inactive and unknown", () => {
  it("Star overlap + неверный тип → 0 активных synergy, score 0", () => {
    const source = testItem({
      id: "source",
      geometry: { cells: [[0, 0]], stars: [[0, 1]] },
      star: { rules: [occupantRule(["melee_weapon"])] },
    });
    const food = testItem({ id: "food", types: ["food"] });
    const state: InventoryState = {
      inventory: { rows: 4, cols: 4 },
      items: [
        { instanceId: "s", itemId: "source", position: { row: 0, col: 0 }, rotation: 0 },
        { instanceId: "f", itemId: "food", position: { row: 0, col: 1 }, rotation: 0 },
      ],
    };
    const result = analyzePlacementScore(state, catalogFromItems([source, food]));
    expect(result.valid).toBe(true);
    expect(result.score).toBe(0);
    expect(result.breakdown.activatedStars).toBe(0);
    const activations = result.synergies.filter((s) => s.type === "star_activation");
    expect(activations).toHaveLength(1);
    expect(activations[0]?.status).toBe("inactive");
  });

  it("no_star_data → нет выдуманной synergy", () => {
    const source = testItem({
      id: "source",
      geometry: { cells: [[0, 0]], stars: [[0, 1]] },
      star: null,
    });
    const target = testItem({ id: "target" });
    const state: InventoryState = {
      inventory: { rows: 4, cols: 4 },
      items: [
        { instanceId: "s", itemId: "source", position: { row: 0, col: 0 }, rotation: 0 },
        { instanceId: "t", itemId: "target", position: { row: 0, col: 1 }, rotation: 0 },
      ],
    };
    const result = analyzePlacementScore(state, catalogFromItems([source, target]));
    expect(result.score).toBe(0);
    expect(result.synergies).toEqual([]);
    expect(result.graph.edges).toEqual([]);
  });

  it("raw condition виден в analysis и не даёт score", () => {
    const source = testItem({
      id: "source",
      geometry: { cells: [[0, 0]], stars: [[0, 1]] },
      star: {
        rules: [
          {
            trigger: { type: "raw", raw: "only during Blood Moon" },
            conditions: [],
            effects: [{ effect: { type: "gain", status: "armor", value: 1 } }],
          },
        ],
      },
    });
    const target = testItem({ id: "target" });
    const state: InventoryState = {
      inventory: { rows: 4, cols: 4 },
      items: [
        { instanceId: "s", itemId: "source", position: { row: 0, col: 0 }, rotation: 0 },
        { instanceId: "t", itemId: "target", position: { row: 0, col: 1 }, rotation: 0 },
      ],
    };
    const result = analyzePlacementScore(state, catalogFromItems([source, target]));
    expect(result.score).toBe(0);
    expect(result.breakdown.unknownInteractions).toBe(1);
    expect(result.synergies.some((s) => s.status === "unknown")).toBe(true);
  });

  it("unsupported_condition виден как unsupported без выдуманных очков", () => {
    const source = testItem({
      id: "source",
      geometry: { cells: [[0, 0]], stars: [[0, 1]] },
      star: {
        rules: [
          {
            trigger: { type: "on_star_occupant", event: "hit" },
            conditions: [],
            effects: [],
          },
        ],
      },
    });
    const target = testItem({ id: "target", types: ["tool"] });
    const state: InventoryState = {
      inventory: { rows: 4, cols: 4 },
      items: [
        { instanceId: "s", itemId: "source", position: { row: 0, col: 0 }, rotation: 0 },
        { instanceId: "t", itemId: "target", position: { row: 0, col: 1 }, rotation: 0 },
      ],
    };
    const result = analyzePlacementScore(state, catalogFromItems([source, target]));
    expect(result.score).toBe(0);
    expect(result.breakdown.unsupportedInteractions).toBe(1);
    expect(result.synergies.some((s) => s.status === "unsupported")).toBe(true);
  });
});

describe("multiple effects", () => {
  it("1 активная Star и 3 эффекта → 1 structural activation и 3 coverage", () => {
    const source = testItem({
      id: "source",
      geometry: { cells: [[0, 0]], stars: [[0, 1]] },
      star: {
        rules: [
          {
            trigger: { type: "on_star_activation" },
            conditions: [],
            effects: [
              { effect: { type: "gain", status: "armor", value: 1 } },
              { effect: { type: "gain", status: "mana", value: 1 } },
              { effect: { type: "inflict", status: "poison", value: 1 } },
            ],
          },
        ],
      },
    });
    const target = testItem({ id: "target" });
    const state: InventoryState = {
      inventory: { rows: 4, cols: 4 },
      items: [
        { instanceId: "s", itemId: "source", position: { row: 0, col: 0 }, rotation: 0 },
        { instanceId: "t", itemId: "target", position: { row: 0, col: 1 }, rotation: 0 },
      ],
    };
    const result = analyzePlacementScore(state, catalogFromItems([source, target]));
    expect(result.score).toBe(1);
    expect(result.synergies.filter((s) => s.type === "star_activation")).toHaveLength(1);
    expect(result.synergies.filter((s) => s.type === "star_effect")).toHaveLength(3);
    expect(result.effectCoverage.totalActiveEffects).toBe(3);
    expect(result.effectCoverage.normalizedEffects).toBe(3);
  });

  it("пустые клетки есть в breakdown и не меняют score", () => {
    const source = tile("source");
    const target = testItem({ id: "target" });
    const state: InventoryState = {
      inventory: { rows: 4, cols: 5 },
      items: [
        { instanceId: "s", itemId: "source", position: { row: 0, col: 0 }, rotation: 0 },
        { instanceId: "t", itemId: "target", position: { row: 0, col: 1 }, rotation: 0 },
      ],
    };
    const result = analyzePlacementScore(state, catalogFromItems([source, target]));
    expect(result.breakdown.occupiedCells).toBe(2);
    expect(result.breakdown.emptyCells).toBe(18);
    expect(result.breakdown.itemsPlaced).toBe(2);
    expect(result.score).toBe(1);
  });
});
