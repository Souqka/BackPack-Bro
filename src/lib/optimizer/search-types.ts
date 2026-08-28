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

export interface OptimizerOptions {
  bagBeamWidth: number;
  itemBeamWidth: number;
  maxDurationMs?: number;
  verbose?: boolean;
}

export interface BeamSearchOptions {
  beamWidth: number;
  maxStates?: number;
  deadlineMs?: number;
}

export const DEFAULT_OPTIMIZER_OPTIONS: OptimizerOptions = {
  bagBeamWidth: 20,
  itemBeamWidth: 50,
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

export interface OptimizerResult {
  bestState: OptimizerState;
  score: PlacementScore;
  placedItems: PlacedItem[];
  placedBags: PlacedBag[];
  unplacedItems: ItemToPlace[];
  unplacedBags: ItemToPlace[];
  complete: boolean;
  stats: OptimizerStats;
}

export interface RunOptimizerInput {
  backpack: Backpack;
  bags: ItemToPlace[];
  items: ItemToPlace[];
  catalog: Map<string, Item>;
  options?: Partial<OptimizerOptions>;
}
