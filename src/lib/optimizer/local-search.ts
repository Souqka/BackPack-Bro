/**
 * Local Search после основного поиска (Beam / Greedy / DFS).
 *
 * Не запускает runOptimizer заново: сосед строится из текущего SearchState
 * через removePlacement + generatePlacementCandidates + addCandidate.
 * Принятие соседа — только PlacementScore / compareRankedLayouts, не heuristic.
 *
 * Зачем после Top-N, а не внутри Beam: heuristic на partial-state специально
 * грубая; финальный score известен только у законченного layout. Локальные
 * ходы имеют смысл, когда уже есть несколько разных полных кандидатов.
 *
 * Соседи (детерминированный порядок, без Math.random):
 * 1) поставить unplaced Item;
 * 2) relocate / rotate одного placed Item;
 * 3) swap двух placed Items, если оба кандидата валидны.
 *
 * Bag mutations на этом этапе нет: смена Bags ломает availableCells и
 * потребовала бы полный Item re-place — это уже не локальный шаг.
 */

import type { Item } from "../inventory/types.ts";
import { analyzePlacementScore } from "../scoring/analyzer.ts";
import { generatePlacementCandidates } from "./candidates.ts";
import { isStrictlyBetterLayout, compareRankedLayouts } from "./rank.ts";
import type { OptimizerState, RankedLayout, LocalSearchOptions } from "./search-types.ts";
import { getOptimizerStateSignature } from "./signature.ts";
import { addCandidate, removePlacement } from "./state.ts";
import type { ItemToPlace, PlacedItem } from "./types.ts";

export interface LocalSearchStats {
  iterations: number;
  neighborsEvaluated: number;
  improvements: number;
  visitedStates: number;
  improved: boolean;
  initialScore: number;
  finalScore: number;
}

export interface LocalSearchOutcome {
  layout: RankedLayout;
  stats: LocalSearchStats;
}

export const DEFAULT_LOCAL_SEARCH_OPTIONS: Required<LocalSearchOptions> = {
  maxIterations: 10,
  maxNeighbors: 100,
};

export function resolveLocalSearchOptions(
  value?: boolean | LocalSearchOptions,
): Required<LocalSearchOptions> | null {
  if (value === undefined || value === false) return null;
  if (value === true) return { ...DEFAULT_LOCAL_SEARCH_OPTIONS };
  return { ...DEFAULT_LOCAL_SEARCH_OPTIONS, ...value };
}

export function layoutScore(layout: RankedLayout): number {
  return layout.score.valid ? layout.score.score : Number.NEGATIVE_INFINITY;
}

/**
 * Hill-climbing по одному layout.
 * На каждом шаге берётся строго лучший сосед среди первых maxNeighbors
 * в детерминированном порядке. Равный score не принимается.
 */
export function improveLayoutLocally(
  initial: RankedLayout,
  catalog: Map<string, Item>,
  options?: LocalSearchOptions,
): LocalSearchOutcome {
  const limits = { ...DEFAULT_LOCAL_SEARCH_OPTIONS, ...options };
  const visited = new Set<string>([initial.signature]);
  let current = initial;
  let iterations = 0;
  let neighborsEvaluated = 0;
  let improvements = 0;
  const initialScore = layoutScore(initial);

  for (let step = 0; step < limits.maxIterations; step++) {
    iterations += 1;
    const neighbors = collectNeighbors(current, catalog, visited, limits.maxNeighbors);
    neighborsEvaluated += neighbors.length;
    for (const neighbor of neighbors) visited.add(neighbor.signature);

    const better = neighbors.filter((neighbor) => isStrictlyBetterLayout(neighbor, current));
    if (better.length === 0) break;
    better.sort(compareRankedLayouts);
    current = better[0]!;
    improvements += 1;
  }

  return {
    layout: current,
    stats: {
      iterations,
      neighborsEvaluated,
      improvements,
      visitedStates: visited.size,
      improved: improvements > 0,
      initialScore,
      finalScore: layoutScore(current),
    },
  };
}

/**
 * Local Search по Top-N: каждый seed улучшается отдельно, затем merge + rank.
 * Так второй/третий Beam-кандидат может обогнать бывшего лидера после локальных ходов.
 */
export function improveTopNLocally(
  layouts: RankedLayout[],
  catalog: Map<string, Item>,
  resultCount: number,
  options?: LocalSearchOptions,
): { layouts: RankedLayout[]; stats: LocalSearchStats } {
  const ranked = [...layouts].sort(compareRankedLayouts);
  const seedCount = Math.max(1, resultCount);
  const seeds = ranked.slice(0, seedCount);
  const unique = new Map<string, RankedLayout>();
  for (const layout of ranked) unique.set(layout.signature, layout);

  const aggregated: LocalSearchStats = {
    iterations: 0,
    neighborsEvaluated: 0,
    improvements: 0,
    visitedStates: 0,
    improved: false,
    initialScore: ranked[0] ? layoutScore(ranked[0]) : Number.NEGATIVE_INFINITY,
    finalScore: Number.NEGATIVE_INFINITY,
  };

  for (const seed of seeds) {
    const outcome = improveLayoutLocally(seed, catalog, options);
    aggregated.iterations += outcome.stats.iterations;
    aggregated.neighborsEvaluated += outcome.stats.neighborsEvaluated;
    aggregated.improvements += outcome.stats.improvements;
    aggregated.visitedStates += outcome.stats.visitedStates;
    if (outcome.stats.improved) aggregated.improved = true;
    const prev = unique.get(outcome.layout.signature);
    if (!prev || compareRankedLayouts(outcome.layout, prev) < 0) {
      unique.set(outcome.layout.signature, outcome.layout);
    }
  }

  const merged = [...unique.values()].sort(compareRankedLayouts);
  aggregated.finalScore = merged[0] ? layoutScore(merged[0]) : aggregated.initialScore;
  return { layouts: merged, stats: aggregated };
}

function collectNeighbors(
  current: RankedLayout,
  catalog: Map<string, Item>,
  visited: ReadonlySet<string>,
  maxNeighbors: number,
): RankedLayout[] {
  const neighbors: RankedLayout[] = [];
  const seen = new Set<string>();

  const push = (neighbor: RankedLayout | null) => {
    if (!neighbor) return false;
    if (visited.has(neighbor.signature) || seen.has(neighbor.signature)) return neighbors.length >= maxNeighbors;
    seen.add(neighbor.signature);
    neighbors.push(neighbor);
    return neighbors.length >= maxNeighbors;
  };

  if (collectUnplacedNeighbors(current, catalog, push)) return neighbors;
  if (collectRelocateNeighbors(current, catalog, push)) return neighbors;
  collectSwapNeighbors(current, catalog, push);
  return neighbors;
}

function collectUnplacedNeighbors(
  current: RankedLayout,
  catalog: Map<string, Item>,
  push: (neighbor: RankedLayout | null) => boolean,
): boolean {
  const unplaced = sortToPlace(current.unplacedItems);
  for (const item of unplaced) {
    const candidates = generatePlacementCandidates(
      item,
      current.state.items,
      catalog,
      current.state.bags.availableCells,
    );
    for (const candidate of candidates) {
      const nextItems = addCandidate(current.state.items, candidate);
      const rest = current.unplacedItems.filter((entry) => entry.instanceId !== item.instanceId);
      if (push(toRanked(current, { ...current.state, items: nextItems }, rest, catalog))) return true;
    }
  }
  return false;
}

function collectRelocateNeighbors(
  current: RankedLayout,
  catalog: Map<string, Item>,
  push: (neighbor: RankedLayout | null) => boolean,
): boolean {
  const placed = sortPlaced(current.state.items.items);
  for (const item of placed) {
    const stripped = removePlacement(current.state.items, item.instanceId);
    const toPlace: ItemToPlace = { instanceId: item.instanceId, itemId: item.itemId };
    const candidates = generatePlacementCandidates(
      toPlace,
      stripped,
      catalog,
      current.state.bags.availableCells,
    );
    for (const candidate of candidates) {
      if (samePlacement(candidate.placement, item)) continue;
      const nextItems = addCandidate(stripped, candidate);
      if (push(toRanked(current, { ...current.state, items: nextItems }, current.unplacedItems, catalog))) {
        return true;
      }
    }
  }
  return false;
}

function collectSwapNeighbors(
  current: RankedLayout,
  catalog: Map<string, Item>,
  push: (neighbor: RankedLayout | null) => boolean,
): boolean {
  const placed = sortPlaced(current.state.items.items);
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i]!;
      const b = placed[j]!;
      const stripped = removePlacement(removePlacement(current.state.items, a.instanceId), b.instanceId);
      const candA = findCandidateAt(
        { instanceId: a.instanceId, itemId: a.itemId },
        stripped,
        catalog,
        current.state.bags.availableCells,
        b,
      );
      if (!candA) continue;
      const afterA = addCandidate(stripped, candA);
      const candB = findCandidateAt(
        { instanceId: b.instanceId, itemId: b.itemId },
        afterA,
        catalog,
        current.state.bags.availableCells,
        a,
      );
      if (!candB) continue;
      const nextItems = addCandidate(afterA, candB);
      if (push(toRanked(current, { ...current.state, items: nextItems }, current.unplacedItems, catalog))) {
        return true;
      }
    }
  }
  return false;
}

function findCandidateAt(
  item: ItemToPlace,
  state: RankedLayout["state"]["items"],
  catalog: Map<string, Item>,
  availableCells: ReadonlySet<string>,
  target: PlacedItem,
) {
  const candidates = generatePlacementCandidates(item, state, catalog, availableCells);
  return (
    candidates.find(
      (candidate) =>
        candidate.placement.position.row === target.position.row &&
        candidate.placement.position.col === target.position.col &&
        candidate.placement.rotation === target.rotation,
    ) ?? null
  );
}

function toRanked(
  origin: RankedLayout,
  state: OptimizerState,
  unplacedItems: ItemToPlace[],
  catalog: Map<string, Item>,
): RankedLayout | null {
  const score = analyzePlacementScore({ inventory: state.backpack, items: state.items.items }, catalog);
  if (!score.valid) return null;
  return {
    state,
    score,
    unplacedItems,
    unplacedBags: origin.unplacedBags,
    complete:
      unplacedItems.length === 0 && origin.unplacedBags.length === 0 && state.bags.bags.length > 0,
    signature: getOptimizerStateSignature(state),
  };
}

function samePlacement(a: PlacedItem, b: PlacedItem): boolean {
  return (
    a.instanceId === b.instanceId &&
    a.position.row === b.position.row &&
    a.position.col === b.position.col &&
    a.rotation === b.rotation
  );
}

function sortPlaced(items: PlacedItem[]): PlacedItem[] {
  return [...items].sort((a, b) => (a.instanceId < b.instanceId ? -1 : a.instanceId > b.instanceId ? 1 : 0));
}

function sortToPlace(items: ItemToPlace[]): ItemToPlace[] {
  return [...items].sort((a, b) => (a.instanceId < b.instanceId ? -1 : a.instanceId > b.instanceId ? 1 : 0));
}

export function emptyLocalSearchStats(initialScore = Number.NEGATIVE_INFINITY): LocalSearchStats {
  return {
    iterations: 0,
    neighborsEvaluated: 0,
    improvements: 0,
    visitedStates: 0,
    improved: false,
    initialScore,
    finalScore: initialScore,
  };
}
