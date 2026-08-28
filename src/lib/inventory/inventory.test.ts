import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeInventory, catalogFromItems } from "./inventory.ts";
import { findCollisions, hasCollision } from "./collision.ts";
import { findStarOverlaps } from "./stars.ts";
import { testItem, occupantRule, universalStarRule } from "./test-item.ts";
import type { Item, InventoryState, PlacedItem } from "./types.ts";

describe("analyzeInventory", () => {
  it("valid при размещении без коллизий и внутри границ; неактивная Star не ломает valid", () => {
    const source = testItem({
      id: "source",
      geometry: { cells: [[0, 0]], stars: [[0, 1]] },
      star: { rules: [occupantRule(["melee_weapon"])] },
    });
    const food = testItem({
      id: "food",
      types: ["food"],
      geometry: { cells: [[0, 0]], stars: [] },
    });
    const state: InventoryState = {
      inventory: { rows: 8, cols: 10 },
      items: [
        { instanceId: "s", itemId: "source", position: { row: 0, col: 0 }, rotation: 0 },
        { instanceId: "f", itemId: "food", position: { row: 0, col: 1 }, rotation: 0 },
      ],
    };
    const analysis = analyzeInventory(state, catalogFromItems([source, food]));
    expect(analysis.valid).toBe(true);
    expect(analysis.collisions).toEqual([]);
    expect(analysis.starOverlaps).toHaveLength(1);
    expect(analysis.starActivations[0]?.active).toBe(false);
    expect(analysis.starActivations[0]?.reason).toBe("condition_not_met");
  });

  it("valid === false при collision", () => {
    const ore = testItem({ id: "ore" });
    const state: InventoryState = {
      inventory: { rows: 4, cols: 4 },
      items: [
        { instanceId: "a", itemId: "ore", position: { row: 1, col: 1 }, rotation: 0 },
        { instanceId: "b", itemId: "ore", position: { row: 1, col: 1 }, rotation: 0 },
      ],
    };
    const analysis = analyzeInventory(state, catalogFromItems([ore]));
    expect(analysis.valid).toBe(false);
    expect(analysis.collisions.length).toBeGreaterThan(0);
  });

  it("valid === false при выходе Item за границы", () => {
    const ore = testItem({ id: "ore" });
    const state: InventoryState = {
      inventory: { rows: 2, cols: 2 },
      items: [{ instanceId: "a", itemId: "ore", position: { row: 5, col: 5 }, rotation: 0 }],
    };
    const analysis = analyzeInventory(state, catalogFromItems([ore]));
    expect(analysis.valid).toBe(false);
    expect(analysis.outOfBounds[0]?.code).toBe("out_of_bounds");
  });
});

describe("performance", () => {
  it("анализ N предметов без квадратичного перебора пар клеток", () => {
    const tile = testItem({
      id: "tile",
      geometry: { cells: [[0, 0]], stars: [[0, 1]] },
    });
    const catalog = catalogFromItems([tile]);
    const items: PlacedItem[] = [];
    for (let row = 0; row < 20; row++) {
      for (let col = 0; col < 10; col++) {
        items.push({
          instanceId: `i-${row}-${col}`,
          itemId: "tile",
          position: { row, col },
          rotation: 0,
        });
      }
    }
    expect(items.length).toBe(200);
    const started = performance.now();
    const analysis = analyzeInventory(
      { inventory: { rows: 40, cols: 40 }, items },
      catalog,
    );
    const elapsed = performance.now() - started;
    expect(analysis.valid).toBe(true);
    expect(analysis.collisions).toEqual([]);
    expect(analysis.starOverlaps.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(200);
    expect(hasCollision(items, catalog)).toBe(false);
    expect(findCollisions(items, catalog)).toEqual([]);
    expect(findStarOverlaps(items, catalog).length).toBe(analysis.starOverlaps.length);
  });
});

describe("catalog star coverage", () => {
  it("классифицирует реальные Star предметов из items.json", () => {
    const raw = readFileSync(path.join(process.cwd(), "data/normalized/items.json"), "utf8");
    const catalogJson = JSON.parse(raw) as { items: Item[] };
    const items = catalogJson.items;
    let withStarGeometry = 0;
    let noStarData = 0;
    let strictCondition = 0;
    let universal = 0;
    let rawCondition = 0;
    let unsupported = 0;

    for (const item of items) {
      if (!item.geometry.stars.length) continue;
      withStarGeometry += 1;
      if (!item.star || item.star.rules.length === 0) {
        noStarData += 1;
        continue;
      }
      const hasTypeCond = item.star.rules.some((rule) => {
        if (rule.conditions.some((c) => c.type === "star_occupant_type")) return true;
        if (rule.trigger?.type === "on_star_occupant" && (rule.trigger.itemTypes?.length ?? 0) > 0) {
          return true;
        }
        if (rule.effects.length === 0) return false;
        return rule.effects.every((wrapped) => {
          const effect = wrapped.effect;
          const occupantTypes =
            "occupantTypes" in effect && effect.occupantTypes && effect.occupantTypes.length > 0;
          const scaleTypes =
            "scale" in effect &&
            effect.scale?.itemTypes &&
            effect.scale.itemTypes.length > 0 &&
            (effect.scale.per === "star_occupant" || effect.scale.per === "star_item");
          return Boolean(occupantTypes || scaleTypes);
        });
      });
      const hasRaw = item.star.rules.some(
        (rule) => rule.trigger?.type === "raw" || rule.conditions.some((c) => c.type === "raw"),
      );
      const namedOccupant = item.star.rules.some(
        (rule) =>
          rule.trigger?.type === "on_star_occupant" &&
          !rule.trigger.itemTypes?.length &&
          rule.conditions.length === 0,
      );
      if (hasTypeCond) strictCondition += 1;
      else if (hasRaw) rawCondition += 1;
      else if (namedOccupant) unsupported += 1;
      else universal += 1;
    }

    expect(withStarGeometry).toBe(495);
    expect(noStarData).toBe(313);
    expect(strictCondition).toBe(100);
    expect(universal).toBe(58);
    expect(rawCondition).toBe(21);
    expect(unsupported).toBe(3);
    expect(strictCondition + universal + rawCondition + unsupported + noStarData).toBe(
      withStarGeometry,
    );
  });
});

describe("universalStarRule helper", () => {
  it("существует для тестов активации", () => {
    expect(universalStarRule().trigger?.type).toBe("on_star_activation");
  });
});
