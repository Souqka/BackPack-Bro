/**
 * Baseline placement-candidate generator (Stage 6 algorithm).
 *
 * Frozen as the differential-test oracle. Unique rotations are computed
 * here so later caches on getUniqueRotations do not affect the baseline.
 */

import { rotateGeometry } from "../inventory/geometry.ts";
import type { Item, ItemGeometry, Rotation } from "../inventory/types.ts";
import { canPlaceCandidate } from "./constraints.ts";
import { cellExtent } from "./rotations.ts";
import type { ItemToPlace, PlacementCandidate, SearchState } from "./types.ts";

const ALL_ROTATIONS: Rotation[] = [0, 90, 180, 270];

export function generatePlacementCandidatesBaseline(
  item: ItemToPlace,
  state: SearchState,
  catalog: Map<string, Item>,
  availableCells?: ReadonlySet<string>,
): PlacementCandidate[] {
  const catalogItem = catalog.get(item.itemId);
  if (!catalogItem) return [];

  const candidates: PlacementCandidate[] = [];
  const rotations = uniqueRotationsBaseline(catalogItem);

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
        if (canPlaceCandidate(candidate, state, availableCells).valid) {
          candidates.push(candidate);
        }
      }
    }
  }

  return candidates;
}

function uniqueRotationsBaseline(item: Item): Rotation[] {
  const seen = new Set<string>();
  const unique: Rotation[] = [];
  for (const rotation of ALL_ROTATIONS) {
    const geometry = rotateGeometry(item.geometry, rotation);
    const signature = geometrySignatureBaseline(geometry);
    if (seen.has(signature)) continue;
    seen.add(signature);
    unique.push(rotation);
  }
  return unique;
}

function geometrySignatureBaseline(geometry: ItemGeometry): string {
  const cells = geometry.cells.map(([row, col]) => `${row},${col}`).join(";");
  const stars = geometry.stars.map(([row, col]) => `${row},${col}`).join(";");
  return `cells:${cells}|stars:${stars}`;
}
