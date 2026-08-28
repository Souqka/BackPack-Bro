/**
 * Слой Bags: Bags занимают клетки рюкзака и дают availableCells для Items.
 *
 * Bag — это Item с type "bag" из каталога, не отдельная модель.
 * Bag + Bag: collision на сетке рюкзака (клетки geometry).
 * Bag + Item: разные слои, не collision.
 */

import type { Position, ResolvedItemGeometry, Rotation } from "../../inventory/types.ts";
import type { Backpack } from "../types.ts";

export type { Backpack };

export interface PlacedBag {
  instanceId: string;
  itemId: string;
  position: Position;
  rotation: Rotation;
}

export interface OccupiedBagCell {
  instanceId: string;
  itemId: string;
  position: Position;
}

export interface BagState {
  bags: PlacedBag[];
  occupiedCells: Map<string, OccupiedBagCell>;
  availableCells: Set<string>;
  /** Разрешённая geometry для инкрементального remove. */
  geometries: Map<string, ResolvedItemGeometry>;
}
