"use client";

import { PlacedItem } from "@/components/optimizer/placed-item";
import type { CatalogItemView } from "@/lib/ui/catalog-types.ts";
import type { OptimizedLayout } from "@/lib/optimizer/api/types.ts";

export function ItemLayer({
  layout,
  catalog,
  hoveredInstanceId,
  onHoverInstance,
}: {
  layout: OptimizedLayout;
  catalog: Map<string, CatalogItemView>;
  hoveredInstanceId: string | null;
  onHoverInstance: (instanceId: string | null) => void;
}) {
  return (
    <>
      {layout.items.map((placement) => {
        const item = catalog.get(placement.itemId);
        if (!item) return null;
        return (
          <PlacedItem
            key={placement.instanceId}
            placement={placement}
            item={item}
            hovered={hoveredInstanceId === placement.instanceId}
            onHover={onHoverInstance}
          />
        );
      })}
    </>
  );
}
