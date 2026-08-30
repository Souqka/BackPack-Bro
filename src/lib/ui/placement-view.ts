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
