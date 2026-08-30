/**
 * Map already-scored star activations onto a compact Active Stats list.
 * Does not re-run Placement Engine or Scoring Engine.
 */

import type { Effect } from "../../../../scripts/wiki-parser/types/effects.ts";
import type { InventoryState, Item } from "../../inventory/types.ts";
import { getBoundInventoryAnalysis } from "../../scoring/analysis-bind.ts";
import { buildPlacementFacts, classifyEffect } from "../../scoring/rules.ts";
import type { PlacementScore } from "../../scoring/types.ts";
import type { OptimizerLayout } from "../search-types.ts";
import type { OptimizedActiveStat } from "./types.ts";

export function extractActiveStats(
  score: PlacementScore,
  layout: OptimizerLayout,
  catalog: Map<string, Item>,
  rows: number,
  cols: number,
): OptimizedActiveStat[] {
  if (!score.valid) return [];
  const analysis = getBoundInventoryAnalysis(score);
  if (!analysis) return [];

  const state: InventoryState = {
    inventory: { rows, cols },
    items: layout.items,
  };
  const facts = buildPlacementFacts(analysis, state, catalog);
  const aggregated = new Map<string, { name: string; sum: number; hasValue: boolean }>();

  for (const fact of facts.activeStars) {
    const source = catalog.get(fact.sourceItemId);
    if (!source?.star) continue;
    for (const ruleIndex of fact.matchingRuleIndexes) {
      const rule = source.star.rules[ruleIndex];
      if (!rule) continue;
      for (const wrapped of rule.effects) {
        if (classifyEffect(wrapped.effect) !== "normalized") continue;
        const presented = presentNormalizedEffect(wrapped.effect);
        if (!presented) continue;
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
        } else {
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

function presentNormalizedEffect(effect: Effect): { id: string; name: string; value?: number } | null {
  switch (effect.type) {
    case "gain":
    case "inflict":
    case "cleanse":
    case "remove":
    case "steal":
    case "spend":
    case "lose":
      return { id: effect.status, name: displayName(effect.status), value: effect.value };
    case "modify_stat":
      return { id: effect.stat, name: displayName(effect.stat), value: effect.value };
    case "heal":
      return { id: "heal", name: "Heal", value: effect.value };
    case "deal_damage":
      return { id: "deal_damage", name: "Damage", value: effect.value };
    case "reduce":
      return { id: `reduce:${effect.what}`, name: displayName(effect.what), value: effect.value };
    case "block_damage":
      return { id: "block_damage", name: "Block Damage", value: effect.value };
    case "stun":
      return { id: "stun", name: "Stun", value: effect.seconds };
    case "extra_attack":
      return { id: "extra_attack", name: "Extra Attack" };
    default:
      return null;
  }
}

function displayName(slug: string): string {
  return slug
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
