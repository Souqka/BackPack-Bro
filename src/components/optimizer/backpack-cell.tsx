"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { CatalogItemView } from "@/lib/ui/catalog-types.ts";
import type { OccupiedCellRef } from "@/lib/ui/placement-view.ts";
import { cn } from "@/lib/utils";

export function BackpackCell({
  row,
  col,
  bags,
  items,
  stars,
  catalog,
}: {
  row: number;
  col: number;
  bags: OccupiedCellRef[];
  items: OccupiedCellRef[];
  stars: Array<{ instanceId: string; itemId: string }>;
  catalog: Map<string, CatalogItemView>;
}) {
  const bag = bags[0];
  const item = items[0];
  const bagInfo = bag ? catalog.get(bag.itemId) : undefined;
  const itemInfo = item ? catalog.get(item.itemId) : undefined;
  const labelParts = [`Row ${row + 1}, column ${col + 1}`];
  if (bagInfo && bag) labelParts.push(`Bag ${bagInfo.name}, rotated ${bag.rotation} degrees`);
  if (itemInfo && item) labelParts.push(`Item ${itemInfo.name}, rotated ${item.rotation} degrees`);
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
        "relative aspect-square overflow-hidden rounded-[3px] border border-zinc-800 bg-zinc-950",
        bag && "bg-amber-800/45 border-amber-500/80",
        item && "border-sky-400/80 bg-sky-950/60",
      )}
    >
      {bagInfo?.icon && bag?.origin ? (
        <PlacedIcon item={bagInfo} rotation={bag.rotation} className="opacity-40" />
      ) : null}
      {itemInfo?.icon && item ? (
        <PlacedIcon item={itemInfo} rotation={item.rotation} className={item.origin ? "z-10" : "z-10 opacity-80"} />
      ) : null}
      {stars.length > 0 ? (
        <span className="absolute right-0.5 top-0.5 z-20 text-[10px] leading-none text-amber-300" aria-hidden>
          ★
        </span>
      ) : null}
      {itemInfo && item ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="absolute inset-0 z-30" />
          </TooltipTrigger>
          <TooltipContent>
            {itemInfo.name} ({item.instanceId}), {item.rotation}°
          </TooltipContent>
        </Tooltip>
      ) : bagInfo && bag ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="absolute inset-0 z-30" />
          </TooltipTrigger>
          <TooltipContent>
            {bagInfo.name} ({bag.instanceId}), {bag.rotation}°
          </TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}

function PlacedIcon({
  item,
  rotation,
  className,
}: {
  item: CatalogItemView;
  rotation: number;
  className?: string;
}) {
  if (!item.icon) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={item.icon}
      alt=""
      className={cn("absolute inset-0.5 h-[calc(100%-4px)] w-[calc(100%-4px)] object-contain", className)}
      style={{ transform: `rotate(${rotation}deg)` }}
    />
  );
}
