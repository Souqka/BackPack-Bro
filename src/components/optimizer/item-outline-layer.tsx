"use client";

import type { CatalogItemView } from "@/lib/ui/catalog-types.ts";
import {
  footprintBoxStyle,
  footprintForPlacement,
  perimeterEdges,
  perimeterEdgeStyle,
} from "@/lib/ui/placement-view.ts";
import type { OptimizedLayout } from "@/lib/optimizer/api/types.ts";

export function ItemOutlineLayer({
  layout,
  catalog,
}: {
  layout: OptimizedLayout;
  catalog: Map<string, CatalogItemView>;
}) {
  return (
    <>
      {layout.items.map((placement) => {
        const item = catalog.get(placement.itemId);
        if (!item) return null;
        const footprint = footprintForPlacement(item, placement);
        if (!footprint) return null;
        const edges = perimeterEdges(footprint.cells);
        return (
          <div
            key={placement.instanceId}
            className="pointer-events-none"
            data-testid={`item-outline-${placement.instanceId}`}
            data-instance-id={placement.instanceId}
            data-edge-count={edges.length}
            style={footprintBoxStyle(footprint)}
          >
            {edges.map((edge) => (
              <span
                key={`${edge.row}:${edge.col}:${edge.side}`}
                data-edge={edge.side}
                data-edge-row={edge.row}
                data-edge-col={edge.col}
                style={perimeterEdgeStyle(edge, footprint.minRow, footprint.minCol)}
              />
            ))}
          </div>
        );
      })}
    </>
  );
}
