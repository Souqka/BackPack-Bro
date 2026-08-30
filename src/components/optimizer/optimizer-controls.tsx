"use client";

import type { Dispatch } from "react";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CatalogPicker } from "@/components/optimizer/catalog-picker";
import { QuantityStepper } from "@/components/optimizer/quantity-stepper";
import type { CatalogItemView } from "@/lib/ui/catalog-types.ts";
import { QUALITY_LABELS, RESULT_COUNT_CHOICES } from "@/lib/ui/constants.ts";
import { OPTIMIZER_EXAMPLES } from "@/lib/ui/examples.ts";
import type { OptimizerUiAction, OptimizerUiState } from "@/lib/ui/optimizer-state.ts";
import type { ProductionQuality } from "@/lib/optimizer/api/types.ts";

export function OptimizerControls({
  catalog,
  state,
  dispatch,
  busy,
  onOptimize,
}: {
  catalog: Map<string, CatalogItemView>;
  state: OptimizerUiState;
  dispatch: Dispatch<OptimizerUiAction>;
  busy: boolean;
  onOptimize: () => void;
}) {
  const bags = [...catalog.values()].filter((item) => item.isBag);
  const items = [...catalog.values()].filter((item) => !item.isBag);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Setup</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {OPTIMIZER_EXAMPLES.map((example) => (
            <Button
              key={example.id}
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => dispatch({ type: "LOAD_EXAMPLE", example })}
            >
              {example.label}
            </Button>
          ))}
        </div>

        <section className="space-y-2" aria-labelledby="bags-heading">
          <h3 id="bags-heading" className="text-sm font-medium">
            Bags
          </h3>
          <CatalogPicker
            items={bags}
            label="Bags"
            disabled={busy}
            onAdd={(itemId) => dispatch({ type: "ADD_BAG", itemId })}
          />
          <div className="space-y-2">
            {state.bags.length === 0 ? (
              <p className="text-xs text-muted-foreground">Add at least one bag to optimize.</p>
            ) : (
              state.bags.map((line) => {
                const item = catalog.get(line.itemId);
                if (!item) return null;
                return (
                  <QuantityStepper
                    key={line.itemId}
                    item={item}
                    quantity={line.quantity}
                    disabled={busy}
                    onChange={(quantity) =>
                      dispatch({ type: "SET_BAG_QUANTITY", itemId: line.itemId, quantity })
                    }
                  />
                );
              })
            )}
          </div>
        </section>

        <Separator />

        <section className="space-y-2" aria-labelledby="items-heading">
          <h3 id="items-heading" className="text-sm font-medium">
            Items
          </h3>
          <CatalogPicker
            items={items}
            label="Items"
            disabled={busy}
            onAdd={(itemId) => dispatch({ type: "ADD_ITEM", itemId })}
          />
          <div className="space-y-2">
            {state.items.length === 0 ? (
              <p className="text-xs text-muted-foreground">Optional. Duplicates are sent as separate instances.</p>
            ) : (
              state.items.map((line) => {
                const item = catalog.get(line.itemId);
                if (!item) return null;
                return (
                  <QuantityStepper
                    key={line.itemId}
                    item={item}
                    quantity={line.quantity}
                    disabled={busy}
                    onChange={(quantity) =>
                      dispatch({ type: "SET_ITEM_QUANTITY", itemId: line.itemId, quantity })
                    }
                  />
                );
              })
            )}
          </div>
        </section>

        <Separator />

        <div className="space-y-2">
          <Label id="quality-label">Quality</Label>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={state.quality}
            onValueChange={(value) => {
              if (value) dispatch({ type: "SET_QUALITY", quality: value as ProductionQuality });
            }}
            aria-labelledby="quality-label"
            className="justify-start"
          >
            {(["fast", "balanced", "high"] as const).map((quality) => (
              <ToggleGroupItem key={quality} value={quality} aria-label={QUALITY_LABELS[quality]}>
                {QUALITY_LABELS[quality]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div className="space-y-2">
          <Label id="results-label">Results</Label>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={String(state.resultCount)}
            onValueChange={(value) => {
              if (value) dispatch({ type: "SET_RESULT_COUNT", resultCount: Number(value) });
            }}
            aria-labelledby="results-label"
            className="justify-start"
          >
            {RESULT_COUNT_CHOICES.map((count) => (
              <ToggleGroupItem key={count} value={String(count)} aria-label={`${count} results`}>
                {count}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <Button type="button" className="w-full" disabled={busy} onClick={onOptimize}>
          {busy ? (
            <>
              <Loader2 className="animate-spin" />
              Optimizing...
            </>
          ) : (
            "Optimize Backpack"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
