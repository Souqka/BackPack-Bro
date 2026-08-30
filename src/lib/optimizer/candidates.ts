/**
 * Генерация валидных PlacementCandidate.
 *
 * Не вызывает analyzeInventory и Scoring. Collision — lookup по сетке
 * occupied / available. Порядок: rotation ASC, row ASC, col ASC.
 * availableCells — опциональный слой Bags: Item можно ставить только на эти клетки.
 * Star за границей / вне Bags не отсекает кандидата.
 */

import type { Item } from "../inventory/types.ts";
import {
  isCandidateGenerationProfiling,
  recordCandidateGeneration,
} from "./candidate-profile.ts";
import { generatePlacementCandidatesBaseline } from "./candidates.baseline.ts";
import { getRotationDescriptors } from "./rotations.ts";
import type { ItemToPlace, OccupiedCell, PlacementCandidate, SearchState } from "./types.ts";

let baselineDepth = 0;

/**
 * Run fn with the Stage 6 generator. Used by differential tests and the
 * Stage 14 report. Default production path is the optimized generator.
 */
export function withBaselineCandidateGeneration<T>(fn: () => T): T {
  baselineDepth += 1;
  try {
    return fn();
  } finally {
    baselineDepth -= 1;
  }
}

export function generatePlacementCandidates(
  item: ItemToPlace,
  state: SearchState,
  catalog: Map<string, Item>,
  availableCells?: ReadonlySet<string>,
): PlacementCandidate[] {
  if (!isCandidateGenerationProfiling()) {
    return dispatch(item, state, catalog, availableCells);
  }
  const started = performance.now();
  const candidates = dispatch(item, state, catalog, availableCells);
  recordCandidateGeneration(performance.now() - started, candidates.length);
  return candidates;
}

function dispatch(
  item: ItemToPlace,
  state: SearchState,
  catalog: Map<string, Item>,
  availableCells?: ReadonlySet<string>,
): PlacementCandidate[] {
  if (baselineDepth > 0) {
    return generatePlacementCandidatesBaseline(item, state, catalog, availableCells);
  }
  return generatePlacementCandidatesOptimized(item, state, catalog, availableCells);
}

function generatePlacementCandidatesOptimized(
  item: ItemToPlace,
  state: SearchState,
  catalog: Map<string, Item>,
  availableCells?: ReadonlySet<string>,
): PlacementCandidate[] {
  const catalogItem = catalog.get(item.itemId);
  if (!catalogItem) return [];

  const need = catalogItem.geometry.cells.length;
  if (need === 0) return [];

  const capacity = availableCells
    ? availableCells.size - state.occupiedCells.size
    : state.inventory.rows * state.inventory.cols - state.occupiedCells.size;
  if (need > capacity) return [];

  const { rows, cols } = state.inventory;
  const blocked = buildBlockedGrid(rows, cols, state.occupiedCells, availableCells);

  const candidates: PlacementCandidate[] = [];
  const descriptors = getRotationDescriptors(catalogItem);

  for (const descriptor of descriptors) {
    if (descriptor.cells.length === 0) continue;
    const maxRow = rows - 1 - descriptor.maxRow;
    const maxCol = cols - 1 - descriptor.maxCol;
    if (maxRow < 0 || maxCol < 0) continue;

    const localCells = descriptor.cells;
    const cellCount = localCells.length;

    for (let row = 0; row <= maxRow; row++) {
      for (let col = 0; col <= maxCol; col++) {
        if (!fitsBlocked(blocked, cols, localCells, cellCount, row, col)) continue;
        candidates.push(materializeCandidate(item, descriptor, row, col));
      }
    }
  }

  return candidates;
}

function buildBlockedGrid(
  rows: number,
  cols: number,
  occupied: ReadonlyMap<string, OccupiedCell>,
  availableCells?: ReadonlySet<string>,
): Uint8Array {
  const blocked = new Uint8Array(rows * cols);
  if (availableCells) {
    blocked.fill(1);
    for (const key of availableCells) {
      const sep = key.indexOf(":");
      const row = Number(key.slice(0, sep));
      const col = Number(key.slice(sep + 1));
      if (row >= 0 && row < rows && col >= 0 && col < cols) {
        blocked[row * cols + col] = 0;
      }
    }
  }
  for (const cell of occupied.values()) {
    const row = cell.position.row;
    const col = cell.position.col;
    if (row >= 0 && row < rows && col >= 0 && col < cols) {
      blocked[row * cols + col] = 1;
    }
  }
  return blocked;
}

function fitsBlocked(
  blocked: Uint8Array,
  cols: number,
  localCells: ReadonlyArray<readonly [number, number]>,
  cellCount: number,
  row: number,
  col: number,
): boolean {
  for (let index = 0; index < cellCount; index++) {
    const local = localCells[index]!;
    if (blocked[(row + local[0]) * cols + (col + local[1])] !== 0) return false;
  }
  return true;
}

function materializeCandidate(
  item: ItemToPlace,
  descriptor: { rotation: 0 | 90 | 180 | 270; cells: ReadonlyArray<readonly [number, number]>; stars: ReadonlyArray<readonly [number, number]> },
  row: number,
  col: number,
): PlacementCandidate {
  return {
    placement: {
      instanceId: item.instanceId,
      itemId: item.itemId,
      position: { row, col },
      rotation: descriptor.rotation,
    },
    cells: descriptor.cells.map(([localRow, localCol]) => ({
      row: row + localRow,
      col: col + localCol,
    })),
    stars: descriptor.stars.map(([localRow, localCol]) => ({
      row: row + localRow,
      col: col + localCol,
    })),
  };
}
