"use client";

import type { CatalogItemView } from "@/lib/ui/catalog-types.ts";
import { footprintBoxStyle, footprintForPlacement } from "@/lib/ui/placement-view.ts";
import type { OptimizedPlacement } from "@/lib/optimizer/api/types.ts";

export function ItemHoverLabel({
  placement,
  item,
}: {
  placement: OptimizedPlacement;
  item: CatalogItemView;
}) {
  const footprint = footprintForPlacement(item, placement);
  if (!footprint) return null;
  return (
    <div
      className="pointer-events-none flex items-start justify-center p-0.5"
      style={footprintBoxStyle(footprint)}
      data-testid="item-name-label"
      data-instance-id={placement.instanceId}
    >
      <span className="max-w-full truncate rounded bg-zinc-950/90 px-1.5 py-0.5 text-[10px] font-medium leading-tight text-zinc-50 shadow ring-1 ring-white/25">
        {item.name}
      </span>
    </div>
  );
}
