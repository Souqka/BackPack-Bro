import { describe, expect, it } from "vitest";
import { extractBagBonuses } from "./bag-bonuses.ts";
import { optimizeInventory } from "./service.ts";
import { loadProductionCatalog } from "../load-catalog.ts";
import type { OptimizerLayout } from "../search-types.ts";

const catalog = loadProductionCatalog();

function layout(overrides: Partial<OptimizerLayout>): OptimizerLayout {
  return {
    bags: [],
    items: [],
    ...overrides,
  };
}

describe("extractBagBonuses", () => {
  it("sums normalized initial abilities of placed bags only", () => {
    const bonuses = extractBagBonuses(
      layout({
        bags: [
          {
            instanceId: "bag-0",
            itemId: "warrior_backpack",
            position: { row: 0, col: 0 },
            rotation: 0,
          },
        ],
        items: [
          {
            instanceId: "bar",
            itemId: "adamantite_bar",
            position: { row: 0, col: 0 },
            rotation: 0,
          },
        ],
      }),
      catalog,
    );
    expect(bonuses.some((stat) => stat.id === "armor")).toBe(true);
    expect(bonuses.find((stat) => stat.id === "armor")?.value).toBe(2);
    expect(bonuses.some((stat) => stat.id === "mana")).toBe(false);
  });

  it("does not include items or unplaced bags", () => {
    const placedItemsOnly = extractBagBonuses(
      layout({
        items: [
          {
            instanceId: "bar",
            itemId: "adamantite_bar",
            position: { row: 0, col: 0 },
            rotation: 0,
          },
        ],
      }),
      catalog,
    );
    expect(placedItemsOnly).toEqual([]);

    const unplacedWarrior = extractBagBonuses(
      layout({
        bags: [
          {
            instanceId: "bag-0",
            itemId: "medium_bag",
            position: { row: 0, col: 0 },
            rotation: 0,
          },
        ],
      }),
      catalog,
    );
    expect(unplacedWarrior.some((stat) => stat.id === "armor")).toBe(false);
  });

  it("aggregates two placed warrior backpacks and skips raw bag abilities", () => {
    const bonuses = extractBagBonuses(
      layout({
        bags: [
          {
            instanceId: "bag-0",
            itemId: "warrior_backpack",
            position: { row: 0, col: 0 },
            rotation: 0,
          },
          {
            instanceId: "bag-1",
            itemId: "warrior_backpack",
            position: { row: 0, col: 2 },
            rotation: 0,
          },
          {
            instanceId: "bag-2",
            itemId: "fanny_pack",
            position: { row: 3, col: 0 },
            rotation: 0,
          },
        ],
      }),
      catalog,
    );
    expect(bonuses.find((stat) => stat.id === "armor")?.value).toBe(4);
    expect(bonuses.some((stat) => stat.id === "haste")).toBe(false);
  });

  it("does not run scoring or a second optimizer", () => {
    const source = extractBagBonuses.toString();
    expect(source).not.toContain("analyzePlacementScore");
    expect(source).not.toContain("optimizeInventory");
    expect(source).not.toContain("runAdaptiveOptimizer");
  });
});

describe("optimizeInventory bagBonuses DTO", () => {
  it("serializes bag bonuses on the layout result without mixing them into activeStats", () => {
    const result = optimizeInventory(
      {
        bagItemIds: ["warrior_backpack", "medium_bag"],
        itemIds: ["adamantite_ore", "adamantite_ore"],
        options: { quality: "fast", resultCount: 1 },
      },
      catalog,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const selected = result.results[0]!;
    expect(selected.bagBonuses).toBeDefined();
    expect(Array.isArray(selected.bagBonuses)).toBe(true);
    const bagArmor = selected.bagBonuses?.find((stat) => stat.id === "armor");
    expect(bagArmor?.value).toBe(2);
    expect(selected.score.activeStats).not.toEqual(selected.bagBonuses);
  });
});
