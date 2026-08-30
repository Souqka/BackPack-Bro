"use client";

import { useState } from "react";
import { BackpackCell } from "@/components/optimizer/backpack-cell";
import { BagLayer } from "@/components/optimizer/bag-layer";
import { ItemHoverLabel } from "@/components/optimizer/item-hover-label";
import { ItemLayer } from "@/components/optimizer/item-layer";
import { ItemOutlineLayer } from "@/components/optimizer/item-outline-layer";
import { StarMarker } from "@/components/optimizer/star-marker";
import { SynergyHighlightLayer } from "@/components/optimizer/synergy-highlight-layer";
import type { CatalogItemView } from "@/lib/ui/catalog-types.ts";
import { GRID_COLS, GRID_ROWS } from "@/lib/ui/constants.ts";
import { resolveItemVisualRole, type ItemVisualRole } from "@/lib/ui/grid-interaction.ts";
import { defaultGridViewOptions, type GridViewOptions } from "@/lib/ui/optimizer-state.ts";
import { buildGridModel, footprintForPlacement } from "@/lib/ui/placement-view.ts";
import type { OptimizedLayout, OptimizedStarActivation } from "@/lib/optimizer/api/types.ts";
import { cn } from "@/lib/utils";
import type { CSSProperties } from "react";

export function BackpackGrid({
  layout,
  catalog,
  view = defaultGridViewOptions,
  hoveredInstanceId,
  onHoverInstance,
  activeSynergy = null,
}: {
  layout: OptimizedLayout | null;
  catalog: Map<string, CatalogItemView>;
  view?: GridViewOptions;
  hoveredInstanceId?: string | null;
  onHoverInstance?: (instanceId: string | null) => void;
  activeSynergy?: OptimizedStarActivation | null;
}) {
  const rows = layout?.rows ?? GRID_ROWS;
  const cols = layout?.cols ?? GRID_COLS;
  const [internalHover, setInternalHover] = useState<string | null>(null);
  const hoverEnabled = view.showItems;
  const hovered =
    hoverEnabled ? (hoveredInstanceId !== undefined ? hoveredInstanceId : internalHover) : null;

  const setHovered = (instanceId: string | null) => {
    onHoverInstance?.(instanceId);
    if (hoveredInstanceId === undefined) setInternalHover(instanceId);
  };

  const grid = layout
    ? buildGridModel(layout, catalog)
    : Array.from({ length: rows }, (_, row) =>
        Array.from({ length: cols }, (_, col) => ({
          row,
          col,
          bags: [],
          items: [],
          stars: [],
        })),
      );

  const hoveredPlacement = layout?.items.find((item) => item.instanceId === hovered) ?? null;
  const hoveredItem = hoveredPlacement ? catalog.get(hoveredPlacement.itemId) : undefined;
  const hoveredFootprint =
    hoveredPlacement && hoveredItem ? footprintForPlacement(hoveredItem, hoveredPlacement) : null;

  const itemRole = (instanceId: string): ItemVisualRole =>
    resolveItemVisualRole(instanceId, activeSynergy, hovered);

  const boardStyle = {
    "--grid-cols": cols,
    "--grid-rows": rows,
  } as CSSProperties;

  return (
    <div
      role="grid"
      aria-label={`Backpack grid ${rows} by ${cols}`}
      data-testid="backpack-grid"
      data-rows={rows}
      data-cols={cols}
      data-show-items={view.showItems ? "true" : "false"}
      data-show-bags={view.showBags ? "true" : "false"}
      data-show-outlines={view.showItemOutlines ? "true" : "false"}
      data-hovered-instance={hovered ?? undefined}
      data-active-synergy={activeSynergy ? "true" : "false"}
      className={cn("backpack-board")}
      style={boardStyle}
    >
      <div
        className="grid"
        data-testid="backpack-cells"
        style={{
          gridTemplateColumns: `repeat(${cols}, var(--cell-size))`,
          gridTemplateRows: `repeat(${rows}, var(--cell-size))`,
        }}
      >
        {grid.flatMap((line) =>
          line.map((cell) => (
            <BackpackCell
              key={`${cell.row}:${cell.col}`}
              row={cell.row}
              col={cell.col}
              bags={cell.bags}
              items={cell.items}
              stars={cell.stars}
            />
          )),
        )}
      </div>
      {layout && view.showBags ? (
        <div className="backpack-layer z-0" data-testid="bag-layer">
          <BagLayer layout={layout} catalog={catalog} emphasize={!view.showItems} />
        </div>
      ) : null}
      {layout && view.showItems ? (
        <div className="backpack-layer z-[1]" data-testid="item-layer">
          <ItemLayer
            layout={layout}
            catalog={catalog}
            hoveredInstanceId={hovered}
            onHoverInstance={setHovered}
            itemRole={itemRole}
          />
        </div>
      ) : null}
      {layout && view.showItemOutlines ? (
        <div className="backpack-layer z-[2]" data-testid="item-outline-layer">
          <ItemOutlineLayer layout={layout} catalog={catalog} />
        </div>
      ) : null}
      {layout && activeSynergy ? (
        <div className="backpack-layer z-[3]" data-testid="synergy-layer">
          <SynergyHighlightLayer layout={layout} catalog={catalog} synergy={activeSynergy} />
        </div>
      ) : null}
      {activeSynergy ? (
        <div className="backpack-layer z-[4]" data-testid="hover-stars">
          <StarMarker
            row={activeSynergy.row}
            col={activeSynergy.col}
            instanceId={activeSynergy.sourceInstanceId}
            emphasized
          />
        </div>
      ) : hoveredFootprint && hoveredPlacement ? (
        <div className="backpack-layer z-[4]" data-testid="hover-stars">
          {hoveredFootprint.stars.map((star) => (
            <StarMarker
              key={`${hoveredPlacement.instanceId}:${star.row}:${star.col}`}
              row={star.row}
              col={star.col}
              instanceId={hoveredPlacement.instanceId}
            />
          ))}
        </div>
      ) : null}
      {hoveredPlacement && hoveredItem && !activeSynergy ? (
        <div className="backpack-layer z-[5]" data-testid="hover-name">
          <ItemHoverLabel placement={hoveredPlacement} item={hoveredItem} />
        </div>
      ) : null}
    </div>
  );
}
