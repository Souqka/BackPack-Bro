/**
 * Кандидаты размещения Bag на сетке рюкзака.
 *
 * Повторно использует generatePlacementCandidates: Bags — те же Item с type bag.
 * Star Bag (если есть) не влияет на границы.
 */

import type { Item } from "../../inventory/types.ts";
import { generatePlacementCandidates } from "../candidates.ts";
import type { Backpack, ItemToPlace, PlacementCandidate } from "../types.ts";
import { bagStateAsSearchState } from "./state.ts";
import type { BagState } from "./types.ts";

export function generateBagCandidates(
  bag: ItemToPlace,
  state: BagState,
  backpack: Backpack,
  catalog: Map<string, Item>,
): PlacementCandidate[] {
  const item = catalog.get(bag.itemId);
  if (!item) return [];
  if (!item.types.includes("bag")) return [];
  return generatePlacementCandidates(bag, bagStateAsSearchState(state, backpack), catalog);
}
