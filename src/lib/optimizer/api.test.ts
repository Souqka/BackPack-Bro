import { describe, expect, it } from "vitest";
import { runAdaptiveOptimizer } from "./adaptive-search.ts";
import { resolveAdaptiveSearchOptions } from "./adaptive-options.ts";
import {
  MAX_PRODUCTION_COLS,
  MAX_PRODUCTION_RESULTS,
  MAX_PRODUCTION_ROWS,
  PRODUCTION_QUALITY_PRESETS,
  optimizeInventory,
  resolveProductionOptions,
  toRunOptimizerInput,
  validateOptimizeInventoryInput,
} from "./api/index.ts";
import type { OptimizeInventoryInput, OptimizeInventorySuccess } from "./api/types.ts";
import { getBenchmarkCase } from "./benchmarks/cases.ts";
import { loadProductionCatalog } from "./load-catalog.ts";
import { getOptimizerStateSignature } from "./optimizer.ts";

const catalog = loadProductionCatalog();

const simpleInput: OptimizeInventoryInput = {
  bagItemIds: ["medium_bag"],
  itemIds: ["adamantite_ore", "adamantite_ore"],
};

function expectSuccess(result: ReturnType<typeof optimizeInventory>): OptimizeInventorySuccess {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(`expected success, got ${result.error.code}: ${result.error.message}`);
  }
  return result;
}

function jsonRoundTrip(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

function containsForbidden(value: unknown, seen = new Set<unknown>()): string | undefined {
  if (typeof value === "function") return "function";
  if (value === null || typeof value !== "object") return undefined;
  if (seen.has(value)) return undefined;
  seen.add(value);
  if (value instanceof Map) return "Map";
  if (value instanceof Set) return "Set";
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = containsForbidden(entry, seen);
      if (found) return found;
    }
    return undefined;
  }
  for (const entry of Object.values(value)) {
    const found = containsForbidden(entry, seen);
    if (found) return found;
  }
  return undefined;
}

describe("production options / quality presets", () => {
  it("balanced is the default and maps onto current Adaptive production settings", () => {
    const resolved = resolveProductionOptions();
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.value.quality).toBe("balanced");
    expect(resolved.value.publicResultCount).toBe(1);
    const adaptive = resolveAdaptiveSearchOptions(resolved.value.adaptive);
    const preset = PRODUCTION_QUALITY_PRESETS.balanced;
    expect(adaptive.bagBeamWidths).toEqual(preset.bagBeamWidths);
    expect(adaptive.itemBeamWidths).toEqual(preset.itemBeamWidths);
    expect(adaptive.maxBagSeeds).toBe(4);
    expect(adaptive.enableItemLocalSearch).toBe(true);
    expect(adaptive.enableBagLocalSearch).toBe(true);
    expect(adaptive.stableLevelsBeforeStop).toBe(2);
    expect(adaptive.maxDurationMs).toBe(10_000);
    expect(adaptive.resultCount).toBe(10);
    expect(adaptive.stopWhenComplete).toBe(false);
  });

  it("fast uses a smaller ladder, fewer seeds, and no local search", () => {
    const resolved = resolveProductionOptions({ quality: "fast" });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const adaptive = resolveAdaptiveSearchOptions(resolved.value.adaptive);
    expect(adaptive.bagBeamWidths).toEqual([1, 2, 5]);
    expect(adaptive.maxBagSeeds).toBe(2);
    expect(adaptive.enableItemLocalSearch).toBe(false);
    expect(adaptive.enableBagLocalSearch).toBe(false);
    expect(adaptive.maxDurationMs).toBe(2_000);
    expect(adaptive.resultCount).toBe(5);
  });

  it("high keeps the Stage 15 ladder, uses more seeds, and does not stop on stability", () => {
    const resolved = resolveProductionOptions({ quality: "high" });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const adaptive = resolveAdaptiveSearchOptions(resolved.value.adaptive);
    expect(adaptive.bagBeamWidths).toEqual([1, 2, 5, 10, 20]);
    expect(adaptive.maxBagSeeds).toBe(6);
    expect(adaptive.enableItemLocalSearch).toBe(true);
    expect(adaptive.enableBagLocalSearch).toBe(true);
    expect(adaptive.stableLevelsBeforeStop).toBe(false);
    expect(adaptive.maxDurationMs).toBe(30_000);
  });

  it("explicit local-search flags override the preset", () => {
    const resolved = resolveProductionOptions({
      quality: "fast",
      enableItemLocalSearch: true,
      enableBagLocalSearch: true,
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.value.adaptive.enableItemLocalSearch).toBe(true);
    expect(resolved.value.adaptive.enableBagLocalSearch).toBe(true);
  });

  it("public resultCount is sliced; Adaptive keeps a larger internal Top-N on balanced", () => {
    const resolved = resolveProductionOptions({ resultCount: 3 });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.value.publicResultCount).toBe(3);
    expect(resolved.value.adaptive.resultCount).toBe(10);
  });
});

describe("optimizeInventory success", () => {
  it("places one bag and items on the default 6×9 grid", () => {
    const result = expectSuccess(optimizeInventory(simpleInput, catalog));
    expect(result.layout.rows).toBe(6);
    expect(result.layout.cols).toBe(9);
    expect(result.layout.bags).toHaveLength(1);
    expect(result.layout.bags[0]?.itemId).toBe("medium_bag");
    expect(result.layout.bags[0]?.instanceId).toBe("bag-0");
    expect(result.layout.items).toHaveLength(2);
    expect(result.complete).toBe(true);
    expect(result.score.valid).toBe(true);
    expect(result.score.structuralScore).not.toBeNull();
    expect(result.results).toHaveLength(1);
  });

  it("places several bags", () => {
    const result = expectSuccess(
      optimizeInventory(
        {
          bagItemIds: ["medium_bag", "fanny_pack"],
          itemIds: ["adamantite_bar", "adamantite_ore", "starbloom"],
        },
        catalog,
      ),
    );
    expect(result.layout.bags).toHaveLength(2);
    expect(result.layout.bags.map((bag) => bag.instanceId).sort()).toEqual(["bag-0", "bag-1"]);
    expect(result.layout.items.length + result.layout.unplacedItems.length).toBe(3);
  });

  it("keeps duplicate itemIds as distinct instances", () => {
    const result = expectSuccess(optimizeInventory(simpleInput, catalog));
    const instanceIds = [
      ...result.layout.items.map((item) => item.instanceId),
      ...result.layout.unplacedItems.map((item) => item.instanceId),
    ].sort();
    expect(instanceIds).toEqual(["item-0", "item-1"]);
    expect(result.layout.items.every((item) => item.itemId === "adamantite_ore")).toBe(true);
  });

  it("defaults resultCount to 1", () => {
    const result = expectSuccess(optimizeInventory(simpleInput, catalog));
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.signature).toBe(result.signature);
  });

  it("returns Top-N layouts when resultCount > 1", () => {
    const result = expectSuccess(
      optimizeInventory(
        {
          bagItemIds: ["medium_bag", "fanny_pack"],
          itemIds: ["adamantite_bar", "adamantite_ore", "starbloom"],
          options: { resultCount: 3, quality: "fast" },
        },
        catalog,
      ),
    );
    expect(result.results.length).toBeGreaterThanOrEqual(1);
    expect(result.results.length).toBeLessThanOrEqual(3);
    expect(result.results[0]?.signature).toBe(result.signature);
    const signatures = result.results.map((entry) => entry.signature);
    expect(new Set(signatures).size).toBe(signatures.length);
  });

  it("returns unplaced items with instance identity", () => {
    const tight = getBenchmarkCase("E-tight-space");
    const result = expectSuccess(
      optimizeInventory(
        {
          bagItemIds: tight.bags.map((bag) => bag.itemId),
          itemIds: tight.items.map((item) => item.itemId),
          options: { quality: "fast" },
        },
        catalog,
      ),
    );
    expect(result.complete).toBe(false);
    expect(result.layout.unplacedItems.length).toBeGreaterThan(0);
    for (const unplaced of result.layout.unplacedItems) {
      expect(unplaced.instanceId).toMatch(/^item-\d+$/);
      expect(unplaced.itemId.length).toBeGreaterThan(0);
    }
    const allItemIds = [
      ...result.layout.items.map((item) => item.itemId),
      ...result.layout.unplacedItems.map((item) => item.itemId),
    ].sort();
    expect(allItemIds).toEqual([...tight.items.map((item) => item.itemId)].sort());
  });

  it("is deterministic for layout identity (duration excluded)", () => {
    const first = expectSuccess(optimizeInventory(simpleInput, catalog));
    const second = expectSuccess(optimizeInventory(simpleInput, catalog));
    expect(first.signature).toBe(second.signature);
    expect(first.layout).toEqual(second.layout);
    expect(first.score).toEqual(second.score);
    expect(first.complete).toBe(second.complete);
    expect(first.results.map((entry) => entry.signature)).toEqual(second.results.map((entry) => entry.signature));
  });

  it("loads the production catalog when none is passed", () => {
    const result = expectSuccess(optimizeInventory(simpleInput));
    expect(result.layout.bags[0]?.itemId).toBe("medium_bag");
    expect(result.ok).toBe(true);
  });
});

describe("optimizeInventory validation", () => {
  it("rejects an unknown item id", () => {
    const result = optimizeInventory({ bagItemIds: ["medium_bag"], itemIds: ["not_a_real_item"] }, catalog);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({
      code: "UNKNOWN_ITEM",
      message: "Unknown catalog item: not_a_real_item",
      itemId: "not_a_real_item",
    });
  });

  it("rejects a bag in itemIds", () => {
    const result = optimizeInventory(
      { bagItemIds: ["medium_bag"], itemIds: ["warrior_backpack"] },
      catalog,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_ITEM");
    if (result.error.code !== "INVALID_ITEM") return;
    expect(result.error.itemId).toBe("warrior_backpack");
  });

  it("rejects a non-bag in bagItemIds", () => {
    const result = optimizeInventory(
      { bagItemIds: ["adamantite_ore"], itemIds: ["adamantite_bar"] },
      catalog,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_BAG");
    if (result.error.code !== "INVALID_BAG") return;
    expect(result.error.itemId).toBe("adamantite_ore");
  });

  it("rejects an empty bag list as a domain error", () => {
    const result = optimizeInventory({ bagItemIds: [], itemIds: ["adamantite_ore"] }, catalog);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("NO_BAG_LAYOUT");
  });

  it("rejects invalid resultCount", () => {
    const zero = optimizeInventory({ ...simpleInput, options: { resultCount: 0 } }, catalog);
    expect(zero.ok).toBe(false);
    if (!zero.ok) expect(zero.error.code).toBe("INVALID_INPUT");

    const tooMany = optimizeInventory(
      { ...simpleInput, options: { resultCount: MAX_PRODUCTION_RESULTS + 1 } },
      catalog,
    );
    expect(tooMany.ok).toBe(false);
    if (!tooMany.ok) expect(tooMany.error.code).toBe("INVALID_INPUT");
  });

  it("rejects invalid dimensions", () => {
    const zeroRows = optimizeInventory({ ...simpleInput, rows: 0 }, catalog);
    expect(zeroRows.ok).toBe(false);
    if (!zeroRows.ok) expect(zeroRows.error.code).toBe("INVALID_INPUT");

    const huge = optimizeInventory({ ...simpleInput, rows: MAX_PRODUCTION_ROWS + 1, cols: MAX_PRODUCTION_COLS + 1 }, catalog);
    expect(huge.ok).toBe(false);
    if (!huge.ok) expect(huge.error.code).toBe("INVALID_INPUT");
  });

  it("does not throw on invalid input", () => {
    expect(() => optimizeInventory({ bagItemIds: [], itemIds: [] }, catalog)).not.toThrow();
    expect(() => optimizeInventory({ bagItemIds: ["nope"], itemIds: ["nope"] }, catalog)).not.toThrow();
  });
});

describe("optimizeInventory search behavior", () => {
  it("passes the production budget into Adaptive Search", () => {
    const result = expectSuccess(
      optimizeInventory(
        {
          bagItemIds: ["warrior_backpack", "medium_bag"],
          itemIds: ["adamantite_bar", "adamantite_bar", "starbloom", "starbloom"],
          options: { quality: "high", maxDurationMs: 1 },
        },
        catalog,
      ),
    );
    expect(result.execution.stopReason).toBe("budget_exhausted");
    expect(result.execution.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.layout.bags.length + result.layout.unplacedBags.length).toBe(2);
  });

  it("serializes a controlled Adaptive stop reason on a normal run", () => {
    const result = expectSuccess(optimizeInventory({ ...simpleInput, options: { quality: "fast" } }, catalog));
    expect([
      "budget_exhausted",
      "stable_result",
      "complete_layout",
      "max_escalation_reached",
      "no_more_unique_bag_seeds",
    ]).toContain(result.execution.stopReason);
    expect(typeof result.execution.durationMs).toBe("number");
  });
});

describe("optimizeInventory serialization", () => {
  it("JSON.stringify round-trips and contains no Map/Set/functions", () => {
    const result = expectSuccess(
      optimizeInventory(
        {
          bagItemIds: ["medium_bag"],
          itemIds: ["adamantite_ore", "adamantite_ore"],
          options: { resultCount: 2, quality: "fast" },
        },
        catalog,
      ),
    );
    expect(containsForbidden(result)).toBeUndefined();
    const parsed = jsonRoundTrip(result) as OptimizeInventorySuccess;
    expect(parsed.ok).toBe(true);
    expect(parsed.layout.bags[0]?.itemId).toBe("medium_bag");
    expect(parsed.score.structuralScore).toEqual(result.score.structuralScore);
    expect(parsed.execution.stopReason).toBe(result.execution.stopReason);
    expect(JSON.stringify(result).includes("[object Map]")).toBe(false);
  });
});

describe("optimizeInventory regression vs Adaptive Search", () => {
  it("matches a direct runAdaptiveOptimizer call for the same preset", () => {
    const input: OptimizeInventoryInput = {
      bagItemIds: ["medium_bag", "fanny_pack"],
      itemIds: ["adamantite_bar", "adamantite_ore", "starbloom"],
      options: { quality: "fast", resultCount: 3 },
    };
    const api = expectSuccess(optimizeInventory(input, catalog));
    const validated = validateOptimizeInventoryInput(input, catalog);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    const direct = runAdaptiveOptimizer(
      toRunOptimizerInput(validated.value, catalog),
      validated.value.options.adaptive,
    );
    expect(api.signature).toBe(getOptimizerStateSignature(direct.bestState));
    expect(api.complete).toBe(direct.complete);
    expect(api.score.valid).toBe(direct.score.valid);
    expect(api.score.structuralScore).toBe(Number.isFinite(direct.score.score) ? direct.score.score : null);
    expect(api.score.activatedStars).toBe(direct.score.breakdown.activatedStars);
    expect(api.layout.bags).toHaveLength(direct.placedBags.length);
    expect(api.layout.items).toHaveLength(direct.placedItems.length);
    expect(api.results[0]?.signature).toBe(getOptimizerStateSignature(direct.bestState));
    const expectedSignatures = [
      getOptimizerStateSignature(direct.bestState),
      ...direct.alternatives.map((entry) => entry.signature),
    ].slice(0, 3);
    expect(api.results.map((entry) => entry.signature)).toEqual(expectedSignatures);
    expect(api.execution.stopReason).toBe(direct.adaptive.stopReason);
  });
});
