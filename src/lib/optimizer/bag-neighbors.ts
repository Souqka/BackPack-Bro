/**
 * Local Bag neighbors: relocate, rotate, swap.
 *
 * Does not re-place Items and does not call runOptimizer.
 * generateBagCandidates already enumerates unique rotations via getUniqueRotations,
 * so rotate is the subset whose rotation differs; relocate keeps the current rotation.
 *
 * Neighbor order is deterministic:
 * operation → rotation → row → col → signature.
 */

import type { Item } from "../inventory/types.ts";
import {
  addBagCandidate,
  generateBagCandidates,
  getBagStateSignature,
  removeBag,
} from "./bags/index.ts";
import type { BagState, PlacedBag } from "./bags/types.ts";
import type { Backpack, ItemToPlace } from "./types.ts";

export type BagNeighborOperation = "relocate" | "rotate" | "swap";

export interface BagNeighbor {
  bags: BagState;
  operation: BagNeighborOperation;
  signature: string;
  movedInstanceIds: string[];
  rotation: number;
  row: number;
  col: number;
}

/**
 * Canonical Bag layout signature. Order of the bags array does not matter.
 * Reuses getBagStateSignature so Item search and Bag LS share one format.
 */
export function canonicalBagSignature(bags: BagState): string {
  return getBagStateSignature(bags);
}

export function generateBagNeighbors(
  bags: BagState,
  backpack: Backpack,
  catalog: Map<string, Item>,
): BagNeighbor[] {
  const unique = new Map<string, BagNeighbor>();
  const currentSignature = canonicalBagSignature(bags);
  const ordered = sortBags(bags.bags);

  for (const bag of ordered) {
    const stripped = removeBag(bags, bag.instanceId);
    const toPlace: ItemToPlace = { instanceId: bag.instanceId, itemId: bag.itemId };
    const candidates = generateBagCandidates(toPlace, stripped, backpack, catalog);
    for (const candidate of candidates) {
      if (sameBagPlacement(candidate.placement, bag)) continue;
      const next = addBagCandidate(stripped, candidate, backpack);
      const operation: BagNeighborOperation =
        candidate.placement.rotation === bag.rotation ? "relocate" : "rotate";
      rememberNeighbor(unique, next, operation, [bag.instanceId], currentSignature);
    }
  }

  for (let i = 0; i < ordered.length; i++) {
    for (let j = i + 1; j < ordered.length; j++) {
      const swapped = trySwapBags(bags, ordered[i]!, ordered[j]!, backpack, catalog);
      for (const next of swapped) {
        rememberNeighbor(
          unique,
          next,
          "swap",
          [ordered[i]!.instanceId, ordered[j]!.instanceId],
          currentSignature,
        );
      }
    }
  }

  return [...unique.values()].sort(compareBagNeighbors);
}

/**
 * Round-robin across operations so rotate/swap are not starved by relocate.
 * Input is assumed sorted; output stays deterministic.
 */
export function limitBagNeighbors(neighbors: readonly BagNeighbor[], maxNeighbors: number): BagNeighbor[] {
  if (neighbors.length <= maxNeighbors) return [...neighbors];
  const groups: Record<BagNeighborOperation, BagNeighbor[]> = {
    relocate: [],
    rotate: [],
    swap: [],
  };
  for (const neighbor of neighbors) groups[neighbor.operation].push(neighbor);
  const result: BagNeighbor[] = [];
  let index = 0;
  while (result.length < maxNeighbors) {
    let added = false;
    for (const operation of ["relocate", "rotate", "swap"] as const) {
      const next = groups[operation][index];
      if (!next) continue;
      result.push(next);
      added = true;
      if (result.length >= maxNeighbors) break;
    }
    if (!added) break;
    index += 1;
  }
  return result;
}

function trySwapBags(
  bags: BagState,
  a: PlacedBag,
  b: PlacedBag,
  backpack: Backpack,
  catalog: Map<string, Item>,
): BagState[] {
  const stripped = removeBag(removeBag(bags, a.instanceId), b.instanceId);
  const candA = generateBagCandidates(
    { instanceId: a.instanceId, itemId: a.itemId },
    stripped,
    backpack,
    catalog,
  ).filter((candidate) => samePosition(candidate.placement, b));
  const results: BagState[] = [];
  for (const first of candA) {
    const afterA = addBagCandidate(stripped, first, backpack);
    const candB = generateBagCandidates(
      { instanceId: b.instanceId, itemId: b.itemId },
      afterA,
      backpack,
      catalog,
    ).filter((candidate) => samePosition(candidate.placement, a));
    for (const second of candB) {
      results.push(addBagCandidate(afterA, second, backpack));
    }
  }
  return results;
}

function rememberNeighbor(
  unique: Map<string, BagNeighbor>,
  bags: BagState,
  operation: BagNeighborOperation,
  movedInstanceIds: string[],
  currentSignature: string,
): void {
  const signature = canonicalBagSignature(bags);
  if (signature === currentSignature) return;
  if (unique.has(signature)) return;
  const moved = [...movedInstanceIds].sort();
  const primary =
    bags.bags.find((bag) => bag.instanceId === moved[0]) ??
    bags.bags.find((bag) => bag.instanceId === movedInstanceIds[0]);
  unique.set(signature, {
    bags,
    operation,
    signature,
    movedInstanceIds: moved,
    rotation: primary?.rotation ?? 0,
    row: primary?.position.row ?? 0,
    col: primary?.position.col ?? 0,
  });
}

function compareBagNeighbors(a: BagNeighbor, b: BagNeighbor): number {
  const op = operationRank(a.operation) - operationRank(b.operation);
  if (op !== 0) return op;
  if (a.rotation !== b.rotation) return a.rotation - b.rotation;
  if (a.row !== b.row) return a.row - b.row;
  if (a.col !== b.col) return a.col - b.col;
  if (a.signature < b.signature) return -1;
  if (a.signature > b.signature) return 1;
  return 0;
}

function operationRank(operation: BagNeighborOperation): number {
  if (operation === "relocate") return 0;
  if (operation === "rotate") return 1;
  return 2;
}

function sortBags(bags: PlacedBag[]): PlacedBag[] {
  return [...bags].sort((a, b) => (a.instanceId < b.instanceId ? -1 : a.instanceId > b.instanceId ? 1 : 0));
}

function sameBagPlacement(a: PlacedBag, b: PlacedBag): boolean {
  return samePosition(a, b) && a.instanceId === b.instanceId && a.rotation === b.rotation;
}

function samePosition(a: Pick<PlacedBag, "position">, b: Pick<PlacedBag, "position">): boolean {
  return a.position.row === b.position.row && a.position.col === b.position.col;
}
