/**
 * Двухфазный Auto-Placement Optimizer: Bag Search, затем Item Search.
 *
 * Не симулирует бой. Final Score — Scoring Engine; heuristic — только поиск.
 * Основной алгоритм остаётся Beam Search; greedy и DFS — baseline для Stage 8.
 */

import type { Item } from "../inventory/types.ts";
import { analyzePlacementScore } from "../scoring/analyzer.ts";
import { emptyEffectCoverage, invalidBreakdown } from "../scoring/score.ts";
import { INVALID_PLACEMENT_SCORE } from "../scoring/weights.ts";
import { emptyBagState } from "./bags/index.ts";
import { searchBagLayouts } from "./bags/search.ts";
import type { BagState } from "./bags/types.ts";
import { pastDeadline, selectBeam, type ScoredBeamState } from "./beam-search.ts";
import { generatePlacementCandidates } from "./candidates.ts";
import { runDfsSearch } from "./dfs.ts";
import { runGreedySearch } from "./greedy.ts";
import { evaluatePartialState, remainingItemCells } from "./heuristic.ts";
import { loadProductionCatalog } from "./load-catalog.ts";
import {
  emptyLocalSearchStats,
  improveTopNLocally,
  layoutScore,
  resolveLocalSearchOptions,
} from "./local-search.ts";
import { emptyBagLocalSearchStats, resolveBagLocalSearchOptions } from "./bag-local-search.ts";
import { improveTopNJointly } from "./joint-search.ts";
import { createEmptyStats, toOptimizerMetrics } from "./metrics.ts";
import { orderItemsForSearch } from "./ordering.ts";
import { sortRankedLayouts } from "./rank.ts";
import type {
  BeamSearchOptions,
  OptimizerAlgorithm,
  OptimizerAlternative,
  OptimizerLayout,
  OptimizerOptions,
  OptimizerResult,
  OptimizerState,
  OptimizerStats,
  RankedLayout,
  RunOptimizerInput,
} from "./search-types.ts";
import { DEFAULT_OPTIMIZER_OPTIONS } from "./search-types.ts";
import { getOptimizerStateSignature } from "./signature.ts";
import { addCandidate, createSearchState } from "./state.ts";
import { DEFAULT_BACKPACK, type Backpack, type ItemToPlace } from "./types.ts";

export { getOptimizerStateSignature } from "./signature.ts";

interface ResolvedOptimizerInput {
  backpack: Backpack;
  bags: ItemToPlace[];
  items: ItemToPlace[];
  catalog: Map<string, Item>;
  options: OptimizerOptions;
}

export function runOptimizer(input: RunOptimizerInput): OptimizerResult {
  const started = Date.now();
  const resolved = resolveInput(input);
  const deadlineMs =
    resolved.options.maxDurationMs !== undefined ? started + resolved.options.maxDurationMs : undefined;
  const stats = createEmptyStats();
  log(resolved.options.verbose, `Запуск optimizer (${resolved.options.algorithm ?? "beam"})`);

  validateInput(resolved);

  const emptyItems = createSearchState(resolved.backpack);
  if (!emptyItems.ok) {
    throw new Error("Не удалось создать пустой SearchState");
  }

  if (resolved.bags.length === 0) {
    log(resolved.options.verbose, "Bags не заданы — пустой слой Bags не является игровым layout");
    return finish({
      ranked: [
        invalidEmptyLayout(resolved.backpack, emptyItems.state, resolved.items, resolved.bags, resolved.catalog),
      ],
      catalog: resolved.catalog,
      stats,
      started,
      options: resolved.options,
      algorithm: resolved.options.algorithm ?? "beam",
      searchExhaustive: true,
    });
  }

  const algorithm = resolved.options.algorithm ?? "beam";
  if (algorithm === "greedy") {
    const greedy = runGreedySearch({
      backpack: resolved.backpack,
      bags: resolved.bags,
      items: resolved.items,
      catalog: resolved.catalog,
      options: resolved.options,
      stats,
      deadlineMs,
    });
    return finish({
      ranked: greedy.ranked,
      catalog: resolved.catalog,
      stats,
      started,
      options: resolved.options,
      algorithm,
      searchExhaustive: greedy.searchExhaustive,
    });
  }

  if (algorithm === "dfs") {
    const dfs = runDfsSearch({
      backpack: resolved.backpack,
      bags: resolved.bags,
      items: resolved.items,
      catalog: resolved.catalog,
      options: resolved.options,
      stats,
      deadlineMs,
    });
    return finish({
      ranked: dfs.ranked,
      catalog: resolved.catalog,
      stats,
      started,
      options: resolved.options,
      algorithm,
      searchExhaustive: dfs.searchExhaustive,
      heuristicSamples: dfs.samples,
    });
  }

  return runBeamOptimizer(resolved, emptyItems.state, stats, started, deadlineMs);
}

function runBeamOptimizer(
  input: ResolvedOptimizerInput,
  emptyItems: OptimizerState["items"],
  stats: OptimizerStats,
  started: number,
  deadlineMs?: number,
): OptimizerResult {
  log(input.options.verbose, "Фаза Bags");
  const bagSearch = searchBags(input, stats, deadlineMs);
  stats.searchDepth = Math.max(stats.searchDepth, bagSearch.placedCount);

  if (bagSearch.layouts.length === 0) {
    log(input.options.verbose, "Нет валидного Bag layout");
    return finish({
      ranked: [
        invalidEmptyLayout(input.backpack, emptyItems, input.items, input.bags, input.catalog),
      ],
      catalog: input.catalog,
      stats,
      started,
      options: input.options,
      algorithm: "beam",
      searchExhaustive: !pastDeadline(deadlineMs),
    });
  }

  log(input.options.verbose, "Фаза Items");
  const unique = new Map<string, RankedLayout>();
  let exhaustive = true;

  for (const bags of bagSearch.layouts) {
    if (pastDeadline(deadlineMs)) {
      exhaustive = false;
      break;
    }
    const initial: OptimizerState = {
      backpack: input.backpack,
      bags,
      items: emptyItems,
    };
    const itemResult = runBeamSearch(
      initial,
      input.items,
      input.catalog,
      {
        beamWidth: input.options.itemBeamWidth,
        deadlineMs,
        dynamicOrdering: input.options.dynamicOrdering,
      },
      stats,
    );
    if (pastDeadline(deadlineMs)) exhaustive = false;
    for (const node of itemResult.finalNodes) {
      rememberLayout(unique, node.state, node.unplacedItems, bagSearch.unplacedBags, input.catalog);
    }
  }

  const ranked = sortRankedLayouts([...unique.values()]);
  const fallback = ranked.length > 0
    ? ranked
    : [
        toRankedLayout(
          {
            backpack: input.backpack,
            bags: bagSearch.layouts[0]!,
            items: emptyItems,
          },
          input.items,
          bagSearch.unplacedBags,
          input.catalog,
        ),
      ];

  log(input.options.verbose, "Optimizer завершён");
  return finish({
    ranked: fallback,
    catalog: input.catalog,
    stats,
    started,
    options: input.options,
    algorithm: "beam",
    searchExhaustive: exhaustive,
  });
}

/**
 * Item Beam Search.
 *
 * Static ordering фиксирует последовательность до поиска — это прежний
 * детерминированный режим Stage 7.
 * Dynamic ordering выбирает следующий Item из текущего SearchState после
 * каждого шага (тот же comparator, актуальный candidateCount). Не пересчитывает
 * полный Scoring Engine «на каждый Item как сущность»: scoring вызывается
 * только внутри evaluatePartialState для конкретных кандидатов размещения.
 */
export function runBeamSearch(
  initialState: OptimizerState,
  items: ItemToPlace[],
  catalog: Map<string, Item>,
  options: BeamSearchOptions,
  stats: OptimizerStats = createEmptyStats(),
): { bestState: OptimizerState; unplacedItems: ItemToPlace[]; finalNodes: ItemBeamNode[] } {
  if (options.dynamicOrdering) {
    return runDynamicItemBeam(initialState, items, catalog, options, stats);
  }
  return runStaticItemBeam(initialState, items, catalog, options, stats);
}

export interface ItemBeamNode {
  state: OptimizerState;
  unplacedItems: ItemToPlace[];
}

function runStaticItemBeam(
  initialState: OptimizerState,
  items: ItemToPlace[],
  catalog: Map<string, Item>,
  options: BeamSearchOptions,
  stats: OptimizerStats,
): { bestState: OptimizerState; unplacedItems: ItemToPlace[]; finalNodes: ItemBeamNode[] } {
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
      for (const candidate of candidates) {
        const nextItems = addCandidate(node.items, candidate);
        const nextState: OptimizerState = {
          backpack: node.backpack,
          bags: node.bags,
          items: nextItems,
        };
        const remainingCells = remainingItemCells(remainingAfter, catalog);
        const free = nextState.bags.availableCells.size - nextState.items.occupiedCells.size;
        if (remainingCells > free) {
          stats.itemStatesPruned += 1;
          continue;
        }
        const heuristic = evaluatePartialState(nextState, remainingAfter, catalog);
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
    const kept = selectBeam(expanded, options);
    stats.itemStatesPruned += Math.max(0, expanded.length - kept.length);
    beam = kept.map((node) => node.state);
    depth += 1;
  }

  stats.searchDepth = Math.max(stats.searchDepth, depth);
  const finalNodes = beam.map((state) => ({ state, unplacedItems: unplaced }));
  const best = pickBestItemState(beam, catalog);
  return { bestState: best, unplacedItems: unplaced, finalNodes };
}

function runDynamicItemBeam(
  initialState: OptimizerState,
  items: ItemToPlace[],
  catalog: Map<string, Item>,
  options: BeamSearchOptions,
  stats: OptimizerStats,
): { bestState: OptimizerState; unplacedItems: ItemToPlace[]; finalNodes: ItemBeamNode[] } {
  interface DynamicNode {
    state: OptimizerState;
    remaining: ItemToPlace[];
    unplaced: ItemToPlace[];
  }

  let beam: DynamicNode[] = [{ state: initialState, remaining: [...items], unplaced: [] }];
  let depth = initialState.items.items.length;
  let guard = items.length + 1;

  while (guard > 0 && beam.some((node) => node.remaining.length > 0)) {
    guard -= 1;
    if (pastDeadline(options.deadlineMs)) {
      beam = beam.map((node) => ({
        ...node,
        unplaced: node.unplaced.concat(node.remaining),
        remaining: [],
      }));
      break;
    }

    const expanded: ScoredBeamState<DynamicNode>[] = [];
    for (const node of beam) {
      if (node.remaining.length === 0) {
        expanded.push({
          state: node,
          score: evaluatePartialState(node.state, [], catalog).total,
          signature: dynamicSignature(node),
        });
        continue;
      }

      const nextItem = orderItemsForSearch(node.remaining, {
        catalog,
        state: node.state,
      })[0]!;
      const rest = node.remaining.filter((item) => item.instanceId !== nextItem.instanceId);
      const candidates = generatePlacementCandidates(
        nextItem,
        node.state.items,
        catalog,
        node.state.bags.availableCells,
      );
      stats.candidatesGenerated += candidates.length;

      if (candidates.length === 0) {
        stats.itemStatesPruned += 1;
        const skipped: DynamicNode = {
          state: node.state,
          remaining: rest,
          unplaced: [...node.unplaced, nextItem],
        };
        expanded.push({
          state: skipped,
          score: evaluatePartialState(skipped.state, rest, catalog).total,
          signature: dynamicSignature(skipped),
        });
        continue;
      }

      for (const candidate of candidates) {
        const nextItems = addCandidate(node.state.items, candidate);
        const nextState: OptimizerState = {
          backpack: node.state.backpack,
          bags: node.state.bags,
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
        const placed: DynamicNode = {
          state: nextState,
          remaining: rest,
          unplaced: node.unplaced,
        };
        expanded.push({
          state: placed,
          score: heuristic.total,
          signature: dynamicSignature(placed),
        });
      }
    }

    if (expanded.length === 0) break;
    const kept = selectBeam(expanded, options);
    stats.itemStatesPruned += Math.max(0, expanded.length - kept.length);
    beam = kept.map((node) => node.state);
    depth += 1;
  }

  stats.searchDepth = Math.max(stats.searchDepth, depth);
  const finalNodes = beam.map((node) => ({
    state: node.state,
    unplacedItems: node.unplaced.concat(node.remaining),
  }));
  const bestNode = finalNodes[0]
    ? pickBestItemState(
        finalNodes.map((node) => node.state),
        catalog,
      )
    : initialState;
  const bestUnplaced =
    finalNodes.find((node) => getOptimizerStateSignature(node.state) === getOptimizerStateSignature(bestNode))
      ?.unplacedItems ?? items;
  return { bestState: bestNode, unplacedItems: bestUnplaced, finalNodes };
}

function dynamicSignature(node: {
  state: OptimizerState;
  remaining: ItemToPlace[];
  unplaced: ItemToPlace[];
}): string {
  const remaining = node.remaining.map((item) => item.instanceId).sort().join(",");
  const unplaced = node.unplaced.map((item) => item.instanceId).sort().join(",");
  return `${getOptimizerStateSignature(node.state)}\nR:${remaining}\nU:${unplaced}`;
}

function searchBags(
  input: ResolvedOptimizerInput,
  stats: OptimizerStats,
  deadlineMs?: number,
): { layouts: BagState[]; unplacedBags: ItemToPlace[]; placedCount: number } {
  return searchBagLayouts({
    backpack: input.backpack,
    bags: input.bags,
    catalog: input.catalog,
    beamWidth: input.options.bagBeamWidth,
    stats,
    deadlineMs,
  });
}

function pickBestItemState(beam: OptimizerState[], catalog: Map<string, Item>): OptimizerState {
  if (beam.length === 0) {
    throw new Error("Пустой beam");
  }
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
  return ranked[0]!.state;
}

function rememberLayout(
  unique: Map<string, RankedLayout>,
  state: OptimizerState,
  unplacedItems: ItemToPlace[],
  unplacedBags: ItemToPlace[],
  catalog: Map<string, Item>,
): void {
  const ranked = toRankedLayout(state, unplacedItems, unplacedBags, catalog);
  const prev = unique.get(ranked.signature);
  if (!prev) {
    unique.set(ranked.signature, ranked);
    return;
  }
  const sorted = sortRankedLayouts([ranked, prev]);
  unique.set(ranked.signature, sorted[0]!);
}

function toRankedLayout(
  state: OptimizerState,
  unplacedItems: ItemToPlace[],
  unplacedBags: ItemToPlace[],
  catalog: Map<string, Item>,
): RankedLayout {
  const score = scoreOrInvalid(state, catalog);
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

function scoreOrInvalid(state: OptimizerState, catalog: Map<string, Item>) {
  if (state.items.items.length === 0 && state.bags.bags.length === 0) {
    return {
      valid: false,
      score: INVALID_PLACEMENT_SCORE,
      breakdown: invalidBreakdown("Нет валидного Bag layout"),
      effectCoverage: emptyEffectCoverage(),
      synergies: [],
      graph: { nodes: [], edges: [] },
    };
  }
  return analyzePlacementScore({ inventory: state.backpack, items: state.items.items }, catalog);
}

function invalidEmptyLayout(
  backpack: Backpack,
  emptyItems: OptimizerState["items"],
  items: ItemToPlace[],
  bags: ItemToPlace[],
  catalog: Map<string, Item>,
): RankedLayout {
  return toRankedLayout(
    { backpack, bags: emptyBagState(), items: emptyItems },
    items,
    bags,
    catalog,
  );
}

function finish(args: {
  ranked: RankedLayout[];
  catalog: Map<string, Item>;
  stats: OptimizerStats;
  started: number;
  options: OptimizerOptions;
  algorithm: OptimizerAlgorithm;
  searchExhaustive: boolean;
  heuristicSamples?: import("./search-types.ts").HeuristicSample[];
}): OptimizerResult {
  let ranked = sortRankedLayouts(args.ranked);
  const initialScore = ranked[0] ? layoutScore(ranked[0]) : Number.NEGATIVE_INFINITY;
  const lsOptions = resolveLocalSearchOptions(args.options.localSearch);
  let lsStats = emptyLocalSearchStats(initialScore);
  const resultCount = Math.max(1, args.options.resultCount ?? 1);

  if (lsOptions) {
    const improved = improveTopNLocally(ranked, args.catalog, resultCount, lsOptions);
    ranked = improved.layouts;
    lsStats = improved.stats;
  }

  const bagLsOptions = resolveBagLocalSearchOptions(args.options.bagLocalSearch, {
    iterations: args.options.bagLocalSearchIterations,
    repairBeamWidth: args.options.bagRepairBeamWidth,
  });
  const bagLsInitial = ranked[0] ? layoutScore(ranked[0]) : initialScore;
  let bagLsStats = emptyBagLocalSearchStats(bagLsInitial);
  if (bagLsOptions) {
    const improved = improveTopNJointly(ranked, args.catalog, resultCount, bagLsOptions);
    ranked = improved.layouts;
    bagLsStats = improved.stats;
  }

  const best = ranked[0]!;
  args.stats.durationMs = Date.now() - args.started;
  const top = ranked.slice(0, resultCount);
  const layout = toLayout(best);
  const alternatives: OptimizerAlternative[] = top.slice(1).map((entry) => ({
    layout: toLayout(entry),
    score: entry.score,
    complete: entry.complete,
    unplacedItems: entry.unplacedItems,
    unplacedBags: entry.unplacedBags,
    signature: entry.signature,
  }));

  const result: OptimizerResult = {
    bestState: best.state,
    score: best.score,
    placedItems: best.state.items.items,
    placedBags: best.state.bags.bags,
    unplacedItems: best.unplacedItems,
    unplacedBags: best.unplacedBags,
    complete: best.complete,
    stats: args.stats,
    layout,
    alternatives,
    searchExhaustive: args.searchExhaustive,
    heuristicSamples: args.heuristicSamples,
    metrics: toOptimizerMetrics(
      {
        bestState: best.state,
        score: best.score,
        placedItems: best.state.items.items,
        placedBags: best.state.bags.bags,
        unplacedItems: best.unplacedItems,
        unplacedBags: best.unplacedBags,
        complete: best.complete,
        stats: args.stats,
        layout,
        alternatives,
        searchExhaustive: args.searchExhaustive,
      },
      args.algorithm,
      args.searchExhaustive,
      {
        beamWidth: args.options.itemBeamWidth,
        bagBeamWidth: args.options.bagBeamWidth,
        localSearch: {
          enabled: lsOptions !== null,
          iterations: lsStats.iterations,
          neighbors: lsStats.neighborsEvaluated,
          improvements: lsStats.improvements,
          initialScore: lsStats.initialScore,
        },
        bagLocalSearch: {
          enabled: bagLsOptions !== null,
          iterations: bagLsStats.iterations,
          neighborsGenerated: bagLsStats.bagNeighborsGenerated,
          neighborsVisited: bagLsStats.bagNeighborsVisited,
          neighborsPruned: bagLsStats.bagNeighborsPruned,
          layoutsAccepted: bagLsStats.bagLayoutsAccepted,
          displacedItems: bagLsStats.displacedItems,
          repairedItems: bagLsStats.repairedItems,
          unrepairedItems: bagLsStats.unrepairedItems,
          repairStatesGenerated: bagLsStats.repairStatesGenerated,
          repairStatesPruned: bagLsStats.repairStatesPruned,
          initialScore: bagLsStats.initialScore,
          finalScore: bagLsStats.finalScore,
          durationMs: bagLsStats.durationMs,
          repairDurationMs: bagLsStats.repairDurationMs,
          itemLocalSearchDurationMs: bagLsStats.itemLocalSearchDurationMs,
        },
      },
    ),
  };

  if (args.options.metrics === false) {
    delete result.metrics;
  }

  return result;
}

function toLayout(ranked: RankedLayout): OptimizerLayout {
  return {
    bags: ranked.state.bags.bags,
    items: ranked.state.items.items,
  };
}

function resolveInput(input: RunOptimizerInput): ResolvedOptimizerInput {
  return {
    backpack: input.backpack ?? input.inventory ?? DEFAULT_BACKPACK,
    bags: input.bags,
    items: input.items,
    catalog: input.catalog ?? loadProductionCatalog(),
    options: { ...DEFAULT_OPTIMIZER_OPTIONS, ...input.options },
  };
}

function validateInput(input: ResolvedOptimizerInput): void {
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

function log(verbose: boolean | undefined, message: string): void {
  if (verbose) console.info(`[optimizer] ${message}`);
}
