/**
 * Synergy из PlacementFacts.
 *
 * Одна активная Star → одна структурная synergy `star_activation`.
 * Эффекты этой Star → отдельные `star_effect` без структурных очков.
 * Неизвестное не считается отсутствующим: raw/unsupported видны в status.
 */

import type { Item } from "../inventory/types.ts";
import { classifyEffect } from "./rules.ts";
import type {
  ActiveStarFact,
  InactiveStarFact,
  PlacementFacts,
  Synergy,
} from "./types.ts";
import type { ScoringWeights } from "./weights.ts";

export function buildSynergies(
  facts: PlacementFacts,
  catalog: Map<string, Item>,
  weights: ScoringWeights,
): Synergy[] {
  const synergies: Synergy[] = [];

  for (const fact of facts.activeStars) {
    synergies.push(activationSynergy(fact, "active", weights.activatedStar, "Активированная Star"));
    synergies.push(...effectSynergies(fact, catalog));
  }

  for (const fact of facts.inactiveStars) {
    const synergy = inactiveSynergy(fact);
    if (synergy) synergies.push(synergy);
  }

  return synergies;
}

function activationSynergy(
  fact: ActiveStarFact,
  status: "active",
  score: number,
  reason: string,
): Synergy {
  const pos = `${fact.starPosition.row}:${fact.starPosition.col}`;
  return {
    id: `star-activation:${fact.sourceInstanceId}:${fact.targetInstanceId}:${pos}`,
    type: "star_activation",
    sourceInstanceId: fact.sourceInstanceId,
    targetInstanceIds: [fact.targetInstanceId],
    score,
    status,
    reason: `${reason} (${fact.activationRule ?? "star"})`,
  };
}

function inactiveSynergy(fact: InactiveStarFact): Synergy | null {
  if (fact.reason === "no_star_data") return null;

  const pos = `${fact.starPosition.row}:${fact.starPosition.col}`;
  const status =
    fact.reason === "raw_condition"
      ? "unknown"
      : fact.reason === "unsupported_condition"
        ? "unsupported"
        : "inactive";
  const type = fact.reason === "raw_condition" ? "unknown" : "star_activation";

  return {
    id: `star-activation:${fact.sourceInstanceId}:${fact.targetInstanceId}:${pos}`,
    type,
    sourceInstanceId: fact.sourceInstanceId,
    targetInstanceIds: [fact.targetInstanceId],
    score: 0,
    status,
    reason: reasonText(fact.reason),
  };
}

function effectSynergies(fact: ActiveStarFact, catalog: Map<string, Item>): Synergy[] {
  const source = catalog.get(fact.sourceItemId);
  if (!source?.star) return [];
  const pos = `${fact.starPosition.row}:${fact.starPosition.col}`;
  const result: Synergy[] = [];

  for (const ruleIndex of fact.matchingRuleIndexes) {
    const rule = source.star.rules[ruleIndex];
    if (!rule) continue;
    for (let effectIndex = 0; effectIndex < rule.effects.length; effectIndex++) {
      const wrapped = rule.effects[effectIndex];
      if (!wrapped) continue;
      const classification = classifyEffect(wrapped.effect);
      const status =
        classification === "normalized"
          ? "active"
          : classification === "raw"
            ? "unknown"
            : "unsupported";
      result.push({
        id: `star-effect:${fact.sourceInstanceId}:${fact.targetInstanceId}:${pos}:${ruleIndex}:${effectIndex}`,
        type: "star_effect",
        sourceInstanceId: fact.sourceInstanceId,
        targetInstanceIds: [fact.targetInstanceId],
        score: 0,
        status,
        reason: effectReason(wrapped.effect.type, classification),
      });
    }
  }

  return result;
}

function reasonText(reason: InactiveStarFact["reason"]): string {
  switch (reason) {
    case "condition_not_met":
      return "Overlap есть, условие типа occupant не выполнено";
    case "raw_condition":
      return "Условие или trigger остались raw — взаимодействие не выдумываем";
    case "unsupported_condition":
      return "Условие не поддерживается Placement Engine";
    case "no_star_data":
      return "Нет данных Star";
    case "active":
      return "Активированная Star";
  }
}

function effectReason(effectType: string, classification: string): string {
  if (classification === "normalized") return `Нормализованный эффект ${effectType}`;
  if (classification === "raw") return "Эффект raw, в structural score не входит";
  return `Эффект ${effectType} не имеет сравнимой боевой модели`;
}
