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
  bagIds?: string[];
  itemIds?: string[];
  expected?: {
    minScore?: number;
    minActiveStars?: number;
  };
  options?: Partial<OptimizerOptions>;
  description: string;
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
  activatedStars: number;
  effectCoverage: number;
  placedItems: number;
  complete: boolean;
  durationMs: number;
  statesGenerated: number;
  statesPruned: number;
  candidatesGenerated: number;
}

export interface LocalSearchRow {
  caseId: string;
  initialScore: number;
  finalScore: number;
  delta: number;
  improvements: number;
  iterations: number;
  neighbors: number;
  durationMs: number;
  complete: boolean;
}

export interface Stage9AlgorithmRow {
  label: string;
  score: number;
  stars: number;
  complete: boolean;
  durationMs: number;
  statesGenerated: number;
}

export interface Stage9CaseReport {
  caseId: string;
  name: string;
  description: string;
  greedy: Stage9AlgorithmRow;
  widths: BeamWidthRow[];
  beamPlusLocal: Stage9AlgorithmRow;
  greedyPlusLocal?: Stage9AlgorithmRow;
  dfs?: Stage9AlgorithmRow & { exhaustive: boolean; gap?: number };
  localSearch: LocalSearchRow;
  dynamicOrdering: {
    staticScore: number;
    dynamicScore: number;
    staticDurationMs: number;
    dynamicDurationMs: number;
  };
  topN: {
    withoutLocal: number[];
    withLocal: number[];
  };
}

export interface Stage10ModeRow {
  label: string;
  score: number;
  stars: number;
  complete: boolean;
  durationMs: number;
  placedItems: number;
  unplacedItems: number;
  bagLocalSearchEnabled: boolean;
  bagLocalSearchIterations: number;
  bagNeighborsGenerated: number;
  bagNeighborsVisited: number;
  bagNeighborsPruned: number;
  bagLayoutsAccepted: number;
  displacedItems: number;
  repairedItems: number;
  unrepairedItems: number;
  repairStatesGenerated: number;
  repairStatesPruned: number;
  initialScore: number;
  finalScore: number;
  delta: number;
  bagLocalSearchDurationMs: number;
  repairDurationMs: number;
  itemLocalSearchDurationMs: number;
}

export interface Stage10CaseReport {
  caseId: string;
  name: string;
  description: string;
  beam1: Stage10ModeRow;
  beam1ItemLs: Stage10ModeRow;
  beam1Joint: Stage10ModeRow;
  beam20: Stage10ModeRow;
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
