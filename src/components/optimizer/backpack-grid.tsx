"use client";

import { BackpackCell } from "@/components/optimizer/backpack-cell";
import type { CatalogItemView } from "@/lib/ui/catalog-types.ts";
import { GRID_COLS, GRID_ROWS } from "@/lib/ui/constants.ts";
import { buildGridModel } from "@/lib/ui/placement-view.ts";
import type { OptimizedLayout } from "@/lib/optimizer/api/types.ts";
import { cn } from "@/lib/utils";

export function BackpackGrid({
  layout,
  catalog,
}: {
  layout: OptimizedLayout | null;
  catalog: Map<string, CatalogItemView>;
}) {
  const rows = layout?.rows ?? GRID_ROWS;
  const cols = layout?.cols ?? GRID_COLS;
  const grid = layout
    ? buildGridModel(layout, catalog)
    : Array.from({ length: rows }, (_, row) =>
        Array.from({ length: cols }, (_, col) => ({
          row,
          col,
          bags: [],
          items: [],
          stars: [],
        })),
      );

  return (
    <div
      role="grid"
      aria-label={`Backpack grid ${rows} by ${cols}`}
      data-testid="backpack-grid"
      data-rows={rows}
      data-cols={cols}
      className={cn("grid w-full max-w-xl gap-0.5 rounded-lg border border-border bg-zinc-900 p-2")}
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {grid.flatMap((line) =>
        line.map((cell) => (
          <BackpackCell
            key={`${cell.row}:${cell.col}`}
            row={cell.row}
            col={cell.col}
            bags={cell.bags}
            items={cell.items}
            stars={cell.stars}
            catalog={catalog}
          />
        )),
      )}
    </div>
  );
}
