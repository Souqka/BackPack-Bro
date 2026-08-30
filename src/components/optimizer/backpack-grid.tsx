"use client";

import { BackpackCell } from "@/components/optimizer/backpack-cell";
import { BagLayer } from "@/components/optimizer/bag-layer";
import { ItemLayer } from "@/components/optimizer/item-layer";
import { StarMarker } from "@/components/optimizer/star-marker";
import type { CatalogItemView } from "@/lib/ui/catalog-types.ts";
import { GRID_COLS, GRID_ROWS } from "@/lib/ui/constants.ts";
import { buildGridModel } from "@/lib/ui/placement-view.ts";
import type { OptimizedLayout } from "@/lib/optimizer/api/types.ts";
import { cn } from "@/lib/utils";

export function BackpackGrid({
  layout,
  catalog,
  bagsOnly = false,
}: {
  layout: OptimizedLayout | null;
  catalog: Map<string, CatalogItemView>;
  bagsOnly?: boolean;
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

  const stars = bagsOnly
    ? []
    : grid.flatMap((line) =>
        line.flatMap((cell) =>
          cell.stars.map((star) => ({
            row: cell.row,
            col: cell.col,
            instanceId: star.instanceId,
          })),
        ),
      );

  return (
    <div
      role="grid"
      aria-label={`Backpack grid ${rows} by ${cols}`}
      data-testid="backpack-grid"
      data-rows={rows}
      data-cols={cols}
      data-bags-only={bagsOnly ? "true" : "false"}
      className={cn("relative grid w-full min-w-0 max-w-xl gap-0.5 rounded-lg border border-border bg-zinc-900 p-2")}
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
      }}
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
          />
        )),
      )}
      {layout ? <BagLayer layout={layout} catalog={catalog} emphasize={bagsOnly} /> : null}
      {layout && !bagsOnly ? <ItemLayer layout={layout} catalog={catalog} /> : null}
      {stars.map((star) => (
        <StarMarker
          key={`${star.instanceId}:${star.row}:${star.col}`}
          row={star.row}
          col={star.col}
          instanceId={star.instanceId}
        />
      ))}
    </div>
  );
}
