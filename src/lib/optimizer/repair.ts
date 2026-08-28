/**
 * Repair Items after a Bag mutation.
 *
 * Stars never decide displacement: only geometry.cells vs availableCells.
 * That matches Stage 7 — Item cells must sit on Bags; Stars may sit outside.
 *
 * Does not call runOptimizer. Kept Items stay in SearchState; only displaced
 * Items are re-placed with a bounded Beam (bagRepairBeamWidth).
 */

import { positionKey } from "../inventory/geometry.ts";
import type { Item } from "../inventory/types.ts";
import { getAvailableCells } from "./bags/index.ts";
import { selectBeam, type ScoredBeamState } from "./beam-search.ts";
import { generatePlacementCandidates } from "./candidates.ts";
import { evaluatePartialState, remainingItemCells } from "./heuristic.ts";
import { orderItemsForSearch } from "./ordering.ts";
import { getOptimizerStateSignature } from "./signature.ts";
import { addCandidate, createSearchState, removePlacement } from "./state.ts";
import type { OptimizerState } from "./search-types.ts";
import type { ItemToPlace, PlacedItem } from "./types.ts";

export interface RepairOptions {
  beamWidth: number;
}

export interface RepairResult {
  state: OptimizerState;
  unplacedItems: ItemToPlace[];
  displaced: PlacedItem[];
  kept: PlacedItem[];
  repaired: PlacedItem[];
  unrepaired: ItemToPlace[];
  statesGenerated: number;
  statesPruned: number;
  durationMs: number;
}

export function itemIsDisplaced(placed: PlacedItem, state: OptimizerState): boolean {
  const geometry = state.items.itemGeometries.get(placed.instanceId);
  if (!geometry) return true;
  const available = getAvailableCells(state.bags);
  return geometry.cells.some((cell) => !available.has(positionKey(cell)));
}

export function findDisplacedItems(state: OptimizerState): PlacedItem[] {
  return state.items.items.filter((placed) => itemIsDisplaced(placed, state));
}

export function findKeptItems(state: OptimizerState): PlacedItem[] {
  return state.items.items.filter((placed) => !itemIsDisplaced(placed, state));
}

/**
 * Keep Items whose cells are still on Bags, drop the rest, then re-place
 * displaced Items with bounded Beam in existing search order.
 */
export function repairItemLayout(
  state: OptimizerState,
  unplacedItems: ItemToPlace[],
  catalog: Map<string, Item>,
  options: RepairOptions,
): RepairResult {
  const started = Date.now();
  const displaced = findDisplacedItems(state);
  const kept = findKeptItems(state);

  let itemsState = state.items;
  for (const placed of displaced) {
    itemsState = removePlacement(itemsState, placed.instanceId);
  }

  const rebuilt = createSearchState(state.backpack, kept, catalog);
  if (rebuilt.ok) {
    itemsState = rebuilt.state;
  }

  const nextState: OptimizerState = {
    backpack: state.backpack,
    bags: state.bags,
    items: itemsState,
  };

  const toRepair: ItemToPlace[] = displaced.map((placed) => ({
    instanceId: placed.instanceId,
    itemId: placed.itemId,
  }));
  const ordered = orderItemsForSearch(toRepair, { catalog, state: nextState });
  const placed = repairWithBeam(nextState, ordered, catalog, options.beamWidth);

  const repairedIds = new Set(placed.state.items.items.map((item) => item.instanceId));
  const repaired = displaced.filter((item) => repairedIds.has(item.instanceId));
  const unrepaired = [
    ...placed.unplaced,
    ...unplacedItems.filter((item) => !toRepair.some((entry) => entry.instanceId === item.instanceId)),
  ];

  return {
    state: placed.state,
    unplacedItems: unrepaired,
    displaced,
    kept,
    repaired,
    unrepaired: placed.unplaced,
    statesGenerated: placed.statesGenerated,
    statesPruned: placed.statesPruned,
    durationMs: Date.now() - started,
  };
}

function repairWithBeam(
  initial: OptimizerState,
  items: ItemToPlace[],
  catalog: Map<string, Item>,
  beamWidth: number,
): {
  state: OptimizerState;
  unplaced: ItemToPlace[];
  statesGenerated: number;
  statesPruned: number;
} {
  let beam: OptimizerState[] = [initial];
  const unplaced: ItemToPlace[] = [];
  let statesGenerated = 0;
  let statesPruned = 0;

  for (let index = 0; index < items.length; index++) {
    const item = items[index]!;
    const remainingAfter = items.slice(index + 1);
    const expanded: ScoredBeamState<OptimizerState>[] = [];

    for (const node of beam) {
      const candidates = generatePlacementCandidates(
        item,
        node.items,
        catalog,
        node.bags.availableCells,
      );
      if (candidates.length === 0) {
        statesPruned += 1;
        continue;
      }
      for (const candidate of candidates) {
        const nextItems = addCandidate(node.items, candidate);
        const nextState: OptimizerState = {
          backpack: node.backpack,
          bags: node.bags,
          items: nextItems,
        };
        const free = nextState.bags.availableCells.size - nextState.items.occupiedCells.size;
        if (remainingItemCells(remainingAfter, catalog) > free) {
          statesPruned += 1;
          continue;
        }
        const heuristic = evaluatePartialState(nextState, remainingAfter, catalog);
        if (!heuristic.feasible) {
          statesPruned += 1;
          continue;
        }
        statesGenerated += 1;
        expanded.push({
          state: nextState,
          score: heuristic.total,
          signature: getOptimizerStateSignature(nextState),
        });
      }
    }

    if (expanded.length === 0) {
      unplaced.push(item);
      continue;
    }
    const kept = selectBeam(expanded, { beamWidth });
    statesPruned += Math.max(0, expanded.length - kept.length);
    beam = kept.map((node) => node.state);
  }

  const best = pickRepairedState(beam);
  return { state: best, unplaced, statesGenerated, statesPruned };
}

function pickRepairedState(beam: OptimizerState[]): OptimizerState {
  if (beam.length === 0) throw new Error("Пустой repair beam");
  const ranked = beam.map((state) => ({
    state,
    signature: getOptimizerStateSignature(state),
    placed: state.items.items.length,
  }));
  ranked.sort((a, b) => {
    if (b.placed !== a.placed) return b.placed - a.placed;
    return a.signature < b.signature ? -1 : a.signature > b.signature ? 1 : 0;
  });
  return ranked[0]!.state;
}
