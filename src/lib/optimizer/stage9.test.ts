import { describe, expect, it } from "vitest";
import { analyzeInventory } from "../inventory/inventory.ts";
import { STAGE9_BENCHMARK_CASES, STAGE9_BEAM_WIDTHS, runBeamWidthSweep, runBenchmarkCase } from "./benchmarks/index.ts";
import { loadProductionCatalog } from "./load-catalog.ts";

const catalog = loadProductionCatalog();

describe("Stage 9 beam width", () => {
  it("G: Beam(1) проигрывает Beam(10/20) по Final Score", () => {
    const g = STAGE9_BENCHMARK_CASES.find((entry) => entry.id === "G-competing-stars")!;
    const rows = runBeamWidthSweep(g, catalog, [1, 10, 20]);
    const w1 = rows.find((row) => row.beamWidth === 1)!;
    const w10 = rows.find((row) => row.beamWidth === 10)!;
    const w20 = rows.find((row) => row.beamWidth === 20)!;
    expect(w1.score).toBeLessThan(w10.score);
    expect(w1.score).toBeLessThan(w20.score);
  });

  it("I: competing geometry, width 1 хуже width 5+", () => {
    const i = STAGE9_BENCHMARK_CASES.find((entry) => entry.id === "I-geometry-trap")!;
    const rows = runBeamWidthSweep(i, catalog, [1, 5, 10]);
    expect(rows[0]!.score).toBeLessThan(rows[1]!.score);
  });

  it("H: несколько Bags, width меняет complete или score", () => {
    const h = STAGE9_BENCHMARK_CASES.find((entry) => entry.id === "H-multiple-bags")!;
    const rows = runBeamWidthSweep(h, catalog, [1, 20]);
    const better =
      rows[0]!.score < rows[1]!.score || (rows[0]!.complete === false && rows[1]!.complete === true);
    expect(better).toBe(true);
  });

  it("J: две Bags, width 1 хуже широкого Beam", () => {
    const j = STAGE9_BENCHMARK_CASES.find((entry) => entry.id === "J-bag-item-topology")!;
    const rows = runBeamWidthSweep(j, catalog, [1, 20]);
    expect(rows[0]!.score).toBeLessThan(rows[1]!.score);
  });

  it("width 1 / 2 / 10 дают валидный layout на G", () => {
    const g = STAGE9_BENCHMARK_CASES.find((entry) => entry.id === "G-competing-stars")!;
    for (const width of [1, 2, 10] as const) {
      const result = runBenchmarkCase(g, catalog, {
        algorithm: "beam",
        bagBeamWidth: width,
        itemBeamWidth: width,
        localSearch: false,
      });
      expect(result.placedBags.length).toBeGreaterThan(0);
      if (result.placedItems.length > 0) {
        expect(
          analyzeInventory({ inventory: g.inventory, items: result.placedItems }, catalog).valid,
        ).toBe(true);
      }
    }
  });

  it("STAGE9_BEAM_WIDTHS содержит требуемые ширины", () => {
    expect([...STAGE9_BEAM_WIDTHS]).toEqual([1, 2, 5, 10, 20, 50]);
  });
});

describe("Stage 9 local search quality", () => {
  it("не ухудшает Beam на G и может улучшить Beam(1)", () => {
    const g = STAGE9_BENCHMARK_CASES.find((entry) => entry.id === "G-competing-stars")!;
    const beam1 = runBenchmarkCase(g, catalog, {
      algorithm: "beam",
      bagBeamWidth: 1,
      itemBeamWidth: 1,
      localSearch: false,
    });
    const beam1Ls = runBenchmarkCase(g, catalog, {
      algorithm: "beam",
      bagBeamWidth: 1,
      itemBeamWidth: 1,
      localSearch: true,
      resultCount: 10,
    });
    expect(beam1Ls.metrics!.finalScore).toBeGreaterThanOrEqual(beam1.metrics!.finalScore);
    expect(beam1Ls.metrics!.scoreDelta).toBeGreaterThanOrEqual(0);
  });
});
