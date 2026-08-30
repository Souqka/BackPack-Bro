/**
 * Build explicit LayoutMove metadata from local-search operations.
 *
 * Generators already know which instanceIds moved. This module snapshots
 * old/new geometry without an O(n²) layout diff.
 */

import { positionKey } from "../../inventory/geometry.ts";
import type { PlacedItem, Position, ResolvedItemGeometry, Rotation } from "../../inventory/types.ts";
import type { SearchState } from "../../optimizer/types.ts";
import type {
  BagRelocateMove,
  BagRotateMove,
  BagSwapMove,
  GeometrySnapshot,
  ItemGeometryChange,
  ItemPlaceMove,
  ItemRelocateMove,
  ItemRemoveMove,
  ItemRotateMove,
  ItemSwapMove,
  LayoutMove,
  RepairMove,
} from "./types.ts";

export function snapshotGeometry(
  geometry: ResolvedItemGeometry,
  placed: Pick<PlacedItem, "position" | "rotation">,
): GeometrySnapshot {
  return {
    origin: { row: placed.position.row, col: placed.position.col },
    rotation: placed.rotation,
    cells: geometry.cells.map(copyPosition),
    stars: geometry.stars.map(copyPosition),
  };
}

export function snapshotFromCandidate(
  instanceId: string,
  itemId: string,
  origin: Position,
  rotation: Rotation,
  cells: Position[],
  stars: Position[],
): GeometrySnapshot {
  return {
    origin: { row: origin.row, col: origin.col },
    rotation,
    cells: cells.map(copyPosition),
    stars: stars.map(copyPosition),
  };
}

export function createItemRelocateMove(
  instanceId: string,
  itemId: string,
  previous: GeometrySnapshot,
  next: GeometrySnapshot,
): ItemRelocateMove {
  return { type: "item_relocate", instanceId, itemId, previous, next };
}

export function createItemRotateMove(
  instanceId: string,
  itemId: string,
  previous: GeometrySnapshot,
  next: GeometrySnapshot,
): ItemRotateMove {
  return { type: "item_rotate", instanceId, itemId, previous, next };
}

export function createItemPlaceMove(
  instanceId: string,
  itemId: string,
  next: GeometrySnapshot,
): ItemPlaceMove {
  return { type: "item_place", instanceId, itemId, next };
}

export function createItemRemoveMove(
  instanceId: string,
  itemId: string,
  previous: GeometrySnapshot,
): ItemRemoveMove {
  return { type: "item_remove", instanceId, itemId, previous };
}

export function createItemSwapMove(
  a: ItemGeometryChange & { previous: GeometrySnapshot; next: GeometrySnapshot },
  b: ItemGeometryChange & { previous: GeometrySnapshot; next: GeometrySnapshot },
): ItemSwapMove {
  return { type: "item_swap", a, b };
}

export function createBagRelocateMove(instanceId: string, itemId: string): BagRelocateMove {
  return { type: "bag_relocate", instanceId, itemId };
}

export function createBagRotateMove(instanceId: string, itemId: string): BagRotateMove {
  return { type: "bag_rotate", instanceId, itemId };
}

export function createBagSwapMove(instanceIds: [string, string]): BagSwapMove {
  return { type: "bag_swap", instanceIds };
}

export function createRepairMove(changes: ItemGeometryChange[]): RepairMove {
  return {
    type: "repair",
    instanceIds: changes.map((change) => change.instanceId),
    changes,
  };
}

export function relocateOrRotateMove(
  instanceId: string,
  itemId: string,
  previous: GeometrySnapshot,
  next: GeometrySnapshot,
): ItemRelocateMove | ItemRotateMove {
  if (previous.rotation !== next.rotation) {
    return createItemRotateMove(instanceId, itemId, previous, next);
  }
  return createItemRelocateMove(instanceId, itemId, previous, next);
}

/**
 * Item geometry changes described by the move list. Bag-only moves yield [].
 */
export function itemGeometryChanges(moves: readonly LayoutMove[]): ItemGeometryChange[] {
  const changes: ItemGeometryChange[] = [];
  for (const move of moves) {
    switch (move.type) {
      case "item_relocate":
      case "item_rotate":
        changes.push(move);
        break;
      case "item_place":
        changes.push({ instanceId: move.instanceId, itemId: move.itemId, next: move.next });
        break;
      case "item_remove":
        changes.push({ instanceId: move.instanceId, itemId: move.itemId, previous: move.previous });
        break;
      case "item_swap":
        changes.push(move.a, move.b);
        break;
      case "repair":
        changes.push(...move.changes);
        break;
      case "bag_relocate":
      case "bag_rotate":
      case "bag_swap":
        break;
    }
  }
  return changes;
}

export function snapshotPlaced(state: SearchState, instanceId: string): GeometrySnapshot | undefined {
  const placed = state.items.find((item) => item.instanceId === instanceId);
  const geometry = state.itemGeometries.get(instanceId);
  if (!placed || !geometry) return undefined;
  return snapshotGeometry(geometry, placed);
}

export function geometryFingerprint(snapshot: GeometrySnapshot): string {
  const cells = snapshot.cells.map(positionKey).sort().join(",");
  const stars = snapshot.stars.map(positionKey).sort().join(",");
  return `${snapshot.origin.row}:${snapshot.origin.col}:${snapshot.rotation}|${cells}|${stars}`;
}

function copyPosition(position: Position): Position {
  return { row: position.row, col: position.col };
}
