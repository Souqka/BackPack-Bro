/**
 * Run-scoped memoization of PlacementScore.
 *
 * analyzePlacementScore remains the source of truth. This module only
 * skips a full analysis when the same scoring-relevant layout was already
 * evaluated in the current optimizer run.
 *
 * Not a process-wide singleton: each runOptimizer / runAdaptiveOptimizer
 * creates a cache, binds it for the duration of the run, then drops it.
 */

import type { Item } from "../inventory/types.ts";
import { analyzePlacementScore } from "../scoring/analyzer.ts";
import type { PlacementScore } from "../scoring/types.ts";
import type { OptimizerState, OptimizerStats } from "./search-types.ts";
import { getOptimizerStateSignature } from "./signature.ts";

export interface ScoreCacheMetrics {
  hits: number;
  misses: number;
  evaluations: number;
  uniqueLayoutsScored: number;
}

export interface ScoreCache {
  readonly enabled: boolean;
  get(key: string): PlacementScore | undefined;
  set(key: string, value: PlacementScore): void;
  has(key: string): boolean;
  clear(): void;
  snapshot(): ScoreCacheMetrics;
  evaluate(state: OptimizerState, catalog: Map<string, Item>): PlacementScore;
}

const EMPTY_METRICS: ScoreCacheMetrics = {
  hits: 0,
  misses: 0,
  evaluations: 0,
  uniqueLayoutsScored: 0,
};

let activeStack: ScoreCache[] = [];

/**
 * Cache key for Scoring Engine results.
 *
 * Includes backpack size (emptyCells depends on the grid), Bag topology
 * (instanceId/itemId/row/col/rotation, sorted), and Item placements
 * (same fields, sorted). Array order, heuristic score, search IDs, and
 * debug fields are not part of the key.
 *
 * Bags are included even though analyzePlacementScore currently reads only
 * backpack + Items: same Items on a different Bag topology must not share
 * a score entry. Geometry-only keys are forbidden — two itemIds with the
 * same shape are not interchangeable.
 */
export function getScoreCacheKey(state: OptimizerState): string {
  const { rows, cols } = state.backpack;
  return `${rows}x${cols}\n${getOptimizerStateSignature(state)}`;
}

export function createScoreCache(options?: { enabled?: boolean }): ScoreCache {
  return new LayoutScoreCache(options?.enabled !== false);
}

export function withActiveScoreCache<T>(cache: ScoreCache, fn: () => T): T {
  activeStack.push(cache);
  try {
    return fn();
  } finally {
    activeStack.pop();
  }
}

export function getActiveScoreCache(): ScoreCache | null {
  return activeStack[activeStack.length - 1] ?? null;
}

/**
 * Shared scoring entry for optimizer algorithms.
 *
 * When a run-scoped cache is active (or passed explicitly), identical
 * layouts reuse the frozen PlacementScore. Misses call analyzePlacementScore
 * once and store the result.
 */
export function scoreLayout(
  state: OptimizerState,
  catalog: Map<string, Item>,
  cache: ScoreCache | null = getActiveScoreCache(),
): PlacementScore {
  if (!cache) {
    return analyzePlacementScore({ inventory: state.backpack, items: state.items.items }, catalog);
  }
  return cache.evaluate(state, catalog);
}

export function applyScoreCacheMetrics(stats: OptimizerStats, cache: ScoreCache | null = getActiveScoreCache()): void {
  const snapshot = cache?.snapshot() ?? EMPTY_METRICS;
  stats.scoreCacheHits = snapshot.hits;
  stats.scoreCacheMisses = snapshot.misses;
  stats.scoreCacheEvaluations = snapshot.evaluations;
  stats.scoreCacheUniqueLayouts = snapshot.uniqueLayoutsScored;
}

export function scoreCacheHitRate(metrics: { hits: number; evaluations: number }): number {
  return metrics.evaluations === 0 ? 0 : metrics.hits / metrics.evaluations;
}

class LayoutScoreCache implements ScoreCache {
  readonly enabled: boolean;
  private readonly store = new Map<string, PlacementScore>();
  private readonly seen = new Set<string>();
  private hits = 0;
  private misses = 0;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  get(key: string): PlacementScore | undefined {
    return this.store.get(key);
  }

  set(key: string, value: PlacementScore): void {
    if (!this.enabled) return;
    this.store.set(key, freezePlacementScore(value));
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  clear(): void {
    this.store.clear();
    this.seen.clear();
    this.hits = 0;
    this.misses = 0;
  }

  snapshot(): ScoreCacheMetrics {
    return {
      hits: this.hits,
      misses: this.misses,
      evaluations: this.hits + this.misses,
      uniqueLayoutsScored: this.seen.size,
    };
  }

  evaluate(state: OptimizerState, catalog: Map<string, Item>): PlacementScore {
    const key = getScoreCacheKey(state);
    this.seen.add(key);
    if (this.enabled) {
      const cached = this.store.get(key);
      if (cached) {
        this.hits += 1;
        return cached;
      }
    }
    this.misses += 1;
    const scored = analyzePlacementScore({ inventory: state.backpack, items: state.items.items }, catalog);
    if (!this.enabled) return scored;
    const frozen = freezePlacementScore(scored);
    this.store.set(key, frozen);
    return frozen;
  }
}

function freezePlacementScore(score: PlacementScore): PlacementScore {
  Object.freeze(score.breakdown.components);
  Object.freeze(score.breakdown);
  Object.freeze(score.effectCoverage);
  Object.freeze(score.synergies);
  Object.freeze(score.graph.nodes);
  Object.freeze(score.graph.edges);
  Object.freeze(score.graph);
  return Object.freeze(score);
}
