import { describe, expect, it } from "vitest";
import { parseAbilities } from "../parsers/abilities.ts";
import { parseGeneralInfo } from "../parsers/general-info.ts";
import { parseLevels } from "../parsers/levels.ts";
import { parseRecipes } from "../parsers/recipes.ts";
import { parseStats } from "../parsers/stats.ts";
import { Logger } from "../utils/logger.ts";
import { loadFixture, paramsOf } from "./helpers.ts";

describe("general info", () => {
  it("reads Adamantite Bar identity from the Item template", () => {
    const fixture = loadFixture("adamantite_bar");
    const logger = new Logger();
    const info = parseGeneralInfo(fixture.html, paramsOf("adamantite_bar"), logger, "Adamantite Bar");
    expect(info.name).toBe("Adamantite Bar");
    expect(info.rarity).toBe("epic");
    expect(info.types).toEqual(["part", "accessory"]);
    expect(info.hero).toBe("Shared");
    expect(info.cost).toBe(12);
    expect(info.purchasable).toBe(false);
    expect(info.unlock?.initiallyAvailable).toBe(true);
  });
});

describe("stats", () => {
  it("returns null when the Wiki item has no combat stats", () => {
    const fixture = loadFixture("adamantite_bar");
    expect(parseStats(fixture.html, paramsOf("adamantite_bar"))).toBeNull();
  });

  it("reads Adamantite Ore combat stats", () => {
    const fixture = loadFixture("adamantite_ore");
    const stats = parseStats(fixture.html, paramsOf("adamantite_ore"));
    expect(stats).toMatchObject({
      damageMin: 6,
      damageMax: 9,
      cooldown: 6,
      accuracy: 80,
      staminaCost: 0,
      critChance: 0,
      critDamage: 100,
    });
  });
});

describe("abilities", () => {
  it("moves Star-triggered Bar ability out of initial abilities", () => {
    const fixture = loadFixture("adamantite_bar");
    const logger = new Logger();
    const result = parseAbilities(fixture.html, paramsOf("adamantite_bar"), logger, "Adamantite Bar", true);
    expect(result.initial).toEqual([]);
    expect(result.star?.effects.length).toBeGreaterThan(0);
    expect(result.star?.activation.raw).toMatch(/star/i);
    const effect = result.star?.effects[0] as { chancePercent?: number; amount?: number; status?: string };
    expect(effect.chancePercent).toBe(20);
    expect(effect.amount).toBe(24);
    expect(effect.status).toBe("armor");
  });

  it("keeps Ore on-hit ability and the throw-once line separate", () => {
    const fixture = loadFixture("adamantite_ore");
    const logger = new Logger();
    const result = parseAbilities(fixture.html, paramsOf("adamantite_ore"), logger, "Adamantite Ore", false);
    expect(result.star).toBeNull();
    expect(result.initial.length).toBe(2);
    expect(result.initial[0]?.trigger).toBe("On hit");
    expect(result.initial[1]?.effects[0]).toMatchObject({ raw: "Can only be thrown once per battle" });
  });

  it("splits Starbloom Dawn ability from Star activation", () => {
    const fixture = loadFixture("starbloom");
    const logger = new Logger();
    const result = parseAbilities(fixture.html, paramsOf("starbloom"), logger, "Starbloom", true);
    expect(result.initial[0]?.trigger).toMatch(/dawn/i);
    expect(result.star?.effects.length).toBe(1);
  });
});

describe("levels", () => {
  it("reads 15 Bar levels with per-row chance changes", () => {
    const fixture = loadFixture("adamantite_bar");
    const logger = new Logger();
    const result = parseLevels(fixture.html, paramsOf("adamantite_bar"), logger, "Adamantite Bar", "epic");
    expect(result.upgrade?.maxLevel).toBe(15);
    expect(result.levelUp).toHaveLength(14);
    expect(result.levelUp[0]?.level).toBe(2);
    expect(result.levelUp.at(-1)?.level).toBe(15);
    const last = result.levelUp.at(-1)?.changes[0] as { chancePercent?: number };
    expect(last.chancePercent).toBe(100);
  });

  it("reads Ore weapon level-up stat bonuses as separate changes", () => {
    const fixture = loadFixture("adamantite_ore");
    const logger = new Logger();
    const result = parseLevels(fixture.html, paramsOf("adamantite_ore"), logger, "Adamantite Ore", "epic");
    expect(result.upgrade?.maxLevel).toBe(15);
    expect(result.levelUp[0]?.rawText).toMatch(/damage/i);
  });
});

describe("recipes", () => {
  it("keeps only recipes that create the current item and collapses quantities", () => {
    const logger = new Logger();
    const known = new Map<string, string>([
      ["steel bar", "steel_bar"],
      ["adamantite ore", "adamantite_ore"],
    ]);
    const result = parseRecipes(paramsOf("adamantite_bar"), "Adamantite Bar", logger, known);
    expect(result.recipes).toEqual([
      { ingredients: [{ itemId: "steel_bar", quantity: 2 }] },
      { ingredients: [{ itemId: "adamantite_ore", quantity: 3 }] },
    ]);
    expect(result.usedInRecipes).toEqual([]);
  });

  it("does not treat used-in recipes as crafting recipes for Starbloom", () => {
    const logger = new Logger();
    const result = parseRecipes(paramsOf("starbloom"), "Starbloom", logger, new Map());
    expect(result.recipes).toEqual([]);
    expect(result.usedInRecipes.length).toBe(4);
  });
});
