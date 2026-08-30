"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CatalogItemView } from "@/lib/ui/catalog-types.ts";

export function QuantityStepper({
  item,
  quantity,
  onChange,
  disabled,
}: {
  item: CatalogItemView;
  quantity: number;
  onChange: (quantity: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-2 py-1.5">
      {item.icon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.icon} alt="" className="h-8 w-8 object-contain" />
      ) : (
        <div className="h-8 w-8 rounded bg-muted" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.name}</p>
        <p className="truncate text-xs capitalize text-muted-foreground">{item.rarity}</p>
      </div>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label={`Decrease ${item.name}`}
          disabled={disabled}
          onClick={() => onChange(quantity - 1)}
        >
          <Minus />
        </Button>
        <span className="w-6 text-center text-sm tabular-nums" aria-live="polite">
          {quantity}
        </span>
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label={`Increase ${item.name}`}
          disabled={disabled}
          onClick={() => onChange(quantity + 1)}
        >
          <Plus />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={`Remove ${item.name}`}
          disabled={disabled}
          onClick={() => onChange(0)}
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  );
}
