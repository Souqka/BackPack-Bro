/**
 * Local layout change metadata for incremental placement scoring.
 *
 * A move describes geometry that actually changed. Incremental scoring never
 * estimates a numeric delta; it rebuilds affected InventoryAnalysis facts
 * and then calls the canonical Scoring Engine.
 */

import type { Position, Rotation } from "../../inventory/types.ts";
import type { OptimizerState } from "../../optimizer/search-types.ts";
import type { PlacementScore } from "../types.ts";

export interface GeometrySnapshot {
  origin: Position;
  rotation: Rotation;
  cells: Position[];
  stars: Position[];
}

export interface ItemGeometryChange {
  instanceId: string;
  itemId: string;
  previous?: GeometrySnapshot;
  next?: GeometrySnapshot;
}

export interface ItemRelocateMove extends ItemGeometryChange {
  type: "item_relocate";
  previous: GeometrySnapshot;
  next: GeometrySnapshot;
}

export interface ItemRotateMove extends ItemGeometryChange {
  type: "item_rotate";
  previous: GeometrySnapshot;
  next: GeometrySnapshot;
}

export interface ItemPlaceMove {
  type: "item_place";
  instanceId: string;
  itemId: string;
  next: GeometrySnapshot;
}

export interface ItemRemoveMove {
  type: "item_remove";
  instanceId: string;
  itemId: string;
  previous: GeometrySnapshot;
}

export interface ItemSwapMove {
  type: "item_swap";
  a: ItemGeometryChange & { previous: GeometrySnapshot; next: GeometrySnapshot };
  b: ItemGeometryChange & { previous: GeometrySnapshot; next: GeometrySnapshot };
}

export interface BagRelocateMove {
  type: "bag_relocate";
  instanceId: string;
  itemId: string;
}

export interface BagRotateMove {
  type: "bag_rotate";
  instanceId: string;
  itemId: string;
}

export interface BagSwapMove {
  type: "bag_swap";
  instanceIds: [string, string];
}

export interface RepairMove {
  type: "repair";
  instanceIds: string[];
  changes: ItemGeometryChange[];
}

export type LayoutMove =
  | ItemRelocateMove
  | ItemRotateMove
  | ItemSwapMove
  | ItemPlaceMove
  | ItemRemoveMove
  | BagRelocateMove
  | BagRotateMove
  | BagSwapMove
  | RepairMove;

export type LayoutMoveKind = LayoutMove["type"];

export interface IncrementalScoreContext {
  previousState: OptimizerState;
  previousScore: PlacementScore;
  moves: LayoutMove[];
}

export interface IncrementalScoreResult {
  score: PlacementScore;
  mode: "incremental" | "full_fallback";
  affectedInstanceIds: string[];
  affectedInteractionCount: number;
  affectedStarCount: number;
  reason?: string;
}

export interface AffectedRegion {
  instanceIds: Set<string>;
  positions: Set<string>;
  starPositions: Set<string>;
}
