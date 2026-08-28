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
import { analyzeHeuristicInversions } from "../metrics.ts";
import { compareOptimizerResults } from "../compare.ts";
import { runOptimizer } from "../optimizer.ts";
import type { OptimizerOptions, OptimizerResult } from "../search-types.ts";
import { BEAM_WIDTHS, OPTIMIZER_BENCHMARK_CASES, SMOKE_BENCHMARK_CASES } from "./cases.ts";
import { requireMetrics, toBeamWidthRow } from "./metrics.ts";
import type {
  AlgorithmComparisonRow,
  BenchmarkRun,
  OptimizerBenchmarkCase,
  Stage8Report,
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
      bagBeamWidth: Math.min(width, benchmarkCase.options?.bagBeamWidth ?? width),
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
