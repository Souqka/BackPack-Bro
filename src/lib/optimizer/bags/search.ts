/**
 * Bag Beam Search shared by runOptimizer and Adaptive Portfolio.
 *
 * Same loop as Stage 7: generateBagCandidates → addBagCandidate → selectBeam.
 * Adaptive reuses this so escalating bagBeamWidth does not fork a second engine.
 */

import type { Item } from "../../inventory/types.ts";
import { remainingItemCells } from "../heuristic.ts";
import { pastDeadline, selectBeam, type ScoredBeamState } from "../beam-search.ts";
import type { OptimizerStats } from "../search-types.ts";
import { getBagPartialStateSignature } from "../state-signature.ts";
import {
  addTranspositionMetrics,
  createTranspositionTable,
  pruneIfSeen,
} from "../transposition.ts";
import type { Backpack, ItemToPlace } from "../types.ts";
import { generateBagCandidates } from "./candidates.ts";
import { orderBags } from "./order.ts";
import { addBagCandidate, emptyBagState, getBagStateSignature } from "./state.ts";
import type { BagState } from "./types.ts";

export interface BagSearchInput {
  backpack: Backpack;
  bags: ItemToPlace[];
  catalog: Map<string, Item>;
  beamWidth: number;
  stats: OptimizerStats;
  deadlineMs?: number;
  transposition?: boolean;
}

export interface BagSearchResult {
  layouts: BagState[];
  unplacedBags: ItemToPlace[];
  placedCount: number;
}

export function searchBagLayouts(input: BagSearchInput): BagSearchResult {
  const ordered = orderBags(input.bags, input.catalog);
  let beam = [emptyBagState()];
  const unplaced: ItemToPlace[] = [];
  const table = createTranspositionTable({ enabled: input.transposition });

  for (let index = 0; index < ordered.length; index++) {
    const bag = ordered[index]!;
    if (pastDeadline(input.deadlineMs)) {
      unplaced.push(bag);
      continue;
    }
    const expanded: ScoredBeamState<BagState>[] = [];
    const remainingAfter = ordered.slice(index + 1);
    for (const node of beam) {
      const candidates = generateBagCandidates(bag, node, input.backpack, input.catalog);
      input.stats.candidatesGenerated += candidates.length;
      if (candidates.length === 0) {
        input.stats.bagStatesPruned += 1;
        continue;
      }
      for (const candidate of candidates) {
        const next = addBagCandidate(node, candidate, input.backpack);
        const remainingCells = remainingItemCells(remainingAfter, input.catalog);
        const freeBackpack = input.backpack.rows * input.backpack.cols - next.occupiedCells.size;
        if (remainingCells > freeBackpack) {
          input.stats.bagStatesPruned += 1;
          continue;
        }
        if (pruneIfSeen(table, getBagPartialStateSignature(input.backpack, next, remainingAfter))) {
          input.stats.bagStatesPruned += 1;
          continue;
        }
        input.stats.bagStatesGenerated += 1;
        expanded.push({
          state: next,
          score: next.availableCells.size - remainingAfter.length,
          signature: getBagStateSignature(next),
        });
      }
    }
    if (expanded.length === 0) {
      unplaced.push(bag);
      continue;
    }
    const kept = selectBeam(expanded, { beamWidth: input.beamWidth, deadlineMs: input.deadlineMs });
    input.stats.bagStatesPruned += Math.max(0, expanded.length - kept.length);
    beam = kept.map((node) => node.state);
  }

  addTranspositionMetrics(input.stats, table.snapshot());
  return { layouts: beam, unplacedBags: unplaced, placedCount: ordered.length - unplaced.length };
}
