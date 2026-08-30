/**
 * Run-scoped memoization of PlacementScore.
 *
 * analyzePlacementScore remains the source of truth. This module only
 * skips a full analysis when the same scoring-relevant layout was already
 * evaluated in the current optimizer run.
 *
 * On a cache miss, an optional IncrementalScoreContext may rebuild only the
 * affected InventoryAnalysis region. Approximate numeric deltas are forbidden.
 *
 * Not a process-wide singleton: each runOptimizer / runAdaptiveOptimizer
 * creates a cache, binds it for the duration of the run, then drops it.
 */

import type { Item } from "../inventory/types.ts";
import { analyzePlacementScore } from "../scoring/analyzer.ts";
import {
  isIncrementalScoringEnabled,
  tryIncrementalPlacementScore,
  type IncrementalScoreContext,
} from "../scoring/incremental/index.ts";
import type { PlacementScore } from "../scoring/types.ts";
import type { OptimizerState, OptimizerStats } from "./search-types.ts";
import { getOptimizerStateSignature } from "./signature.ts";

export interface ScoreCacheMetrics {
  hits: number;
  misses: number;
  evaluations: number;
  uniqueLayoutsScored: number;
  incrementalScoreAttempts: number;
  incrementalScoreSuccesses: number;
  incrementalScoreFallbacks: number;
  incrementalAffectedItems: number;
  incrementalAffectedInteractions: number;
  incrementalAffectedStars: number;
}

export interface ScoreCache {
  readonly enabled: boolean;
  get(key: string): PlacementScore | undefined;
  set(key: string, value: PlacementScore): void;
  has(key: string): boolean;
  clear(): void;
  snapshot(): ScoreCacheMetrics;
  evaluate(
    state: OptimizerState,
    catalog: Map<string, Item>,
    incremental?: IncrementalScoreContext | null,
  ): PlacementScore;
}

const EMPTY_METRICS: ScoreCacheMetrics = {
  hits: 0,
  misses: 0,
  evaluations: 0,
  uniqueLayoutsScored: 0,
  incrementalScoreAttempts: 0,
  incrementalScoreSuccesses: 0,
  incrementalScoreFallbacks: 0,
  incrementalAffectedItems: 0,
  incrementalAffectedInteractions: 0,
  incrementalAffectedStars: 0,
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
 * layouts reuse the frozen PlacementScore. Misses try incremental scoring
 * when context is present, otherwise analyzePlacementScore, then store.
 */
export function scoreLayout(
  state: OptimizerState,
  catalog: Map<string, Item>,
  cache: ScoreCache | null = getActiveScoreCache(),
  incremental?: IncrementalScoreContext | null,
): PlacementScore {
  if (!cache) {
    return evaluateUncached(state, catalog, incremental);
  }
  return cache.evaluate(state, catalog, incremental);
}

export function applyScoreCacheMetrics(stats: OptimizerStats, cache: ScoreCache | null = getActiveScoreCache()): void {
  const snapshot = cache?.snapshot() ?? EMPTY_METRICS;
  stats.scoreCacheHits = snapshot.hits;
  stats.scoreCacheMisses = snapshot.misses;
  stats.scoreCacheEvaluations = snapshot.evaluations;
  stats.scoreCacheUniqueLayouts = snapshot.uniqueLayoutsScored;
  stats.incrementalScoreAttempts = snapshot.incrementalScoreAttempts;
  stats.incrementalScoreSuccesses = snapshot.incrementalScoreSuccesses;
  stats.incrementalScoreFallbacks = snapshot.incrementalScoreFallbacks;
  stats.incrementalAffectedItems = snapshot.incrementalAffectedItems;
  stats.incrementalAffectedInteractions = snapshot.incrementalAffectedInteractions;
  stats.incrementalAffectedStars = snapshot.incrementalAffectedStars;
}

export function scoreCacheHitRate(metrics: { hits: number; evaluations: number }): number {
  return metrics.evaluations === 0 ? 0 : metrics.hits / metrics.evaluations;
}

function evaluateUncached(
  state: OptimizerState,
  catalog: Map<string, Item>,
  incremental?: IncrementalScoreContext | null,
): PlacementScore {
  return computePlacementScore(state, catalog, incremental).score;
}

function computePlacementScore(
  state: OptimizerState,
  catalog: Map<string, Item>,
  incremental?: IncrementalScoreContext | null,
): { score: PlacementScore; incremental?: IncrementalScoreResultMetrics } {
  const inventory = { inventory: state.backpack, items: state.items.items };
  if (incremental && isIncrementalScoringEnabled()) {
    const result = tryIncrementalPlacementScore(state, catalog, incremental);
    return {
      score: result.score,
      incremental: {
        attempted: true,
        success: result.mode === "incremental",
        affectedItems: result.affectedInstanceIds.length,
        affectedInteractions: result.affectedInteractionCount,
        affectedStars: result.affectedStarCount,
      },
    };
  }
  return { score: analyzePlacementScore(inventory, catalog) };
}

interface IncrementalScoreResultMetrics {
  attempted: boolean;
  success: boolean;
  affectedItems: number;
  affectedInteractions: number;
  affectedStars: number;
}

class LayoutScoreCache implements ScoreCache {
  readonly enabled: boolean;
  private readonly store = new Map<string, PlacementScore>();
  private readonly seen = new Set<string>();
  private hits = 0;
  private misses = 0;
  private incrementalScoreAttempts = 0;
  private incrementalScoreSuccesses = 0;
  private incrementalScoreFallbacks = 0;
  private incrementalAffectedItems = 0;
  private incrementalAffectedInteractions = 0;
  private incrementalAffectedStars = 0;

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
    this.incrementalScoreAttempts = 0;
    this.incrementalScoreSuccesses = 0;
    this.incrementalScoreFallbacks = 0;
    this.incrementalAffectedItems = 0;
    this.incrementalAffectedInteractions = 0;
    this.incrementalAffectedStars = 0;
  }

  snapshot(): ScoreCacheMetrics {
    return {
      hits: this.hits,
      misses: this.misses,
      evaluations: this.hits + this.misses,
      uniqueLayoutsScored: this.seen.size,
      incrementalScoreAttempts: this.incrementalScoreAttempts,
      incrementalScoreSuccesses: this.incrementalScoreSuccesses,
      incrementalScoreFallbacks: this.incrementalScoreFallbacks,
      incrementalAffectedItems: this.incrementalAffectedItems,
      incrementalAffectedInteractions: this.incrementalAffectedInteractions,
      incrementalAffectedStars: this.incrementalAffectedStars,
    };
  }

  evaluate(
    state: OptimizerState,
    catalog: Map<string, Item>,
    incremental?: IncrementalScoreContext | null,
  ): PlacementScore {
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
    const computed = computePlacementScore(state, catalog, incremental);
    this.recordIncremental(computed.incremental);
    if (!this.enabled) return computed.score;
    const frozen = freezePlacementScore(computed.score);
    this.store.set(key, frozen);
    return frozen;
  }

  private recordIncremental(metrics?: IncrementalScoreResultMetrics): void {
    if (!metrics?.attempted) return;
    this.incrementalScoreAttempts += 1;
    if (metrics.success) {
      this.incrementalScoreSuccesses += 1;
      this.incrementalAffectedItems += metrics.affectedItems;
      this.incrementalAffectedInteractions += metrics.affectedInteractions;
      this.incrementalAffectedStars += metrics.affectedStars;
    } else {
      this.incrementalScoreFallbacks += 1;
    }
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
