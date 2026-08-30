/**
 * Best-known selection, ranking gaps и Beam width saturation.
 *
 * Best known — лучший найденный layout по production ranking.
 * Это не global optimum, пока exhaustive DFS не завершился.
 */

import { isStrictlyBetterLayout } from "../rank.ts";
import type { RankedLayout } from "../search-types.ts";
import { compareLayoutQuality, finiteScore, matchesBestKnownQuality } from "./quality.ts";
import type {
  BestKnownCandidate,
  BestKnownResult,
  BestKnownSource,
  BeamWidthCurve,
  BeamWidthQualityPoint,
  QualityComparison,
} from "./quality-types.ts";

const SOURCE_PRIORITY: Record<BestKnownSource, number> = {
  exhaustive_dfs: 0,
  beam: 1,
  adaptive: 2,
  joint_bag_local_search: 3,
  item_local_search: 4,
  bounded_dfs: 5,
  greedy: 6,
};

export function selectBestKnown(candidates: BestKnownCandidate[]): BestKnownResult {
  if (candidates.length === 0) {
    throw new Error("selectBestKnown: нет кандидатов");
  }

  const ranked = [...candidates].sort(compareBestKnownCandidates);
  const best = ranked[0]!;
  const exhaustive = candidates.filter((entry) => entry.source === "exhaustive_dfs");
  const exhaustiveMatchesBest = exhaustive.some((entry) =>
    matchesBestKnownQuality(entry.layout, best.layout),
  );

  return {
    layout: best.layout,
    source: best.source,
    sourceLabel: best.label,
    beamWidth: best.beamWidth,
    optimumProven: exhaustiveMatchesBest,
    score: finiteScore(best.layout),
    activatedStars: best.layout.score.breakdown.activatedStars,
    complete: best.layout.complete,
    signature: best.layout.signature,
  };
}

export function compareBestKnownCandidates(a: BestKnownCandidate, b: BestKnownCandidate): number {
  if (isStrictlyBetterLayout(a.layout, b.layout)) return -1;
  if (isStrictlyBetterLayout(b.layout, a.layout)) return 1;
  const priority = SOURCE_PRIORITY[a.source] - SOURCE_PRIORITY[b.source];
  if (priority !== 0) return priority;
  const widthA = a.beamWidth ?? Number.POSITIVE_INFINITY;
  const widthB = b.beamWidth ?? Number.POSITIVE_INFINITY;
  if (widthA !== widthB) return widthA - widthB;
  return a.label.localeCompare(b.label);
}

export function qualitySaturationWidth(
  points: ReadonlyArray<{ width: number; layout: RankedLayout }>,
  bestKnown: RankedLayout,
): number | null {
  const sorted = [...points].sort((a, b) => a.width - b.width);
  for (const point of sorted) {
    if (matchesBestKnownQuality(point.layout, bestKnown)) return point.width;
  }
  return null;
}

export function buildBeamWidthCurve(
  caseId: string,
  points: ReadonlyArray<{
    width: number;
    layout: RankedLayout;
    durationMs: number;
    states: number;
  }>,
  bestKnown: RankedLayout,
): BeamWidthCurve {
  const qualityPoints: BeamWidthQualityPoint[] = [...points]
    .sort((a, b) => a.width - b.width)
    .map((point) => {
      const gapToBestKnown = compareLayoutQuality(point.layout, bestKnown);
      return {
        width: point.width,
        score: finiteScore(point.layout),
        stars: point.layout.score.breakdown.activatedStars,
        complete: point.layout.complete,
        durationMs: point.durationMs,
        states: point.states,
        gapToBestKnown,
        matchesBestKnown: gapToBestKnown.relation === "equal",
      };
    });
  return {
    caseId,
    points: qualityPoints,
    saturationWidth: qualitySaturationWidth(
      points.map((point) => ({ width: point.width, layout: point.layout })),
      bestKnown,
    ),
  };
}

export function gapAgainstBestKnown(
  result: RankedLayout,
  bestKnown: RankedLayout,
): QualityComparison {
  return compareLayoutQuality(result, bestKnown);
}
