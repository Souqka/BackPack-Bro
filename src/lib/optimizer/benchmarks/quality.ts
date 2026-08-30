/**
 * Сравнение качества layout через production ranking.
 *
 * Не вводит вторую формулу: complete / score / stars / coverage / placed
 * совпадают с compareRankedLayouts. Canonical signature — только tie-break
 * детерминизма, не gameplay-улучшение (как isStrictlyBetterLayout).
 */

import { emptyEffectCoverage, invalidBreakdown } from "../../scoring/score.ts";
import { INVALID_PLACEMENT_SCORE } from "../../scoring/weights.ts";
import { getOptimizerStateSignature } from "../optimizer.ts";
import { isStrictlyBetterLayout } from "../rank.ts";
import type { OptimizerResult, RankedLayout } from "../search-types.ts";
import type { QualityComparison } from "./quality-types.ts";

export function rankedLayoutFromResult(result: OptimizerResult): RankedLayout {
  return {
    state: result.bestState,
    score: result.score,
    unplacedItems: result.unplacedItems,
    unplacedBags: result.unplacedBags,
    complete: result.complete,
    signature: getOptimizerStateSignature(result.bestState),
  };
}

export function compareLayoutQuality(result: RankedLayout, reference: RankedLayout): QualityComparison {
  const resultBetter = isStrictlyBetterLayout(result, reference);
  const referenceBetter = isStrictlyBetterLayout(reference, result);
  const relation = resultBetter ? "better" : referenceBetter ? "worse" : "equal";
  return {
    relation,
    scoreGap: subtractScores(finiteScore(reference), finiteScore(result)),
    starGap: reference.score.breakdown.activatedStars - result.score.breakdown.activatedStars,
    coverageGap:
      reference.score.effectCoverage.normalizedEffects - result.score.effectCoverage.normalizedEffects,
    placedGap: reference.state.items.items.length - result.state.items.items.length,
    completeGap: Number(reference.complete) - Number(result.complete),
    signatureTieOnly: relation === "equal" && result.signature !== reference.signature,
  };
}

export function matchesBestKnownQuality(result: RankedLayout, bestKnown: RankedLayout): boolean {
  return compareLayoutQuality(result, bestKnown).relation === "equal";
}

export function finiteScore(layout: RankedLayout): number {
  if (!layout.score.valid) return Number.NEGATIVE_INFINITY;
  return layout.score.score;
}

function subtractScores(reference: number, result: number): number {
  if (reference === result) return 0;
  if (!Number.isFinite(reference) && !Number.isFinite(result)) return 0;
  return reference - result;
}

/** Минимальный RankedLayout для unit-тестов quality comparison — не production API. */
export function stubRankedLayout(args: {
  complete: boolean;
  score: number;
  stars?: number;
  coverage?: number;
  totalEffects?: number;
  placed?: number;
  occupied?: number;
  signature?: string;
  valid?: boolean;
}): RankedLayout {
  const valid = args.valid ?? Number.isFinite(args.score);
  const placed = args.placed ?? 0;
  const items = Array.from({ length: placed }, (_, index) => ({
    instanceId: `item-${index}`,
    itemId: "adamantite_ore",
    position: { row: 0, col: index },
    rotation: 0 as const,
  }));
  return {
    state: {
      backpack: { rows: 6, cols: 9 },
      bags: {
        bags: [],
        occupiedCells: new Map(),
        availableCells: new Set(),
        geometries: new Map(),
      },
      items: {
        inventory: { rows: 6, cols: 9 },
        items,
        occupiedCells: new Map(),
        itemGeometries: new Map(),
      },
    },
    score: {
      valid,
      score: valid ? args.score : INVALID_PLACEMENT_SCORE,
      breakdown: valid
        ? {
            total: args.score,
            activatedStars: args.stars ?? 0,
            unsupportedInteractions: 0,
            unknownInteractions: 0,
            itemsPlaced: placed,
            occupiedCells: args.occupied ?? placed,
            emptyCells: 0,
            components: [],
          }
        : invalidBreakdown("invalid stub"),
      effectCoverage: {
        ...emptyEffectCoverage(),
        normalizedEffects: args.coverage ?? 0,
        totalActiveEffects: args.totalEffects ?? args.coverage ?? 0,
      },
      synergies: [],
      graph: { nodes: [], edges: [] },
    },
    unplacedItems: [],
    unplacedBags: [],
    complete: args.complete,
    signature: args.signature ?? "stub",
  };
}
