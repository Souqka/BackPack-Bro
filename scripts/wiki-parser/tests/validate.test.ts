import { describe, expect, it } from "vitest";
import { buildCatalogIndexes, buildUsedInIndex } from "../indexes.ts";
import { parseOneItem } from "../parser.ts";
import { validateCatalog } from "../validate.ts";
import { Logger } from "../utils/logger.ts";
import { loadFixture } from "./helpers.ts";
import type { Item } from "../types/normalized.ts";

describe("validateCatalog", () => {
  it("возвращает errors и warnings как CatalogValidationResult", async () => {
    const logger = new Logger();
    const { item } = await parseOneItem(loadFixture("adamantite_bar").page, {
      logger,
      knownNames: new Map(),
      outputDir: "/tmp",
      skipImages: true,
      fetcher: null,
    });
    const result = validateCatalog([item], logger);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings.some((w) => w.code === "unresolved_recipe_ingredient")).toBe(true);
  });

  it("ломает геометрию: пустые cells и пересечение star с cell", () => {
    const base: Item = {
      id: "broken",
      name: "Broken",
      rarity: "common",
      types: ["part"],
      geometry: { cells: [], stars: [] },
      constraints: [],
      abilities: { initial: [], levelUp: [] },
      recipes: [],
      images: {},
      source: { wikiUrl: "https://backpackbrawl.wiki.gg/wiki/Broken", parsedAt: "", parserVersion: "0.3.0" },
    };
    const empty = validateCatalog([base]);
    expect(empty.errors.some((e) => e.code === "missing_geometry")).toBe(true);

    const overlap = validateCatalog([
      {
        ...base,
        geometry: { cells: [[0, 0]], stars: [[0, 0]] },
      },
    ]);
    expect(overlap.errors.some((e) => e.code === "star_overlaps_cell")).toBe(true);
  });
});

describe("indexes", () => {
  it("строит by-id / by-type / used-in только из ID", async () => {
    const logger = new Logger();
    const bar = await parseOneItem(loadFixture("adamantite_bar").page, {
      logger,
      knownNames: new Map(),
      outputDir: "/tmp",
      skipImages: true,
      fetcher: null,
    });
    const ore = await parseOneItem(loadFixture("adamantite_ore").page, {
      logger,
      knownNames: new Map(),
      outputDir: "/tmp",
      skipImages: true,
      fetcher: null,
    });
    const indexes = buildCatalogIndexes([bar.item, ore.item]);
    expect(indexes.byId.adamantite_bar).toBe("adamantite_bar");
    expect(indexes.byRarity.epic).toEqual(["adamantite_bar", "adamantite_ore"]);
    expect(indexes.byType.mineral).toEqual(["adamantite_ore"]);
    expect(indexes.usedInRecipes.adamantite_ore).toEqual(["adamantite_bar"]);
    expect(buildUsedInIndex([bar.item]).steel_bar).toEqual(["adamantite_bar"]);
    expect(JSON.stringify(indexes.byId)).not.toContain("geometry");
  });
});
