/**
 * Слой Fact: InventoryAnalysis → PlacementFacts.
 *
 * Не пересчитывает геометрию. Matching StarRule нужны только чтобы
 * scoring знал, какие эффекты относятся к уже активному overlap.
 */

import { matchingStarRuleIndexes } from "../inventory/activation.ts";
import type {
  InventoryAnalysis,
  InventoryState,
  Item,
  StarActivationResult,
} from "../inventory/types.ts";
import type { Effect } from "../../../scripts/wiki-parser/types/effects.ts";
import type {
  ActiveStarFact,
  EffectClassification,
  InactiveStarFact,
  PlacementFacts,
} from "./types.ts";

export function buildPlacementFacts(
  analysis: InventoryAnalysis,
  state: InventoryState,
  catalog: Map<string, Item>,
): PlacementFacts {
  const itemIdByInstance = new Map(state.items.map((placed) => [placed.instanceId, placed.itemId]));
  const activeStars: ActiveStarFact[] = [];
  const inactiveStars: InactiveStarFact[] = [];

  for (const activation of analysis.starActivations) {
    const sourceItemId = itemIdByInstance.get(activation.sourceInstanceId);
    const targetItemId = itemIdByInstance.get(activation.targetInstanceId);
    if (!sourceItemId || !targetItemId) continue;

    if (activation.active) {
      activeStars.push(toActiveFact(activation, sourceItemId, targetItemId, catalog));
    } else {
      inactiveStars.push({
        sourceInstanceId: activation.sourceInstanceId,
        sourceItemId,
        targetInstanceId: activation.targetInstanceId,
        targetItemId,
        starPosition: activation.starPosition,
        reason: activation.reason,
      });
    }
  }

  return { valid: analysis.valid, activeStars, inactiveStars };
}

function toActiveFact(
  activation: StarActivationResult,
  sourceItemId: string,
  targetItemId: string,
  catalog: Map<string, Item>,
): ActiveStarFact {
  const source = catalog.get(sourceItemId);
  const target = catalog.get(targetItemId);
  const matchingRuleIndexes =
    source && target ? matchingStarRuleIndexes(source, target) : [];
  const first = matchingRuleIndexes[0];
  const triggerType =
    first !== undefined ? source?.star?.rules[first]?.trigger?.type : undefined;

  return {
    sourceInstanceId: activation.sourceInstanceId,
    sourceItemId,
    targetInstanceId: activation.targetInstanceId,
    targetItemId,
    starPosition: activation.starPosition,
    matchingRuleIndexes,
    activationRule: triggerType,
  };
}

/**
 * Классификация эффекта без выдумывания боевой ценности.
 * `raw` в тексте нормализованного эффекта (поле raw) — это цитата Wiki, не тип.
 */
export function classifyEffect(effect: Effect): EffectClassification {
  switch (effect.type) {
    case "raw":
      return "raw";
    case "special":
      return "unsupported";
    case "gain":
    case "inflict":
    case "heal":
    case "deal_damage":
    case "modify_stat":
    case "reduce":
    case "cleanse":
    case "remove":
    case "steal":
    case "spend":
    case "block_damage":
    case "stun":
    case "extra_attack":
    case "lose":
      return "normalized";
  }
}
