/**
 * Adaptive Portfolio Search: cheap Bag/Item beams, then Item LS + Joint LS,
 * then escalate bag/item width only when structural checks say so.
 *
 * Coordinates existing engines. Does not call runOptimizer per neighbor.
 * Does not change PlacementScore.
 */

import type { Item } from "../inventory/types.ts";
import { resolveAdaptiveSearchOptions, zipSearchLevels } from "./adaptive-options.ts";
import type {
  AdaptiveLevelMetrics,
  AdaptiveOptimizerResult,
  AdaptiveSearchMetrics,
  AdaptiveSearchOptions,
  AdaptiveStopReason,
} from "./adaptive-types.ts";
import { canonicalBagSignature } from "./bag-neighbors.ts";
import { selectDiverseBagSeeds } from "./bag-diversity.ts";
import { resolveBagLocalSearchOptions } from "./bag-local-search.ts";
import { emptyBagState } from "./bags/index.ts";
import { searchBagLayouts } from "./bags/search.ts";
import type { BagState } from "./bags/types.ts";
import { pastDeadline } from "./beam-search.ts";
import { improveTopNJointly } from "./joint-search.ts";
import {
  emptyLocalSearchStats,
  improveTopNLocally,
  layoutScore,
  resolveLocalSearchOptions,
} from "./local-search.ts";
import { loadProductionCatalog } from "./load-catalog.ts";
import { createEmptyStats, toOptimizerMetrics } from "./metrics.ts";
import { runBeamSearch } from "./optimizer.ts";
import { buildRankedLayout, isStrictlyBetterLayout, sortRankedLayouts } from "./rank.ts";
import type {
  OptimizerAlternative,
  OptimizerLayout,
  OptimizerResult,
  OptimizerStats,
  RankedLayout,
  RunOptimizerInput,
} from "./search-types.ts";
import { createSearchState } from "./state.ts";
import { DEFAULT_BACKPACK, type Backpack, type ItemToPlace } from "./types.ts";

export function runAdaptiveOptimizer(
  input: RunOptimizerInput,
  adaptive?: AdaptiveSearchOptions,
): AdaptiveOptimizerResult {
  const started = Date.now();
  const options = resolveAdaptiveSearchOptions({
    ...adaptive,
    maxDurationMs: adaptive?.maxDurationMs ?? input.options?.maxDurationMs,
  });
  const catalog = input.catalog ?? loadProductionCatalog();
  const backpack = input.backpack ?? input.inventory ?? DEFAULT_BACKPACK;
  validateAdaptiveInput(backpack, input.bags, input.items, catalog);

  const deadlineMs =
    options.maxDurationMs !== undefined ? started + options.maxDurationMs : undefined;
  const stats = createEmptyStats();
  const emptyItems = createSearchState(backpack);
  if (!emptyItems.ok) throw new Error("Не удалось создать пустой SearchState");

  const levels = zipSearchLevels(options.bagBeamWidths, options.itemBeamWidths);
  const unique = new Map<string, RankedLayout>();
  const processedBags = new Map<string, number>();
  const selectedSeeds: BagState[] = [];
  const levelMetrics: AdaptiveLevelMetrics[] = [];

  let unplacedBags: ItemToPlace[] = [];
  let bagSeedsGenerated = 0;
  let bagSeedsSelected = 0;
  let bagSeedsSkipped = 0;
  let localSearchNeighbors = 0;
  let jointNeighbors = 0;
  let jointImproved = false;
  let stableCount = 0;
  let previousBest: RankedLayout | null = null;
  let initialScore = Number.NEGATIVE_INFINITY;
  let stopReason: AdaptiveStopReason = "max_escalation_reached";
  let stoppedEarly = false;
  let lastBagBeamWidth = options.initialBagBeamWidth;
  let lastItemBeamWidth = options.initialItemBeamWidth;

  const lsOptions = options.enableItemLocalSearch ? resolveLocalSearchOptions(true) : null;
  const bagLsOptions = options.enableBagLocalSearch ? resolveBagLocalSearchOptions(true) : null;

  for (let levelIndex = 0; levelIndex < levels.length; levelIndex++) {
    const level = levels[levelIndex]!;
    lastBagBeamWidth = level.bagBeamWidth;
    lastItemBeamWidth = level.itemBeamWidth;
    const statesBefore = stats.bagStatesGenerated + stats.itemStatesGenerated;

    if (pastDeadline(deadlineMs)) {
      stopReason = "budget_exhausted";
      stoppedEarly = true;
      break;
    }

    const bagSearch = searchBagLayouts({
      backpack,
      bags: input.bags,
      catalog,
      beamWidth: level.bagBeamWidth,
      stats,
      deadlineMs,
    });
    unplacedBags = bagSearch.unplacedBags;
    bagSeedsGenerated += bagSearch.layouts.length;
    stats.searchDepth = Math.max(stats.searchDepth, bagSearch.placedCount);

    const unseen = bagSearch.layouts.filter((layout) => {
      const signature = canonicalBagSignature(layout);
      const usedWidth = processedBags.get(signature);
      return usedWidth === undefined || usedWidth < level.itemBeamWidth;
    });
    const skippedHere = bagSearch.layouts.length - unseen.length;
    bagSeedsSkipped += skippedHere;

    const fresh = unseen.filter((layout) => !processedBags.has(canonicalBagSignature(layout)));
    const rewiden = unseen.filter((layout) => processedBags.has(canonicalBagSignature(layout)));
    const picked = selectDiverseBagSeeds(
      fresh,
      options.maxBagSeeds,
      options.similarityThreshold,
      selectedSeeds,
    );
    for (const seed of picked) selectedSeeds.push(seed);
    const seedsThisLevel = [...picked, ...rewiden];
    bagSeedsSelected += picked.length;

    if (seedsThisLevel.length === 0 && bagSearch.layouts.length === 0) {
      rememberLayout(
        unique,
        buildRankedLayout(
          { backpack, bags: emptyBagState(), items: emptyItems.state },
          input.items,
          unplacedBags,
          catalog,
        ),
      );
    }

    for (const bags of seedsThisLevel) {
      if (pastDeadline(deadlineMs)) {
        stopReason = "budget_exhausted";
        stoppedEarly = true;
        break;
      }
      const signature = canonicalBagSignature(bags);
      processedBags.set(signature, level.itemBeamWidth);
      const itemResult = runBeamSearch(
        { backpack, bags, items: emptyItems.state },
        input.items,
        catalog,
        {
          beamWidth: level.itemBeamWidth,
          deadlineMs,
          dynamicOrdering: input.options?.dynamicOrdering,
        },
        stats,
      );
      for (const node of itemResult.finalNodes) {
        rememberLayout(unique, buildRankedLayout(node.state, node.unplacedItems, unplacedBags, catalog));
      }
    }

    if (stopReason === "budget_exhausted" && stoppedEarly) break;

    let ranked = sortRankedLayouts([...unique.values()]);
    if (ranked.length === 0 && bagSearch.layouts[0]) {
      ranked = [
        buildRankedLayout(
          { backpack, bags: bagSearch.layouts[0], items: emptyItems.state },
          input.items,
          unplacedBags,
          catalog,
        ),
      ];
      rememberLayout(unique, ranked[0]!);
    }

    if (lsOptions && ranked.length > 0) {
      const improved = improveTopNLocally(ranked, catalog, options.resultCount, lsOptions);
      ranked = improved.layouts;
      localSearchNeighbors += improved.stats.neighborsEvaluated;
      for (const layout of ranked) rememberLayout(unique, layout);
    }

    const beforeJoint = ranked[0] ?? null;
    if (bagLsOptions && ranked.length > 0) {
      const improved = improveTopNJointly(ranked, catalog, options.resultCount, bagLsOptions);
      ranked = improved.layouts;
      jointNeighbors += improved.stats.bagNeighborsVisited;
      if (improved.stats.bagLayoutsAccepted > 0) jointImproved = true;
      if (beforeJoint && ranked[0] && isStrictlyBetterLayout(ranked[0], beforeJoint)) {
        jointImproved = true;
      }
      for (const layout of ranked) rememberLayout(unique, layout);
    }

    ranked = sortRankedLayouts([...unique.values()]);
    const best = ranked[0];
    if (best && initialScore === Number.NEGATIVE_INFINITY) initialScore = layoutScore(best);

    const improvedBest =
      best !== undefined && (previousBest === null || isStrictlyBetterLayout(best, previousBest));
    if (improvedBest) stableCount = 0;
    else stableCount += 1;
    if (best) previousBest = best;

    levelMetrics.push({
      bagBeamWidth: level.bagBeamWidth,
      itemBeamWidth: level.itemBeamWidth,
      bagLayoutsGenerated: bagSearch.layouts.length,
      bagSeedsSelected: picked.length + rewiden.length,
      bagSeedsSkipped: skippedHere,
      statesGenerated: stats.bagStatesGenerated + stats.itemStatesGenerated - statesBefore,
      improved: improvedBest,
    });

    const moreLevels = levelIndex < levels.length - 1;
    const noNewBags = picked.length === 0 && rewiden.length === 0;
    const higherBagWidth =
      moreLevels && levels.slice(levelIndex + 1).some((next) => next.bagBeamWidth > level.bagBeamWidth);
    const higherItemWidth =
      moreLevels && levels.slice(levelIndex + 1).some((next) => next.itemBeamWidth > level.itemBeamWidth);

    if (pastDeadline(deadlineMs)) {
      stopReason = "budget_exhausted";
      stoppedEarly = true;
      break;
    }
    if (options.stopWhenComplete && best?.complete) {
      stopReason = "complete_layout";
      stoppedEarly = true;
      break;
    }
    if (
      options.stableLevelsBeforeStop !== false &&
      options.stableLevelsBeforeStop !== undefined &&
      stableCount >= options.stableLevelsBeforeStop
    ) {
      stopReason = "stable_result";
      stoppedEarly = true;
      break;
    }
    if (noNewBags && !higherBagWidth && !higherItemWidth) {
      stopReason = "no_more_unique_bag_seeds";
      stoppedEarly = true;
      break;
    }
    if (!moreLevels) {
      stopReason = "max_escalation_reached";
      stoppedEarly = false;
      break;
    }
  }

  const ranked = sortRankedLayouts([...unique.values()]);
  const fallback =
    ranked.length > 0
      ? ranked
      : [
          buildRankedLayout(
            { backpack, bags: emptyBagState(), items: emptyItems.state },
            input.items,
            input.bags,
            catalog,
          ),
        ];
  stats.durationMs = Date.now() - started;
  const finalScore = fallback[0] ? layoutScore(fallback[0]) : Number.NEGATIVE_INFINITY;
  if (initialScore === Number.NEGATIVE_INFINITY) initialScore = finalScore;

  const adaptiveMetrics: AdaptiveSearchMetrics = {
    bagSeedsGenerated,
    bagSeedsSelected,
    bagSeedsSkipped,
    escalationSteps: Math.max(0, levelMetrics.length - 1),
    levelsRun: levelMetrics.length,
    lastBagBeamWidth,
    lastItemBeamWidth,
    totalStatesGenerated: stats.bagStatesGenerated + stats.itemStatesGenerated,
    totalStatesPruned: stats.bagStatesPruned + stats.itemStatesPruned,
    candidatesGenerated: stats.candidatesGenerated,
    localSearchNeighbors,
    jointNeighbors,
    stoppedEarly,
    stopReason,
    durationMs: stats.durationMs,
    initialScore,
    finalScore,
    scoreDelta:
      initialScore === Number.NEGATIVE_INFINITY || finalScore === Number.NEGATIVE_INFINITY
        ? 0
        : finalScore - initialScore,
    jointImproved,
    levels: levelMetrics,
  };

  return assembleResult(fallback, stats, options.resultCount, lsOptions !== null, bagLsOptions !== null, adaptiveMetrics);
}

function assembleResult(
  ranked: RankedLayout[],
  stats: OptimizerStats,
  resultCount: number,
  localSearchEnabled: boolean,
  bagLocalSearchEnabled: boolean,
  adaptive: AdaptiveSearchMetrics,
): AdaptiveOptimizerResult {
  const best = ranked[0]!;
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
  const base: Omit<OptimizerResult, "metrics"> = {
    bestState: best.state,
    score: best.score,
    placedItems: best.state.items.items,
    placedBags: best.state.bags.bags,
    unplacedItems: best.unplacedItems,
    unplacedBags: best.unplacedBags,
    complete: best.complete,
    stats,
    layout,
    alternatives,
    searchExhaustive: false,
  };
  const metrics = toOptimizerMetrics(base, "adaptive", false, {
    beamWidth: adaptive.lastItemBeamWidth,
    bagBeamWidth: adaptive.lastBagBeamWidth,
    localSearch: {
      enabled: localSearchEnabled,
      iterations: adaptive.levelsRun,
      neighbors: adaptive.localSearchNeighbors,
      improvements: adaptive.jointImproved ? 1 : 0,
      initialScore: adaptive.initialScore,
    },
    bagLocalSearch: {
      enabled: bagLocalSearchEnabled,
      iterations: adaptive.escalationSteps,
      neighborsGenerated: adaptive.jointNeighbors,
      neighborsVisited: adaptive.jointNeighbors,
      neighborsPruned: 0,
      layoutsAccepted: adaptive.jointImproved ? 1 : 0,
      displacedItems: 0,
      repairedItems: 0,
      unrepairedItems: 0,
      repairStatesGenerated: 0,
      repairStatesPruned: 0,
      initialScore: adaptive.initialScore,
      finalScore: adaptive.finalScore,
      durationMs: adaptive.durationMs,
      repairDurationMs: 0,
      itemLocalSearchDurationMs: 0,
    },
  });
  return { ...base, metrics, adaptive };
}

function rememberLayout(unique: Map<string, RankedLayout>, ranked: RankedLayout): void {
  const prev = unique.get(ranked.signature);
  if (!prev) {
    unique.set(ranked.signature, ranked);
    return;
  }
  unique.set(ranked.signature, sortRankedLayouts([ranked, prev])[0]!);
}

function toLayout(ranked: RankedLayout): OptimizerLayout {
  return { bags: ranked.state.bags.bags, items: ranked.state.items.items };
}

function validateAdaptiveInput(
  backpack: Backpack,
  bags: ItemToPlace[],
  items: ItemToPlace[],
  catalog: Map<string, Item>,
): void {
  if (backpack.rows < 1 || backpack.cols < 1) {
    throw new Error("Некорректный размер рюкзака");
  }
  const seen = new Set<string>();
  for (const bag of bags) {
    if (seen.has(bag.instanceId)) throw new Error(`Повторяющийся instanceId: ${bag.instanceId}`);
    seen.add(bag.instanceId);
    const item = catalog.get(bag.itemId);
    if (!item) throw new Error(`Неизвестный bag itemId: ${bag.itemId}`);
    if (!item.types.includes("bag")) throw new Error(`Предмет не является Bag: ${bag.itemId}`);
  }
  for (const itemToPlace of items) {
    if (seen.has(itemToPlace.instanceId)) {
      throw new Error(`Повторяющийся instanceId: ${itemToPlace.instanceId}`);
    }
    seen.add(itemToPlace.instanceId);
    const item = catalog.get(itemToPlace.itemId);
    if (!item) throw new Error(`Неизвестный itemId: ${itemToPlace.itemId}`);
  }
}
