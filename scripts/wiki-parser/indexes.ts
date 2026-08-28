/**
 * Производные поисковые индексы. Source of truth — `Item[]`.
 * В индексах только item ID, без копий предметов.
 */

import type { Item } from "./types/normalized.ts";

export interface CatalogIndexes {
  byId: Record<string, string>;
  byType: Record<string, string[]>;
  byRarity: Record<string, string[]>;
  byHero: Record<string, string[]>;
  usedInRecipes: Record<string, string[]>;
}

export function buildCatalogIndexes(items: Item[]): CatalogIndexes {
  const byId: Record<string, string> = {};
  const byType: Record<string, string[]> = {};
  const byRarity: Record<string, string[]> = {};
  const byHero: Record<string, string[]> = {};

  for (const item of items) {
    if (!item.id) continue;
    byId[item.id] = item.id;

    for (const type of item.types) {
      const key = type || "_unknown";
      pushUnique(byType, key, item.id);
    }
    if (item.types.length === 0) {
      pushUnique(byType, "_none", item.id);
    }

    const rarity = item.rarity || "_none";
    pushUnique(byRarity, rarity, item.id);

    const hero = item.hero && item.hero.trim() ? item.hero : "_none";
    pushUnique(byHero, hero, item.id);
  }

  return {
    byId,
    byType,
    byRarity,
    byHero,
    usedInRecipes: buildUsedInIndex(items),
  };
}

/**
 * Индекс «предмет используется в рецепте» строится только из `recipes`
 * целевого предмета. Не дублируется в каждом Item.
 */
export function buildUsedInIndex(items: Item[]): Record<string, string[]> {
  const index: Record<string, string[]> = {};
  for (const item of items) {
    for (const recipe of item.recipes) {
      for (const ingredient of recipe.ingredients) {
        const list = index[ingredient.itemId] ?? [];
        if (!list.includes(item.id)) list.push(item.id);
        index[ingredient.itemId] = list;
      }
    }
  }
  return index;
}

function pushUnique(map: Record<string, string[]>, key: string, id: string): void {
  const list = map[key] ?? [];
  if (!list.includes(id)) list.push(id);
  map[key] = list;
}
