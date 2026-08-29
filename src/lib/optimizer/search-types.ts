/**
 * Типы двухслойного optimizer: Bags, затем Items.
 */

import type { Item } from "../inventory/types.ts";
import type { PlacementScore } from "../scoring/types.ts";
import type { BagState, PlacedBag } from "./bags/types.ts";
import type { Backpack, ItemToPlace, PlacedItem, SearchState } from "./types.ts";

export interface OptimizerState {
  backpack: Backpack;
  bags: BagState;
  items: SearchState;
}

export type OptimizerAlgorithm = "beam" | "greedy" | "dfs" | "adaptive";

/**
 * Лимиты reference-DFS. Без них DFS не является bounded и не должен
 * запускаться на полном каталоге: дерево позиций растёт комбинаторно.
 */
export interface DfsSearchLimits {
  maxNodes?: number;
  maxDepth?: number;
  timeoutMs?: number;
}

export interface OptimizerOptions {
  bagBeamWidth: number;
  itemBeamWidth: number;
  maxDurationMs?: number;
  verbose?: boolean;
  /** Основной алгоритм — beam. greedy/dfs только для сравнения качества. */
  algorithm?: OptimizerAlgorithm;
  /** Сколько уникальных layout вернуть. 1 = только лучший. */
  resultCount?: number;
  /**
   * Если true, следующий Item выбирается после каждого шага по текущему SearchState.
   * Static ordering при этом не удаляется: это экспериментальный режим.
   */
  dynamicOrdering?: boolean;
  /** Если true, в результат кладётся OptimizerMetrics. */
  metrics?: boolean;
  dfs?: DfsSearchLimits;
  /**
   * Local Search после Top-N. false/undefined — выключен (default),
   * чтобы сравнение Beam width не смешивалось с локальными ходами.
   */
  localSearch?: boolean | LocalSearchOptions;
  /**
   * Joint Bag + Item Local Search после Item LS / Top-N.
   * Default false: Stage 9 width-sweep не должен смешиваться с Bag mutations.
   */
  bagLocalSearch?: boolean | BagLocalSearchOptions;
  /** Alias for BagLocalSearchOptions.maxIterations when bagLocalSearch is true. */
  bagLocalSearchIterations?: number;
  /** Bounded Beam width for repairing displaced Items after a Bag mutation. */
  bagRepairBeamWidth?: number;
}

export interface LocalSearchOptions {
  maxIterations?: number;
  maxNeighbors?: number;
}

export interface BagLocalSearchOptions {
  maxIterations?: number;
  maxNeighbors?: number;
  repairBeamWidth?: number;
  itemLocalSearch?: boolean;
}

export interface BeamSearchOptions {
  beamWidth: number;
  maxStates?: number;
  deadlineMs?: number;
  dynamicOrdering?: boolean;
}

export const DEFAULT_OPTIMIZER_OPTIONS: OptimizerOptions = {
  bagBeamWidth: 20,
  itemBeamWidth: 50,
  algorithm: "beam",
  resultCount: 1,
  dynamicOrdering: false,
  metrics: true,
  localSearch: false,
  bagLocalSearch: false,
};

export const DEFAULT_DFS_LIMITS: DfsSearchLimits = {
  maxNodes: 20_000,
  maxDepth: 12,
  timeoutMs: 5_000,
};

export interface PartialStateScore {
  total: number;
  structural: number;
  effectCoverage: number;
  placementQuality: number;
  futurePotential: number;
  remainingPenalty: number;
  feasible: boolean;
}

export interface OptimizerStats {
  bagStatesGenerated: number;
  bagStatesPruned: number;
  itemStatesGenerated: number;
  itemStatesPruned: number;
  candidatesGenerated: number;
  searchDepth: number;
  durationMs: number;
}

/**
 * Метрики одного запуска поиска. Final Score здесь — Scoring Engine,
 * не partial heuristic.
 */
export interface OptimizerMetrics {
  algorithm: OptimizerAlgorithm;
  durationMs: number;
  statesGenerated: number;
  statesPruned: number;
  candidatesGenerated: number;
  searchDepth: number;
  finalScore: number;
  activatedStars: number;
  normalizedEffects: number;
  rawEffects: number;
  occupiedCells: number;
  emptyCells: number;
  placedItems: number;
  unplacedItems: number;
  /** Все Bags и Items размещены, слой Bags непустой. */
  complete: boolean;
  /**
   * Поиск исчерпал пространство (DFS дошёл до конца / greedy закончил /
   * beam не упёрся в deadline). false не означает, что layout — глобальный оптимум.
   */
  searchExhaustive: boolean;
  beamWidth?: number;
  bagBeamWidth?: number;
  localSearchEnabled: boolean;
  localSearchIterations: number;
  localSearchNeighbors: number;
  localSearchImprovements: number;
  initialScore: number;
  scoreDelta: number;
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
  bagLocalSearchInitialScore: number;
  bagLocalSearchFinalScore: number;
  bagLocalSearchScoreDelta: number;
  bagLocalSearchDurationMs: number;
  repairDurationMs: number;
  bagItemLocalSearchDurationMs: number;
}

export interface OptimizerLayout {
  bags: PlacedBag[];
  items: PlacedItem[];
}

export interface OptimizerAlternative {
  layout: OptimizerLayout;
  score: PlacementScore;
  complete: boolean;
  unplacedItems: ItemToPlace[];
  unplacedBags: ItemToPlace[];
  signature: string;
}

export interface RankedLayout {
  state: OptimizerState;
  score: PlacementScore;
  unplacedItems: ItemToPlace[];
  unplacedBags: ItemToPlace[];
  complete: boolean;
  signature: string;
}

export interface OptimizerResult {
  bestState: OptimizerState;
  score: PlacementScore;
  placedItems: PlacedItem[];
  placedBags: PlacedBag[];
  unplacedItems: ItemToPlace[];
  unplacedBags: ItemToPlace[];
  complete: boolean;
  stats: OptimizerStats;
  layout: OptimizerLayout;
  alternatives: OptimizerAlternative[];
  metrics?: OptimizerMetrics;
  heuristicSamples?: HeuristicSample[];
  /** false, если DFS/поиск остановлен лимитом. Не путать с complete layout. */
  searchExhaustive: boolean;
}

export interface RunOptimizerInput {
  backpack?: Backpack;
  /** Алиас `backpack` для API Stage 8. */
  inventory?: Backpack;
  bags: ItemToPlace[];
  items: ItemToPlace[];
  catalog?: Map<string, Item>;
  options?: Partial<OptimizerOptions>;
}

export interface HeuristicSample {
  heuristic: number;
  finalScore: number;
  depth: number;
}

export interface HeuristicInversionReport {
  sampleCount: number;
  pairCount: number;
  inversionCount: number;
  inversionRate: number;
  sameDepthPairCount: number;
  sameDepthInversionCount: number;
  sameDepthInversionRate: number;
}

export interface OptimizerComparisonSnapshot {
  algorithm?: OptimizerAlgorithm;
  finalScore: number;
  activatedStars: number;
  effectCoverage: number;
  placedItems: number;
  occupiedCells: number;
  durationMs: number;
  complete: boolean;
  searchExhaustive: boolean;
}

export interface OptimizerComparison {
  a: OptimizerComparisonSnapshot;
  b: OptimizerComparisonSnapshot;
  scoreDelta: number;
  activatedStarsDelta: number;
  effectCoverageDelta: number;
  placedItemsDelta: number;
  occupiedCellsDelta: number;
  durationMsDelta: number;
  /**
   * referenceScore − beamScore. Есть только если один из результатов — DFS
   * с конечным score. Не вычисляется при reference = −∞.
   */
  gap?: number;
  referenceExhaustive?: boolean;
}
