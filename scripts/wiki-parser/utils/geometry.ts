/**
 * Геометрические утилиты для будущего optimizer.
 *
 * Вращение применяется одновременно к `cells` и `stars`: Star остаётся
 * привязанной к Item. После поворота bounding box сдвигается в начало
 * координат (`minRow === 0`, `minCol === 0`).
 */

import type { Cell, ItemGeometry } from "../types/normalized.ts";

/** Четверть оборота по часовой стрелке. */
export type Rotation = 0 | 90 | 180 | 270;

/**
 * Повернуть каноническую геометрию и обрезать пустой край.
 * Star и Item-клетки вращаются одним преобразованием.
 */
export function rotateGeometry(geometry: ItemGeometry, rotation: Rotation): ItemGeometry {
  if (rotation === 0) {
    return cropGeometryToOrigin(cloneGeometry(geometry));
  }
  const rotated: ItemGeometry = {
    cells: geometry.cells.map((cell) => rotateCell(cell, rotation)),
    stars: geometry.stars.map((cell) => rotateCell(cell, rotation)),
  };
  return cropGeometryToOrigin(rotated);
}

/**
 * Сдвинуть занятые клетки так, чтобы минимум по строке и столбцу был 0.
 * Пустая геометрия не меняется.
 */
export function cropGeometryToOrigin(geometry: ItemGeometry): ItemGeometry {
  const occupied = [...geometry.cells, ...geometry.stars];
  if (occupied.length === 0) {
    return { cells: [], stars: [] };
  }
  const minRow = Math.min(...occupied.map((c) => c[0]));
  const minCol = Math.min(...occupied.map((c) => c[1]));
  const shift = (cell: Cell): Cell => [cell[0] - minRow, cell[1] - minCol];
  const cells = geometry.cells.map(shift).sort(compareCell);
  const stars = geometry.stars.map(shift).sort(compareCell);
  return { cells, stars };
}

export function originOf(geometry: ItemGeometry): { minRow: number; minCol: number } | null {
  const occupied = [...geometry.cells, ...geometry.stars];
  if (occupied.length === 0) return null;
  return {
    minRow: Math.min(...occupied.map((c) => c[0])),
    minCol: Math.min(...occupied.map((c) => c[1])),
  };
}

/**
 * Смещение Star относительно ближайшей Item-клетки: `[dRow, dCol]`.
 * Не игровая метрика, только разность координат.
 */
export function starOffsetsFromNearestCell(geometry: ItemGeometry): Array<[number, number]> {
  if (geometry.cells.length === 0) {
    return geometry.stars.map((star) => [star[0], star[1]] as [number, number]);
  }
  return geometry.stars.map((star) => {
    let best: [number, number] = [star[0] - geometry.cells[0]![0], star[1] - geometry.cells[0]![1]];
    let bestChebyshev = Math.max(Math.abs(best[0]), Math.abs(best[1]));
    let bestManhattan = Math.abs(best[0]) + Math.abs(best[1]);
    for (const cell of geometry.cells) {
      const dRow = star[0] - cell[0];
      const dCol = star[1] - cell[1];
      const chebyshev = Math.max(Math.abs(dRow), Math.abs(dCol));
      const manhattan = Math.abs(dRow) + Math.abs(dCol);
      if (
        chebyshev < bestChebyshev ||
        (chebyshev === bestChebyshev && manhattan < bestManhattan)
      ) {
        best = [dRow, dCol];
        bestChebyshev = chebyshev;
        bestManhattan = manhattan;
      }
    }
    return best;
  });
}

/** Chebyshev: max(|dRow|, |dCol|). Соседняя клетка — 1. */
export function chebyshevDistance(a: Cell, b: Cell): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
}

function rotateCell(cell: Cell, rotation: Rotation): Cell {
  const [row, col] = cell;
  switch (rotation) {
    case 0:
      return [row, col];
    case 90:
      return [col, -row];
    case 180:
      return [-row, -col];
    case 270:
      return [-col, row];
  }
}

function cloneGeometry(geometry: ItemGeometry): ItemGeometry {
  return {
    cells: geometry.cells.map((c) => [c[0], c[1]] as Cell),
    stars: geometry.stars.map((c) => [c[0], c[1]] as Cell),
  };
}

function compareCell(a: Cell, b: Cell): number {
  return a[0] === b[0] ? a[1] - b[1] : a[0] - b[0];
}
