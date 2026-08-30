"use client";

import type { CatalogItemView } from "@/lib/ui/catalog-types.ts";
import { synergyId } from "@/lib/ui/grid-interaction.ts";
import type { OptimizedStarActivation } from "@/lib/optimizer/api/types.ts";
import { cn } from "@/lib/utils";

export function SynergyItem({
  activation,
  catalog,
  selected,
  previewed = false,
  onPreview,
  onToggle,
}: {
  activation: OptimizedStarActivation;
  catalog: Map<string, CatalogItemView>;
  selected: boolean;
  previewed?: boolean;
  onPreview: (id: string | null) => void;
  onToggle: (id: string) => void;
}) {
  const id = synergyId(activation);
  const sourceName = catalog.get(activation.sourceItemId)?.name ?? activation.sourceItemId;
  const targetName = catalog.get(activation.targetItemId)?.name ?? activation.targetItemId;
  const label = `${sourceName} activates ${targetName}`;

  return (
    <button
      type="button"
      data-testid={`synergy-row-${id}`}
      data-synergy-id={id}
      data-source-instance={activation.sourceInstanceId}
      data-target-instance={activation.targetInstanceId}
      data-star-row={activation.row}
      data-star-col={activation.col}
      aria-label={label}
      aria-pressed={selected}
      data-previewed={previewed ? "true" : "false"}
      className={cn(
        "flex min-h-11 w-full flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left text-sm transition-colors",
        selected
          ? "border-primary bg-primary/15"
          : "border-border bg-secondary/40 hover:bg-secondary",
      )}
      onMouseEnter={() => onPreview(id)}
      onMouseLeave={() => onPreview(null)}
      onFocus={() => onPreview(id)}
      onBlur={() => onPreview(null)}
      onClick={() => onToggle(id)}
    >
      <span className="font-medium">
        ★ {sourceName}
      </span>
      <span className="text-xs text-muted-foreground">activates → {targetName}</span>
    </button>
  );
}
