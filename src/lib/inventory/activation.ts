/**
 * Игровая активация Star после геометрического overlap.
 *
 * Геометрия и активация разделены: overlap ещё не значит active.
 * Не выдумываем эффекты. raw и неподдерживаемые условия не активируют Star.
 *
 * Несколько itemTypes в одном `star_occupant_type` — ИЛИ (как в Wiki:
 * «Star Melee Weapon Type Ranged Weapon Type»).
 * Несколько Condition в одном правиле — И (в каталоге таких правил нет).
 * Несколько StarRule — ИЛИ: overlap активен, если подходит хотя бы одно правило.
 *
 * Ограничение типа occupant также читается из модели Stage 2/3:
 * `effect.occupantTypes` и `effect.scale.itemTypes` — если у всех эффектов
 * правила есть такой список. Не выдумываем типы, которых нет в данных.
 */

import type {
  Condition,
  Effect,
  StarRule,
  Trigger,
} from "../../../scripts/wiki-parser/types/effects.ts";
import type { Item } from "../../../scripts/wiki-parser/types/normalized.ts";
import type {
  StarActivationReason,
  StarActivationResult,
  StarOverlap,
} from "./types.ts";

export function evaluateStarActivations(
  overlaps: StarOverlap[],
  placedItemIdByInstance: Map<string, string>,
  catalog: Map<string, Item>,
): StarActivationResult[] {
  return overlaps.map((overlap) => evaluateOne(overlap, placedItemIdByInstance, catalog));
}

function evaluateOne(
  overlap: StarOverlap,
  placedItemIdByInstance: Map<string, string>,
  catalog: Map<string, Item>,
): StarActivationResult {
  const sourceItemId = placedItemIdByInstance.get(overlap.sourceInstanceId);
  const targetItemId = placedItemIdByInstance.get(overlap.targetInstanceId);
  const source = sourceItemId ? catalog.get(sourceItemId) : undefined;
  const target = targetItemId ? catalog.get(targetItemId) : undefined;

  const base = {
    sourceInstanceId: overlap.sourceInstanceId,
    targetInstanceId: overlap.targetInstanceId,
    starPosition: overlap.starPosition,
    targetCell: overlap.targetCell,
  };

  if (!source || !source.star || source.star.rules.length === 0) {
    return { ...base, active: false, reason: "no_star_data" };
  }
  if (!target) {
    return { ...base, active: false, reason: "no_star_data" };
  }

  let sawTypeMiss = false;
  let sawRaw = false;
  let sawUnsupported = false;

  for (const rule of source.star.rules) {
    const verdict = evaluateRule(rule, target);
    if (verdict === "active") {
      return { ...base, active: true, reason: "active" };
    }
    if (verdict === "condition_not_met") sawTypeMiss = true;
    else if (verdict === "raw_condition") sawRaw = true;
    else if (verdict === "unsupported_condition") sawUnsupported = true;
  }

  const reason: StarActivationReason = sawTypeMiss
    ? "condition_not_met"
    : sawRaw
      ? "raw_condition"
      : sawUnsupported
        ? "unsupported_condition"
        : "no_star_data";
  return { ...base, active: false, reason };
}

function evaluateRule(rule: StarRule, target: Item): StarActivationReason {
  for (const condition of rule.conditions) {
    const result = evaluateCondition(condition, target);
    if (result !== "active") return result;
  }

  const triggerTypes = occupantTypesFromTrigger(rule.trigger);
  if (triggerTypes === "raw") return "raw_condition";
  if (triggerTypes === "named") return "unsupported_condition";
  if (Array.isArray(triggerTypes) && triggerTypes.length > 0) {
    if (!matchesAnyType(target.types, triggerTypes)) return "condition_not_met";
  }

  const effectTypes = occupantTypesFromEffects(rule);
  if (effectTypes && !matchesAnyType(target.types, effectTypes)) {
    return "condition_not_met";
  }

  return "active";
}

function evaluateCondition(condition: Condition, target: Item): StarActivationReason {
  if (condition.type === "raw") return "raw_condition";
  if (condition.type === "opponent_has_status") return "unsupported_condition";
  if (condition.type === "star_occupant_type") {
    if (!matchesAnyType(target.types, condition.itemTypes)) return "condition_not_met";
    return "active";
  }
  return "unsupported_condition";
}

/**
 * Типы occupant из триггера.
 * `on_star_occupant` без itemTypes — в Wiki это имя конкретного предмета
 * («Star Forge Hammer»), не универсальная активация.
 */
function occupantTypesFromTrigger(
  trigger: Trigger | null,
): string[] | "raw" | "named" | null {
  if (!trigger) return null;
  if (trigger.type === "raw") return "raw";
  if (trigger.type === "on_star_occupant") {
    if (trigger.itemTypes && trigger.itemTypes.length > 0) return trigger.itemTypes;
    return "named";
  }
  return null;
}

/**
 * Типы occupant с эффектов правила.
 * Ворота действует только если каждый эффект несёт occupantTypes или
 * scale.itemTypes — иначе в правиле есть универсальный эффект.
 */
function occupantTypesFromEffects(rule: StarRule): string[] | null {
  if (rule.effects.length === 0) return null;
  const required: string[] = [];
  for (const wrapped of rule.effects) {
    const types = occupantTypesFromEffect(wrapped.effect);
    if (!types) return null;
    required.push(...types);
  }
  return required.length > 0 ? required : null;
}

function occupantTypesFromEffect(effect: Effect): string[] | null {
  const types: string[] = [];
  if ("occupantTypes" in effect && effect.occupantTypes && effect.occupantTypes.length > 0) {
    types.push(...effect.occupantTypes);
  }
  if (
    "scale" in effect &&
    effect.scale?.itemTypes &&
    effect.scale.itemTypes.length > 0 &&
    (effect.scale.per === "star_occupant" || effect.scale.per === "star_item")
  ) {
    types.push(...effect.scale.itemTypes);
  }
  return types.length > 0 ? types : null;
}

function matchesAnyType(targetTypes: string[], required: string[]): boolean {
  const set = new Set(targetTypes);
  return required.some((type) => set.has(type));
}
