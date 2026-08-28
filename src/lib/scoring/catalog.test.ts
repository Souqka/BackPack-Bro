import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { catalogFromItems } from "../inventory/inventory.ts";
import type { InventoryState, Item } from "../inventory/types.ts";
import { analyzePlacementScore } from "./analyzer.ts";
import { classifyEffect } from "./rules.ts";

function loadCatalog(): Map<string, Item> {
  const raw = readFileSync(path.join(process.cwd(), "data/normalized/items.json"), "utf8");
  const parsed = JSON.parse(raw) as { items: Item[] };
  return catalogFromItems(parsed.items);
}

describe("реальный каталог", () => {
  it("Adamantite Bar активирует Star на Adamantite Ore", () => {
    const catalog = loadCatalog();
    const state: InventoryState = {
      inventory: { rows: 8, cols: 10 },
      items: [
        { instanceId: "bar", itemId: "adamantite_bar", position: { row: 0, col: 0 }, rotation: 0 },
        { instanceId: "ore", itemId: "adamantite_ore", position: { row: 0, col: 0 }, rotation: 0 },
      ],
    };
    const result = analyzePlacementScore(state, catalog);
    expect(result.valid).toBe(true);
    expect(result.score).toBe(1);
    expect(result.breakdown.activatedStars).toBe(1);
    expect(result.graph.edges).toEqual([
      expect.objectContaining({
        source: "bar",
        target: "ore",
        type: "star_activation",
        active: true,
      }),
    ]);
    expect(result.effectCoverage.totalActiveEffects).toBe(1);
    expect(result.effectCoverage.normalizedEffects).toBe(1);
  });

  it("Starbloom активирует Star на Adamantite Ore", () => {
    const catalog = loadCatalog();
    const state: InventoryState = {
      inventory: { rows: 8, cols: 10 },
      items: [
        { instanceId: "bloom", itemId: "starbloom", position: { row: 0, col: 0 }, rotation: 0 },
        { instanceId: "ore", itemId: "adamantite_ore", position: { row: 1, col: 0 }, rotation: 0 },
      ],
    };
    const result = analyzePlacementScore(state, catalog);
    expect(result.valid).toBe(true);
    expect(result.score).toBe(1);
    expect(result.graph.edges[0]).toMatchObject({
      source: "bloom",
      target: "ore",
      active: true,
    });
  });

  it("Bar + Ore + Starbloom: две активные Star Bar лучше одной", () => {
    const catalog = loadCatalog();
    const oneStar: InventoryState = {
      inventory: { rows: 8, cols: 10 },
      items: [
        { instanceId: "bar", itemId: "adamantite_bar", position: { row: 0, col: 0 }, rotation: 0 },
        { instanceId: "ore", itemId: "adamantite_ore", position: { row: 0, col: 0 }, rotation: 0 },
      ],
    };
    const twoStars: InventoryState = {
      inventory: { rows: 8, cols: 10 },
      items: [
        { instanceId: "bar", itemId: "adamantite_bar", position: { row: 0, col: 0 }, rotation: 0 },
        { instanceId: "ore", itemId: "adamantite_ore", position: { row: 0, col: 0 }, rotation: 0 },
        { instanceId: "bloom", itemId: "starbloom", position: { row: 0, col: 2 }, rotation: 0 },
      ],
    };
    const a = analyzePlacementScore(oneStar, catalog);
    const b = analyzePlacementScore(twoStars, catalog);
    expect(a.score).toBe(1);
    expect(b.score).toBeGreaterThan(a.score);
    expect(b.breakdown.activatedStars).toBeGreaterThan(a.breakdown.activatedStars);
  });

  it("Amethyst Pendant + bag_of_flour → type mismatch, score 0", () => {
    const catalog = loadCatalog();
    const state: InventoryState = {
      inventory: { rows: 8, cols: 10 },
      items: [
        { instanceId: "pendant", itemId: "amethyst_pendant", position: { row: 0, col: 1 }, rotation: 0 },
        { instanceId: "flour", itemId: "bag_of_flour", position: { row: 0, col: 1 }, rotation: 0 },
      ],
    };
    const result = analyzePlacementScore(state, catalog);
    expect(result.valid).toBe(true);
    expect(result.score).toBe(0);
    expect(result.synergies.some((s) => s.status === "inactive")).toBe(true);
  });

  it("Amethyst Pendant + Wooden Sword → активный edge pendant → sword", () => {
    const catalog = loadCatalog();
    const state: InventoryState = {
      inventory: { rows: 8, cols: 10 },
      items: [
        { instanceId: "pendant", itemId: "amethyst_pendant", position: { row: 0, col: 1 }, rotation: 0 },
        { instanceId: "sword", itemId: "wooden_sword", position: { row: 0, col: 1 }, rotation: 0 },
      ],
    };
    const result = analyzePlacementScore(state, catalog);
    expect(result.valid).toBe(true);
    expect(result.score).toBe(1);
    expect(result.graph.edges).toEqual([
      expect.objectContaining({
        source: "pendant",
        target: "sword",
        type: "star_activation",
        active: true,
      }),
    ]);
  });

  it("классифицирует все типы Star-эффектов каталога без выдуманного score", () => {
    const catalog = loadCatalog();
    const counts: Record<string, number> = {
      normalized: 0,
      raw: 0,
      unsupported: 0,
    };
    const byType = new Map<string, { count: number; kind: ReturnType<typeof classifyEffect> }>();

    for (const item of catalog.values()) {
      if (!item.star) continue;
      for (const rule of item.star.rules) {
        for (const wrapped of rule.effects) {
          const kind = classifyEffect(wrapped.effect);
          counts[kind] = (counts[kind] ?? 0) + 1;
          const t = wrapped.effect.type;
          const entry = byType.get(t) ?? { count: 0, kind };
          entry.count += 1;
          byType.set(t, entry);
        }
      }
    }

    expect(counts.normalized).toBeGreaterThan(0);
    expect(counts.raw).toBeGreaterThan(0);
    expect(byType.get("gain")?.kind).toBe("normalized");
    expect(byType.get("raw")?.kind).toBe("raw");
    expect(byType.get("special")?.kind).toBe("unsupported");
    expect(byType.size).toBeGreaterThanOrEqual(10);
  });
});
