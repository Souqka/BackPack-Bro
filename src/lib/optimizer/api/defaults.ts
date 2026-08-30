/**
 * Thin mapping from public quality presets onto existing Adaptive Search options.
 * No new search algorithms. Ladder widths follow Stage 15: Beam(50) did not
 * improve production ranking over Beam(20), so high keeps the same ladder and
 * spends budget on more bag seeds + a full (non-early-stop) escalation.
 */

import type { AdaptiveSearchOptions } from "../adaptive-types.ts";
import type { OptimizeInventoryOptions, ProductionQuality } from "./types.ts";
import { invalidInput } from "./errors.ts";
import type { OptimizeInventoryError } from "./types.ts";

export const DEFAULT_PRODUCTION_QUALITY: ProductionQuality = "balanced";
export const DEFAULT_PRODUCTION_RESULT_COUNT = 1;
export const MAX_PRODUCTION_RESULTS = 10;
export const MAX_PRODUCTION_ROWS = 12;
export const MAX_PRODUCTION_COLS = 16;
export const MAX_PRODUCTION_DURATION_MS = 120_000;

export interface QualityPreset {
  bagBeamWidths: number[];
  itemBeamWidths: number[];
  maxBagSeeds: number;
  enableItemLocalSearch: boolean;
  enableBagLocalSearch: boolean;
  stableLevelsBeforeStop: number | false;
  maxDurationMs: number;
  minInternalResultCount: number;
}

export const PRODUCTION_QUALITY_PRESETS: Record<ProductionQuality, QualityPreset> = {
  fast: {
    bagBeamWidths: [1, 2, 5],
    itemBeamWidths: [1, 2, 5],
    maxBagSeeds: 2,
    enableItemLocalSearch: false,
    enableBagLocalSearch: false,
    stableLevelsBeforeStop: 2,
    maxDurationMs: 2_000,
    minInternalResultCount: 5,
  },
  balanced: {
    bagBeamWidths: [1, 2, 5, 10, 20],
    itemBeamWidths: [1, 2, 5, 10, 20],
    maxBagSeeds: 4,
    enableItemLocalSearch: true,
    enableBagLocalSearch: true,
    stableLevelsBeforeStop: 2,
    maxDurationMs: 10_000,
    minInternalResultCount: 10,
  },
  high: {
    bagBeamWidths: [1, 2, 5, 10, 20],
    itemBeamWidths: [1, 2, 5, 10, 20],
    maxBagSeeds: 6,
    enableItemLocalSearch: true,
    enableBagLocalSearch: true,
    stableLevelsBeforeStop: false,
    maxDurationMs: 30_000,
    minInternalResultCount: 10,
  },
};

export interface ResolvedProductionOptions {
  quality: ProductionQuality;
  publicResultCount: number;
  adaptive: AdaptiveSearchOptions;
}

export type ResolveOptionsResult =
  | { ok: true; value: ResolvedProductionOptions }
  | { ok: false; error: OptimizeInventoryError };

export function resolveProductionOptions(options?: OptimizeInventoryOptions): ResolveOptionsResult {
  if (options === undefined) {
    return { ok: true, value: fromPreset(DEFAULT_PRODUCTION_QUALITY, DEFAULT_PRODUCTION_RESULT_COUNT, undefined) };
  }
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    return { ok: false, error: invalidInput("options", "options must be an object", options) };
  }

  const quality = options.quality ?? DEFAULT_PRODUCTION_QUALITY;
  if (quality !== "fast" && quality !== "balanced" && quality !== "high") {
    return { ok: false, error: invalidInput("options.quality", "quality must be fast, balanced, or high", quality) };
  }

  const resultCount = options.resultCount ?? DEFAULT_PRODUCTION_RESULT_COUNT;
  if (!Number.isInteger(resultCount) || resultCount < 1 || resultCount > MAX_PRODUCTION_RESULTS) {
    return {
      ok: false,
      error: invalidInput(
        "options.resultCount",
        `resultCount must be an integer from 1 to ${MAX_PRODUCTION_RESULTS}`,
        resultCount,
      ),
    };
  }

  if (options.maxDurationMs !== undefined) {
    if (
      typeof options.maxDurationMs !== "number" ||
      !Number.isFinite(options.maxDurationMs) ||
      options.maxDurationMs < 1 ||
      options.maxDurationMs > MAX_PRODUCTION_DURATION_MS
    ) {
      return {
        ok: false,
        error: invalidInput(
          "options.maxDurationMs",
          `maxDurationMs must be a finite number from 1 to ${MAX_PRODUCTION_DURATION_MS}`,
          options.maxDurationMs,
        ),
      };
    }
  }

  if (options.enableItemLocalSearch !== undefined && typeof options.enableItemLocalSearch !== "boolean") {
    return {
      ok: false,
      error: invalidInput(
        "options.enableItemLocalSearch",
        "enableItemLocalSearch must be a boolean",
        options.enableItemLocalSearch,
      ),
    };
  }
  if (options.enableBagLocalSearch !== undefined && typeof options.enableBagLocalSearch !== "boolean") {
    return {
      ok: false,
      error: invalidInput(
        "options.enableBagLocalSearch",
        "enableBagLocalSearch must be a boolean",
        options.enableBagLocalSearch,
      ),
    };
  }

  return {
    ok: true,
    value: fromPreset(quality, resultCount, options),
  };
}

function fromPreset(
  quality: ProductionQuality,
  publicResultCount: number,
  overrides: OptimizeInventoryOptions | undefined,
): ResolvedProductionOptions {
  const preset = PRODUCTION_QUALITY_PRESETS[quality];
  const adaptive: AdaptiveSearchOptions = {
    bagBeamWidths: preset.bagBeamWidths,
    itemBeamWidths: preset.itemBeamWidths,
    maxBagSeeds: preset.maxBagSeeds,
    enableItemLocalSearch: overrides?.enableItemLocalSearch ?? preset.enableItemLocalSearch,
    enableBagLocalSearch: overrides?.enableBagLocalSearch ?? preset.enableBagLocalSearch,
    stopWhenComplete: false,
    stableLevelsBeforeStop: preset.stableLevelsBeforeStop,
    resultCount: Math.max(publicResultCount, preset.minInternalResultCount),
    maxDurationMs: overrides?.maxDurationMs ?? preset.maxDurationMs,
  };
  return { quality, publicResultCount, adaptive };
}
