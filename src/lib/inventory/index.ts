/**
 * Публичный API Inventory Placement Engine.
 *
 * Внутренние хелперы (`buildCellIndex`, разбор Condition) не экспортируются.
 * `positionKey` нужен будущему optimizer для того же spatial index.
 */

export type {
  CellOccupancy,
  Collision,
  Inventory,
  InventoryAnalysis,
  InventoryState,
  Item,
  ItemGeometry,
  PlacedItem,
  PlacementIssue,
  Position,
  ResolvedItemGeometry,
  Rotation,
  StarActivationReason,
  StarActivationResult,
  StarOverlap,
} from "./types.ts";

export { positionKey, resolvePlacedGeometry, rotateGeometry } from "./geometry.ts";
export { isInsideInventory, isPlacementInsideInventory, findOutOfBounds } from "./placement.ts";
export { findCollisions, hasCollision } from "./collision.ts";
export { findStarOverlaps } from "./stars.ts";
export { evaluateStarActivations, matchingStarRuleIndexes } from "./activation.ts";
export { analyzeInventory, catalogFromItems } from "./inventory.ts";
