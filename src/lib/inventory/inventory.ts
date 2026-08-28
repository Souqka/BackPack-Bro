/**
 * Сводка состояния рюкзака: границы, коллизии, Star overlap и активация.
 *
 * valid === true только при отсутствии outOfBounds и collisions.
 * Неактивная Star — нормальное игровое состояние, на valid не влияет.
 *
 * Асимптотика одного вызова: O(Item-клетки + Stars).
 */

import { evaluateStarActivations } from "./activation.ts";
import { buildCellIndex, findCollisions } from "./collision.ts";
import { resolvePlacedGeometry } from "./geometry.ts";
import { findOutOfBounds } from "./placement.ts";
import { findStarOverlaps } from "./stars.ts";
import type {
  InventoryAnalysis,
  InventoryState,
  Item,
  PlacedItem,
  ResolvedItemGeometry,
} from "./types.ts";

export function analyzeInventory(
  state: InventoryState,
  catalog: Map<string, Item>,
): InventoryAnalysis {
  const resolved = new Map<string, ResolvedItemGeometry>();
  for (const placed of state.items) {
    const item = catalog.get(placed.itemId);
    if (!item) continue;
    resolved.set(placed.instanceId, resolvePlacedGeometry(item, placed));
  }

  const outOfBounds = findOutOfBounds(state.items, catalog, state.inventory);
  const cellIndex = buildCellIndex(state.items, catalog, resolved);
  const collisions = findCollisions(state.items, catalog, cellIndex);
  const starOverlaps = findStarOverlaps(state.items, catalog, cellIndex, resolved);
  const placedItemIdByInstance = new Map(
    state.items.map((placed) => [placed.instanceId, placed.itemId]),
  );
  const starActivations = evaluateStarActivations(starOverlaps, placedItemIdByInstance, catalog);

  return {
    valid: outOfBounds.length === 0 && collisions.length === 0,
    outOfBounds,
    collisions,
    starOverlaps,
    starActivations,
  };
}

/** Карта каталога по itemId. Не копирует предметы внутрь InventoryState. */
export function catalogFromItems(items: Item[]): Map<string, Item> {
  const map = new Map<string, Item>();
  for (const item of items) {
    map.set(item.id, item);
  }
  return map;
}

export function placedItemIdIndex(items: PlacedItem[]): Map<string, string> {
  return new Map(items.map((placed) => [placed.instanceId, placed.itemId]));
}
