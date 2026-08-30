"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OptimizedActiveStat } from "@/lib/optimizer/api/types.ts";

const STAT_ICONS: Record<string, string> = {
  luck: "⭐",
  health: "❤️",
  max_health: "❤️",
  poison: "☠",
  stamina: "⚡",
  armor: "🛡",
  mana: "💧",
  bleed: "🩸",
  burn: "🔥",
  haste: "💨",
  thorns: "🌿",
  regeneration: "✚",
  heal: "✚",
  deal_damage: "⚔",
  stun: "💫",
};

export function ActiveStats({ stats }: { stats: OptimizedActiveStat[] }) {
  return (
    <Card data-testid="active-stats">
      <CardHeader>
        <CardTitle>Active Stats</CardTitle>
      </CardHeader>
      <CardContent>
        {stats.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="active-stats-empty">
            No activated star effects in this layout.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {stats.map((stat) => (
              <li
                key={stat.id}
                data-testid={`active-stat-${stat.id}`}
                data-stat-id={stat.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 text-sm"
              >
                <span aria-hidden>{STAT_ICONS[stat.id] ?? "✦"}</span>
                <span>{stat.name}</span>
                {stat.value !== undefined ? (
                  <span className="tabular-nums text-muted-foreground">{stat.value}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
