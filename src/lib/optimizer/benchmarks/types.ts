/**
 * Модели benchmark Stage 8: кейс, прогон, сводка по алгоритмам и beam width.
 *
 * Цифры берутся только из реального запуска optimizer, не подставляются вручную.
 */

import type { Inventory } from "../../inventory/types.ts";
import type {
  OptimizerAlgorithm,
  OptimizerMetrics,
  OptimizerOptions,
  OptimizerResult,
} from "../search-types.ts";
import type { ItemToPlace } from "../types.ts";

export interface OptimizerBenchmarkCase {
  id: string;
  name: string;
  inventory: Inventory;
  bags: ItemToPlace[];
  items: ItemToPlace[];
  options?: Partial<OptimizerOptions>;
  description?: string;
  /** DFS только на маленьких кейсах: иначе это не reference, а обрыв по лимиту. */
  runDfs?: boolean;
}

export interface BenchmarkRun {
  caseId: string;
  algorithm: OptimizerAlgorithm;
  result: OptimizerResult;
  metrics: OptimizerMetrics;
}

export interface AlgorithmComparisonRow {
  caseId: string;
  beam?: OptimizerMetrics;
  greedy?: OptimizerMetrics;
  dfs?: OptimizerMetrics;
  gap?: number;
  referenceExhaustive?: boolean;
}

export interface BeamWidthRow {
  caseId: string;
  beamWidth: number;
  score: number;
  durationMs: number;
  statesGenerated: number;
  statesPruned: number;
  complete: boolean;
}

export interface Stage8Report {
  algorithms: AlgorithmComparisonRow[];
  beamWidths: BeamWidthRow[];
  dynamicOrdering: Array<{
    caseId: string;
    staticScore: number;
    dynamicScore: number;
    staticDurationMs: number;
    dynamicDurationMs: number;
  }>;
  heuristic: Array<{
    caseId: string;
    sampleCount: number;
    sameDepthInversionRate: number;
    inversionRate: number;
    dfsExhaustive: boolean;
    dfsScore: number;
  }>;
  smoke: Array<{
    caseId: string;
    complete: boolean;
    durationMs: number;
    placedItems: number;
    unplacedItems: number;
    valid: boolean;
  }>;
}
