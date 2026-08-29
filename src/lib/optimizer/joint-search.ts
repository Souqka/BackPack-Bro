/**
 * Joint Bag + Item Local Search.
 *
 * Bag topology is part of the search space, but each neighbor is a local
 * mutation of an existing layout — never a full runOptimizer restart.
 *
 * Per Top-N seed (own visitedBagLayouts):
 *   generate Bag neighbors
 *     → skip seen signatures
 *     → repair displaced Items (bounded Beam)
 *     → existing Item Local Search
 *     → scoreLayout via buildRankedLayout
 *     → accept only isStrictlyBetterLayout
 */

import type { Item } from "../inventory/types.ts";
import {
  emptyBagLocalSearchStats,
  mergeBagLocalSearchStats,
  resolveBagLocalSearchOptions,
  type BagLocalSearchStats,
} from "./bag-local-search.ts";
import { canonicalBagSignature, generateBagNeighbors, limitBagNeighbors } from "./bag-neighbors.ts";
import { improveLayoutLocally, layoutScore } from "./local-search.ts";
import { buildRankedLayout, compareRankedLayouts, isStrictlyBetterLayout, sortRankedLayouts } from "./rank.ts";
import { repairItemLayout } from "./repair.ts";
import type { BagLocalSearchOptions, RankedLayout } from "./search-types.ts";
import type { BagState } from "./bags/types.ts";

export function runJointLocalSearch(
  seed: RankedLayout,
  catalog: Map<string, Item>,
  options?: BagLocalSearchOptions,
): { layout: RankedLayout; stats: BagLocalSearchStats } {
  const limits = resolveBagLocalSearchOptions(options ?? true);
  if (!limits) {
    const stats = emptyBagLocalSearchStats(layoutScore(seed));
    stats.finalScore = stats.initialScore;
    return { layout: seed, stats };
  }
  const started = Date.now();
  const visitedBags = new Set<string>([canonicalBagSignature(seed.state.bags)]);
  let current = seed;
  const stats = emptyBagLocalSearchStats(layoutScore(seed));
  stats.visitedBagLayouts = visitedBags.size;

  for (let step = 0; step < limits.maxIterations; step++) {
    stats.iterations += 1;
    const generated = generateBagNeighbors(current.state.bags, current.state.backpack, catalog);
    stats.bagNeighborsGenerated += generated.length;

    const fresh = generated.filter((neighbor) => !visitedBags.has(neighbor.signature));
    stats.bagNeighborsPruned += generated.length - fresh.length;
    const limited = limitBagNeighbors(fresh, limits.maxNeighbors);
    stats.bagNeighborsPruned += Math.max(0, fresh.length - limited.length);

    const evaluated: RankedLayout[] = [];
    for (const neighbor of limited) {
      visitedBags.add(neighbor.signature);
      stats.bagNeighborsVisited += 1;
      const candidate = evaluateBagNeighbor(current, neighbor.bags, catalog, limits);
      stats.displacedItems += candidate.displaced;
      stats.repairedItems += candidate.repaired;
      stats.unrepairedItems += candidate.unrepaired;
      stats.repairStatesGenerated += candidate.repairStatesGenerated;
      stats.repairStatesPruned += candidate.repairStatesPruned;
      stats.repairDurationMs += candidate.repairDurationMs;
      stats.itemLocalSearchDurationMs += candidate.itemLocalSearchDurationMs;
      evaluated.push(candidate.layout);
    }

    const better = evaluated.filter((layout) => isStrictlyBetterLayout(layout, current));
    if (better.length === 0) break;
    better.sort(compareRankedLayouts);
    current = better[0]!;
    stats.bagLayoutsAccepted += 1;
    visitedBags.add(canonicalBagSignature(current.state.bags));
    stats.visitedBagLayouts = visitedBags.size;
  }

  stats.visitedBagLayouts = visitedBags.size;
  stats.finalScore = layoutScore(current);
  stats.scoreDelta =
    stats.initialScore === Number.NEGATIVE_INFINITY || stats.finalScore === Number.NEGATIVE_INFINITY
      ? 0
      : stats.finalScore - stats.initialScore;
  stats.durationMs = Date.now() - started;
  return { layout: current, stats };
}

/**
 * Each Top-N seed has its own visitedBagLayouts. After all seeds, merge by
 * canonical full-layout signature and rank with the existing helper.
 */
export function improveTopNJointly(
  layouts: RankedLayout[],
  catalog: Map<string, Item>,
  resultCount: number,
  options?: BagLocalSearchOptions,
): { layouts: RankedLayout[]; stats: BagLocalSearchStats } {
  const ranked = sortRankedLayouts(layouts);
  const seeds = ranked.slice(0, Math.max(1, resultCount));
  const unique = new Map<string, RankedLayout>();
  for (const layout of ranked) unique.set(layout.signature, layout);

  const parts: BagLocalSearchStats[] = [];
  for (const seed of seeds) {
    const outcome = runJointLocalSearch(seed, catalog, options);
    parts.push(outcome.stats);
    const prev = unique.get(outcome.layout.signature);
    if (!prev || compareRankedLayouts(outcome.layout, prev) < 0) {
      unique.set(outcome.layout.signature, outcome.layout);
    }
  }

  const merged = sortRankedLayouts([...unique.values()]);
  const stats = mergeBagLocalSearchStats(parts);
  stats.initialScore = ranked[0] ? layoutScore(ranked[0]) : Number.NEGATIVE_INFINITY;
  stats.finalScore = merged[0] ? layoutScore(merged[0]) : stats.initialScore;
  stats.scoreDelta =
    stats.initialScore === Number.NEGATIVE_INFINITY || stats.finalScore === Number.NEGATIVE_INFINITY
      ? 0
      : stats.finalScore - stats.initialScore;
  return { layouts: merged, stats };
}

function evaluateBagNeighbor(
  origin: RankedLayout,
  bags: BagState,
  catalog: Map<string, Item>,
  limits: Required<BagLocalSearchOptions>,
): {
  layout: RankedLayout;
  displaced: number;
  repaired: number;
  unrepaired: number;
  repairStatesGenerated: number;
  repairStatesPruned: number;
  repairDurationMs: number;
  itemLocalSearchDurationMs: number;
} {
  const mutated: RankedLayout["state"] = {
    backpack: origin.state.backpack,
    bags,
    items: origin.state.items,
  };
  const repaired = repairItemLayout(mutated, origin.unplacedItems, catalog, {
    beamWidth: limits.repairBeamWidth,
  });
  let layout = buildRankedLayout(repaired.state, repaired.unplacedItems, origin.unplacedBags, catalog);
  let itemLocalSearchDurationMs = 0;
  if (limits.itemLocalSearch) {
    const lsStarted = Date.now();
    layout = improveLayoutLocally(layout, catalog).layout;
    itemLocalSearchDurationMs = Date.now() - lsStarted;
  }
  return {
    layout,
    displaced: repaired.displaced.length,
    repaired: repaired.repaired.length,
    unrepaired: repaired.unrepaired.length,
    repairStatesGenerated: repaired.statesGenerated,
    repairStatesPruned: repaired.statesPruned,
    repairDurationMs: repaired.durationMs,
    itemLocalSearchDurationMs,
  };
}
