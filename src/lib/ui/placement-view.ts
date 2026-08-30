import { rotateGeometry } from "../inventory/geometry.ts";
import type { Rotation } from "../inventory/types.ts";
import type { OptimizedLayout, OptimizedPlacement } from "../optimizer/api/types.ts";
import type { CatalogItemView } from "./catalog-types.ts";

export interface OccupiedCellRef {
  instanceId: string;
  itemId: string;
  origin: boolean;
  rotation: number;
}

export interface GridCellModel {
  row: number;
  col: number;
  bags: OccupiedCellRef[];
  items: OccupiedCellRef[];
  stars: Array<{ instanceId: string; itemId: string }>;
}

export interface ResolvedPlacementCells {
  instanceId: string;
  itemId: string;
  rotation: number;
  cells: Array<{ row: number; col: number }>;
  stars: Array<{ row: number; col: number }>;
}

/** Bounding box of occupied `geometry.cells` after rotateGeometry + placement. */
export interface PlacementFootprint extends ResolvedPlacementCells {
  minRow: number;
  minCol: number;
  maxRow: number;
  maxCol: number;
  bboxRows: number;
  bboxCols: number;
}

const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270];

export function asRotation(value: number): Rotation {
  return (ROTATIONS.includes(value as Rotation) ? value : 0) as Rotation;
}

/** Visualize catalog geometry at the production placement. Does not search or score. */
export function cellsForPlacement(
  item: CatalogItemView,
  placement: OptimizedPlacement,
): ResolvedPlacementCells {
  const rotation = asRotation(placement.rotation);
  const rotated = rotateGeometry(item.geometry, rotation);
  return {
    instanceId: placement.instanceId,
    itemId: placement.itemId,
    rotation,
    cells: rotated.cells.map(([row, col]) => ({
      row: placement.row + row,
      col: placement.col + col,
    })),
    stars: rotated.stars.map(([row, col]) => ({
      row: placement.row + row,
      col: placement.col + col,
    })),
  };
}

export function footprintForPlacement(
  item: CatalogItemView,
  placement: OptimizedPlacement,
): PlacementFootprint | null {
  const resolved = cellsForPlacement(item, placement);
  if (resolved.cells.length === 0) return null;
  const minRow = Math.min(...resolved.cells.map((cell) => cell.row));
  const maxRow = Math.max(...resolved.cells.map((cell) => cell.row));
  const minCol = Math.min(...resolved.cells.map((cell) => cell.col));
  const maxCol = Math.max(...resolved.cells.map((cell) => cell.col));
  return {
    ...resolved,
    minRow,
    minCol,
    maxRow,
    maxCol,
    bboxRows: maxRow - minRow + 1,
    bboxCols: maxCol - minCol + 1,
  };
}

export function occupiedCellKeys(footprint: Pick<ResolvedPlacementCells, "cells">): Set<string> {
  return new Set(footprint.cells.map((cell) => `${cell.row}:${cell.col}`));
}

export function footprintFillsBbox(footprint: PlacementFootprint): boolean {
  return footprint.cells.length === footprint.bboxRows * footprint.bboxCols;
}

/** CSS mask so an overlay image covers only `geometry.cells`, not bbox holes. */
export function occupiedMaskStyle(footprint: PlacementFootprint): Record<string, string> | undefined {
  if (footprintFillsBbox(footprint)) return undefined;
  const { bboxRows, bboxCols, minRow, minCol, cells } = footprint;
  const layers = cells.map(() => "linear-gradient(#fff 0 0)");
  const sizes = cells.map(() => `${100 / bboxCols}% ${100 / bboxRows}%`);
  const positions = cells.map((cell) => {
    const localCol = cell.col - minCol;
    const localRow = cell.row - minRow;
    const x = bboxCols === 1 ? "0%" : `${(localCol / (bboxCols - 1)) * 100}%`;
    const y = bboxRows === 1 ? "0%" : `${(localRow / (bboxRows - 1)) * 100}%`;
    return `${x} ${y}`;
  });
  const image = layers.join(",");
  const size = sizes.join(",");
  const position = positions.join(",");
  return {
    WebkitMaskImage: image,
    maskImage: image,
    WebkitMaskSize: size,
    maskSize: size,
    WebkitMaskPosition: position,
    maskPosition: position,
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
  };
}

export function gridAreaStyle(footprint: PlacementFootprint): {
  gridColumn: string;
  gridRow: string;
} {
  return {
    gridColumn: `${footprint.minCol + 1} / ${footprint.maxCol + 2}`,
    gridRow: `${footprint.minRow + 1} / ${footprint.maxRow + 2}`,
  };
}

export function buildGridModel(
  layout: OptimizedLayout,
  catalog: Map<string, CatalogItemView>,
): GridCellModel[][] {
  const grid: GridCellModel[][] = [];
  for (let row = 0; row < layout.rows; row++) {
    const line: GridCellModel[] = [];
    for (let col = 0; col < layout.cols; col++) {
      line.push({ row, col, bags: [], items: [], stars: [] });
    }
    grid.push(line);
  }

  paintLayer(grid, layout, layout.bags, catalog, "bags");
  paintLayer(grid, layout, layout.items, catalog, "items");
  return grid;
}

function paintLayer(
  grid: GridCellModel[][],
  layout: OptimizedLayout,
  placements: OptimizedPlacement[],
  catalog: Map<string, CatalogItemView>,
  layer: "bags" | "items",
): void {
  for (const placement of placements) {
    const item = catalog.get(placement.itemId);
    if (!item) continue;
    const resolved = cellsForPlacement(item, placement);
    for (const cell of resolved.cells) {
      const target = cellAt(grid, layout, cell.row, cell.col);
      if (!target) continue;
      target[layer].push({
        instanceId: placement.instanceId,
        itemId: placement.itemId,
        origin: cell.row === placement.row && cell.col === placement.col,
        rotation: placement.rotation,
      });
    }
    for (const star of resolved.stars) {
      const target = cellAt(grid, layout, star.row, star.col);
      if (!target) continue;
      target.stars.push({ instanceId: placement.instanceId, itemId: placement.itemId });
    }
  }
}

function cellAt(
  grid: GridCellModel[][],
  layout: OptimizedLayout,
  row: number,
  col: number,
): GridCellModel | undefined {
  if (row < 0 || col < 0 || row >= layout.rows || col >= layout.cols) return undefined;
  return grid[row]?.[col];
}
