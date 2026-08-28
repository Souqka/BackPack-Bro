/**
 * Генерация валидных PlacementCandidate.
 *
 * Не вызывает analyzeInventory и Scoring. Collision — lookup в occupiedCells.
 * Порядок: rotation ASC, row ASC, col ASC.
 */

import { rotateGeometry } from "../inventory/geometry.ts";
import type { Item } from "../inventory/types.ts";
import { canPlaceCandidate } from "./constraints.ts";
import { cellExtent, getUniqueRotations } from "./rotations.ts";
import type { ItemToPlace, PlacementCandidate, SearchState } from "./types.ts";

export function generatePlacementCandidates(
  item: ItemToPlace,
  state: SearchState,
  catalog: Map<string, Item>,
): PlacementCandidate[] {
  const catalogItem = catalog.get(item.itemId);
  if (!catalogItem) return [];

  const candidates: PlacementCandidate[] = [];
  const rotations = getUniqueRotations(catalogItem);

  for (const rotation of rotations) {
    const local = rotateGeometry(catalogItem.geometry, rotation);
    const extent = cellExtent(local.cells);
    if (!extent) continue;

    const maxRow = state.inventory.rows - 1 - extent.maxRow;
    const maxCol = state.inventory.cols - 1 - extent.maxCol;
    if (maxRow < 0 || maxCol < 0) continue;

    for (let row = 0; row <= maxRow; row++) {
      for (let col = 0; col <= maxCol; col++) {
        const candidate: PlacementCandidate = {
          placement: {
            instanceId: item.instanceId,
            itemId: item.itemId,
            position: { row, col },
            rotation,
          },
          cells: local.cells.map(([localRow, localCol]) => ({
            row: row + localRow,
            col: col + localCol,
          })),
          stars: local.stars.map(([localRow, localCol]) => ({
            row: row + localRow,
            col: col + localCol,
          })),
        };
        if (canPlaceCandidate(candidate, state).valid) {
          candidates.push(candidate);
        }
      }
    }
  }

  return candidates;
}
