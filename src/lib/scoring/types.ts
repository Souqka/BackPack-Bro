/**
 * Модели Scoring Engine: факты, synergy, coverage, итоговый PlacementScore.
 *
 * Adjacency в факты не входит: в строгой модели Stage 2/3 нет механики adjacent,
 * только геометрическая статистика расстояния Star в отчёте каталога.
 */

import type { Position, StarActivationReason } from "../inventory/types.ts";

export type SynergyType = "star_activation" | "star_effect" | "unknown";

export type SynergyStatus = "active" | "inactive" | "unknown" | "unsupported";

export type EffectClassification = "normalized" | "raw" | "unsupported";

export interface ActiveStarFact {
  sourceInstanceId: string;
  sourceItemId: string;
  targetInstanceId: string;
  targetItemId: string;
  starPosition: Position;
  /** Индексы StarRule source, прошедших occupant. */
  matchingRuleIndexes: number[];
  /** Краткое имя первого подошедшего trigger, например on_star_activation. */
  activationRule?: string;
}

export interface InactiveStarFact {
  sourceInstanceId: string;
  sourceItemId: string;
  targetInstanceId: string;
  targetItemId: string;
  starPosition: Position;
  reason: StarActivationReason;
}

export interface PlacementFacts {
  valid: boolean;
  activeStars: ActiveStarFact[];
  inactiveStars: InactiveStarFact[];
}

export interface Synergy {
  id: string;
  type: SynergyType;
  sourceInstanceId: string;
  targetInstanceIds: string[];
  score: number;
  status: SynergyStatus;
  reason?: string;
}

export interface ScoreComponent {
  type: string;
  score: number;
  sourceInstanceId?: string;
  targetInstanceId?: string;
  reason: string;
}

export interface ScoreBreakdown {
  total: number;
  activatedStars: number;
  unsupportedInteractions: number;
  unknownInteractions: number;
  itemsPlaced: number;
  occupiedCells: number;
  emptyCells: number;
  components: ScoreComponent[];
}

export interface EffectCoverage {
  totalActiveEffects: number;
  normalizedEffects: number;
  rawEffects: number;
  unsupportedEffects: number;
}

export interface SynergyNode {
  id: string;
  instanceId: string;
  itemId: string;
}

export interface SynergyEdge {
  id: string;
  source: string;
  target: string;
  synergyId: string;
  type: SynergyType;
  active: boolean;
}

export interface SynergyGraph {
  nodes: SynergyNode[];
  edges: SynergyEdge[];
}

export interface PlacementScore {
  valid: boolean;
  score: number;
  breakdown: ScoreBreakdown;
  effectCoverage: EffectCoverage;
  synergies: Synergy[];
  graph: SynergyGraph;
}
