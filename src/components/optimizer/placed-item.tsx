"use client";

import type { CatalogItemView } from "@/lib/ui/catalog-types.ts";
import {
  footprintForPlacement,
  footprintBoxStyle,
  occupiedMaskStyle,
  type PlacementFootprint,
} from "@/lib/ui/placement-view.ts";
import type { ItemVisualRole } from "@/lib/ui/grid-interaction.ts";
import type { OptimizedPlacement } from "@/lib/optimizer/api/types.ts";
import { cn } from "@/lib/utils";

export function PlacedItem({
  placement,
  item,
  hovered = false,
  role = "normal",
  onHover,
}: {
  placement: OptimizedPlacement;
  item: CatalogItemView;
  hovered?: boolean;
  role?: ItemVisualRole;
  onHover?: (instanceId: string | null) => void;
}) {
  const footprint = footprintForPlacement(item, placement);
  if (!footprint) return null;
  return (
    <PlacedItemVisual
      placement={placement}
      item={item}
      footprint={footprint}
      hovered={hovered}
      role={role}
      onHover={onHover}
    />
  );
}

function PlacedItemVisual({
  placement,
  item,
  footprint,
  hovered,
  role,
  onHover,
}: {
  placement: OptimizedPlacement;
  item: CatalogItemView;
  footprint: PlacementFootprint;
  hovered: boolean;
  role: ItemVisualRole;
  onHover?: (instanceId: string | null) => void;
}) {
  const mask = occupiedMaskStyle(footprint);
  const name = item.name;

  return (
    <div
      role="img"
      aria-label={name}
      data-testid={`placed-item-${placement.instanceId}`}
      data-instance-id={placement.instanceId}
      data-item-id={placement.itemId}
      data-rotation={placement.rotation}
      data-hovered={hovered ? "true" : "false"}
      data-visual-role={role}
      data-min-row={footprint.minRow}
      data-min-col={footprint.minCol}
      data-max-row={footprint.maxRow}
      data-max-col={footprint.maxCol}
      data-bbox-cols={footprint.bboxCols}
      data-bbox-rows={footprint.bboxRows}
      data-cell-count={footprint.cells.length}
      data-irregular={mask ? "true" : "false"}
      className={cn(
        "cursor-pointer overflow-hidden",
        role === "hovered" && "brightness-125 drop-shadow-[0_0_8px_rgba(255,255,255,0.45)]",
        role === "source" && "brightness-110 drop-shadow-[0_0_8px_rgba(125,211,252,0.7)]",
        role === "target" && "brightness-125 drop-shadow-[0_0_10px_rgba(252,211,77,0.8)]",
        role === "dimmed" && "opacity-40",
      )}
      style={{ ...footprintBoxStyle(footprint), pointerEvents: "auto" }}
      onMouseEnter={() => onHover?.(placement.instanceId)}
      onMouseLeave={() => onHover?.(null)}
    >
      {item.icon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.icon}
          alt=""
          className={cn("pointer-events-none h-full w-full object-contain")}
          style={{
            transform: `rotate(${placement.rotation}deg)`,
            ...mask,
          }}
        />
      ) : (
        <span className="pointer-events-none block h-full w-full bg-sky-950/80" />
      )}
    </div>
  );
}
