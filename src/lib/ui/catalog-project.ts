import type { Item } from "../inventory/types.ts";
import type { CatalogItemView } from "./catalog-types.ts";

/** Project a production catalog Item to UI view fields. Does not copy a second catalog. */
export function projectCatalogItem(item: Item): CatalogItemView {
  return {
    id: item.id,
    name: item.name,
    rarity: item.rarity,
    types: [...item.types],
    isBag: item.types.includes("bag"),
    geometry: {
      cells: item.geometry.cells.map((cell) => [cell[0], cell[1]]),
      stars: item.geometry.stars.map((cell) => [cell[0], cell[1]]),
    },
    icon: item.images.icon ?? null,
  };
}

export function catalogViewFromItems(items: Iterable<Item>): Map<string, CatalogItemView> {
  const map = new Map<string, CatalogItemView>();
  for (const item of items) {
    map.set(item.id, projectCatalogItem(item));
  }
  return map;
}
