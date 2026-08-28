import { describe, expect, it } from "vitest";
import { getOptimizerStateSignature, runOptimizer } from "./optimizer.ts";
import { loadProductionCatalog } from "./load-catalog.ts";
import { DEFAULT_BACKPACK } from "./types.ts";

const catalog = loadProductionCatalog();

function sameRun(options: Parameters<typeof runOptimizer>[0]["options"]) {
  const input = {
    backpack: DEFAULT_BACKPACK,
    bags: [{ instanceId: "bag", itemId: "warrior_backpack" }],
    items: [
      { instanceId: "bar", itemId: "adamantite_bar" },
      { instanceId: "ore", itemId: "adamantite_ore" },
      { instanceId: "bloom", itemId: "starbloom" },
    ],
    catalog,
    options,
  };
  return { a: runOptimizer(input), b: runOptimizer(input) };
}

describe("determinism", () => {
  it("beam: одинаковый input → одинаковый layout и score", () => {
    const { a, b } = sameRun({ algorithm: "beam", bagBeamWidth: 8, itemBeamWidth: 12 });
    expect(getOptimizerStateSignature(a.bestState)).toBe(getOptimizerStateSignature(b.bestState));
    expect(a.score.score).toBe(b.score.score);
    expect(a.placedItems).toEqual(b.placedItems);
    expect(a.placedBags).toEqual(b.placedBags);
  });

  it("greedy детерминирован", () => {
    const { a, b } = sameRun({ algorithm: "greedy" });
    expect(getOptimizerStateSignature(a.bestState)).toBe(getOptimizerStateSignature(b.bestState));
    expect(a.score.score).toBe(b.score.score);
  });

  it("dfs детерминирован", () => {
    const { a, b } = sameRun({
      algorithm: "dfs",
      dfs: { maxNodes: 2_000, maxDepth: 6, timeoutMs: 2_000 },
    });
    expect(getOptimizerStateSignature(a.bestState)).toBe(getOptimizerStateSignature(b.bestState));
    expect(a.score.score).toBe(b.score.score);
  });

  it("в исходниках optimizer нет Math.random", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const root = join(process.cwd(), "src/lib/optimizer");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (full.endsWith(".ts") && !full.endsWith(".test.ts")) files.push(full);
      }
    };
    walk(root);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source.includes("Math.random("), file).toBe(false);
    }
  });

  it("dynamicOrdering детерминирован", () => {
    const { a, b } = sameRun({
      algorithm: "beam",
      bagBeamWidth: 6,
      itemBeamWidth: 8,
      dynamicOrdering: true,
    });
    expect(getOptimizerStateSignature(a.bestState)).toBe(getOptimizerStateSignature(b.bestState));
    expect(a.layout).toEqual(b.layout);
  });
});
