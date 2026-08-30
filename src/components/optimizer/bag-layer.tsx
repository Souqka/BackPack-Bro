"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { bagColorForItemId } from "@/lib/ui/bag-color.ts";
import type { CatalogItemView } from "@/lib/ui/catalog-types.ts";
import {
  footprintForPlacement,
  gridAreaStyle,
  occupiedCellKeys,
  type PlacementFootprint,
} from "@/lib/ui/placement-view.ts";
import type { OptimizedLayout, OptimizedPlacement } from "@/lib/optimizer/api/types.ts";
import { cn } from "@/lib/utils";

export function BagLayer({
  layout,
  catalog,
  emphasize,
}: {
  layout: OptimizedLayout;
  catalog: Map<string, CatalogItemView>;
  emphasize: boolean;
}) {
  return (
    <>
      {layout.bags.map((placement) => {
        const item = catalog.get(placement.itemId);
        if (!item) return null;
        const footprint = footprintForPlacement(item, placement);
        if (!footprint) return null;
        return (
          <BagFootprint
            key={placement.instanceId}
            placement={placement}
            item={item}
            footprint={footprint}
            emphasize={emphasize}
          />
        );
      })}
    </>
  );
}

export function BagFootprint({
  placement,
  item,
  footprint,
  emphasize,
}: {
  placement: OptimizedPlacement;
  item: CatalogItemView;
  footprint: PlacementFootprint;
  emphasize: boolean;
}) {
  const color = bagColorForItemId(item.id);
  const occupied = occupiedCellKeys(footprint);
  const name = item.name;
  const cells: Array<{ row: number; col: number; localRow: number; localCol: number }> = [];
  for (let localRow = 0; localRow < footprint.bboxRows; localRow++) {
    for (let localCol = 0; localCol < footprint.bboxCols; localCol++) {
      const row = footprint.minRow + localRow;
      const col = footprint.minCol + localCol;
      if (!occupied.has(`${row}:${col}`)) continue;
      cells.push({ row, col, localRow, localCol });
    }
  }

  return (
    <div
      role="group"
      aria-label={name}
      title={name}
      data-testid={`bag-footprint-${placement.instanceId}`}
      data-instance-id={placement.instanceId}
      data-item-id={placement.itemId}
      data-bag-name={name}
      className="relative z-[1] min-h-0 min-w-0"
      style={{
        ...gridAreaStyle(footprint),
        display: "grid",
        gridTemplateColumns: `repeat(${footprint.bboxCols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${footprint.bboxRows}, minmax(0, 1fr))`,
        gap: "inherit",
      }}
    >
      {cells.map((cell) => {
        const north = occupied.has(`${cell.row - 1}:${cell.col}`);
        const south = occupied.has(`${cell.row + 1}:${cell.col}`);
        const west = occupied.has(`${cell.row}:${cell.col - 1}`);
        const east = occupied.has(`${cell.row}:${cell.col + 1}`);
        const width = emphasize ? 2 : 1;
        return (
          <Tooltip key={`${cell.row}:${cell.col}`}>
            <TooltipTrigger asChild>
              <div
                title={name}
                aria-label={name}
                data-bag-cell={`${cell.row}:${cell.col}`}
                className={cn("min-h-0 min-w-0 rounded-[2px]")}
                style={{
                  gridColumn: cell.localCol + 1,
                  gridRow: cell.localRow + 1,
                  backgroundColor: color.fill,
                  borderColor: color.border,
                  borderStyle: "solid",
                  borderTopWidth: north ? 0 : width,
                  borderBottomWidth: south ? 0 : width,
                  borderLeftWidth: west ? 0 : width,
                  borderRightWidth: east ? 0 : width,
                }}
              />
            </TooltipTrigger>
            <TooltipContent>{name}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
