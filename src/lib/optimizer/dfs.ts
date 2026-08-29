/**
 * Reference DFS для маленьких benchmark cases.
 *
 * DFS не заменяет Beam Search и не запускается на полном каталоге.
 * Он нужен, чтобы на крошечном наборе получить reference best score
 * и измерить gap = reference − beam.
 *
 * Если сработал maxNodes / maxDepth / timeoutMs, searchExhaustive = false
 * и результат нельзя называть глобальным оптимумом.
 *
 * Кандидаты обходятся в порядке signature, без Math.random и без
 * эвристической сортировки: иначе «reference» зависел бы от той же
 * heuristic, которую мы проверяем.
 *
 * Вдоль каждого пути сохраняются (heuristic, depth); finalScore
 * дописывается на терминале — так можно искать инверсии heuristic.
 */

import type { Item } from "../inventory/types.ts";
import { addBagCandidate, emptyBagState, generateBagCandidates } from "./bags/index.ts";
import type { BagState } from "./bags/types.ts";
import { generatePlacementCandidates } from "./candidates.ts";
import { getCandidateSignature } from "./deduplication.ts";
import { orderBags } from "./greedy.ts";
import { evaluatePartialState, remainingItemCells } from "./heuristic.ts";
import { orderItemsForSearch } from "./ordering.ts";
import type {
  DfsSearchLimits,
  HeuristicSample,
  OptimizerOptions,
  OptimizerState,
  OptimizerStats,
  RankedLayout,
} from "./search-types.ts";
import { DEFAULT_DFS_LIMITS } from "./search-types.ts";
import { getOptimizerStateSignature } from "./signature.ts";
import { addCandidate, createSearchState } from "./state.ts";
import { scoreLayout } from "./score-cache.ts";
import type { Backpack, ItemToPlace } from "./types.ts";

const MAX_UNIQUE_LAYOUTS = 400;
const MAX_SAMPLES = 8_000;

export interface DfsSearchInput {
  backpack: Backpack;
  bags: ItemToPlace[];
  items: ItemToPlace[];
  catalog: Map<string, Item>;
  options: OptimizerOptions;
  stats: OptimizerStats;
  deadlineMs?: number;
}

export interface DfsSearchOutput {
  ranked: RankedLayout[];
  searchExhaustive: boolean;
  samples: HeuristicSample[];
  nodesVisited: number;
}

interface DfsContext {
  backpack: Backpack;
  catalog: Map<string, Item>;
  items: ItemToPlace[];
  options: OptimizerOptions;
  stats: OptimizerStats;
  limits: Required<DfsSearchLimits>;
  started: number;
  deadlineMs?: number;
  nodesVisited: number;
  exhaustive: boolean;
  samples: HeuristicSample[];
  unique: Map<string, RankedLayout>;
  emptyItems: OptimizerState["items"];
}

export function runDfsSearch(input: DfsSearchInput): DfsSearchOutput {
  const emptyItems = createSearchState(input.backpack);
  if (!emptyItems.ok) {
    throw new Error("Не удалось создать пустой SearchState");
  }

  const limits = resolveDfsLimits(input.options.dfs);
  const ctx: DfsContext = {
    backpack: input.backpack,
    catalog: input.catalog,
    items: input.items,
    options: input.options,
    stats: input.stats,
    limits,
    started: Date.now(),
    deadlineMs: input.deadlineMs,
    nodesVisited: 0,
    exhaustive: true,
    samples: [],
    unique: new Map(),
    emptyItems: emptyItems.state,
  };

  const orderedBags = orderBags(input.bags, input.catalog);
  dfsBags(emptyBagState(), orderedBags, [], 0, ctx);

  const ranked = [...ctx.unique.values()];
  if (ranked.length === 0) {
    const fallback: OptimizerState = {
      backpack: input.backpack,
      bags: emptyBagState(),
      items: emptyItems.state,
    };
    ranked.push(toRanked(fallback, input.items, input.bags, input.catalog));
  }

  return {
    ranked,
    searchExhaustive: ctx.exhaustive,
    samples: ctx.samples,
    nodesVisited: ctx.nodesVisited,
  };
}

function dfsBags(
  bags: BagState,
  remaining: ItemToPlace[],
  unplaced: ItemToPlace[],
  depth: number,
  ctx: DfsContext,
): void {
  if (hitLimit(ctx, depth)) {
    if (bags.bags.length > 0) {
      dfsItemsFromBags(bags, unplaced.concat(remaining), ctx);
    }
    return;
  }

  ctx.nodesVisited += 1;
  ctx.stats.bagStatesGenerated += 1;

  if (remaining.length === 0) {
    dfsItemsFromBags(bags, unplaced, ctx);
    return;
  }

  const bag = remaining[0]!;
  const rest = remaining.slice(1);
  const candidates = generateBagCandidates(bag, bags, ctx.backpack, ctx.catalog);
  ctx.stats.candidatesGenerated += candidates.length;

  if (candidates.length === 0) {
    ctx.stats.bagStatesPruned += 1;
    dfsBags(bags, rest, [...unplaced, bag], depth, ctx);
    return;
  }

  const sorted = sortCandidates(candidates);
  let expanded = 0;
  for (const candidate of sorted) {
    if (hitLimit(ctx, depth + 1)) break;
    const next = addBagCandidate(bags, candidate, ctx.backpack);
    const remainingCells = remainingItemCells(rest, ctx.catalog);
    const freeBackpack = ctx.backpack.rows * ctx.backpack.cols - next.occupiedCells.size;
    if (remainingCells > freeBackpack) {
      ctx.stats.bagStatesPruned += 1;
      continue;
    }
    dfsBags(next, rest, unplaced, depth + 1, ctx);
    expanded += 1;
  }
  if (expanded === 0 && !hitLimit(ctx, depth)) {
    dfsBags(bags, rest, [...unplaced, bag], depth, ctx);
  }
}

function dfsItemsFromBags(bags: BagState, unplacedBags: ItemToPlace[], ctx: DfsContext): void {
  const initial: OptimizerState = {
    backpack: ctx.backpack,
    bags,
    items: ctx.emptyItems,
  };
  const ordered = ctx.options.dynamicOrdering
    ? [...ctx.items]
    : orderItemsForSearch(ctx.items, { catalog: ctx.catalog, state: initial });
  dfsItems(initial, ordered, [], unplacedBags, 0, [], ctx);
}

function dfsItems(
  state: OptimizerState,
  remaining: ItemToPlace[],
  unplacedItems: ItemToPlace[],
  unplacedBags: ItemToPlace[],
  depth: number,
  path: Array<{ heuristic: number; depth: number }>,
  ctx: DfsContext,
): void {
  if (hitLimit(ctx, depth)) {
    recordTerminal(state, remaining.concat(unplacedItems), unplacedBags, path, ctx);
    return;
  }

  ctx.nodesVisited += 1;
  ctx.stats.searchDepth = Math.max(ctx.stats.searchDepth, depth);

  if (remaining.length === 0) {
    recordTerminal(state, unplacedItems, unplacedBags, path, ctx);
    return;
  }

  const nextItem = ctx.options.dynamicOrdering
    ? orderItemsForSearch(remaining, { catalog: ctx.catalog, state })[0]!
    : remaining[0]!;
  const rest = remaining.filter((item) => item.instanceId !== nextItem.instanceId);
  const candidates = generatePlacementCandidates(
    nextItem,
    state.items,
    ctx.catalog,
    state.bags.availableCells,
  );
  ctx.stats.candidatesGenerated += candidates.length;

  if (candidates.length === 0) {
    ctx.stats.itemStatesPruned += 1;
    dfsItems(state, rest, [...unplacedItems, nextItem], unplacedBags, depth, path, ctx);
    return;
  }

  const sorted = sortCandidates(candidates);
  let expanded = 0;
  for (const candidate of sorted) {
    if (hitLimit(ctx, depth + 1)) break;
    const nextItems = addCandidate(state.items, candidate);
    const nextState: OptimizerState = {
      backpack: state.backpack,
      bags: state.bags,
      items: nextItems,
    };
    const free = nextState.bags.availableCells.size - nextState.items.occupiedCells.size;
    if (remainingItemCells(rest, ctx.catalog) > free) {
      ctx.stats.itemStatesPruned += 1;
      continue;
    }
    const heuristic = evaluatePartialState(nextState, rest, ctx.catalog);
    if (!heuristic.feasible) {
      ctx.stats.itemStatesPruned += 1;
      continue;
    }
    ctx.stats.itemStatesGenerated += 1;
    dfsItems(
      nextState,
      rest,
      unplacedItems,
      unplacedBags,
      depth + 1,
      [...path, { heuristic: heuristic.total, depth: depth + 1 }],
      ctx,
    );
    expanded += 1;
  }

  if (expanded === 0 && !hitLimit(ctx, depth)) {
    dfsItems(state, rest, [...unplacedItems, nextItem], unplacedBags, depth, path, ctx);
  }
}

function recordTerminal(
  state: OptimizerState,
  unplacedItems: ItemToPlace[],
  unplacedBags: ItemToPlace[],
  path: Array<{ heuristic: number; depth: number }>,
  ctx: DfsContext,
): void {
  const ranked = toRanked(state, unplacedItems, unplacedBags, ctx.catalog);
  const prev = ctx.unique.get(ranked.signature);
  if (!prev || layoutBetter(ranked, prev)) {
    if (ctx.unique.size < MAX_UNIQUE_LAYOUTS || prev) {
      ctx.unique.set(ranked.signature, ranked);
    }
  }

  if (ctx.samples.length >= MAX_SAMPLES) return;
  const finalScore = ranked.score.valid ? ranked.score.score : Number.NEGATIVE_INFINITY;
  for (const node of path) {
    if (ctx.samples.length >= MAX_SAMPLES) break;
    ctx.samples.push({
      heuristic: node.heuristic,
      finalScore,
      depth: node.depth,
    });
  }
}

function layoutBetter(a: RankedLayout, b: RankedLayout): boolean {
  if (a.complete !== b.complete) return a.complete;
  const sa = a.score.valid ? a.score.score : Number.NEGATIVE_INFINITY;
  const sb = b.score.valid ? b.score.score : Number.NEGATIVE_INFINITY;
  if (sa !== sb) return sa > sb;
  return a.signature < b.signature;
}

function hitLimit(ctx: DfsContext, depth: number): boolean {
  if (ctx.nodesVisited >= ctx.limits.maxNodes) {
    ctx.exhaustive = false;
    return true;
  }
  if (depth >= ctx.limits.maxDepth) {
    ctx.exhaustive = false;
    return true;
  }
  if (Date.now() - ctx.started >= ctx.limits.timeoutMs) {
    ctx.exhaustive = false;
    return true;
  }
  if (ctx.deadlineMs !== undefined && Date.now() >= ctx.deadlineMs) {
    ctx.exhaustive = false;
    return true;
  }
  return false;
}

function resolveDfsLimits(partial?: DfsSearchLimits): Required<DfsSearchLimits> {
  return {
    maxNodes: partial?.maxNodes ?? DEFAULT_DFS_LIMITS.maxNodes ?? 20_000,
    maxDepth: partial?.maxDepth ?? DEFAULT_DFS_LIMITS.maxDepth ?? 12,
    timeoutMs: partial?.timeoutMs ?? DEFAULT_DFS_LIMITS.timeoutMs ?? 5_000,
  };
}

function sortCandidates<T extends { placement: { instanceId: string } }>(
  candidates: T[],
): T[] {
  return [...candidates].sort((a, b) => {
    const sa = getCandidateSignature(a as never);
    const sb = getCandidateSignature(b as never);
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  });
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
