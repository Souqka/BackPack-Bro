import { describe, expect, it } from "vitest";
import { catalogFromItems } from "../../inventory/inventory.ts";
import type { InventoryState, Item } from "../../inventory/types.ts";
import { analyzePlacementScore } from "../../scoring/analyzer.ts";
import { getBoundInventoryAnalysis } from "../../scoring/analysis-bind.ts";
import { extractActiveStats } from "./active-stats.ts";
import { optimizeInventory } from "./service.ts";
import { loadProductionCatalog } from "../load-catalog.ts";
import { readFileSync } from "node:fs";
import path from "node:path";

function loadCatalog(): Map<string, Item> {
  const raw = readFileSync(path.join(process.cwd(), "data/normalized/items.json"), "utf8");
  const parsed = JSON.parse(raw) as { items: Item[] };
  return catalogFromItems(parsed.items);
}

describe("extractActiveStats", () => {
  it("reads activated star-rule effects from the bound scoring result, not item abilities", () => {
    const catalog = loadCatalog();
    const state: InventoryState = {
      inventory: { rows: 8, cols: 10 },
      items: [
        { instanceId: "bar", itemId: "adamantite_bar", position: { row: 0, col: 0 }, rotation: 0 },
        { instanceId: "ore", itemId: "adamantite_ore", position: { row: 0, col: 0 }, rotation: 0 },
      ],
    };
    const score = analyzePlacementScore(state, catalog);
    expect(getBoundInventoryAnalysis(score)).toBeDefined();
    const stats = extractActiveStats(
      score,
      {
        bags: [],
        items: state.items,
      },
      catalog,
      8,
      10,
    );
    expect(stats.some((stat) => stat.id === "armor")).toBe(true);
    expect(stats.find((stat) => stat.id === "armor")?.value).toBe(24);
    expect(stats.some((stat) => stat.name === "Mana")).toBe(false);
  });

  it("returns an empty list when analysis is not bound (no second scoring pipeline)", () => {
    const catalog = loadCatalog();
    const stats = extractActiveStats(
      {
        valid: true,
        score: 1,
        breakdown: {
          total: 1,
          activatedStars: 1,
          unsupportedInteractions: 0,
          unknownInteractions: 0,
          itemsPlaced: 1,
          occupiedCells: 1,
          emptyCells: 1,
          components: [],
        },
        effectCoverage: { totalActiveEffects: 1, normalizedEffects: 1, rawEffects: 0, unsupportedEffects: 0 },
        synergies: [],
        graph: { nodes: [], edges: [] },
      },
      { bags: [], items: [] },
      catalog,
      6,
      9,
    );
    expect(stats).toEqual([]);
  });
});

describe("optimizeInventory activeStats DTO", () => {
  it("attaches activeStats from the selected layout without changing structural score", () => {
    const catalog = loadProductionCatalog();
    const result = optimizeInventory(
      {
        bagItemIds: ["medium_bag"],
        itemIds: ["adamantite_ore", "adamantite_ore"],
        options: { quality: "fast", resultCount: 1 },
      },
      catalog,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.score.activeStats).toBeDefined();
    expect(Array.isArray(result.score.activeStats)).toBe(true);
    expect(result.results[0]?.score.activeStats).toEqual(result.score.activeStats);
  });
});
