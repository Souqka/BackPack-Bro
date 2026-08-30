"use client";

import type { OccupiedCellRef } from "@/lib/ui/placement-view.ts";
import { cn } from "@/lib/utils";

export function BackpackCell({
  row,
  col,
  bags,
  items,
  stars,
}: {
  row: number;
  col: number;
  bags: OccupiedCellRef[];
  items: OccupiedCellRef[];
  stars: Array<{ instanceId: string; itemId: string }>;
}) {
  const bag = bags[0];
  const item = items[0];
  const labelParts = [`Row ${row + 1}, column ${col + 1}`];
  if (bag) labelParts.push(`Bag instance ${bag.instanceId}, rotated ${bag.rotation} degrees`);
  if (item) labelParts.push(`Item instance ${item.instanceId}, rotated ${item.rotation} degrees`);
  if (stars.length > 0) labelParts.push("Star overlay");

  return (
    <div
      role="gridcell"
      data-testid={`cell-${row}-${col}`}
      data-row={row}
      data-col={col}
      data-bag-instance={bag?.instanceId}
      data-item-instance={item?.instanceId}
      data-bag-rotation={bag?.rotation}
      data-item-rotation={item?.rotation}
      aria-label={labelParts.join(". ")}
      className={cn(
        "pointer-events-none relative z-0 aspect-square overflow-hidden rounded-[3px] border border-zinc-800 bg-zinc-950",
      )}
    />
  );
}
