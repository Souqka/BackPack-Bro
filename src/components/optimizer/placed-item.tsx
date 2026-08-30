"use client";

import type { CatalogItemView } from "@/lib/ui/catalog-types.ts";
import type { OptimizedPlacement } from "@/lib/optimizer/api/types.ts";

/** Named piece overlay metadata. Occupied cells are painted by BackpackGrid. */
export function PlacedItemLabel({
  placement,
  item,
}: {
  placement: OptimizedPlacement;
  item: CatalogItemView | undefined;
}) {
  const name = item?.name ?? placement.itemId;
  return (
    <span data-instance-id={placement.instanceId} data-rotation={placement.rotation}>
      {name}
    </span>
  );
}
