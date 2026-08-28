/**
 * Геометрические Star overlap.
 *
 * Star не занимает клетку и не коллизится.
 * Overlap = глобальная координата Star совпала с Item-клеткой другого экземпляра.
 * Совпадение Star со своими cells игнорируется.
 *
 * Сложность: O(Item-клетки + Stars) — lookup в индексе клеток.
 */

import { buildCellIndex } from "./collision.ts";
import { positionKey, resolvePlacedGeometry } from "./geometry.ts";
import type {
  CellOccupancy,
  Item,
  PlacedItem,
  ResolvedItemGeometry,
  StarOverlap,
} from "./types.ts";

export function findStarOverlaps(
  placedItems: PlacedItem[],
  catalog: Map<string, Item>,
  cellIndex?: Map<string, CellOccupancy[]>,
  resolved?: Map<string, ResolvedItemGeometry>,
): StarOverlap[] {
  const index = cellIndex ?? buildCellIndex(placedItems, catalog, resolved);
  const overlaps: StarOverlap[] = [];

  for (const placed of placedItems) {
    const item = catalog.get(placed.itemId);
    if (!item) continue;
    const geometry = resolved?.get(placed.instanceId) ?? resolvePlacedGeometry(item, placed);
    for (const starPosition of geometry.stars) {
      const occupants = index.get(positionKey(starPosition));
      if (!occupants) continue;
      for (const occupant of occupants) {
        if (occupant.instanceId === placed.instanceId) continue;
        overlaps.push({
          sourceInstanceId: placed.instanceId,
          starPosition,
          targetInstanceId: occupant.instanceId,
          targetCell: starPosition,
        });
      }
    }
  }

  return overlaps;
}
