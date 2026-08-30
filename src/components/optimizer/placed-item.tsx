"use client";

import type { CatalogItemView } from "@/lib/ui/catalog-types.ts";
import {
  footprintForPlacement,
  gridAreaStyle,
  occupiedMaskStyle,
  type PlacementFootprint,
} from "@/lib/ui/placement-view.ts";
import type { OptimizedPlacement } from "@/lib/optimizer/api/types.ts";
import { cn } from "@/lib/utils";

export function PlacedItem({
  placement,
  item,
}: {
  placement: OptimizedPlacement;
  item: CatalogItemView;
}) {
  const footprint = footprintForPlacement(item, placement);
  if (!footprint) return null;
  return <PlacedItemVisual placement={placement} item={item} footprint={footprint} />;
}

function PlacedItemVisual({
  placement,
  item,
  footprint,
}: {
  placement: OptimizedPlacement;
  item: CatalogItemView;
  footprint: PlacementFootprint;
}) {
  const mask = occupiedMaskStyle(footprint);
  const name = item.name;

  return (
    <div
      role="img"
      aria-label={name}
      title={name}
      data-testid={`placed-item-${placement.instanceId}`}
      data-instance-id={placement.instanceId}
      data-item-id={placement.itemId}
      data-rotation={placement.rotation}
      data-min-row={footprint.minRow}
      data-min-col={footprint.minCol}
      data-max-row={footprint.maxRow}
      data-max-col={footprint.maxCol}
      data-cell-count={footprint.cells.length}
      data-irregular={mask ? "true" : "false"}
      className="pointer-events-none relative z-[2] min-h-0 min-w-0 overflow-hidden"
      style={gridAreaStyle(footprint)}
    >
      {item.icon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.icon}
          alt=""
          className={cn("h-full w-full object-contain p-0.5")}
          style={{
            transform: `rotate(${placement.rotation}deg)`,
            ...mask,
          }}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center px-1 text-center text-[10px] leading-tight text-sky-100">
          {name}
        </span>
      )}
    </div>
  );
}
