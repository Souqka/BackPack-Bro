"use client";

import { PlacedItem } from "@/components/optimizer/placed-item";
import type { CatalogItemView } from "@/lib/ui/catalog-types.ts";
import type { ItemVisualRole } from "@/lib/ui/grid-interaction.ts";
import type { OptimizedLayout } from "@/lib/optimizer/api/types.ts";

export function ItemLayer({
  layout,
  catalog,
  hoveredInstanceId,
  onHoverInstance,
  itemRole,
}: {
  layout: OptimizedLayout;
  catalog: Map<string, CatalogItemView>;
  hoveredInstanceId: string | null;
  onHoverInstance: (instanceId: string | null) => void;
  itemRole?: (instanceId: string) => ItemVisualRole;
}) {
  return (
    <>
      {layout.items.map((placement) => {
        const item = catalog.get(placement.itemId);
        if (!item) return null;
        const role = itemRole?.(placement.instanceId) ?? (hoveredInstanceId === placement.instanceId ? "hovered" : "normal");
        return (
          <PlacedItem
            key={placement.instanceId}
            placement={placement}
            item={item}
            hovered={hoveredInstanceId === placement.instanceId}
            role={role}
            onHover={onHoverInstance}
          />
        );
      })}
    </>
  );
}
