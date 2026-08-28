/**
 * Уникальные повороты Item.
 *
 * Сравниваются cells и stars после rotateGeometry (Stage 3): одинаковая
 * форма Item при разной конфигурации Star — разные ориентации.
 */

import { rotateGeometry } from "../inventory/geometry.ts";
import type { Item, ItemGeometry, Rotation } from "../inventory/types.ts";

const ALL_ROTATIONS: Rotation[] = [0, 90, 180, 270];

/**
 * Детерминированная подпись канонической geometry.
 * Координаты уже отсортированы `rotateGeometry`.
 */
export function geometrySignature(geometry: ItemGeometry): string {
  const cells = geometry.cells.map(([row, col]) => `${row},${col}`).join(";");
  const stars = geometry.stars.map(([row, col]) => `${row},${col}`).join(";");
  return `cells:${cells}|stars:${stars}`;
}

/**
 * Уникальные ориентации в порядке 0 → 90 → 180 → 270.
 * Сложность: O(4 × размер geometry).
 */
export function getUniqueRotations(item: Item): Rotation[] {
  const seen = new Set<string>();
  const unique: Rotation[] = [];
  for (const rotation of ALL_ROTATIONS) {
    const signature = geometrySignature(rotateGeometry(item.geometry, rotation));
    if (seen.has(signature)) continue;
    seen.add(signature);
    unique.push(rotation);
  }
  return unique;
}

/** Максимальные локальные row/col Item-клеток. Star не входит. */
export function cellExtent(cells: ReadonlyArray<readonly [number, number]>): {
  maxRow: number;
  maxCol: number;
} | null {
  if (cells.length === 0) return null;
  let maxRow = Number.NEGATIVE_INFINITY;
  let maxCol = Number.NEGATIVE_INFINITY;
  for (const [row, col] of cells) {
    if (row > maxRow) maxRow = row;
    if (col > maxCol) maxCol = col;
  }
  return { maxRow, maxCol };
}
