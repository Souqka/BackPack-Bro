/**
 * Aggregate catalog `abilities.initial` from placed Bags only.
 * Does not run Placement Engine, Scoring Engine, or Adaptive Search.
 */

import type { Item } from "../../inventory/types.ts";
import { classifyEffect } from "../../scoring/rules.ts";
import type { OptimizerLayout } from "../search-types.ts";
import { presentNormalizedEffect } from "./active-stats.ts";
import type { OptimizedActiveStat } from "./types.ts";

export function extractBagBonuses(
  layout: OptimizerLayout,
  catalog: Map<string, Item>,
): OptimizedActiveStat[] {
  const aggregated = new Map<string, { name: string; sum: number; hasValue: boolean }>();

  for (const bag of layout.bags) {
    const source = catalog.get(bag.itemId);
    if (!source) continue;
    for (const ability of source.abilities.initial) {
      for (const wrapped of ability.effects) {
        if (classifyEffect(wrapped.effect) !== "normalized") continue;
        const presented = presentNormalizedEffect(wrapped.effect);
        if (!presented) continue;
        if (presented.value === 0) continue;
        const existing = aggregated.get(presented.id);
        if (!existing) {
          aggregated.set(presented.id, {
            name: presented.name,
            sum: presented.value ?? 0,
            hasValue: presented.value !== undefined,
          });
          continue;
        }
        if (existing.hasValue && presented.value !== undefined) {
          existing.sum += presented.value;
        } else if (presented.value === undefined) {
          existing.hasValue = false;
        }
      }
    }
  }

  return [...aggregated.entries()].map(([id, entry]) => {
    const stat: OptimizedActiveStat = { id, name: entry.name };
    if (entry.hasValue) stat.value = entry.sum;
    return stat;
  });
}
