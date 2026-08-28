/**
 * Модели Candidate Generator и инкрементального SearchState.
 *
 * Кандидат не содержит score, synergy и полный Item.
 * Геометрия в кандидате уже глобальная — будущий optimizer может не пересчитывать её.
 */

import type {
  Inventory,
  PlacedItem,
  Position,
  ResolvedItemGeometry,
  Rotation,
} from "../inventory/types.ts";

export type { Inventory, PlacedItem, Position, ResolvedItemGeometry, Rotation };

/** Предмет, который ещё не стоит в рюкзаке. */
export interface ItemToPlace {
  instanceId: string;
  itemId: string;
}

export interface OccupiedCell {
  instanceId: string;
  itemId: string;
  position: Position;
}

/**
 * Лёгкое состояние поиска: занятые Item-клетки и уже разрешённая геометрия.
 * Не хранит score и не заменяет InventoryAnalysis.
 */
export interface SearchState {
  inventory: Inventory;
  items: PlacedItem[];
  occupiedCells: Map<string, OccupiedCell>;
  itemGeometries: Map<string, ResolvedItemGeometry>;
}

export interface SearchStateIssue {
  code: "out_of_bounds" | "collision" | "unknown_item" | "duplicate_instance";
  instanceId?: string;
  itemId?: string;
  message: string;
  cells?: Position[];
}

export type SearchStateResult =
  | { ok: true; state: SearchState; issues: SearchStateIssue[] }
  | { ok: false; state?: undefined; issues: SearchStateIssue[] };

export interface PlacementCandidate {
  placement: PlacedItem;
  cells: Position[];
  stars: Position[];
}

export type CandidateInvalidReason = "out_of_bounds" | "collision";

export interface CandidateValidationResult {
  valid: boolean;
  reason?: CandidateInvalidReason;
  cells?: Position[];
}

/** Размер игрового рюкзака. Совпадает с Inventory Stage 4. */
export type Backpack = Inventory;

/** Игровой рюкзак 6×9. Алгоритмы читают поле, а не литералы. */
export const DEFAULT_BACKPACK: Backpack = {
  rows: 6,
  cols: 9,
};
