"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OptimizedActiveStat } from "@/lib/optimizer/api/types.ts";

function formatValue(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

export function BagBonuses({ bonuses }: { bonuses: OptimizedActiveStat[] }) {
  if (bonuses.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="bag-bonuses-empty">
        No active backpack bonuses
      </p>
    );
  }

  return (
    <Card data-testid="bag-bonuses">
      <CardHeader>
        <CardTitle>Backpack Bonuses</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1 text-sm">
          {bonuses.map((stat) => (
            <li
              key={stat.id}
              data-testid={`bag-bonus-${stat.id}`}
              data-stat-id={stat.id}
              className="flex items-center justify-between gap-3"
            >
              <span>{stat.name}</span>
              {stat.value !== undefined ? (
                <span className="tabular-nums text-muted-foreground">{formatValue(stat.value)}</span>
              ) : null}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
