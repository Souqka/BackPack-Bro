/**
 * Affected region for a local layout move.
 *
 * An Item move can change more than the moved instance: Stars that used to
 * land on it, Stars that now land on it, and occupants of old/new cells.
 */

import { positionKey } from "../../inventory/geometry.ts";
import type { Position, ResolvedItemGeometry } from "../../inventory/types.ts";
import type { SearchState } from "../../optimizer/types.ts";
import { itemGeometryChanges } from "./move.ts";
import type { AffectedRegion, LayoutMove } from "./types.ts";

export function collectAffectedRegion(
  moves: readonly LayoutMove[],
  previousItems: SearchState,
  nextItems: SearchState,
): AffectedRegion {
  const positions = new Set<string>();
  const starPositions = new Set<string>();
  const instanceIds = new Set<string>();

  for (const change of itemGeometryChanges(moves)) {
    instanceIds.add(change.instanceId);
    addSnapshotPositions(change.previous?.cells, positions);
    addSnapshotPositions(change.next?.cells, positions);
    addSnapshotPositions(change.previous?.stars, positions);
    addSnapshotPositions(change.next?.stars, positions);
    addSnapshotPositions(change.previous?.stars, starPositions);
    addSnapshotPositions(change.next?.stars, starPositions);
  }

  addOccupants(previousItems, positions, instanceIds);
  addOccupants(nextItems, positions, instanceIds);
  addStarSources(previousItems.itemGeometries, positions, instanceIds, starPositions);
  addStarSources(nextItems.itemGeometries, positions, instanceIds, starPositions);

  return { instanceIds, positions, starPositions };
}

function addSnapshotPositions(cells: Position[] | undefined, into: Set<string>): void {
  if (!cells) return;
  for (const cell of cells) into.add(positionKey(cell));
}

function addOccupants(state: SearchState, positions: Set<string>, instanceIds: Set<string>): void {
  for (const [key, occupant] of state.occupiedCells) {
    if (positions.has(key)) instanceIds.add(occupant.instanceId);
  }
  for (const geometry of state.itemGeometries.values()) {
    for (const cell of geometry.cells) {
      if (positions.has(positionKey(cell))) instanceIds.add(geometry.instanceId);
    }
  }
}

function addStarSources(
  geometries: ReadonlyMap<string, ResolvedItemGeometry>,
  positions: Set<string>,
  instanceIds: Set<string>,
  starPositions: Set<string>,
): void {
  for (const geometry of geometries.values()) {
    for (const star of geometry.stars) {
      const key = positionKey(star);
      if (!positions.has(key)) continue;
      instanceIds.add(geometry.instanceId);
      starPositions.add(key);
    }
  }
}
