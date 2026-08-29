/**
 * Bag topology diversity for multi-start seeds.
 *
 * Jaccard on occupied backpack cells. This is a search-seed filter, not a
 * game score and not a PlacementScore component.
 */

import { canonicalBagSignature } from "./bag-neighbors.ts";
import type { BagState } from "./bags/types.ts";

export interface BagTopologySimilarity {
  sharedOccupiedCells: number;
  totalOccupiedCells: number;
  similarity: number;
}

export const DEFAULT_BAG_SIMILARITY_THRESHOLD = 0.7;

export function bagOccupiedCellKeys(bags: BagState): string[] {
  return [...bags.occupiedCells.keys()].sort();
}

export function bagTopologySimilarity(a: BagState, b: BagState): BagTopologySimilarity {
  const aKeys = new Set(a.occupiedCells.keys());
  const bKeys = new Set(b.occupiedCells.keys());
  let shared = 0;
  for (const key of aKeys) {
    if (bKeys.has(key)) shared += 1;
  }
  const total = aKeys.size + bKeys.size - shared;
  return {
    sharedOccupiedCells: shared,
    totalOccupiedCells: total,
    similarity: total === 0 ? 1 : shared / total,
  };
}

/**
 * Greedy deterministic diversity pick.
 * Candidates are taken in caller order (Bag Beam rank). First kept is the
 * first unseen candidate; later ones must stay at or below the Jaccard
 * threshold against every already selected seed. Does not pad the array.
 */
export function selectDiverseBagSeeds(
  candidates: readonly BagState[],
  maxSeeds: number,
  similarityThreshold: number,
  alreadySelected: readonly BagState[] = [],
): BagState[] {
  const limit = Math.max(0, maxSeeds);
  if (limit === 0) return [];

  const selected: BagState[] = [...alreadySelected];
  const seen = new Set(selected.map((bags) => canonicalBagSignature(bags)));
  const picked: BagState[] = [];

  for (const candidate of candidates) {
    if (picked.length >= limit) break;
    const signature = canonicalBagSignature(candidate);
    if (seen.has(signature)) continue;
    if (isTooSimilar(candidate, selected, similarityThreshold)) continue;
    picked.push(candidate);
    selected.push(candidate);
    seen.add(signature);
  }

  return picked;
}

function isTooSimilar(
  candidate: BagState,
  selected: readonly BagState[],
  similarityThreshold: number,
): boolean {
  for (const existing of selected) {
    if (bagTopologySimilarity(candidate, existing).similarity > similarityThreshold) {
      return true;
    }
  }
  return false;
}
