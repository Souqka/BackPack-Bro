import { describe, expect, it } from "vitest";
import { catalogFromItems } from "../../inventory/inventory.ts";
import type { InventoryState, Item } from "../../inventory/types.ts";
import { analyzePlacementScore } from "../../scoring/analyzer.ts";
import { getBoundInventoryAnalysis } from "../../scoring/analysis-bind.ts";
import { extractOptimizerExplanation } from "./explanation.ts";
import { optimizeInventory } from "./service.ts";
import { loadProductionCatalog } from "../load-catalog.ts";
import { readFileSync } from "node:fs";
import path from "node:path";

function loadCatalog(): Map<string, Item> {
  const raw = readFileSync(path.join(process.cwd(), "data/normalized/items.json"), "utf8");
  const parsed = JSON.parse(raw) as { items: Item[] };
  return catalogFromItems(parsed.items);
}

describe("extractOptimizerExplanation", () => {
  it("maps bound active star activations with instance ids and star cells", () => {
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
    const explanation = extractOptimizerExplanation(score, { bags: [], items: state.items }, catalog, 8, 10);
    expect(explanation.activatedStars.length).toBe(score.breakdown.activatedStars);
    expect(explanation.activatedStars.length).toBeGreaterThan(0);
    for (const link of explanation.activatedStars) {
      expect(link.sourceInstanceId).toBe("bar");
      expect(link.sourceItemId).toBe("adamantite_bar");
      expect(link.targetInstanceId).toBe("ore");
      expect(link.targetItemId).toBe("adamantite_ore");
      expect(Number.isInteger(link.row)).toBe(true);
      expect(Number.isInteger(link.col)).toBe(true);
    }
    expect(JSON.parse(JSON.stringify(explanation))).toEqual(explanation);
  });

  it("returns an empty explanation when analysis is not bound (no second scoring)", () => {
    const catalog = loadCatalog();
    const explanation = extractOptimizerExplanation(
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
    expect(explanation).toEqual({ activatedStars: [] });
    expect(extractOptimizerExplanation.toString()).not.toContain("analyzePlacementScore");
    expect(extractOptimizerExplanation.toString()).not.toContain("optimizeInventory");
  });
});

describe("optimizeInventory explanation DTO", () => {
  it("serializes activated stars for Case G without mixing duplicate instances", () => {
    const catalog = loadProductionCatalog();
    const result = optimizeInventory(
      {
        bagItemIds: ["warrior_backpack", "medium_bag"],
        itemIds: ["adamantite_bar", "adamantite_bar", "starbloom", "starbloom"],
        options: { quality: "balanced", resultCount: 1 },
      },
      catalog,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const explanation = result.explanation ?? result.results[0]?.explanation;
    expect(explanation).toBeDefined();
    expect(explanation?.activatedStars).toHaveLength(result.score.activatedStars);
    const instanceIds = new Set(result.layout.items.map((item) => item.instanceId));
    for (const link of explanation!.activatedStars) {
      expect(instanceIds.has(link.sourceInstanceId)).toBe(true);
      expect(instanceIds.has(link.targetInstanceId)).toBe(true);
      expect(link.sourceInstanceId).not.toBe(link.targetInstanceId);
    }
    const sourceInstances = new Set(explanation!.activatedStars.map((link) => link.sourceInstanceId));
    expect(sourceInstances.size).toBeGreaterThan(1);
  });

  it("attaches a per-result explanation for Top-N and keeps the best copy on success", () => {
    const catalog = loadProductionCatalog();
    const result = optimizeInventory(
      {
        bagItemIds: ["medium_bag", "fanny_pack"],
        itemIds: ["adamantite_bar", "adamantite_ore", "starbloom"],
        options: { quality: "fast", resultCount: 3 },
      },
      catalog,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.results.length).toBeGreaterThan(1);
    expect(result.explanation).toEqual(result.results[0]?.explanation);
    for (const entry of result.results) {
      expect(entry.explanation).toBeDefined();
      expect(Array.isArray(entry.explanation?.activatedStars)).toBe(true);
      expect(entry.explanation?.activatedStars.length).toBe(entry.score.activatedStars);
    }
  });

  it("serializes an empty activation list when no stars fire", () => {
    const catalog = loadProductionCatalog();
    const result = optimizeInventory(
      {
        bagItemIds: ["medium_bag"],
        itemIds: ["adamantite_ore"],
        options: { quality: "fast", resultCount: 1 },
      },
      catalog,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.explanation?.activatedStars ?? []).toHaveLength(result.score.activatedStars);
  });
});
