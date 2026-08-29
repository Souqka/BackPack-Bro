/**
 * Deterministic Bag ordering for Beam / Greedy / Adaptive.
 * Larger geometry and more unique rotations first, then instanceId.
 */

import type { Item } from "../../inventory/types.ts";
import { getUniqueRotations } from "../rotations.ts";
import type { ItemToPlace } from "../types.ts";

export function orderBags(bags: ItemToPlace[], catalog: Map<string, Item>): ItemToPlace[] {
  return [...bags].sort((a, b) => {
    const itemA = catalog.get(a.itemId);
    const itemB = catalog.get(b.itemId);
    const cellsA = itemA?.geometry.cells.length ?? 0;
    const cellsB = itemB?.geometry.cells.length ?? 0;
    if (cellsA !== cellsB) return cellsB - cellsA;
    const rotA = itemA ? getUniqueRotations(itemA).length : 0;
    const rotB = itemB ? getUniqueRotations(itemB).length : 0;
    if (rotA !== rotB) return rotB - rotA;
    return a.instanceId < b.instanceId ? -1 : a.instanceId > b.instanceId ? 1 : 0;
  });
}
