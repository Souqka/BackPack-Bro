"use client";

import { SynergyItem } from "@/components/optimizer/synergy-item";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CatalogItemView } from "@/lib/ui/catalog-types.ts";
import { synergyId, toggleSynergySelection } from "@/lib/ui/grid-interaction.ts";
import type { OptimizerExplanation } from "@/lib/optimizer/api/types.ts";

export function ActiveSynergies({
  explanation,
  catalog,
  previewSynergyId,
  selectedSynergyId,
  onPreview,
  onSelect,
}: {
  explanation: OptimizerExplanation | undefined;
  catalog: Map<string, CatalogItemView>;
  previewSynergyId: string | null;
  selectedSynergyId: string | null;
  onPreview: (id: string | null) => void;
  onSelect: (id: string | null) => void;
}) {
  const activations = explanation?.activatedStars ?? [];
  if (activations.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="active-synergies-empty">
        No active Star synergies
      </p>
    );
  }

  return (
    <Card data-testid="active-synergies">
      <CardHeader>
        <CardTitle>Active Synergies</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {activations.map((activation) => {
            const id = synergyId(activation);
            return (
              <li key={id}>
                <SynergyItem
                  activation={activation}
                  catalog={catalog}
                  selected={selectedSynergyId === id}
                  previewed={previewSynergyId === id}
                  onPreview={onPreview}
                  onToggle={(clicked) => onSelect(toggleSynergySelection(selectedSynergyId, clicked))}
                />
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
