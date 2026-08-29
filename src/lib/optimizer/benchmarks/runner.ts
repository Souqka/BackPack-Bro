/**
 * Запуск benchmark cases.
 *
 * Не подставляет score вручную: каждый ряд — реальный runOptimizer.
 * DFS вызывается только если case.runDfs: на большом наборе это не reference.
 *
 * Beam width sweep и dynamic ordering идут отдельными прогонами, чтобы
 * сравнение было честным (одинаковый case, разные options).
 */

import type { Item } from "../../inventory/types.ts";
import { runAdaptiveOptimizer } from "../adaptive-search.ts";
import { analyzeHeuristicInversions } from "../metrics.ts";
import { compareOptimizerResults } from "../compare.ts";
import { runOptimizer } from "../optimizer.ts";
import type { OptimizerOptions, OptimizerResult } from "../search-types.ts";
import { BEAM_WIDTHS, OPTIMIZER_BENCHMARK_CASES, SMOKE_BENCHMARK_CASES, STAGE9_BENCHMARK_CASES, STAGE9_BEAM_WIDTHS, STAGE10_BENCHMARK_CASES, STAGE11_BENCHMARK_CASES } from "./cases.ts";
import { requireMetrics, toBeamWidthRow } from "./metrics.ts";
import type {
  AlgorithmComparisonRow,
  BenchmarkRun,
  OptimizerBenchmarkCase,
  Stage8Report,
  Stage9AlgorithmRow,
  Stage9CaseReport,
  Stage10CaseReport,
  Stage10ModeRow,
  Stage11CaseReport,
  Stage11ModeRow,
} from "./types.ts";

export function runBenchmarkCase(
  benchmarkCase: OptimizerBenchmarkCase,
  catalog: Map<string, Item>,
  extra?: Partial<OptimizerOptions>,
): OptimizerResult {
  return runOptimizer({
    inventory: benchmarkCase.inventory,
    bags: benchmarkCase.bags,
    items: benchmarkCase.items,
    catalog,
    options: {
      ...benchmarkCase.options,
      ...extra,
      metrics: true,
    },
  });
}

export function runAlgorithmSuite(
  benchmarkCase: OptimizerBenchmarkCase,
  catalog: Map<string, Item>,
): BenchmarkRun[] {
  const runs: BenchmarkRun[] = [];
  const beam = runBenchmarkCase(benchmarkCase, catalog, { algorithm: "beam" });
  runs.push({ caseId: benchmarkCase.id, algorithm: "beam", result: beam, metrics: requireMetrics(beam) });

  const greedy = runBenchmarkCase(benchmarkCase, catalog, { algorithm: "greedy" });
  runs.push({
    caseId: benchmarkCase.id,
    algorithm: "greedy",
    result: greedy,
    metrics: requireMetrics(greedy),
  });

  if (benchmarkCase.runDfs) {
    const dfs = runBenchmarkCase(benchmarkCase, catalog, { algorithm: "dfs" });
    runs.push({ caseId: benchmarkCase.id, algorithm: "dfs", result: dfs, metrics: requireMetrics(dfs) });
  }

  return runs;
}

export function compareAlgorithms(
  benchmarkCase: OptimizerBenchmarkCase,
  catalog: Map<string, Item>,
): AlgorithmComparisonRow {
  const runs = runAlgorithmSuite(benchmarkCase, catalog);
  const beam = runs.find((run) => run.algorithm === "beam");
  const greedy = runs.find((run) => run.algorithm === "greedy");
  const dfs = runs.find((run) => run.algorithm === "dfs");
  const row: AlgorithmComparisonRow = {
    caseId: benchmarkCase.id,
    beam: beam?.metrics,
    greedy: greedy?.metrics,
    dfs: dfs?.metrics,
  };
  if (beam && dfs) {
    const comparison = compareOptimizerResults(dfs.result, beam.result);
    row.gap = comparison.gap;
    row.referenceExhaustive = comparison.referenceExhaustive;
  }
  return row;
}

export function runBeamWidthSweep(
  benchmarkCase: OptimizerBenchmarkCase,
  catalog: Map<string, Item>,
  widths: readonly number[] = BEAM_WIDTHS,
) {
  return widths.map((width) => {
    const result = runBenchmarkCase(benchmarkCase, catalog, {
      algorithm: "beam",
      localSearch: false,
      bagBeamWidth: width,
      itemBeamWidth: width,
    });
    return toBeamWidthRow(benchmarkCase.id, width, result);
  });
}

/**
 * Сводка Stage 8: алгоритмы, beam width, dynamic ordering, heuristic inversions, smoke.
 * Нужна для отчёта с реальными цифрами, а не как игровой API.
 */
export function buildStage8Report(catalog: Map<string, Item>): Stage8Report {
  const algorithms = OPTIMIZER_BENCHMARK_CASES.map((entry) => compareAlgorithms(entry, catalog));

  const beamWidths = ["A-simple", "B-star-synergy", "D-many-positions"].flatMap((id) => {
    const benchmarkCase = OPTIMIZER_BENCHMARK_CASES.find((entry) => entry.id === id);
    if (!benchmarkCase) return [];
    return runBeamWidthSweep(benchmarkCase, catalog);
  });

  const dynamicOrdering = ["B-star-synergy", "C-complex-geometry", "F-two-bags"].map((id) => {
    const benchmarkCase = OPTIMIZER_BENCHMARK_CASES.find((entry) => entry.id === id)!;
    const staticRun = runBenchmarkCase(benchmarkCase, catalog, {
      algorithm: "beam",
      dynamicOrdering: false,
    });
    const dynamicRun = runBenchmarkCase(benchmarkCase, catalog, {
      algorithm: "beam",
      dynamicOrdering: true,
    });
    return {
      caseId: id,
      staticScore: requireMetrics(staticRun).finalScore,
      dynamicScore: requireMetrics(dynamicRun).finalScore,
      staticDurationMs: requireMetrics(staticRun).durationMs,
      dynamicDurationMs: requireMetrics(dynamicRun).durationMs,
    };
  });

  const heuristic = OPTIMIZER_BENCHMARK_CASES.filter((entry) => entry.runDfs).map((entry) => {
    const dfs = runBenchmarkCase(entry, catalog, { algorithm: "dfs" });
    const report = analyzeHeuristicInversions(dfs.heuristicSamples ?? []);
    return {
      caseId: entry.id,
      sampleCount: report.sampleCount,
      sameDepthInversionRate: report.sameDepthInversionRate,
      inversionRate: report.inversionRate,
      dfsExhaustive: dfs.searchExhaustive,
      dfsScore: dfs.score.valid ? dfs.score.score : Number.NEGATIVE_INFINITY,
    };
  });

  const smoke = SMOKE_BENCHMARK_CASES.map((entry) => {
    const result = runBenchmarkCase(entry, catalog, { algorithm: "beam" });
    return {
      caseId: entry.id,
      complete: result.complete,
      durationMs: result.stats.durationMs,
      placedItems: result.placedItems.length,
      unplacedItems: result.unplacedItems.length,
      valid: result.score.valid,
    };
  });

  return { algorithms, beamWidths, dynamicOrdering, heuristic, smoke };
}

function algorithmRow(label: string, result: OptimizerResult): Stage9AlgorithmRow {
  const metrics = requireMetrics(result);
  return {
    label,
    score: metrics.finalScore,
    stars: metrics.activatedStars,
    complete: metrics.complete,
    durationMs: metrics.durationMs,
    statesGenerated: metrics.statesGenerated,
  };
}

/**
 * Stage 9: width-sensitive cases, Local Search, dynamic ordering, DFS gap.
 * Local Search в width-sweep выключен, чтобы не маскировать эффект Beam width.
 */
export function buildStage9Report(catalog: Map<string, Item>): Stage9CaseReport[] {
  return STAGE9_BENCHMARK_CASES.map((entry) => {
    const greedy = runBenchmarkCase(entry, catalog, { algorithm: "greedy", localSearch: false });
    const greedyLocal = runBenchmarkCase(entry, catalog, {
      algorithm: "greedy",
      localSearch: true,
      resultCount: 1,
    });
    const widths = runBeamWidthSweep(entry, catalog, STAGE9_BEAM_WIDTHS);
    const beam20 = runBenchmarkCase(entry, catalog, {
      algorithm: "beam",
      bagBeamWidth: 20,
      itemBeamWidth: 20,
      localSearch: false,
      resultCount: 10,
    });
    const beam20Local = runBenchmarkCase(entry, catalog, {
      algorithm: "beam",
      bagBeamWidth: 20,
      itemBeamWidth: 20,
      localSearch: true,
      resultCount: 10,
    });
    const beam1Local = runBenchmarkCase(entry, catalog, {
      algorithm: "beam",
      bagBeamWidth: 1,
      itemBeamWidth: 1,
      localSearch: true,
      resultCount: 10,
    });

    let dfsRow: Stage9CaseReport["dfs"];
    if (entry.runDfs) {
      const dfs = runBenchmarkCase(entry, catalog, { algorithm: "dfs", localSearch: false });
      const comparison = compareOptimizerResults(dfs, beam20);
      dfsRow = {
        ...algorithmRow("DFS", dfs),
        exhaustive: dfs.searchExhaustive,
        gap: comparison.gap,
      };
    }

    const staticRun = runBenchmarkCase(entry, catalog, {
      algorithm: "beam",
      bagBeamWidth: 20,
      itemBeamWidth: 20,
      dynamicOrdering: false,
      localSearch: false,
    });
    const dynamicRun = runBenchmarkCase(entry, catalog, {
      algorithm: "beam",
      bagBeamWidth: 20,
      itemBeamWidth: 20,
      dynamicOrdering: true,
      localSearch: false,
    });

    const withoutLocalScores = [
      beam20.score.valid ? beam20.score.score : Number.NEGATIVE_INFINITY,
      ...beam20.alternatives.map((entryAlt) => (entryAlt.score.valid ? entryAlt.score.score : Number.NEGATIVE_INFINITY)),
    ];
    const withLocalScores = [
      beam20Local.score.valid ? beam20Local.score.score : Number.NEGATIVE_INFINITY,
      ...beam20Local.alternatives.map((entryAlt) =>
        entryAlt.score.valid ? entryAlt.score.score : Number.NEGATIVE_INFINITY,
      ),
    ];

    const lsMetrics = requireMetrics(beam1Local);
    return {
      caseId: entry.id,
      name: entry.name,
      description: entry.description,
      greedy: algorithmRow("Greedy", greedy),
      widths,
      beamPlusLocal: algorithmRow("Beam(20)+LS", beam20Local),
      greedyPlusLocal: algorithmRow("Greedy+LS", greedyLocal),
      dfs: dfsRow,
      localSearch: {
        caseId: entry.id,
        initialScore: lsMetrics.initialScore,
        finalScore: lsMetrics.finalScore,
        delta: lsMetrics.scoreDelta,
        improvements: lsMetrics.localSearchImprovements,
        iterations: lsMetrics.localSearchIterations,
        neighbors: lsMetrics.localSearchNeighbors,
        durationMs: lsMetrics.durationMs,
        complete: lsMetrics.complete,
      },
      dynamicOrdering: {
        staticScore: requireMetrics(staticRun).finalScore,
        dynamicScore: requireMetrics(dynamicRun).finalScore,
        staticDurationMs: requireMetrics(staticRun).durationMs,
        dynamicDurationMs: requireMetrics(dynamicRun).durationMs,
      },
      topN: {
        withoutLocal: withoutLocalScores,
        withLocal: withLocalScores,
      },
    };
  });
}

function stage10ModeRow(label: string, result: OptimizerResult): Stage10ModeRow {
  const metrics = requireMetrics(result);
  return {
    label,
    score: metrics.finalScore,
    stars: metrics.activatedStars,
    complete: metrics.complete,
    durationMs: metrics.durationMs,
    placedItems: metrics.placedItems,
    unplacedItems: metrics.unplacedItems,
    bagLocalSearchEnabled: metrics.bagLocalSearchEnabled,
    bagLocalSearchIterations: metrics.bagLocalSearchIterations,
    bagNeighborsGenerated: metrics.bagNeighborsGenerated,
    bagNeighborsVisited: metrics.bagNeighborsVisited,
    bagNeighborsPruned: metrics.bagNeighborsPruned,
    bagLayoutsAccepted: metrics.bagLayoutsAccepted,
    displacedItems: metrics.displacedItems,
    repairedItems: metrics.repairedItems,
    unrepairedItems: metrics.unrepairedItems,
    repairStatesGenerated: metrics.repairStatesGenerated,
    repairStatesPruned: metrics.repairStatesPruned,
    initialScore: metrics.bagLocalSearchEnabled ? metrics.bagLocalSearchInitialScore : metrics.initialScore,
    finalScore: metrics.finalScore,
    delta: metrics.bagLocalSearchEnabled ? metrics.bagLocalSearchScoreDelta : metrics.scoreDelta,
    bagLocalSearchDurationMs: metrics.bagLocalSearchDurationMs,
    repairDurationMs: metrics.repairDurationMs,
    itemLocalSearchDurationMs: metrics.bagItemLocalSearchDurationMs,
  };
}

/**
 * Stage 10: Beam(1) vs Item LS vs Joint Bag LS vs Beam(20) on H/I/J/K.
 * Joint run uses existing Item Local Search after repair; it does not restart runOptimizer.
 */
export function buildStage10Report(catalog: Map<string, Item>): Stage10CaseReport[] {
  return STAGE10_BENCHMARK_CASES.map((entry) => {
    const beam1 = runBenchmarkCase(entry, catalog, {
      algorithm: "beam",
      bagBeamWidth: 1,
      itemBeamWidth: 1,
      localSearch: false,
      bagLocalSearch: false,
    });
    const beam1ItemLs = runBenchmarkCase(entry, catalog, {
      algorithm: "beam",
      bagBeamWidth: 1,
      itemBeamWidth: 1,
      localSearch: true,
      bagLocalSearch: false,
      resultCount: 10,
    });
    const beam1Joint = runBenchmarkCase(entry, catalog, {
      algorithm: "beam",
      bagBeamWidth: 1,
      itemBeamWidth: 1,
      localSearch: true,
      bagLocalSearch: true,
      resultCount: 10,
    });
    const beam20 = runBenchmarkCase(entry, catalog, {
      algorithm: "beam",
      bagBeamWidth: 20,
      itemBeamWidth: 20,
      localSearch: false,
      bagLocalSearch: false,
    });
    return {
      caseId: entry.id,
      name: entry.name,
      description: entry.description,
      beam1: stage10ModeRow("Beam(1)", beam1),
      beam1ItemLs: stage10ModeRow("Beam(1)+Item LS", beam1ItemLs),
      beam1Joint: stage10ModeRow("Beam(1)+Joint Bag LS", beam1Joint),
      beam20: stage10ModeRow("Beam(20)", beam20),
    };
  });
}

function stage11ModeRow(
  label: string,
  result: OptimizerResult,
  extra?: { bagSeeds?: number; escalationSteps?: number; stopReason?: string },
): Stage11ModeRow {
  const metrics = requireMetrics(result);
  return {
    label,
    score: metrics.finalScore,
    stars: metrics.activatedStars,
    complete: metrics.complete,
    placed: metrics.placedItems,
    unplaced: metrics.unplacedItems,
    durationMs: metrics.durationMs,
    states: metrics.statesGenerated,
    bagSeeds: extra?.bagSeeds ?? 0,
    escalationSteps: extra?.escalationSteps ?? 0,
    stopReason: extra?.stopReason ?? "n/a",
  };
}

/**
 * Stage 11: Beam(1) vs Beam(20) vs Joint vs Adaptive Portfolio on G–O.
 */
export function buildStage11Report(catalog: Map<string, Item>): Stage11CaseReport[] {
  return STAGE11_BENCHMARK_CASES.map((entry) => {
    const beam1 = runBenchmarkCase(entry, catalog, {
      algorithm: "beam",
      bagBeamWidth: 1,
      itemBeamWidth: 1,
      localSearch: false,
      bagLocalSearch: false,
    });
    const beam20 = runBenchmarkCase(entry, catalog, {
      algorithm: "beam",
      bagBeamWidth: 20,
      itemBeamWidth: 20,
      localSearch: false,
      bagLocalSearch: false,
    });
    const joint = runBenchmarkCase(entry, catalog, {
      algorithm: "beam",
      bagBeamWidth: 1,
      itemBeamWidth: 1,
      localSearch: true,
      bagLocalSearch: true,
      resultCount: 10,
    });
    const adaptive = runAdaptiveOptimizer(
      {
        inventory: entry.inventory,
        bags: entry.bags,
        items: entry.items,
        catalog,
        options: { metrics: true, dynamicOrdering: false },
      },
    );
    return {
      caseId: entry.id,
      name: entry.name,
      description: entry.description,
      beam1: stage11ModeRow("Beam(1)", beam1),
      beam20: stage11ModeRow("Beam(20)", beam20),
      joint: stage11ModeRow("Joint", joint, {
        bagSeeds: 1,
        stopReason: "n/a",
      }),
      adaptive: stage11ModeRow("Adaptive", adaptive, {
        bagSeeds: adaptive.adaptive.bagSeedsSelected,
        escalationSteps: adaptive.adaptive.escalationSteps,
        stopReason: adaptive.adaptive.stopReason,
      }),
    };
  });
}
