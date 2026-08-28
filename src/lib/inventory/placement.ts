/**
 * Границы рюкзака.
 *
 * Валидность размещения проверяется только по Item cells.
 * Star клетку рюкзака не занимает и может быть снаружи.
 */

import { resolvePlacedGeometry } from "./geometry.ts";
import type { Item } from "./types.ts";
import type { Inventory, PlacedItem, PlacementIssue, Position } from "./types.ts";

export function isInsideInventory(position: Position, inventory: Inventory): boolean {
  return (
    position.row >= 0 &&
    position.col >= 0 &&
    position.row < inventory.rows &&
    position.col < inventory.cols
  );
}

/**
 * true, если все Item-клетки внутри сетки.
 * Star за границей на результат не влияет.
 */
export function isPlacementInsideInventory(
  item: Item,
  placedItem: PlacedItem,
  inventory: Inventory,
): boolean {
  const resolved = resolvePlacedGeometry(item, placedItem);
  return resolved.cells.every((cell) => isInsideInventory(cell, inventory));
}

export function findOutOfBounds(
  placedItems: PlacedItem[],
  catalog: Map<string, Item>,
  inventory: Inventory,
): PlacementIssue[] {
  const issues: PlacementIssue[] = [];
  for (const placed of placedItems) {
    const item = catalog.get(placed.itemId);
    if (!item) {
      issues.push({
        instanceId: placed.instanceId,
        itemId: placed.itemId,
        code: "unknown_item",
        message: `Предмет каталога не найден: ${placed.itemId}`,
      });
      continue;
    }
    const resolved = resolvePlacedGeometry(item, placed);
    const outside = resolved.cells.filter((cell) => !isInsideInventory(cell, inventory));
    if (outside.length > 0) {
      issues.push({
        instanceId: placed.instanceId,
        itemId: placed.itemId,
        code: "out_of_bounds",
        message: `Item выходит за границы рюкзака (${outside.length} клеток)`,
        cells: outside,
      });
    }
  }
  return issues;
}
