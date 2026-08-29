/**
 * Defaults for Adaptive Portfolio Search. Ladder values live here only.
 */

import { DEFAULT_BAG_SIMILARITY_THRESHOLD } from "./bag-diversity.ts";
import type { AdaptiveSearchOptions } from "./adaptive-types.ts";

export interface ResolvedAdaptiveSearchOptions {
  initialBagBeamWidth: number;
  initialItemBeamWidth: number;
  bagBeamWidths: number[];
  itemBeamWidths: number[];
  maxBagSeeds: number;
  similarityThreshold: number;
  enableItemLocalSearch: boolean;
  enableBagLocalSearch: boolean;
  stopWhenComplete: boolean;
  stableLevelsBeforeStop: number | false;
  resultCount: number;
  maxDurationMs?: number;
  scoreCache: boolean;
  transposition: boolean;
}

export const DEFAULT_ADAPTIVE_SEARCH_OPTIONS: ResolvedAdaptiveSearchOptions = {
  initialBagBeamWidth: 1,
  initialItemBeamWidth: 1,
  bagBeamWidths: [1, 2, 5, 10, 20],
  itemBeamWidths: [1, 2, 5, 10, 20],
  maxBagSeeds: 4,
  similarityThreshold: DEFAULT_BAG_SIMILARITY_THRESHOLD,
  enableItemLocalSearch: true,
  enableBagLocalSearch: true,
  /** Complete is not a proven optimum (Stage 9 G: complete@2 then score 4@10). */
  stopWhenComplete: false,
  /** Two consecutive non-improving levels after Stage 9 diminishing returns. */
  stableLevelsBeforeStop: 2,
  resultCount: 10,
  scoreCache: true,
  transposition: true,
};

export function normalizeWidthLadder(widths: readonly number[]): number[] {
  const unique = new Set<number>();
  for (const width of widths) {
    if (!Number.isFinite(width)) continue;
    const value = Math.floor(width);
    if (value >= 1) unique.add(value);
  }
  return [...unique].sort((a, b) => a - b);
}

export function resolveAdaptiveSearchOptions(
  value?: AdaptiveSearchOptions,
): ResolvedAdaptiveSearchOptions {
  const merged: ResolvedAdaptiveSearchOptions = {
    ...DEFAULT_ADAPTIVE_SEARCH_OPTIONS,
    ...value,
    maxDurationMs: value?.maxDurationMs ?? DEFAULT_ADAPTIVE_SEARCH_OPTIONS.maxDurationMs,
  };
  merged.bagBeamWidths = resolveLadder(
    value?.initialBagBeamWidth,
    value?.bagBeamWidths,
    DEFAULT_ADAPTIVE_SEARCH_OPTIONS.initialBagBeamWidth,
    DEFAULT_ADAPTIVE_SEARCH_OPTIONS.bagBeamWidths,
  );
  merged.itemBeamWidths = resolveLadder(
    value?.initialItemBeamWidth,
    value?.itemBeamWidths,
    DEFAULT_ADAPTIVE_SEARCH_OPTIONS.initialItemBeamWidth,
    DEFAULT_ADAPTIVE_SEARCH_OPTIONS.itemBeamWidths,
  );
  merged.initialBagBeamWidth = merged.bagBeamWidths[0]!;
  merged.initialItemBeamWidth = merged.itemBeamWidths[0]!;
  merged.maxBagSeeds = Math.max(1, Math.floor(merged.maxBagSeeds));
  merged.resultCount = Math.max(1, Math.floor(merged.resultCount));
  merged.scoreCache = merged.scoreCache !== false;
  merged.transposition = merged.transposition !== false;
  return merged;
}

function resolveLadder(
  initial: number | undefined,
  widths: number[] | undefined,
  defaultInitial: number,
  defaultWidths: number[],
): number[] {
  const source =
    widths !== undefined
      ? initial !== undefined
        ? [initial, ...widths]
        : widths
      : [initial ?? defaultInitial, ...defaultWidths];
  const normalized = normalizeWidthLadder(source);
  return normalized.length > 0 ? normalized : [defaultInitial];
}

export function zipSearchLevels(
  bagWidths: readonly number[],
  itemWidths: readonly number[],
): Array<{ bagBeamWidth: number; itemBeamWidth: number }> {
  const length = Math.max(bagWidths.length, itemWidths.length);
  const levels: Array<{ bagBeamWidth: number; itemBeamWidth: number }> = [];
  for (let index = 0; index < length; index++) {
    levels.push({
      bagBeamWidth: bagWidths[Math.min(index, bagWidths.length - 1)]!,
      itemBeamWidth: itemWidths[Math.min(index, itemWidths.length - 1)]!,
    });
  }
  return levels;
}
