/**
 * Координаты и разрешённая геометрия размещения.
 *
 * Поворот делегируется `rotateGeometry` из Stage 3 — алгоритм не копируется.
 * Star и Item-клетки вращаются одним преобразованием, затем сдвигаются на position.
 */

import { rotateGeometry } from "../../../scripts/wiki-parser/utils/geometry.ts";
import type { Item } from "../../../scripts/wiki-parser/types/normalized.ts";
import type { PlacedItem, Position, ResolvedItemGeometry, Rotation } from "./types.ts";

export { rotateGeometry };

/**
 * Ключ клетки для spatial Map. Формат `row:col`.
 */
export function positionKey(position: Position): string {
  return `${position.row}:${position.col}`;
}

export function samePosition(a: Position, b: Position): boolean {
  return a.row === b.row && a.col === b.col;
}

/**
 * Локальная geometry → поворот (Stage 3 crop к [0,0]) → глобальные координаты.
 */
export function resolvePlacedGeometry(item: Item, placedItem: PlacedItem): ResolvedItemGeometry {
  const rotated = rotateGeometry(item.geometry, placedItem.rotation as Rotation);
  const origin = placedItem.position;
  return {
    instanceId: placedItem.instanceId,
    itemId: placedItem.itemId,
    cells: rotated.cells.map(([row, col]) => ({
      row: origin.row + row,
      col: origin.col + col,
    })),
    stars: rotated.stars.map(([row, col]) => ({
      row: origin.row + row,
      col: origin.col + col,
    })),
  };
}

export function toPosition(cell: readonly [number, number]): Position {
  return { row: cell[0], col: cell[1] };
}
