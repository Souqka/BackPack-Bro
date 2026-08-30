/**
 * Stage 15: quality comparison, best known, beam saturation, coverage, determinism.
 *
 * Не гоняет полный quality suite: только unit-логика и маленькие production cases.
 */

import { describe, expect, it } from "vitest";
import { runAdaptiveOptimizer } from "../adaptive-search.ts";
import { loadProductionCatalog } from "../load-catalog.ts";
import { getOptimizerStateSignature, runOptimizer } from "../optimizer.ts";
import { getBenchmarkCase, runBenchmarkCase, STAGE15_EXTRA_CASES } from "./index.ts";
import { buildBeamWidthCurve, qualitySaturationWidth, selectBestKnown } from "./comparison.ts";
import {
  assertProductionCatalogCoverage,
  QUALITY_CASE_META,
  uniqueQualityCases,
} from "./coverage.ts";
import { compareLayoutQuality, stubRankedLayout } from "./quality.ts";

const catalog = loadProductionCatalog();

describe("compareLayoutQuality", () => {
  it("complete лучше incomplete даже при меньшем score", () => {
    const complete = stubRankedLayout({ complete: true, score: 3, stars: 1, placed: 2, signature: "a" });
    const incomplete = stubRankedLayout({ complete: false, score: 4, stars: 2, placed: 3, signature: "b" });
    const vsBest = compareLayoutQuality(incomplete, complete);
    expect(vsBest.relation).toBe("worse");
    expect(vsBest.completeGap).toBe(1);
    expect(compareLayoutQuality(complete, incomplete).relation).toBe("better");
  });

  it("score gap корректный для двух complete layout", () => {
    const best = stubRankedLayout({ complete: true, score: 6, stars: 3, placed: 4, signature: "best" });
    const beam = stubRankedLayout({ complete: true, score: 4, stars: 2, placed: 4, signature: "beam" });
    const gap = compareLayoutQuality(beam, best);
    expect(gap.relation).toBe("worse");
    expect(gap.scoreGap).toBe(2);
    expect(gap.starGap).toBe(1);
    expect(gap.placedGap).toBe(0);
    expect(gap.occupiedGap).toBe(0);
  });

  it("occupied cells различают качество при равном score", () => {
    const denser = stubRankedLayout({ complete: true, score: 0, placed: 1, occupied: 4, signature: "d" });
    const sparser = stubRankedLayout({ complete: true, score: 0, placed: 1, occupied: 2, signature: "s" });
    const gap = compareLayoutQuality(sparser, denser);
    expect(gap.relation).toBe("worse");
    expect(gap.scoreGap).toBe(0);
    expect(gap.occupiedGap).toBe(2);
  });

  it("равные layout определяются как equal", () => {
    const a = stubRankedLayout({ complete: true, score: 5, stars: 2, coverage: 2, placed: 3, occupied: 5, signature: "same" });
    const b = stubRankedLayout({ complete: true, score: 5, stars: 2, coverage: 2, placed: 3, occupied: 5, signature: "same" });
    const gap = compareLayoutQuality(a, b);
    expect(gap.relation).toBe("equal");
    expect(gap.scoreGap).toBe(0);
    expect(gap.signatureTieOnly).toBe(false);
  });

  it("signature tie-break не считается gameplay improvement", () => {
    const a = stubRankedLayout({ complete: true, score: 5, stars: 1, coverage: 1, placed: 2, occupied: 4, signature: "aaa" });
    const b = stubRankedLayout({ complete: true, score: 5, stars: 1, coverage: 1, placed: 2, occupied: 4, signature: "zzz" });
    const gap = compareLayoutQuality(a, b);
    expect(gap.relation).toBe("equal");
    expect(gap.signatureTieOnly).toBe(true);
    expect(gap.scoreGap).toBe(0);
  });
});

describe("selectBestKnown", () => {
  it("exhaustive DFS помечается как proven", () => {
    const layout = stubRankedLayout({ complete: true, score: 4, stars: 2, placed: 3, signature: "opt" });
    const best = selectBestKnown([
      { source: "beam", label: "Beam(20)", layout, beamWidth: 20 },
      { source: "exhaustive_dfs", label: "DFS exhaustive", layout },
    ]);
    expect(best.source).toBe("exhaustive_dfs");
    expect(best.optimumProven).toBe(true);
    expect(best.score).toBe(4);
  });

  it("bounded DFS не помечается как proven", () => {
    const layout = stubRankedLayout({ complete: true, score: 4, stars: 2, placed: 3, signature: "bk" });
    const best = selectBestKnown([
      { source: "bounded_dfs", label: "DFS bounded", layout },
      { source: "beam", label: "Beam(5)", layout, beamWidth: 5 },
    ]);
    expect(best.source).toBe("beam");
    expect(best.optimumProven).toBe(false);
  });

  it("лучший источник выбирается по production ranking, не по сырому score", () => {
    const complete = stubRankedLayout({ complete: true, score: 3, stars: 1, placed: 2, signature: "c" });
    const incomplete = stubRankedLayout({ complete: false, score: 9, stars: 4, placed: 1, signature: "i" });
    const best = selectBestKnown([
      { source: "greedy", label: "Greedy", layout: incomplete },
      { source: "beam", label: "Beam(1)", layout: complete, beamWidth: 1 },
    ]);
    expect(best.complete).toBe(true);
    expect(best.score).toBe(3);
    expect(best.source).toBe("beam");
  });
});

describe("beam width saturation", () => {
  it("smallest width reaching best known определяется корректно", () => {
    const weak = stubRankedLayout({ complete: true, score: 2, stars: 1, placed: 2, signature: "w" });
    const mid = stubRankedLayout({ complete: true, score: 4, stars: 2, placed: 3, signature: "m" });
    const best = stubRankedLayout({ complete: true, score: 6, stars: 3, placed: 4, signature: "b" });
    const points = [
      { width: 1, layout: weak },
      { width: 2, layout: weak },
      { width: 5, layout: mid },
      { width: 10, layout: best },
      { width: 20, layout: best },
      { width: 50, layout: best },
    ];
    expect(qualitySaturationWidth(points, best)).toBe(10);
    const curve = buildBeamWidthCurve(
      "G-competing-stars",
      points.map((point) => ({ ...point, durationMs: point.width, states: point.width * 10 })),
      best,
    );
    expect(curve.saturationWidth).toBe(10);
    expect(curve.points.find((row) => row.width === 5)?.matchesBestKnown).toBe(false);
    expect(curve.points.find((row) => row.width === 10)?.matchesBestKnown).toBe(true);
  });

  it("отсутствие saturation обрабатывается корректно", () => {
    const best = stubRankedLayout({ complete: true, score: 6, stars: 3, placed: 4, signature: "best" });
    const weak = stubRankedLayout({ complete: true, score: 2, stars: 1, placed: 2, signature: "weak" });
    expect(
      qualitySaturationWidth(
        [
          { width: 1, layout: weak },
          { width: 20, layout: weak },
        ],
        best,
      ),
    ).toBeNull();
  });
});

describe("benchmark coverage", () => {
  it("все quality cases имеют category metadata", () => {
    const cases = uniqueQualityCases();
    expect(cases.length).toBeGreaterThanOrEqual(17);
    for (const entry of cases) {
      expect(entry.categories.length, entry.id).toBeGreaterThan(0);
      expect(entry.purpose.length, entry.id).toBeGreaterThan(0);
      expect(QUALITY_CASE_META[entry.id]).toBeDefined();
    }
    const ids = new Set(cases.map((entry) => entry.id));
    expect(ids.has("A-simple")).toBe(true);
    expect(ids.has("O-multi-bag-repair")).toBe(true);
    expect(ids.has("P-asymmetric-star")).toBe(true);
    expect(ids.has("Q-impossible-l")).toBe(true);
  });

  it("отсутствующие production itemId не проходят silently", () => {
    expect(() =>
      assertProductionCatalogCoverage(
        [{ id: "fake", bags: [{ itemId: "not_a_real_item" }], items: [{ itemId: "adamantite_ore" }] }],
        catalog,
      ),
    ).toThrow(/not_a_real_item/);
  });

  it("A–Q используют только production catalog", () => {
    expect(() => assertProductionCatalogCoverage(uniqueQualityCases(), catalog)).not.toThrow();
    for (const extra of STAGE15_EXTRA_CASES) {
      expect(getBenchmarkCase(extra.id).id).toBe(extra.id);
    }
  });
});

describe("benchmark determinism", () => {
  const simple = getBenchmarkCase("A-simple");

  it("одинаковый case → одинаковый Greedy / Beam / Adaptive Top-1", () => {
    const greedyA = runBenchmarkCase(simple, catalog, { algorithm: "greedy", localSearch: false });
    const greedyB = runBenchmarkCase(simple, catalog, { algorithm: "greedy", localSearch: false });
    expect(getOptimizerStateSignature(greedyA.bestState)).toBe(getOptimizerStateSignature(greedyB.bestState));

    const beamA = runBenchmarkCase(simple, catalog, {
      algorithm: "beam",
      bagBeamWidth: 5,
      itemBeamWidth: 5,
      localSearch: false,
      resultCount: 3,
    });
    const beamB = runBenchmarkCase(simple, catalog, {
      algorithm: "beam",
      bagBeamWidth: 5,
      itemBeamWidth: 5,
      localSearch: false,
      resultCount: 3,
    });
    expect(getOptimizerStateSignature(beamA.bestState)).toBe(getOptimizerStateSignature(beamB.bestState));
    expect(beamA.alternatives.map((entry) => entry.signature)).toEqual(
      beamB.alternatives.map((entry) => entry.signature),
    );

    const adaptiveInput = {
      inventory: simple.inventory,
      bags: simple.bags,
      items: simple.items,
      catalog,
      options: { metrics: true as const },
    };
    const adaptiveA = runAdaptiveOptimizer(adaptiveInput);
    const adaptiveB = runAdaptiveOptimizer(adaptiveInput);
    expect(getOptimizerStateSignature(adaptiveA.bestState)).toBe(
      getOptimizerStateSignature(adaptiveB.bestState),
    );
  });

  it("порядок cases не меняет результаты", () => {
    const other = getBenchmarkCase("Q-impossible-l");
    const firstA = runBenchmarkCase(simple, catalog, { algorithm: "beam", bagBeamWidth: 4, itemBeamWidth: 4 });
    const firstQ = runBenchmarkCase(other, catalog, { algorithm: "beam", bagBeamWidth: 4, itemBeamWidth: 4 });
    const secondQ = runBenchmarkCase(other, catalog, { algorithm: "beam", bagBeamWidth: 4, itemBeamWidth: 4 });
    const secondA = runBenchmarkCase(simple, catalog, { algorithm: "beam", bagBeamWidth: 4, itemBeamWidth: 4 });
    expect(getOptimizerStateSignature(firstA.bestState)).toBe(getOptimizerStateSignature(secondA.bestState));
    expect(getOptimizerStateSignature(firstQ.bestState)).toBe(getOptimizerStateSignature(secondQ.bestState));
    expect(firstQ.complete).toBe(false);
  });
});

describe("production ranking lock", () => {
  it("runOptimizer на A не меняет complete layout из-за quality suite", () => {
    const result = runOptimizer({
      inventory: getBenchmarkCase("A-simple").inventory,
      bags: getBenchmarkCase("A-simple").bags,
      items: getBenchmarkCase("A-simple").items,
      catalog,
      options: { algorithm: "beam", bagBeamWidth: 8, itemBeamWidth: 10, localSearch: false },
    });
    expect(result.complete).toBe(true);
    expect(result.placedItems).toHaveLength(2);
  });
});
