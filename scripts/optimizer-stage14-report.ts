/**
 * Stage 14 report: candidate generation microbenchmark + optimizer identity.
 *
 * Baseline = frozen Stage 6 generator. Optimized = production path.
 */
import { generatePlacementCandidatesBaseline } from "../src/lib/optimizer/candidates.baseline.ts";
import {
  generatePlacementCandidates,
  withBaselineCandidateGeneration,
} from "../src/lib/optimizer/candidates.ts";
import { withCandidateGenerationProfile } from "../src/lib/optimizer/candidate-profile.ts";
import { STAGE11_BENCHMARK_CASES } from "../src/lib/optimizer/benchmarks/cases.ts";
import { generateBagCandidates } from "../src/lib/optimizer/bags/candidates.ts";
import { createBagState } from "../src/lib/optimizer/bags/state.ts";
import { runAdaptiveOptimizer } from "../src/lib/optimizer/adaptive-search.ts";
import { loadProductionCatalog } from "../src/lib/optimizer/load-catalog.ts";
import { getOptimizerStateSignature, runOptimizer } from "../src/lib/optimizer/optimizer.ts";
import { createSearchState } from "../src/lib/optimizer/state.ts";
import { DEFAULT_BACKPACK } from "../src/lib/optimizer/types.ts";
import type { ItemToPlace, SearchState } from "../src/lib/optimizer/types.ts";

function pad(value: string | number, width: number): string {
  const text = String(value);
  return text.length >= width ? text : `${" ".repeat(width - text.length)}${text}`;
}

function ms(value: number): string {
  return `${value.toFixed(2)}ms`;
}

function speedup(baseline: number, optimized: number): string {
  if (optimized <= 0) return "n/a";
  return `${(baseline / optimized).toFixed(2)}x`;
}

function pct(part: number, total: number): string {
  if (total <= 0) return "n/a";
  return `${((part / total) * 100).toFixed(1)}%`;
}

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

function timed(iterations: number, fn: () => void): number {
  const first = run(iterations, fn);
  const second = run(iterations, fn);
  const third = run(iterations, fn);
  return Math.min(first, second, third);
}

function run(iterations: number, fn: () => void): number {
  const started = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  return performance.now() - started;
}

const catalog = loadProductionCatalog();
const ITERATIONS = 600;

function emptyState(): SearchState {
  const result = createSearchState(DEFAULT_BACKPACK);
  if (!result.ok) throw new Error("empty");
  return result.state;
}

const empty = emptyState();
const emptyBags = createBagState(DEFAULT_BACKPACK, [], catalog);
if (!emptyBags.ok) throw new Error("empty bags");

console.log("=== Stage 14 Candidate Generation Optimization ===\n");

console.log("Candidate microbenchmark (empty 6×9, min of 3 runs)");
console.log("item                        cand  baseline   optimized  speedup");
const itemIds = [
  "adamantite_ore",
  "adamantite_bar",
  "starbloom",
  "black_cat",
  "big_chocolate_gift_box",
];
for (const itemId of itemIds) {
  const item: ItemToPlace = { instanceId: `${itemId}-1`, itemId };
  const candidates = generatePlacementCandidates(item, empty, catalog);
  const baselineMs = timed(ITERATIONS, () => {
    generatePlacementCandidatesBaseline(item, empty, catalog);
  });
  const optimizedMs = timed(ITERATIONS, () => {
    generatePlacementCandidates(item, empty, catalog);
  });
  console.log(
    `${pad(itemId, 27)} ${pad(candidates.length, 4)} ${pad(ms(baselineMs / ITERATIONS), 10)} ${pad(ms(optimizedMs / ITERATIONS), 10)} ${speedup(baselineMs, optimizedMs)}`,
  );
}

console.log("\nWith availableCells (warrior_backpack)");
const warrior = createBagState(
  DEFAULT_BACKPACK,
  [{ instanceId: "w", itemId: "warrior_backpack", position: { row: 0, col: 0 }, rotation: 0 }],
  catalog,
);
if (!warrior.ok) throw new Error("warrior");
for (const itemId of ["adamantite_ore", "adamantite_bar", "black_cat"]) {
  const item: ItemToPlace = { instanceId: `${itemId}-w`, itemId };
  const available = warrior.state.availableCells;
  const candidates = generatePlacementCandidates(item, empty, catalog, available);
  const baselineMs = timed(ITERATIONS, () => {
    generatePlacementCandidatesBaseline(item, empty, catalog, available);
  });
  const optimizedMs = timed(ITERATIONS, () => {
    generatePlacementCandidates(item, empty, catalog, available);
  });
  console.log(
    `${pad(itemId, 16)} cand=${pad(candidates.length, 3)} baseline ${ms(baselineMs / ITERATIONS)} optimized ${ms(optimizedMs / ITERATIONS)} ${speedup(baselineMs, optimizedMs)}`,
  );
}

console.log("\nBag candidate generation");
console.log("bag                  cand  baseline   optimized  speedup");
for (const bagId of ["medium_bag", "fanny_pack", "warrior_backpack", "bottom_trawl"]) {
  const bag: ItemToPlace = { instanceId: "bag", itemId: bagId };
  const candidates = generateBagCandidates(bag, emptyBags.state, DEFAULT_BACKPACK, catalog);
  const baselineMs = timed(ITERATIONS, () => {
    withBaselineCandidateGeneration(() =>
      generateBagCandidates(bag, emptyBags.state, DEFAULT_BACKPACK, catalog),
    );
  });
  const optimizedMs = timed(ITERATIONS, () => {
    generateBagCandidates(bag, emptyBags.state, DEFAULT_BACKPACK, catalog);
  });
  console.log(
    `${pad(bagId, 20)} ${pad(candidates.length, 4)} ${pad(ms(baselineMs / ITERATIONS), 10)} ${pad(ms(optimizedMs / ITERATIONS), 10)} ${speedup(baselineMs, optimizedMs)}`,
  );
}

console.log("\nFull optimizer G–O (min of 2 runs). Baseline uses Stage 6 generator.");
console.log("mode     case  score same  sig same  base ms  opt ms  improve  states  cand  gen share");

function min2(fn: () => { durationMs: number; extra?: string }): { durationMs: number; extra?: string } {
  const a = fn();
  const b = fn();
  return a.durationMs <= b.durationMs ? a : b;
}

for (const mode of ["Beam(1)", "Beam(20)", "Adaptive"] as const) {
  for (const entry of STAGE11_BENCHMARK_CASES) {
    const short = entry.id.split("-")[0]!;
    const input = {
      inventory: entry.inventory,
      bags: entry.bags,
      items: entry.items,
      catalog,
      options: { metrics: true as const, dynamicOrdering: false },
    };

    if (mode === "Adaptive") {
      const baseline = min2(() => {
        const started = performance.now();
        const result = withBaselineCandidateGeneration(() => runAdaptiveOptimizer(input));
        return { durationMs: performance.now() - started, result };
      }) as { durationMs: number; result: ReturnType<typeof runAdaptiveOptimizer> };
      const optimized = min2(() => {
        const started = performance.now();
        const wrapped = withCandidateGenerationProfile(() => runAdaptiveOptimizer(input));
        return {
          durationMs: performance.now() - started,
          result: wrapped.result,
          genMs: wrapped.profile.durationMs,
        };
      }) as {
        durationMs: number;
        result: ReturnType<typeof runAdaptiveOptimizer>;
        genMs: number;
      };
      const scoreSame = optimized.result.metrics.finalScore === baseline.result.metrics.finalScore;
      const sigSame =
        getOptimizerStateSignature(optimized.result.bestState) ===
        getOptimizerStateSignature(baseline.result.bestState);
      const improve =
        baseline.durationMs === 0 ? "n/a" : pct(baseline.durationMs - optimized.durationMs, baseline.durationMs);
      console.log(
        `${pad(mode, 8)} ${pad(short, 4)} ${pad(yesNo(scoreSame), 10)} ${pad(yesNo(sigSame), 8)} ${pad(ms(baseline.durationMs), 8)} ${pad(ms(optimized.durationMs), 7)} ${pad(improve, 7)} ${pad(optimized.result.metrics.statesGenerated, 6)} ${pad(optimized.result.metrics.candidatesGenerated, 6)} ${pct(optimized.genMs, optimized.durationMs)}`,
      );
    } else {
      const width = mode === "Beam(1)" ? 1 : 20;
      const options = {
        algorithm: "beam" as const,
        bagBeamWidth: width,
        itemBeamWidth: width,
        metrics: true as const,
        localSearch: false,
        bagLocalSearch: false,
      };
      const baseline = min2(() => {
        const result = withBaselineCandidateGeneration(() =>
          runOptimizer({ ...input, options }),
        );
        return { durationMs: result.metrics!.durationMs, result };
      }) as { durationMs: number; result: ReturnType<typeof runOptimizer> };
      const optimized = min2(() => {
        const result = runOptimizer({ ...input, options });
        return { durationMs: result.metrics!.durationMs, result };
      }) as { durationMs: number; result: ReturnType<typeof runOptimizer> };
      const scoreSame = optimized.result.score.score === baseline.result.score.score;
      const sigSame =
        getOptimizerStateSignature(optimized.result.bestState) ===
        getOptimizerStateSignature(baseline.result.bestState);
      const improve =
        baseline.durationMs === 0 ? "n/a" : pct(baseline.durationMs - optimized.durationMs, baseline.durationMs);
      console.log(
        `${pad(mode, 8)} ${pad(short, 4)} ${pad(yesNo(scoreSame), 10)} ${pad(yesNo(sigSame), 8)} ${pad(ms(baseline.durationMs), 8)} ${pad(ms(optimized.durationMs), 7)} ${pad(improve, 7)} ${pad(optimized.result.metrics!.statesGenerated, 6)} ${pad(optimized.result.metrics!.candidatesGenerated, 6)}`,
      );
    }
  }
}
