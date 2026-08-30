"use client";

import { Toggle } from "@/components/ui/toggle";
import type { GridViewOptions } from "@/lib/ui/optimizer-state.ts";

const OPTIONS: Array<{ key: keyof GridViewOptions; label: string; testId: string }> = [
  { key: "showItems", label: "Items", testId: "view-toggle-items" },
  { key: "showBags", label: "Bags", testId: "view-toggle-bags" },
  { key: "showItemOutlines", label: "Item outlines", testId: "view-toggle-outlines" },
];

export function ViewToggles({
  view,
  onChange,
}: {
  view: GridViewOptions;
  onChange: (option: keyof GridViewOptions, value: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5" data-testid="view-toggles">
      <p className="text-xs font-medium text-muted-foreground">View</p>
      <div className="flex flex-wrap gap-1">
        {OPTIONS.map((option) => (
          <Toggle
            key={option.key}
            variant="outline"
            size="sm"
            pressed={view[option.key]}
            onPressedChange={(pressed) => onChange(option.key, pressed)}
            aria-label={option.label}
            data-testid={option.testId}
            data-pressed={view[option.key] ? "true" : "false"}
          >
            {option.label}
          </Toggle>
        ))}
      </div>
    </div>
  );
}
