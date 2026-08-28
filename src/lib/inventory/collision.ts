/**
 * Коллизии Item-клеток.
 *
 * Collision только Item cell + Item cell.
 * Star коллизию не создаёт: Star + Item — разрешённое наложение.
 *
 * Сложность: O(сумма Item-клеток) через Map по ключу row:col.
 */

import { positionKey, resolvePlacedGeometry } from "./geometry.ts";
import type { CellOccupancy, Collision, Item, PlacedItem, ResolvedItemGeometry } from "./types.ts";

export function buildCellIndex(
  placedItems: PlacedItem[],
  catalog: Map<string, Item>,
  resolved?: Map<string, ResolvedItemGeometry>,
): Map<string, CellOccupancy[]> {
  const index = new Map<string, CellOccupancy[]>();
  for (const placed of placedItems) {
    const item = catalog.get(placed.itemId);
    if (!item) continue;
    const geometry = resolved?.get(placed.instanceId) ?? resolvePlacedGeometry(item, placed);
    for (const cell of geometry.cells) {
      const key = positionKey(cell);
      const list = index.get(key);
      const occupant: CellOccupancy = { instanceId: placed.instanceId, itemId: placed.itemId };
      if (list) list.push(occupant);
      else index.set(key, [occupant]);
    }
  }
  return index;
}

export function findCollisions(
  placedItems: PlacedItem[],
  catalog: Map<string, Item>,
  cellIndex?: Map<string, CellOccupancy[]>,
): Collision[] {
  const index = cellIndex ?? buildCellIndex(placedItems, catalog);
  const collisions: Collision[] = [];
  for (const [key, occupants] of index) {
    if (occupants.length < 2) continue;
    const [rowStr, colStr] = key.split(":");
    collisions.push({
      cell: { row: Number(rowStr), col: Number(colStr) },
      instanceIds: occupants.map((o) => o.instanceId),
    });
  }
  return collisions;
}

export function hasCollision(placedItems: PlacedItem[], catalog: Map<string, Item>): boolean {
  return findCollisions(placedItems, catalog).length > 0;
}
