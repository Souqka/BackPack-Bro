/**
 * Детерминированный greedy baseline.
 *
 * На каждом шаге берётся следующий Item (static или dynamic ordering)
 * и единственный лучший candidate по partial heuristic, затем signature.
 *
 * Greedy не ищет оптимум и не использует Math.random: он нужен benchmark,
 * чтобы понять, даёт ли Beam Search что-то сверх «всегда бери локально лучшее».
 */

import type { Item } from "../inventory/types.ts";
import { addBagCandidate, emptyBagState, generateBagCandidates, getBagStateSignature } from "./bags/index.ts";
import type { BagState } from "./bags/types.ts";
import { generatePlacementCandidates } from "./candidates.ts";
import { evaluatePartialState, remainingItemCells } from "./heuristic.ts";
import { orderItemsForSearch } from "./ordering.ts";
import type {
  OptimizerOptions,
  OptimizerState,
  OptimizerStats,
  RankedLayout,
} from "./search-types.ts";
import { getOptimizerStateSignature } from "./signature.ts";
import { addCandidate, createSearchState } from "./state.ts";
import type { Backpack, ItemToPlace } from "./types.ts";
import { orderBags } from "./bags/order.ts";
import { scoreLayout } from "./score-cache.ts";

export { orderBags };

export interface GreedySearchInput {
  backpack: Backpack;
  bags: ItemToPlace[];
  items: ItemToPlace[];
  catalog: Map<string, Item>;
  options: OptimizerOptions;
  stats: OptimizerStats;
  deadlineMs?: number;
}

export interface GreedySearchOutput {
  ranked: RankedLayout[];
  searchExhaustive: boolean;
}

export function runGreedySearch(input: GreedySearchInput): GreedySearchOutput {
  const emptyItems = createSearchState(input.backpack);
  if (!emptyItems.ok) {
    throw new Error("Не удалось создать пустой SearchState");
  }

  const bags = placeBagsGreedy(input);
  const unplacedBags = bags.unplaced;
  const bagState = bags.state;

  const initial: OptimizerState = {
    backpack: input.backpack,
    bags: bagState,
    items: emptyItems.state,
  };

  if (bagState.bags.length === 0) {
    return {
      ranked: [toRanked(initial, input.items, unplacedBags, input.catalog)],
      searchExhaustive: true,
    };
  }

  let state = initial;
  let remaining = input.options.dynamicOrdering
    ? [...input.items]
    : orderItemsForSearch(input.items, { catalog: input.catalog, state: initial });
  const unplacedItems: ItemToPlace[] = [];
  let depth = 0;

  while (remaining.length > 0) {
    if (pastDeadline(input.deadlineMs)) {
      unplacedItems.push(...remaining);
      remaining = [];
      break;
    }

    const nextItem = input.options.dynamicOrdering
      ? orderItemsForSearch(remaining, { catalog: input.catalog, state })[0]!
      : remaining[0]!;
    const rest = remaining.filter((item) => item.instanceId !== nextItem.instanceId);
    const candidates = generatePlacementCandidates(
      nextItem,
      state.items,
      input.catalog,
      state.bags.availableCells,
    );
    input.stats.candidatesGenerated += candidates.length;

    if (candidates.length === 0) {
      unplacedItems.push(nextItem);
      remaining = rest;
      input.stats.itemStatesPruned += 1;
      continue;
    }

    let best: { state: OptimizerState; score: number; signature: string } | null = null;
    for (const candidate of candidates) {
      const nextItems = addCandidate(state.items, candidate);
      const nextState: OptimizerState = {
        backpack: state.backpack,
        bags: state.bags,
        items: nextItems,
      };
      const free = nextState.bags.availableCells.size - nextState.items.occupiedCells.size;
      if (remainingItemCells(rest, input.catalog) > free) {
        input.stats.itemStatesPruned += 1;
        continue;
      }
      const heuristic = evaluatePartialState(nextState, rest, input.catalog);
      if (!heuristic.feasible) {
        input.stats.itemStatesPruned += 1;
        continue;
      }
      input.stats.itemStatesGenerated += 1;
      const signature = getOptimizerStateSignature(nextState);
      if (
        !best ||
        heuristic.total > best.score ||
        (heuristic.total === best.score && signature < best.signature)
      ) {
        best = { state: nextState, score: heuristic.total, signature };
      }
    }

    if (!best) {
      unplacedItems.push(nextItem);
      remaining = rest;
      continue;
    }

    state = best.state;
    remaining = rest;
    depth += 1;
  }

  input.stats.searchDepth = Math.max(input.stats.searchDepth, depth);
  return {
    ranked: [toRanked(state, unplacedItems, unplacedBags, input.catalog)],
    searchExhaustive: true,
  };
}

function placeBagsGreedy(
  input: GreedySearchInput,
): { state: BagState; unplaced: ItemToPlace[] } {
  const ordered = orderBags(input.bags, input.catalog);
  let state = emptyBagState();
  const unplaced: ItemToPlace[] = [];

  for (const bag of ordered) {
    const candidates = generateBagCandidates(bag, state, input.backpack, input.catalog);
    input.stats.candidatesGenerated += candidates.length;
    if (candidates.length === 0) {
      unplaced.push(bag);
      input.stats.bagStatesPruned += 1;
      continue;
    }

    let best: { state: BagState; score: number; signature: string } | null = null;
    for (const candidate of candidates) {
      const next = addBagCandidate(state, candidate, input.backpack);
      input.stats.bagStatesGenerated += 1;
      const score = next.availableCells.size;
      const signature = getBagStateSignature(next);
      if (!best || score > best.score || (score === best.score && signature < best.signature)) {
        best = { state: next, score, signature };
      }
    }
    if (!best) {
      unplaced.push(bag);
      continue;
    }
    state = best.state;
  }

  return { state, unplaced };
}

function toRanked(
  state: OptimizerState,
  unplacedItems: ItemToPlace[],
  unplacedBags: ItemToPlace[],
  catalog: Map<string, Item>,
): RankedLayout {
  const score = scoreLayout(state, catalog);
  return {
    state,
    score,
    unplacedItems,
    unplacedBags,
    complete:
      unplacedItems.length === 0 && unplacedBags.length === 0 && state.bags.bags.length > 0,
    signature: getOptimizerStateSignature(state),
  };
}

function pastDeadline(deadlineMs?: number): boolean {
  return deadlineMs !== undefined && Date.now() >= deadlineMs;
}
