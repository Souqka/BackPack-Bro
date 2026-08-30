/**
 * Search Quality Suite: измеряет алгоритмы, не меняя их семантику.
 *
 * Не входит в production hot path. Каждый case независим:
 * score cache и transposition table не разделяются между запусками.
 */

import type { Item } from "../../../inventory/types.ts";
import { withIncrementalScoring } from "../../../scoring/incremental/index.ts";
import { runAdaptiveOptimizer } from "../../adaptive-search.ts";
import { runJointLocalSearch } from "../../joint-search.ts";
import { improveLayoutLocally } from "../../local-search.ts";
import { analyzeHeuristicInversions } from "../../metrics.ts";
import { createScoreCache, withActiveScoreCache } from "../../score-cache.ts";
import type { OptimizerOptions, OptimizerResult, RankedLayout } from "../../search-types.ts";
import { withTranspositionEnabled } from "../../transposition.ts";
import { buildBeamWidthCurve, gapAgainstBestKnown, selectBestKnown } from "../comparison.ts";
import {
  assertProductionCatalogCoverage,
  beamWidthsForCase,
  isDfsFeasible,
  isLocalSearchCase,
  uniqueQualityCases,
} from "../coverage.ts";
import {
  itemLsMetricsFromResult,
  jointLsMetricsFromResult,
  snapshotFromAdaptive,
  snapshotFromLayout,
  snapshotFromResult,
} from "../quality-metrics.ts";
import { compareLayoutQuality, finiteScore, rankedLayoutFromResult } from "../quality.ts";
import type {
  AdaptiveCaseEvaluation,
  BestKnownCandidate,
  CaseQualitySummary,
  HeuristicCaseDiagnostics,
  QualitySuiteMode,
  SearchQualitySnapshot,
  Stage15QualityReport,
} from "../quality-types.ts";
import { runBenchmarkCase } from "../runner.ts";
import type { OptimizerBenchmarkCase } from "../types.ts";

interface TimedRun {
  result: OptimizerResult;
  layout: RankedLayout;
  snapshot: SearchQualitySnapshot;
  durationMs: number;
}

export function buildStage15Report(
  catalog: Map<string, Item>,
  mode: QualitySuiteMode = "quick",
): Stage15QualityReport {
  const started = performance.now();
  const cases = uniqueQualityCases();
  assertProductionCatalogCoverage(cases, catalog);

  const coverage = cases.map((entry) => ({
    caseId: entry.id,
    name: entry.name,
    categories: entry.categories,
    purpose: entry.purpose,
  }));

  const summaries: CaseQualitySummary[] = [];
  const algorithmMatrix: Stage15QualityReport["algorithmMatrix"] = [];
  const beamCurves: Stage15QualityReport["beamCurves"] = [];
  const localSearch: Stage15QualityReport["localSearch"] = [];
  const adaptiveRows: AdaptiveCaseEvaluation[] = [];
  const heuristic: HeuristicCaseDiagnostics[] = [];
  const snapshots: Stage15QualityReport["snapshots"] = [];

  for (const entry of cases) {
    const built = evaluateCase(entry, catalog, mode);
    summaries.push(built.summary);
    algorithmMatrix.push({ caseId: entry.id, runs: built.runs });
    beamCurves.push(built.curve);
    if (built.localSearch) localSearch.push(built.localSearch);
    if (built.adaptive) adaptiveRows.push(built.adaptive);
    if (built.heuristic) heuristic.push(built.heuristic);
    for (const snapshot of built.runs) {
      snapshots.push({ caseId: entry.id, algorithmId: snapshot.algorithmId, snapshot });
    }
  }

  return {
    mode,
    elapsedMs: performance.now() - started,
    cases: summaries,
    coverage,
    algorithmMatrix,
    beamCurves,
    localSearch,
    adaptive: adaptiveRows,
    heuristic,
    snapshots,
  };
}

function evaluateCase(
  entry: ReturnType<typeof uniqueQualityCases>[number],
  catalog: Map<string, Item>,
  mode: QualitySuiteMode,
) {
  const candidates: BestKnownCandidate[] = [];
  const runs: SearchQualitySnapshot[] = [];
  const layouts = new Map<string, RankedLayout>();

  const greedy = runTimed(entry, catalog, {
    algorithm: "greedy",
    localSearch: false,
    bagLocalSearch: false,
  });
  pushRun(runs, layouts, candidates, greedy, {
    algorithmId: "greedy",
    label: "Greedy",
    source: "greedy",
  });

  const widths = beamWidthsForCase(entry.id, mode);
  const beamLayouts: Array<{ width: number; layout: RankedLayout; durationMs: number; states: number }> =
    [];
  for (const width of widths) {
    const beam = runTimed(entry, catalog, {
      algorithm: "beam",
      bagBeamWidth: width,
      itemBeamWidth: width,
      localSearch: false,
      bagLocalSearch: false,
    });
    pushRun(runs, layouts, candidates, beam, {
      algorithmId: `beam:${width}`,
      label: `Beam(${width})`,
      source: "beam",
      beamWidth: width,
    });
    beamLayouts.push({
      width,
      layout: beam.layout,
      durationMs: beam.durationMs,
      states: beam.snapshot.cost.statesGenerated,
    });
  }

  if (isLocalSearchCase(entry.id)) {
    const itemLs = runTimed(entry, catalog, {
      algorithm: "beam",
      bagBeamWidth: 1,
      itemBeamWidth: 1,
      localSearch: true,
      bagLocalSearch: false,
      resultCount: 1,
    });
    pushRun(runs, layouts, candidates, itemLs, {
      algorithmId: "beam:1+item_ls",
      label: "Beam(1)+Item LS",
      source: "item_local_search",
      beamWidth: 1,
      localSearch: itemLsMetricsFromResult(itemLs.result),
    });

    const joint = runTimed(entry, catalog, {
      algorithm: "beam",
      bagBeamWidth: 1,
      itemBeamWidth: 1,
      localSearch: true,
      bagLocalSearch: true,
      resultCount: 1,
    });
    pushRun(runs, layouts, candidates, joint, {
      algorithmId: "beam:1+joint_ls",
      label: "Beam(1)+Joint Bag LS",
      source: "joint_bag_local_search",
      beamWidth: 1,
      localSearch: jointLsMetricsFromResult(joint.result) ?? itemLsMetricsFromResult(joint.result),
    });
  }

  const adaptiveTimed = timed(() =>
    runAdaptiveOptimizer({
      inventory: entry.inventory,
      bags: entry.bags,
      items: entry.items,
      catalog,
      options: { metrics: true, dynamicOrdering: false },
    }),
  );
  const adaptiveSnapshot = snapshotFromAdaptive(adaptiveTimed.value, adaptiveTimed.durationMs);
  const adaptiveLayout = rankedLayoutFromResult(adaptiveTimed.value);
  runs.push(adaptiveSnapshot);
  layouts.set(adaptiveSnapshot.algorithmId, adaptiveLayout);
  candidates.push({
    source: "adaptive",
    label: "Adaptive",
    layout: adaptiveLayout,
  });

  let heuristicRow: HeuristicCaseDiagnostics | undefined;
  if (isDfsFeasible(entry.id)) {
    const dfs = runTimed(entry, catalog, dfsOptions(entry, mode));
    const exhaustive = dfs.result.searchExhaustive === true;
    pushRun(runs, layouts, candidates, dfs, {
      algorithmId: exhaustive ? "dfs:exhaustive" : "dfs:bounded",
      label: exhaustive ? "DFS exhaustive" : "DFS bounded",
      source: exhaustive ? "exhaustive_dfs" : "bounded_dfs",
    });
    const report = analyzeHeuristicInversions(dfs.result.heuristicSamples ?? []);
    heuristicRow = {
      caseId: entry.id,
      sampleCount: report.sampleCount,
      sameDepthPairCount: report.sameDepthPairCount,
      sameDepthInversionCount: report.sameDepthInversionCount,
      sameDepthInversionRate: report.sameDepthInversionRate,
      inversionRate: report.inversionRate,
      dfsExhaustive: exhaustive,
      dfsScore: finiteScore(dfs.layout),
    };
  }

  const beam1Layout = layouts.get("beam:1");
  const beam20Layout = layouts.get("beam:20");
  const greedyLayout = layouts.get("greedy");

  const lsEval =
    isLocalSearchCase(entry.id) && beam1Layout
      ? evaluateLocalSearchFromSeed(catalog, beam1Layout)
      : undefined;
  if (lsEval) {
    candidates.push(
      {
        source: "item_local_search",
        label: "Item LS (same seed)",
        layout: lsEval.afterItemLsLayout,
      },
      {
        source: "joint_bag_local_search",
        label: "Joint LS (same seed)",
        layout: lsEval.afterJointLsLayout,
      },
    );
  }

  const bestKnown = selectBestKnown(candidates);
  const curve = buildBeamWidthCurve(entry.id, beamLayouts, bestKnown.layout);
  const beamLayoutByWidth = new Map(beamLayouts.map((point) => [point.width, point.layout]));

  const adaptiveEval = evaluateAdaptive(
    entry.id,
    adaptiveLayout,
    adaptiveSnapshot,
    bestKnown.layout,
    beam1Layout,
    beam20Layout,
    beamLayoutByWidth,
    curve,
  );

  const summary: CaseQualitySummary = {
    caseId: entry.id,
    name: entry.name,
    categories: entry.categories,
    purpose: entry.purpose,
    bestKnown,
    saturationWidth: curve.saturationWidth,
    greedyGap: greedyLayout ? gapAgainstBestKnown(greedyLayout, bestKnown.layout) : null,
    beam1Gap: beam1Layout ? gapAgainstBestKnown(beam1Layout, bestKnown.layout) : null,
    beam20Gap: beam20Layout ? gapAgainstBestKnown(beam20Layout, bestKnown.layout) : null,
    adaptiveGap: gapAgainstBestKnown(adaptiveLayout, bestKnown.layout),
    localSearchImprovement: lsEval
      ? lsEval.itemStrictImprovement || lsEval.jointStrictImprovement
      : null,
  };

  return {
    summary,
    runs,
    curve,
    localSearch: lsEval
      ? {
          caseId: entry.id,
          seedScore: lsEval.seedScore,
          seedComplete: lsEval.seedComplete,
          seedSignature: lsEval.seedSignature,
          afterItemLs: lsEval.afterItemLs,
          afterJointLs: lsEval.afterJointLs,
          itemDelta: lsEval.itemDelta,
          jointDelta: lsEval.jointDelta,
          itemStrictImprovement: lsEval.itemStrictImprovement,
          jointStrictImprovement: lsEval.jointStrictImprovement,
        }
      : undefined,
    adaptive: adaptiveEval,
    heuristic: heuristicRow,
  };
}

function evaluateLocalSearchFromSeed(catalog: Map<string, Item>, seed: RankedLayout) {
  const itemTimed = timed(() => withSearchContext(() => improveLayoutLocally(seed, catalog)));
  const jointTimed = timed(() => withSearchContext(() => runJointLocalSearch(seed, catalog)));
  const afterItem = itemTimed.value.layout;
  const afterJoint = jointTimed.value.layout;
  const itemDelta = compareLayoutQuality(afterItem, seed);
  const jointDelta = compareLayoutQuality(afterJoint, seed);
  return {
    seedScore: seed.score.valid ? seed.score.score : Number.NEGATIVE_INFINITY,
    seedComplete: seed.complete,
    seedSignature: seed.signature,
    afterItemLsLayout: afterItem,
    afterJointLsLayout: afterJoint,
    afterItemLs: snapshotFromLayout(afterItem, {
      algorithmId: "item_ls:seed",
      label: "Item LS from Beam(1) seed",
      source: "item_local_search",
      durationMs: itemTimed.durationMs,
      unplacedItems: afterItem.unplacedItems.length,
      localSearch: {
        initialScore: itemTimed.value.stats.initialScore,
        scoreDelta: itemTimed.value.stats.finalScore - itemTimed.value.stats.initialScore,
        iterations: itemTimed.value.stats.iterations,
        neighbors: itemTimed.value.stats.neighborsEvaluated,
        acceptedMoves: itemTimed.value.stats.improvements,
      },
      cost: {
        statesGenerated: 0,
        statesPruned: 0,
        candidatesGenerated: itemTimed.value.stats.neighborsEvaluated,
      },
    }),
    afterJointLs: snapshotFromLayout(afterJoint, {
      algorithmId: "joint_ls:seed",
      label: "Joint LS from Beam(1) seed",
      source: "joint_bag_local_search",
      durationMs: jointTimed.durationMs,
      unplacedItems: afterJoint.unplacedItems.length,
      localSearch: {
        initialScore: jointTimed.value.stats.initialScore,
        scoreDelta: jointTimed.value.stats.finalScore - jointTimed.value.stats.initialScore,
        iterations: jointTimed.value.stats.iterations,
        neighbors: jointTimed.value.stats.bagNeighborsVisited,
        acceptedMoves: jointTimed.value.stats.bagLayoutsAccepted,
      },
      cost: {
        statesGenerated: jointTimed.value.stats.repairStatesGenerated,
        statesPruned: jointTimed.value.stats.repairStatesPruned,
        candidatesGenerated: jointTimed.value.stats.bagNeighborsGenerated,
      },
    }),
    itemDelta,
    jointDelta,
    itemStrictImprovement: itemDelta.relation === "better",
    jointStrictImprovement: jointDelta.relation === "better",
  };
}

function evaluateAdaptive(
  caseId: string,
  adaptiveLayout: RankedLayout,
  adaptiveSnapshot: SearchQualitySnapshot,
  bestKnown: RankedLayout,
  beam1: RankedLayout | undefined,
  beam20: RankedLayout | undefined,
  beamLayoutByWidth: Map<number, RankedLayout>,
  curve: ReturnType<typeof buildBeamWidthCurve>,
): AdaptiveCaseEvaluation {
  const vsBeam1 = beam1
    ? compareLayoutQuality(adaptiveLayout, beam1)
    : compareLayoutQuality(adaptiveLayout, adaptiveLayout);
  const vsBeam20 = beam20 ? compareLayoutQuality(adaptiveLayout, beam20) : null;
  const bestFixedWidth = curve.saturationWidth ?? bestQualityWidth(curve);
  const bestFixedLayout = bestFixedWidth !== null ? beamLayoutByWidth.get(bestFixedWidth) : undefined;
  const vsBestFixedBeam = bestFixedLayout
    ? compareLayoutQuality(adaptiveLayout, bestFixedLayout)
    : null;

  const beam20Point = curve.points.find((point) => point.width === 20);
  const runtimeRatioVsBeam20 =
    beam20Point && beam20Point.durationMs > 0
      ? adaptiveSnapshot.durationMs / beam20Point.durationMs
      : null;
  const statesRatioVsBeam20 =
    beam20Point && beam20Point.states > 0
      ? adaptiveSnapshot.cost.statesGenerated / beam20Point.states
      : null;
  const matchesBestKnown = compareLayoutQuality(adaptiveLayout, bestKnown).relation === "equal";
  const improvedOverBeam1 = vsBeam1.relation === "better";
  const matchesBeam20 = vsBeam20?.relation === "equal";
  const overheadOnly =
    !improvedOverBeam1 &&
    (vsBeam20?.relation === "equal" || vsBeam20?.relation === "worse") &&
    (runtimeRatioVsBeam20 ?? 0) > 1.15;

  return {
    caseId,
    matchesBestKnown,
    vsBeam1,
    vsBeam20,
    vsBestFixedBeam,
    bestFixedBeamWidth: bestFixedWidth,
    runtimeRatioVsBeam20,
    statesRatioVsBeam20,
    stopReason: adaptiveSnapshot.adaptive?.stopReason ?? "n/a",
    escalation: adaptiveSnapshot.adaptive?.escalation ?? 0,
    improvedOverBeam1,
    matchesBeam20: matchesBeam20 === true,
    overheadOnly,
  };
}

function bestQualityWidth(curve: ReturnType<typeof buildBeamWidthCurve>): number | null {
  const matched = curve.points.filter((point) => point.matchesBestKnown);
  if (matched.length > 0) return matched[0]!.width;
  const first = curve.points[0];
  if (!first) return null;
  let best = first;
  for (const point of curve.points) {
    if (point.gapToBestKnown.scoreGap < best.gapToBestKnown.scoreGap) best = point;
  }
  return best.width;
}

function dfsOptions(entry: OptimizerBenchmarkCase, mode: QualitySuiteMode): Partial<OptimizerOptions> {
  const requested = entry.options?.dfs;
  if (mode === "quick") {
    return {
      algorithm: "dfs",
      localSearch: false,
      bagLocalSearch: false,
      dfs: {
        maxNodes: Math.min(requested?.maxNodes ?? 12_000, 12_000),
        maxDepth: requested?.maxDepth ?? 8,
        timeoutMs: Math.min(requested?.timeoutMs ?? 2_000, 2_000),
      },
    };
  }
  return {
    algorithm: "dfs",
    localSearch: false,
    bagLocalSearch: false,
    dfs: requested ?? { maxNodes: 30_000, maxDepth: 10, timeoutMs: 8_000 },
  };
}

function runTimed(
  entry: OptimizerBenchmarkCase,
  catalog: Map<string, Item>,
  extra: Partial<OptimizerOptions>,
): TimedRun {
  const { value, durationMs } = timed(() => runBenchmarkCase(entry, catalog, extra));
  return {
    result: value,
    layout: rankedLayoutFromResult(value),
    snapshot: snapshotFromResult(value, {
      algorithmId: "pending",
      label: "pending",
      source: "beam",
      durationMs,
    }),
    durationMs,
  };
}

function pushRun(
  runs: SearchQualitySnapshot[],
  layouts: Map<string, RankedLayout>,
  candidates: BestKnownCandidate[],
  timedRun: TimedRun,
  meta: {
    algorithmId: string;
    label: string;
    source: BestKnownCandidate["source"];
    beamWidth?: number;
    localSearch?: ReturnType<typeof itemLsMetricsFromResult>;
  },
): void {
  const snapshot = snapshotFromResult(timedRun.result, {
    algorithmId: meta.algorithmId,
    label: meta.label,
    source: meta.source,
    beamWidth: meta.beamWidth,
    durationMs: timedRun.durationMs,
    localSearch: meta.localSearch,
  });
  runs.push(snapshot);
  layouts.set(meta.algorithmId, timedRun.layout);
  candidates.push({
    source: meta.source,
    label: meta.label,
    layout: timedRun.layout,
    beamWidth: meta.beamWidth,
  });
}

function timed<T>(fn: () => T): { value: T; durationMs: number } {
  const started = performance.now();
  const value = fn();
  return { value, durationMs: performance.now() - started };
}

function withSearchContext<T>(fn: () => T): T {
  const cache = createScoreCache({ enabled: true });
  return withIncrementalScoring({ enabled: true, verify: false }, () =>
    withTranspositionEnabled(true, () => withActiveScoreCache(cache, fn)),
  );
}
