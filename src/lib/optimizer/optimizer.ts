/**
 * Двухфазный Auto-Placement Optimizer: Bag Beam Search, затем Item Beam Search.
 *
 * Не симулирует бой. Final Score — Scoring Engine; heuristic — только поиск.
 */

import type { Item } from "../inventory/types.ts";
import { analyzePlacementScore } from "../scoring/analyzer.ts";
import { emptyEffectCoverage, invalidBreakdown } from "../scoring/score.ts";
import { INVALID_PLACEMENT_SCORE } from "../scoring/weights.ts";
import { addBagCandidate, emptyBagState, generateBagCandidates, getBagStateSignature } from "./bags/index.ts";
import { pastDeadline, selectBeam, type ScoredBeamState } from "./beam-search.ts";
import { addCandidate } from "./state.ts";
import { generatePlacementCandidates } from "./candidates.ts";
import { getStateSignature } from "./deduplication.ts";
import { evaluatePartialState, remainingItemCells } from "./heuristic.ts";
import { orderItemsForSearch } from "./ordering.ts";
import { getUniqueRotations } from "./rotations.ts";
import type {
  BeamSearchOptions,
  OptimizerOptions,
  OptimizerResult,
  OptimizerState,
  OptimizerStats,
  RunOptimizerInput,
} from "./search-types.ts";
import { DEFAULT_OPTIMIZER_OPTIONS } from "./search-types.ts";
import { createSearchState } from "./state.ts";
import type { ItemToPlace } from "./types.ts";

export function getOptimizerStateSignature(state: OptimizerState): string {
  return `${getBagStateSignature(state.bags)}\n#\n${getStateSignature(state.items)}`;
}

export function runOptimizer(input: RunOptimizerInput): OptimizerResult {
  const started = Date.now();
  const options: OptimizerOptions = { ...DEFAULT_OPTIMIZER_OPTIONS, ...input.options };
  const deadlineMs =
    options.maxDurationMs !== undefined ? started + options.maxDurationMs : undefined;
  const stats = emptyStats();
  log(options.verbose, "Запуск optimizer");

  validateInput(input);

  const emptyItems = createSearchState(input.backpack);
  if (!emptyItems.ok) {
    throw new Error("Не удалось создать пустой SearchState");
  }

  if (input.bags.length === 0) {
    log(options.verbose, "Bags не заданы — пустой слой Bags не является игровым layout");
    return finish(
      {
        backpack: input.backpack,
        bags: emptyBagState(),
        items: emptyItems.state,
      },
      input.catalog,
      input.items,
      input.bags,
      stats,
      started,
      false,
    );
  }

  log(options.verbose, "Фаза Bags");
  const bagSearch = searchBags(input, options, stats, deadlineMs);
  stats.searchDepth = Math.max(stats.searchDepth, bagSearch.placedCount);

  if (bagSearch.layouts.length === 0) {
    log(options.verbose, "Нет валидного Bag layout");
    return finish(
      {
        backpack: input.backpack,
        bags: emptyBagState(),
        items: emptyItems.state,
      },
      input.catalog,
      input.items,
      input.bags,
      stats,
      started,
      false,
    );
  }

  log(options.verbose, "Фаза Items");
  let best: {
    state: OptimizerState;
    unplacedItems: ItemToPlace[];
    unplacedBags: ItemToPlace[];
    score: number;
    signature: string;
  } | null = null;

  for (const bags of bagSearch.layouts) {
    if (pastDeadline(deadlineMs)) break;
    const initial: OptimizerState = {
      backpack: input.backpack,
      bags,
      items: emptyItems.state,
    };
    const itemResult = runBeamSearch(initial, input.items, input.catalog, {
      beamWidth: options.itemBeamWidth,
      deadlineMs,
    }, stats);
    const scored = analyzePlacementScore(
      { inventory: itemResult.bestState.backpack, items: itemResult.bestState.items.items },
      input.catalog,
    );
    const signature = getOptimizerStateSignature(itemResult.bestState);
    const rank = scored.valid ? scored.score : Number.NEGATIVE_INFINITY;
    const candidate = {
      state: itemResult.bestState,
      unplacedItems: itemResult.unplacedItems,
      unplacedBags: bagSearch.unplacedBags,
      score: rank,
      signature,
    };
    if (
      !best ||
      candidate.unplacedItems.length < best.unplacedItems.length ||
      (candidate.unplacedItems.length === best.unplacedItems.length &&
        (candidate.score > best.score ||
          (candidate.score === best.score && candidate.signature < best.signature)))
    ) {
      best = candidate;
    }
  }

  const chosen = best ?? {
    state: {
      backpack: input.backpack,
      bags: bagSearch.layouts[0]!,
      items: emptyItems.state,
    },
    unplacedItems: input.items,
    unplacedBags: bagSearch.unplacedBags,
    score: 0,
    signature: "",
  };

  log(options.verbose, "Optimizer завершён");
  const complete =
    chosen.unplacedItems.length === 0 && chosen.unplacedBags.length === 0 && chosen.state.bags.bags.length > 0;
  return finish(chosen.state, input.catalog, chosen.unplacedItems, chosen.unplacedBags, stats, started, complete);
}

/**
 * Item Beam Search по фиксированному порядку предметов.
 * Catalog нужен для генерации кандидатов и heuristic.
 */
export function runBeamSearch(
  initialState: OptimizerState,
  items: ItemToPlace[],
  catalog: Map<string, Item>,
  options: BeamSearchOptions,
  stats: OptimizerStats = emptyStats(),
): { bestState: OptimizerState; unplacedItems: ItemToPlace[] } {
  const ordered = orderItemsForSearch(items, { catalog, state: initialState });
  let beam: OptimizerState[] = [initialState];
  const unplaced: ItemToPlace[] = [];
  let depth = initialState.items.items.length;

  for (let index = 0; index < ordered.length; index++) {
    const item = ordered[index]!;
    if (pastDeadline(options.deadlineMs)) {
      unplaced.push(item);
      continue;
    }
    const remainingAfter = ordered.slice(index + 1);
    const expanded: ScoredBeamState<OptimizerState>[] = [];

    for (const node of beam) {
      const candidates = generatePlacementCandidates(
        item,
        node.items,
        catalog,
        node.bags.availableCells,
      );
      stats.candidatesGenerated += candidates.length;
      if (candidates.length === 0) {
        stats.itemStatesPruned += 1;
        continue;
      }
        const rest = remainingAfter;
      for (const candidate of candidates) {
        const nextItems = addCandidate(node.items, candidate);
        const nextState: OptimizerState = {
          backpack: node.backpack,
          bags: node.bags,
          items: nextItems,
        };
        const remainingCells = remainingItemCells(rest, catalog);
        const free = nextState.bags.availableCells.size - nextState.items.occupiedCells.size;
        if (remainingCells > free) {
          stats.itemStatesPruned += 1;
          continue;
        }
        const heuristic = evaluatePartialState(nextState, rest, catalog);
        if (!heuristic.feasible) {
          stats.itemStatesPruned += 1;
          continue;
        }
        stats.itemStatesGenerated += 1;
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
    beam = selectBeam(expanded, options).map((node) => node.state);
    depth += 1;
  }

  stats.searchDepth = Math.max(stats.searchDepth, depth);
  const best = pickBestItemState(beam, catalog);
  return { bestState: best, unplacedItems: unplaced };
}

function searchBags(
  input: RunOptimizerInput,
  options: OptimizerOptions,
  stats: OptimizerStats,
  deadlineMs?: number,
): { layouts: import("./bags/types.ts").BagState[]; unplacedBags: ItemToPlace[]; placedCount: number } {
  const ordered = orderBags(input.bags, input.catalog);
  let beam = [emptyBagState()];
  const unplaced: ItemToPlace[] = [];

  for (let index = 0; index < ordered.length; index++) {
    const bag = ordered[index]!;
    if (pastDeadline(deadlineMs)) {
      unplaced.push(bag);
      continue;
    }
    const expanded: ScoredBeamState<import("./bags/types.ts").BagState>[] = [];
    const remainingAfter = ordered.slice(index + 1);
    for (const node of beam) {
      const candidates = generateBagCandidates(bag, node, input.backpack, input.catalog);
      stats.candidatesGenerated += candidates.length;
      if (candidates.length === 0) {
        stats.bagStatesPruned += 1;
        continue;
      }
      for (const candidate of candidates) {
        const next = addBagCandidate(node, candidate, input.backpack);
        const remainingCells = remainingItemCells(remainingAfter, input.catalog);
        const freeBackpack =
          input.backpack.rows * input.backpack.cols - next.occupiedCells.size;
        if (remainingCells > freeBackpack) {
          stats.bagStatesPruned += 1;
          continue;
        }
        stats.bagStatesGenerated += 1;
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
    beam = selectBeam(expanded, { beamWidth: options.bagBeamWidth, deadlineMs }).map(
      (node) => node.state,
    );
  }

  return { layouts: beam, unplacedBags: unplaced, placedCount: ordered.length - unplaced.length };
}

function orderBags(bags: ItemToPlace[], catalog: Map<string, Item>): ItemToPlace[] {
  return [...bags].sort((a, b) => {
    const itemA = catalog.get(a.itemId);
    const itemB = catalog.get(b.itemId);
    const cellsA = itemA?.geometry.cells.length ?? 0;
    const cellsB = itemB?.geometry.cells.length ?? 0;
    if (cellsA !== cellsB) return cellsB - cellsA;
    const rotA = itemA ? getUniqueRotations(itemA).length : 0;
    const rotB = itemB ? getUniqueRotations(itemB).length : 0;
    if (rotA !== rotB) return rotB - rotA;
    return a.instanceId < b.instanceId ? -1 : a.instanceId > b.instanceId ? 1 : 0;
  });
}

function pickBestItemState(beam: OptimizerState[], catalog: Map<string, Item>): OptimizerState {
  const ranked = beam.map((state) => {
    const scored = analyzePlacementScore(
      { inventory: state.backpack, items: state.items.items },
      catalog,
    );
    return {
      state,
      score: scored.valid ? scored.score : Number.NEGATIVE_INFINITY,
      signature: getOptimizerStateSignature(state),
    };
  });
  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.signature < b.signature ? -1 : 1;
  });
  return ranked[0]?.state ?? beam[0]!;
}

function finish(
  state: OptimizerState,
  catalog: Map<string, Item>,
  unplacedItems: ItemToPlace[],
  unplacedBags: ItemToPlace[],
  stats: OptimizerStats,
  started: number,
  complete: boolean,
): OptimizerResult {
  const score =
    state.items.items.length === 0 && state.bags.bags.length === 0
      ? {
          valid: false,
          score: INVALID_PLACEMENT_SCORE,
          breakdown: invalidBreakdown("Нет валидного Bag layout"),
          effectCoverage: emptyEffectCoverage(),
          synergies: [],
          graph: { nodes: [], edges: [] },
        }
      : analyzePlacementScore({ inventory: state.backpack, items: state.items.items }, catalog);

  stats.durationMs = Date.now() - started;
  return {
    bestState: state,
    score,
    placedItems: state.items.items,
    placedBags: state.bags.bags,
    unplacedItems,
    unplacedBags,
    complete,
    stats,
  };
}

function validateInput(input: RunOptimizerInput): void {
  if (input.backpack.rows < 1 || input.backpack.cols < 1) {
    throw new Error("Некорректный размер рюкзака");
  }
  const seen = new Set<string>();
  for (const bag of input.bags) {
    if (seen.has(bag.instanceId)) throw new Error(`Повторяющийся instanceId: ${bag.instanceId}`);
    seen.add(bag.instanceId);
    const item = input.catalog.get(bag.itemId);
    if (!item) throw new Error(`Неизвестный bag itemId: ${bag.itemId}`);
    if (!item.types.includes("bag")) throw new Error(`Предмет не является Bag: ${bag.itemId}`);
  }
  for (const itemToPlace of input.items) {
    if (seen.has(itemToPlace.instanceId)) {
      throw new Error(`Повторяющийся instanceId: ${itemToPlace.instanceId}`);
    }
    seen.add(itemToPlace.instanceId);
    const item = input.catalog.get(itemToPlace.itemId);
    if (!item) throw new Error(`Неизвестный itemId: ${itemToPlace.itemId}`);
  }
}

function emptyStats(): OptimizerStats {
  return {
    bagStatesGenerated: 0,
    bagStatesPruned: 0,
    itemStatesGenerated: 0,
    itemStatesPruned: 0,
    candidatesGenerated: 0,
    searchDepth: 0,
    durationMs: 0,
  };
}

function log(verbose: boolean | undefined, message: string): void {
  if (verbose) console.info(`[optimizer] ${message}`);
}
