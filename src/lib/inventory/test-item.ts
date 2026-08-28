/**
 * Минимальный Item для unit-тестов Placement Engine.
 * Не подставляет игровые значения Wiki — только поля, нужные геометрии и Star.
 */

import type { Item } from "./types.ts";
import type { Condition, StarRule } from "../../../scripts/wiki-parser/types/effects.ts";

export function testItem(overrides: Partial<Item> & Pick<Item, "id">): Item {
  return {
    name: overrides.name ?? overrides.id,
    rarity: "common",
    types: [],
    geometry: { cells: [[0, 0]], stars: [] },
    constraints: [],
    abilities: { initial: [], levelUp: [] },
    star: null,
    recipes: [],
    images: {},
    source: {
      wikiUrl: `https://backpackbrawl.wiki.gg/wiki/${overrides.id}`,
      parsedAt: "2026-08-28T00:00:00.000Z",
      parserVersion: "0.3.0",
    },
    ...overrides,
  };
}

export function occupantRule(itemTypes: string[]): StarRule {
  const condition: Condition = { type: "star_occupant_type", itemTypes };
  return {
    trigger: { type: "on_star_occupant", event: "hit", itemTypes },
    conditions: [condition],
    effects: [{ effect: { type: "gain", status: "armor", value: 1 } }],
  };
}

export function universalStarRule(): StarRule {
  return {
    trigger: { type: "on_star_activation" },
    conditions: [],
    effects: [{ effect: { type: "gain", status: "mana", value: 1 } }],
  };
}
