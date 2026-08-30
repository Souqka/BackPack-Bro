"use client";

import type { CatalogItemView } from "@/lib/ui/catalog-types.ts";
import { footprintBoxStyle, footprintForPlacement } from "@/lib/ui/placement-view.ts";
import type { OptimizedLayout, OptimizedStarActivation } from "@/lib/optimizer/api/types.ts";
import { cn } from "@/lib/utils";

export function SynergyHighlightLayer({
  layout,
  catalog,
  synergy,
}: {
  layout: OptimizedLayout;
  catalog: Map<string, CatalogItemView>;
  synergy: OptimizedStarActivation;
}) {
  return (
    <div className="pointer-events-none" data-testid="synergy-highlight-layer">
      <RoleHighlight
        layout={layout}
        catalog={catalog}
        instanceId={synergy.sourceInstanceId}
        role="source"
        label="Source"
      />
      <RoleHighlight
        layout={layout}
        catalog={catalog}
        instanceId={synergy.targetInstanceId}
        role="target"
        label="Activates"
      />
    </div>
  );
}

function RoleHighlight({
  layout,
  catalog,
  instanceId,
  role,
  label,
}: {
  layout: OptimizedLayout;
  catalog: Map<string, CatalogItemView>;
  instanceId: string;
  role: "source" | "target";
  label: string;
}) {
  const placement = layout.items.find((item) => item.instanceId === instanceId);
  if (!placement) return null;
  const item = catalog.get(placement.itemId);
  if (!item) return null;
  const footprint = footprintForPlacement(item, placement);
  if (!footprint) return null;
  return (
    <div
      data-testid={`synergy-${role}-${instanceId}`}
      data-synergy-role={role}
      data-instance-id={instanceId}
      className={cn(
        "pointer-events-none box-border rounded-sm",
        role === "source" && "ring-2 ring-sky-300/90 ring-offset-0",
        role === "target" && "ring-2 ring-amber-300 ring-offset-0",
      )}
      style={footprintBoxStyle(footprint)}
    >
      <span
        className={cn(
          "absolute left-0.5 top-0.5 rounded px-1 py-px text-[9px] font-medium leading-tight text-zinc-950",
          role === "source" && "bg-sky-300",
          role === "target" && "bg-amber-300",
        )}
      >
        {label}
      </span>
    </div>
  );
}
