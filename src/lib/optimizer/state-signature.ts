/**
 * Partial-state signatures for transposition pruning.
 *
 * These keys describe the future search space, not a heuristic value.
 * Two states with the same key have the same remaining candidate space
 * and may keep a single representative. Different remaining items never
 * share a key — even when the placed geometry matches.
 */

import { getBagStateSignature } from "./bags/index.ts";
import type { BagState } from "./bags/types.ts";
import { getOptimizerStateSignature } from "./signature.ts";
import type { OptimizerState } from "./search-types.ts";
import type { Backpack, ItemToPlace } from "./types.ts";

/**
 * Remaining / unplaced multiset. instanceId is kept: two copies of the
 * same itemId are not assumed interchangeable.
 */
export function remainingMultisetSignature(items: readonly ItemToPlace[]): string {
  const lines = items.map((item) => `${item.instanceId}:${item.itemId}`);
  lines.sort();
  return lines.join("\n");
}

/**
 * Item-search partial key: backpack, Bag topology, placed Items, remaining
 * and optional unplaced multisets. Array order of those lists is ignored.
 */
export function getItemPartialStateSignature(
  state: OptimizerState,
  remaining: readonly ItemToPlace[],
  unplaced: readonly ItemToPlace[] = [],
): string {
  const { rows, cols } = state.backpack;
  return [
    `${rows}x${cols}`,
    getOptimizerStateSignature(state),
    `R:${remainingMultisetSignature(remaining)}`,
    `U:${remainingMultisetSignature(unplaced)}`,
  ].join("\n");
}

/**
 * Bag-search partial key: backpack, placed Bags, remaining Bag multiset.
 * availableCells follow from Bag topology, so they are not listed twice.
 */
export function getBagPartialStateSignature(
  backpack: Backpack,
  bags: BagState,
  remaining: readonly ItemToPlace[],
): string {
  return [
    `${backpack.rows}x${backpack.cols}`,
    getBagStateSignature(bags),
    `R:${remainingMultisetSignature(remaining)}`,
  ].join("\n");
}
