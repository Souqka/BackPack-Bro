/**
 * Типы Inventory Placement Engine.
 *
 * Каталог `Item` — source of truth предметов.
 * В рюкзаке живут только `PlacedItem` (instanceId + itemId + позиция + поворот).
 */

export type { Item, ItemGeometry } from "../../../scripts/wiki-parser/types/normalized.ts";
export type { Condition, StarData, StarRule } from "../../../scripts/wiki-parser/types/effects.ts";

/** Четверть оборота по часовой стрелке. Совпадает с Stage 3. */
export type Rotation = 0 | 90 | 180 | 270;

/** Глобальная или локальная клетка рюкзака: строка и столбец. */
export interface Position {
  row: number;
  col: number;
}

/** Размер сетки рюкзака. Не захардкожен. */
export interface Inventory {
  rows: number;
  cols: number;
}

/**
 * Экземпляр предмета в рюкзаке.
 * `instanceId` уникален для копии; `itemId` ссылается на каталог.
 */
export interface PlacedItem {
  instanceId: string;
  itemId: string;
  position: Position;
  rotation: Rotation;
}

export interface InventoryState {
  inventory: Inventory;
  items: PlacedItem[];
}

/** Геометрия экземпляра после поворота и сдвига в глобальные координаты. */
export interface ResolvedItemGeometry {
  instanceId: string;
  itemId: string;
  cells: Position[];
  stars: Position[];
}

export interface Collision {
  cell: Position;
  instanceIds: string[];
}

/**
 * Геометрическое совпадение Star source с Item-клеткой target.
 * Не означает игровую активацию.
 */
export interface StarOverlap {
  sourceInstanceId: string;
  starPosition: Position;
  targetInstanceId: string;
  targetCell: Position;
}

export type StarActivationReason =
  | "active"
  | "no_star_data"
  | "condition_not_met"
  | "unsupported_condition"
  | "raw_condition";

export interface StarActivationResult {
  sourceInstanceId: string;
  targetInstanceId: string;
  active: boolean;
  reason: StarActivationReason;
  starPosition: Position;
  targetCell: Position;
}

export interface PlacementIssue {
  instanceId: string;
  itemId: string;
  code: "out_of_bounds" | "unknown_item";
  message: string;
  cells?: Position[];
}

export interface InventoryAnalysis {
  valid: boolean;
  outOfBounds: PlacementIssue[];
  collisions: Collision[];
  starOverlaps: StarOverlap[];
  starActivations: StarActivationResult[];
}

/** Занятость клетки Item (Star в индекс коллизий не входит). */
export interface CellOccupancy {
  instanceId: string;
  itemId: string;
}
