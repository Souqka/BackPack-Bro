import { describe, expect, it } from "vitest";
import { analyzeInventory } from "../inventory/inventory.ts";
import { analyzePlacementScore } from "../scoring/analyzer.ts";
import { evaluatePartialState } from "./heuristic.ts";
import { loadProductionCatalog } from "./load-catalog.ts";
import { runOptimizer } from "./optimizer.ts";
import { DEFAULT_BACKPACK } from "./types.ts";

const catalog = loadProductionCatalog();

describe("algorithms: beam, greedy, dfs", () => {
  const simple = {
    backpack: DEFAULT_BACKPACK,
    bags: [{ instanceId: "bag", itemId: "medium_bag" }],
    items: [
      { instanceId: "ore-1", itemId: "adamantite_ore" },
      { instanceId: "ore-2", itemId: "adamantite_ore" },
    ],
    catalog,
  };

  it("beam размещает оба Item", () => {
    const result = runOptimizer({ ...simple, options: { algorithm: "beam", itemBeamWidth: 10 } });
    expect(result.metrics?.algorithm).toBe("beam");
    expect(result.complete).toBe(true);
    expect(result.placedItems).toHaveLength(2);
  });

  it("greedy размещает Items детерминированно без Math.random", () => {
    const result = runOptimizer({ ...simple, options: { algorithm: "greedy" } });
    expect(result.metrics?.algorithm).toBe("greedy");
    expect(result.placedItems.length).toBeGreaterThan(0);
    expect(result.searchExhaustive).toBe(true);
  });

  it("dfs на маленьком кейсе даёт complete layout и searchExhaustive", () => {
    const result = runOptimizer({
      ...simple,
      options: { algorithm: "dfs", dfs: { maxNodes: 5_000, maxDepth: 6, timeoutMs: 3_000 } },
    });
    expect(result.metrics?.algorithm).toBe("dfs");
    expect(result.complete).toBe(true);
    expect(result.searchExhaustive).toBe(true);
    expect(result.heuristicSamples?.length).toBeGreaterThan(0);
  });

  it("dfs с maxNodes=1 не выдаёт себя за глобальный оптимум", () => {
    const result = runOptimizer({
      ...simple,
      options: { algorithm: "dfs", dfs: { maxNodes: 1, maxDepth: 1, timeoutMs: 50 } },
    });
    expect(result.searchExhaustive).toBe(false);
  });
});

describe("quality: beam width", () => {
  const input = {
    inventory: DEFAULT_BACKPACK,
    bags: [{ instanceId: "bag", itemId: "warrior_backpack" }],
    items: [
      { instanceId: "bar", itemId: "adamantite_bar" },
      { instanceId: "ore", itemId: "adamantite_ore" },
    ],
    catalog,
  };

  for (const width of [1, 10, 50, 100]) {
    it(`beam width ${width} даёт валидный layout`, () => {
      const result = runOptimizer({
        ...input,
        options: { algorithm: "beam", bagBeamWidth: Math.min(width, 20), itemBeamWidth: width },
      });
      expect(result.placedBags).toHaveLength(1);
      expect(
        analyzeInventory({ inventory: DEFAULT_BACKPACK, items: result.placedItems }, catalog).valid,
      ).toBe(true);
      expect(result.score.valid).toBe(true);
      expect(result.metrics?.statesGenerated).toBeGreaterThanOrEqual(0);
    });
  }
});

describe("scoring: heuristic не является Final Score", () => {
  it("final score совпадает с analyzePlacementScore, не с partial heuristic", () => {
    const result = runOptimizer({
      backpack: DEFAULT_BACKPACK,
      bags: [{ instanceId: "bag", itemId: "warrior_backpack" }],
      items: [
        { instanceId: "bar", itemId: "adamantite_bar" },
        { instanceId: "ore", itemId: "adamantite_ore" },
      ],
      catalog,
      options: { bagBeamWidth: 8, itemBeamWidth: 12 },
    });
    const scored = analyzePlacementScore(
      { inventory: DEFAULT_BACKPACK, items: result.placedItems },
      catalog,
    );
    expect(result.score.score).toBe(scored.score);
    const heuristic = evaluatePartialState(result.bestState, result.unplacedItems, catalog);
    expect(heuristic.total).not.toBe(result.score.score);
    expect(result.score.breakdown.activatedStars).toBe(scored.breakdown.activatedStars);
  });
});
