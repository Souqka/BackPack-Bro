/**
 * Production Optimizer API contract.
 * Search internals (SearchState, PlacementCandidate, AdaptiveSearchOptions) stay private.
 */

import type { AdaptiveStopReason } from "../adaptive-types.ts";

export type ProductionQuality = "fast" | "balanced" | "high";

export interface OptimizeInventoryOptions {
  resultCount?: number;
  maxDurationMs?: number;
  quality?: ProductionQuality;
  enableItemLocalSearch?: boolean;
  enableBagLocalSearch?: boolean;
}

export interface OptimizeInventoryInput {
  rows?: number;
  cols?: number;
  bagItemIds: string[];
  itemIds: string[];
  options?: OptimizeInventoryOptions;
}

export interface OptimizedPlacement {
  instanceId: string;
  itemId: string;
  row: number;
  col: number;
  rotation: number;
}

export interface OptimizedInstance {
  instanceId: string;
  itemId: string;
}

export interface OptimizedActiveStat {
  id: string;
  name: string;
  value?: number;
}

export interface OptimizedScore {
  valid: boolean;
  /** Final Scoring Engine score. null when the layout is invalid (−∞ is not JSON-safe). */
  structuralScore: number | null;
  activatedStars: number;
  effectCoverage: number;
  /**
   * Activated star-rule effects from the Scoring Engine result.
   * Optional for backward compatibility with older serialized fixtures.
   */
  activeStats?: OptimizedActiveStat[];
}

export interface OptimizedLayout {
  rows: number;
  cols: number;
  bags: OptimizedPlacement[];
  items: OptimizedPlacement[];
  unplacedItems: OptimizedInstance[];
  unplacedBags: OptimizedInstance[];
}

export interface OptimizedLayoutResult {
  layout: OptimizedLayout;
  score: OptimizedScore;
  complete: boolean;
  signature: string;
}

export interface OptimizeInventoryExecution {
  stopReason: AdaptiveStopReason;
  durationMs: number;
}

export interface OptimizeInventorySuccess {
  ok: true;
  layout: OptimizedLayout;
  score: OptimizedScore;
  complete: boolean;
  signature: string;
  results: OptimizedLayoutResult[];
  execution: OptimizeInventoryExecution;
}

export interface OptimizeInventoryFailure {
  ok: false;
  error: OptimizeInventoryError;
}

export type OptimizeInventoryResult = OptimizeInventorySuccess | OptimizeInventoryFailure;

export type OptimizeInventoryError =
  | {
      code: "INVALID_INPUT";
      message: string;
      details?: { field: string; value?: unknown };
    }
  | {
      code: "UNKNOWN_ITEM";
      message: string;
      itemId: string;
    }
  | {
      code: "INVALID_BAG";
      message: string;
      itemId: string;
    }
  | {
      code: "INVALID_ITEM";
      message: string;
      itemId: string;
    }
  | {
      code: "NO_BAG_LAYOUT";
      message: string;
    };
