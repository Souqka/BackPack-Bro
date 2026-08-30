/**
 * Уникальные повороты Item.
 *
 * Сравниваются cells и stars после rotateGeometry (Stage 3): одинаковая
 * форма Item при разной конфигурации Star — разные ориентации.
 *
 * Descriptors кэшируются WeakMap по объекту Item каталога: geometry
 * immutable, invalidation не нужна. Кэш не шарится со Score Cache.
 */

import { rotateGeometry } from "../inventory/geometry.ts";
import type { Item, ItemGeometry, Rotation } from "../inventory/types.ts";

const ALL_ROTATIONS: Rotation[] = [0, 90, 180, 270];

/**
 * Подготовленная уникальная ориентация. cells/stars — локальные координаты
 * после rotateGeometry (crop к [0,0]). Массивы заморожены.
 */
export interface RotationDescriptor {
  rotation: Rotation;
  cells: ReadonlyArray<readonly [number, number]>;
  stars: ReadonlyArray<readonly [number, number]>;
  maxRow: number;
  maxCol: number;
}

const descriptorsByItem = new WeakMap<Item, readonly RotationDescriptor[]>();

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
 * Сложность первого вызова: O(4 × размер geometry); далее O(уникальные).
 */
export function getUniqueRotations(item: Item): Rotation[] {
  const descriptors = getRotationDescriptors(item);
  const rotations: Rotation[] = [];
  for (const descriptor of descriptors) rotations.push(descriptor.rotation);
  return rotations;
}

/**
 * Unique rotations plus cached local geometry / cell bounding box.
 * Source of truth remains rotateGeometry.
 */
export function getRotationDescriptors(item: Item): readonly RotationDescriptor[] {
  const cached = descriptorsByItem.get(item);
  if (cached) return cached;

  const seen = new Set<string>();
  const unique: RotationDescriptor[] = [];
  for (const rotation of ALL_ROTATIONS) {
    const geometry = rotateGeometry(item.geometry, rotation);
    const signature = geometrySignature(geometry);
    if (seen.has(signature)) continue;
    seen.add(signature);
    const extent = cellExtent(geometry.cells);
    const cells = Object.freeze(geometry.cells.map((cell) => Object.freeze([cell[0], cell[1]] as const)));
    const stars = Object.freeze(geometry.stars.map((cell) => Object.freeze([cell[0], cell[1]] as const)));
    unique.push(
      Object.freeze({
        rotation,
        cells,
        stars,
        maxRow: extent?.maxRow ?? -1,
        maxCol: extent?.maxCol ?? -1,
      }),
    );
  }
  const frozen = Object.freeze(unique);
  descriptorsByItem.set(item, frozen);
  return frozen;
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
