/**
 * Порядок Items для Beam Search.
 *
 * Это оптимизация поиска, не игровая ценность.
 * Rarity не используется. Порядок фиксируется до Item-фазы.
 *
 * 1) меньше валидных позиций;
 * 2) сложнее геометрия (больше клеток, больше unique rotations, не прямоугольник);
 * 3) Star-зависимости;
 * 4) шире набор типов для Star occupant.
 */

import type { Item } from "../inventory/types.ts";
import { matchingStarRuleIndexes } from "../inventory/activation.ts";
import { generatePlacementCandidates } from "./candidates.ts";
import { getUniqueRotations } from "./rotations.ts";
import type { ItemToPlace } from "./types.ts";
import type { OptimizerState } from "./search-types.ts";

export interface OrderingContext {
  catalog: Map<string, Item>;
  state: OptimizerState;
}

export interface ItemSearchMeta {
  candidateCount: number;
  cellCount: number;
  uniqueRotations: number;
  nonRectangular: boolean;
  starCount: number;
  hasStarRules: boolean;
  strictTypeRequirements: boolean;
  universalStar: boolean;
  synergyTypeCount: number;
}

export function orderItemsForSearch(items: ItemToPlace[], context: OrderingContext): ItemToPlace[] {
  const metaByKey = new Map<string, ItemSearchMeta>();
  const decorated = items.map((item, index) => {
    const cacheKey = item.itemId;
    let meta = metaByKey.get(cacheKey);
    if (!meta) {
      meta = describeItem(item, context);
      metaByKey.set(cacheKey, meta);
    }
    return { item, index, meta };
  });

  decorated.sort((a, b) => {
    if (a.meta.candidateCount !== b.meta.candidateCount) {
      return a.meta.candidateCount - b.meta.candidateCount;
    }
    if (a.meta.cellCount !== b.meta.cellCount) return b.meta.cellCount - a.meta.cellCount;
    if (a.meta.uniqueRotations !== b.meta.uniqueRotations) {
      return b.meta.uniqueRotations - a.meta.uniqueRotations;
    }
    if (a.meta.nonRectangular !== b.meta.nonRectangular) {
      return a.meta.nonRectangular ? -1 : 1;
    }
    if (a.meta.starCount !== b.meta.starCount) return b.meta.starCount - a.meta.starCount;
    if (a.meta.hasStarRules !== b.meta.hasStarRules) return a.meta.hasStarRules ? -1 : 1;
    if (a.meta.strictTypeRequirements !== b.meta.strictTypeRequirements) {
      return a.meta.strictTypeRequirements ? -1 : 1;
    }
    if (a.meta.universalStar !== b.meta.universalStar) return a.meta.universalStar ? -1 : 1;
    if (a.meta.synergyTypeCount !== b.meta.synergyTypeCount) {
      return b.meta.synergyTypeCount - a.meta.synergyTypeCount;
    }
    if (a.item.instanceId !== b.item.instanceId) {
      return a.item.instanceId < b.item.instanceId ? -1 : 1;
    }
    return a.index - b.index;
  });

  return decorated.map((entry) => entry.item);
}

function describeItem(item: ItemToPlace, context: OrderingContext): ItemSearchMeta {
  const catalogItem = context.catalog.get(item.itemId);
  if (!catalogItem) {
    return {
      candidateCount: 0,
      cellCount: 0,
      uniqueRotations: 0,
      nonRectangular: false,
      starCount: 0,
      hasStarRules: false,
      strictTypeRequirements: false,
      universalStar: false,
      synergyTypeCount: 0,
    };
  }
  const candidates = generatePlacementCandidates(
    item,
    context.state.items,
    context.catalog,
    context.state.bags.availableCells,
  );
  const cells = catalogItem.geometry.cells;
  const maxRow = Math.max(0, ...cells.map((c) => c[0]));
  const maxCol = Math.max(0, ...cells.map((c) => c[1]));
  const box = (maxRow + 1) * (maxCol + 1);
  const types = occupantTypeUniverse(catalogItem);
  return {
    candidateCount: candidates.length,
    cellCount: cells.length,
    uniqueRotations: getUniqueRotations(catalogItem).length,
    nonRectangular: cells.length < box,
    starCount: catalogItem.geometry.stars.length,
    hasStarRules: Boolean(catalogItem.star && catalogItem.star.rules.length > 0),
    strictTypeRequirements: types.kind === "typed",
    universalStar: types.kind === "any",
    synergyTypeCount: types.kind === "typed" ? types.types.size : 0,
  };
}

export function occupantTypeUniverse(
  item: Item,
): { kind: "none" } | { kind: "any" } | { kind: "typed"; types: Set<string> } {
  if (!item.star || item.star.rules.length === 0 || item.geometry.stars.length === 0) {
    return { kind: "none" };
  }
  const types = new Set<string>();
  let any = false;
  let typed = false;
  for (const rule of item.star.rules) {
    let ruleTyped = false;
    for (const condition of rule.conditions) {
      if (condition.type === "star_occupant_type" && condition.itemTypes.length > 0) {
        for (const t of condition.itemTypes) types.add(t);
        ruleTyped = true;
      }
    }
    if (rule.trigger?.type === "on_star_occupant" && (rule.trigger.itemTypes?.length ?? 0) > 0) {
      for (const t of rule.trigger.itemTypes ?? []) types.add(t);
      ruleTyped = true;
    }
    if (ruleTyped) typed = true;
    else if (rule.trigger?.type === "on_star_activation") any = true;
    else if (rule.conditions.length === 0) any = true;
  }
  if (typed) return { kind: "typed", types };
  if (any) return { kind: "any" };
  return { kind: "none" };
}

export function itemCouldActivateStar(source: Item, target: Item): boolean {
  return matchingStarRuleIndexes(source, target).length > 0;
}
