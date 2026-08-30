/**
 * Типы Search Quality Suite (Stage 15).
 *
 * Не путать best known с доказанным оптимумом: optimumProven = true
 * только если exhaustive DFS дошёл до конца и совпал с best known.
 */

import type { RankedLayout } from "../search-types.ts";
import type { AdaptiveStopReason } from "../adaptive-types.ts";
import type { OptimizerBenchmarkCase } from "./types.ts";

export type BenchmarkCategory =
  | "dfs_feasible"
  | "beam_width_sensitive"
  | "bag_topology_sensitive"
  | "star_topology_sensitive"
  | "local_search_sensitive"
  | "repair_sensitive"
  | "multi_bag"
  | "dense_geometry"
  | "incomplete"
  | "control";

export type BestKnownSource =
  | "exhaustive_dfs"
  | "bounded_dfs"
  | "beam"
  | "adaptive"
  | "greedy"
  | "item_local_search"
  | "joint_bag_local_search";

export type QualityRelation = "better" | "equal" | "worse";

export type QualitySuiteMode = "quick" | "full";

export interface QualityBenchmarkCase extends OptimizerBenchmarkCase {
  categories: BenchmarkCategory[];
  /** Зачем case существует в quality suite, а не только что в нём лежит. */
  purpose: string;
}

export interface QualityComparison {
  relation: QualityRelation;
  scoreGap: number;
  starGap: number;
  coverageGap: number;
  placedGap: number;
  completeGap: number;
  occupiedGap: number;
  /**
   * true, если production ranking различает только canonical signature,
   * а gameplay-качество (isStrictlyBetterLayout) одинаковое.
   */
  signatureTieOnly: boolean;
}

export interface SearchCostMetrics {
  statesGenerated: number;
  statesPruned: number;
  candidatesGenerated: number;
  scoreCacheHits?: number;
  scoreCacheMisses?: number;
  scoreCacheHitRate?: number;
}

export interface LocalSearchQualityMetrics {
  initialScore: number;
  scoreDelta: number;
  iterations: number;
  neighbors: number;
  acceptedMoves: number;
}

export interface AdaptiveQualityMetrics {
  escalation: number;
  stopReason: AdaptiveStopReason | string;
  bagSeeds: number;
}

export interface SearchQualitySnapshot {
  algorithmId: string;
  label: string;
  source: BestKnownSource;
  beamWidth?: number;
  complete: boolean;
  score: number;
  activatedStars: number;
  effectCoverage: number;
  placedItems: number;
  unplacedItems: number;
  canonicalSignature: string;
  durationMs: number;
  searchExhaustive?: boolean;
  cost: SearchCostMetrics;
  localSearch?: LocalSearchQualityMetrics;
  adaptive?: AdaptiveQualityMetrics;
}

export interface BestKnownCandidate {
  source: BestKnownSource;
  label: string;
  layout: RankedLayout;
  beamWidth?: number;
}

export interface BestKnownResult {
  layout: RankedLayout;
  source: BestKnownSource;
  sourceLabel: string;
  beamWidth?: number;
  optimumProven: boolean;
  score: number;
  activatedStars: number;
  complete: boolean;
  signature: string;
}

export interface BeamWidthQualityPoint {
  width: number;
  score: number;
  stars: number;
  complete: boolean;
  durationMs: number;
  states: number;
  gapToBestKnown: QualityComparison;
  matchesBestKnown: boolean;
}

export interface BeamWidthCurve {
  caseId: string;
  points: BeamWidthQualityPoint[];
  saturationWidth: number | null;
}

export interface LocalSearchCaseEvaluation {
  caseId: string;
  seedScore: number;
  seedComplete: boolean;
  seedSignature: string;
  afterItemLs: SearchQualitySnapshot;
  afterJointLs: SearchQualitySnapshot;
  itemDelta: QualityComparison;
  jointDelta: QualityComparison;
  itemStrictImprovement: boolean;
  jointStrictImprovement: boolean;
}

export interface AdaptiveCaseEvaluation {
  caseId: string;
  matchesBestKnown: boolean;
  vsBeam1: QualityComparison;
  vsBeam20: QualityComparison | null;
  vsBestFixedBeam: QualityComparison | null;
  bestFixedBeamWidth: number | null;
  runtimeRatioVsBeam20: number | null;
  statesRatioVsBeam20: number | null;
  stopReason: string;
  escalation: number;
  improvedOverBeam1: boolean;
  matchesBeam20: boolean;
  overheadOnly: boolean;
}

export interface HeuristicCaseDiagnostics {
  caseId: string;
  sampleCount: number;
  sameDepthPairCount: number;
  sameDepthInversionCount: number;
  sameDepthInversionRate: number;
  inversionRate: number;
  dfsExhaustive: boolean;
  dfsScore: number;
}

export interface CaseQualitySummary {
  caseId: string;
  name: string;
  categories: BenchmarkCategory[];
  purpose: string;
  bestKnown: BestKnownResult;
  saturationWidth: number | null;
  greedyGap: QualityComparison | null;
  beam1Gap: QualityComparison | null;
  beam20Gap: QualityComparison | null;
  adaptiveGap: QualityComparison | null;
  localSearchImprovement: boolean | null;
}

export interface Stage15QualityReport {
  mode: QualitySuiteMode;
  elapsedMs: number;
  cases: CaseQualitySummary[];
  coverage: Array<{
    caseId: string;
    name: string;
    categories: BenchmarkCategory[];
    purpose: string;
  }>;
  algorithmMatrix: Array<{
    caseId: string;
    runs: SearchQualitySnapshot[];
  }>;
  beamCurves: BeamWidthCurve[];
  localSearch: LocalSearchCaseEvaluation[];
  adaptive: AdaptiveCaseEvaluation[];
  heuristic: HeuristicCaseDiagnostics[];
  snapshots: Array<{
    caseId: string;
    algorithmId: string;
    snapshot: SearchQualitySnapshot;
  }>;
}
