/**
 * Stage 14 profiling: candidate generation phases and share of optimizer time.
 *
 * Does not change search semantics. Uses the frozen baseline generator for
 * phase breakdown and wraps production generatePlacementCandidates for
 * Adaptive G–O wall-clock share.
 */
import { generatePlacementCandidatesBaseline } from "../src/lib/optimizer/candidates.baseline.ts";
import { withCandidateGenerationProfile } from "../src/lib/optimizer/candidate-profile.ts";
import { STAGE11_BENCHMARK_CASES } from "../src/lib/optimizer/benchmarks/cases.ts";
import { createBagState } from "../src/lib/optimizer/bags/state.ts";
import { generateBagCandidates } from "../src/lib/optimizer/bags/candidates.ts";
import { runAdaptiveOptimizer } from "../src/lib/optimizer/adaptive-search.ts";
import { loadProductionCatalog } from "../src/lib/optimizer/load-catalog.ts";
import { createSearchState } from "../src/lib/optimizer/state.ts";
import { DEFAULT_BACKPACK } from "../src/lib/optimizer/types.ts";
import { rotateGeometry } from "../src/lib/inventory/geometry.ts";
import { canPlaceCandidate } from "../src/lib/optimizer/constraints.ts";
import { cellExtent, getUniqueRotations } from "../src/lib/optimizer/rotations.ts";
import type { Item } from "../src/lib/inventory/types.ts";
import type { ItemToPlace, PlacementCandidate, SearchState } from "../src/lib/optimizer/types.ts";
import { positionKey } from "../src/lib/inventory/geometry.ts";

const ITERATIONS = 400;

function pad(value: string | number, width: number): string {
  const text = String(value);
  return text.length >= width ? text : `${" ".repeat(width - text.length)}${text}`;
}

function ms(value: number): string {
  return `${value.toFixed(2)}ms`;
}

function pct(part: number, total: number): string {
  if (total <= 0) return "n/a";
  return `${((part / total) * 100).toFixed(1)}%`;
}

const catalog = loadProductionCatalog();

function emptyItems(): SearchState {
  const result = createSearchState(DEFAULT_BACKPACK);
  if (!result.ok) throw new Error("empty SearchState");
  return result.state;
}

function denseItems(catalog: Map<string, Item>): SearchState {
  const empty = emptyItems();
  const ore = catalog.get("adamantite_ore")!;
  const toPlace: ItemToPlace = { instanceId: "fill", itemId: "adamantite_ore" };
  const candidates = generatePlacementCandidatesBaseline(toPlace, empty, catalog);
  const taken = candidates.filter((_, index) => index % 2 === 0).slice(0, 20);
  let state = empty;
  let n = 0;
  for (const candidate of taken) {
    const placed = {
      ...candidate,
      placement: { ...candidate.placement, instanceId: `ore-${n++}` },
    };
    const next = createSearchState(DEFAULT_BACKPACK, [...state.items, placed.placement], catalog);
    if (next.ok) state = next.state;
  }
  return state;
}

function bagAvailable(bagId: string) {
  const bags = createBagState(
    DEFAULT_BACKPACK,
    [{ instanceId: "bag", itemId: bagId, position: { row: 0, col: 0 }, rotation: 0 }],
    catalog,
  );
  if (!bags.ok) throw new Error(bags.issues.join("; "));
  return bags.state.availableCells;
}

interface PhaseTimes {
  uniqueRotationsMs: number;
  rotateMs: number;
  allocMs: number;
  canPlaceMs: number;
  accepted: number;
  rejected: number;
  rotationCount: number;
  occupiedChecks: number;
  availableChecks: number;
  anchors: number;
}

function profilePhases(
  item: ItemToPlace,
  state: SearchState,
  catalog: Map<string, Item>,
  availableCells?: ReadonlySet<string>,
): PhaseTimes {
  const times: PhaseTimes = {
    uniqueRotationsMs: 0,
    rotateMs: 0,
    allocMs: 0,
    canPlaceMs: 0,
    accepted: 0,
    rejected: 0,
    rotationCount: 0,
    occupiedChecks: 0,
    availableChecks: 0,
    anchors: 0,
  };
  const catalogItem = catalog.get(item.itemId);
  if (!catalogItem) return times;

  let t = performance.now();
  const rotations = getUniqueRotations(catalogItem);
  times.uniqueRotationsMs += performance.now() - t;
  times.rotationCount = rotations.length;

  for (const rotation of rotations) {
    t = performance.now();
    const local = rotateGeometry(catalogItem.geometry, rotation);
    times.rotateMs += performance.now() - t;
    const extent = cellExtent(local.cells);
    if (!extent) continue;
    const maxRow = state.inventory.rows - 1 - extent.maxRow;
    const maxCol = state.inventory.cols - 1 - extent.maxCol;
    if (maxRow < 0 || maxCol < 0) continue;

    for (let row = 0; row <= maxRow; row++) {
      for (let col = 0; col <= maxCol; col++) {
        times.anchors += 1;
        t = performance.now();
        const candidate: PlacementCandidate = {
          placement: {
            instanceId: item.instanceId,
            itemId: item.itemId,
            position: { row, col },
            rotation,
          },
          cells: local.cells.map(([localRow, localCol]) => ({
            row: row + localRow,
            col: col + localCol,
          })),
          stars: local.stars.map(([localRow, localCol]) => ({
            row: row + localRow,
            col: col + localCol,
          })),
        };
        times.allocMs += performance.now() - t;
        times.occupiedChecks += candidate.cells.length;
        if (availableCells) times.availableChecks += candidate.cells.length;
        t = performance.now();
        const valid = canPlaceCandidate(candidate, state, availableCells).valid;
        times.canPlaceMs += performance.now() - t;
        if (valid) times.accepted += 1;
        else times.rejected += 1;
      }
    }
  }
  return times;
}

function repeat<T>(iterations: number, fn: () => T): { totalMs: number; last: T } {
  const started = performance.now();
  let last!: T;
  for (let i = 0; i < iterations; i++) last = fn();
  return { totalMs: performance.now() - started, last };
}

const itemIds = [
  "adamantite_ore",
  "adamantite_bar",
  "starbloom",
  "black_cat",
  "big_chocolate_gift_box",
];

const empty = emptyItems();
const dense = denseItems(catalog);
const mediumAvailable = bagAvailable("medium_bag");
const warriorAvailable = bagAvailable("warrior_backpack");

console.log("=== Stage 14 candidate generation profiling (baseline) ===\n");

console.log("Item microbenchmark (empty 6×9, no Bags)");
console.log(
  "item                        rot  cand  rej   unique   rotate    alloc  canPlace   total",
);
for (const itemId of itemIds) {
  const item: ItemToPlace = { instanceId: `${itemId}-1`, itemId };
  const run = repeat(ITERATIONS, () => profilePhases(item, empty, catalog));
  const p = run.last;
  const total = p.uniqueRotationsMs + p.rotateMs + p.allocMs + p.canPlaceMs;
  console.log(
    `${pad(itemId, 27)} ${pad(p.rotationCount, 3)} ${pad(p.accepted, 5)} ${pad(p.rejected, 5)} ${pad(ms(p.uniqueRotationsMs), 8)} ${pad(ms(p.rotateMs), 8)} ${pad(ms(p.allocMs), 8)} ${pad(ms(p.canPlaceMs), 8)} ${pad(ms(run.totalMs / ITERATIONS), 8)}`,
  );
  console.log(
    `  phase share of one call: unique ${pct(p.uniqueRotationsMs, total)} rotate ${pct(p.rotateMs, total)} alloc ${pct(p.allocMs, total)} canPlace ${pct(p.canPlaceMs, total)} occupiedChecks=${p.occupiedChecks} anchors=${p.anchors}`,
  );
}

console.log("\nDense SearchState (every other ore, no Bags)");
for (const itemId of ["adamantite_bar", "black_cat", "starbloom"]) {
  const item: ItemToPlace = { instanceId: `${itemId}-d`, itemId };
  const run = repeat(ITERATIONS, () => profilePhases(item, dense, catalog));
  const p = run.last;
  console.log(
    `${pad(itemId, 16)} cand=${p.accepted} rej=${p.rejected} occupiedChecks=${p.occupiedChecks} ${ms(run.totalMs / ITERATIONS)}/call`,
  );
}

console.log("\nWith availableCells (Medium Bag / Warrior Backpack, empty items)");
for (const [label, available] of [
  ["medium_bag", mediumAvailable],
  ["warrior_backpack", warriorAvailable],
] as const) {
  for (const itemId of ["adamantite_ore", "adamantite_bar", "black_cat"]) {
    const item: ItemToPlace = { instanceId: `${itemId}-b`, itemId };
    const run = repeat(ITERATIONS, () => profilePhases(item, empty, catalog, available));
    const p = run.last;
    console.log(
      `${pad(label, 18)} ${pad(itemId, 16)} cand=${pad(p.accepted, 4)} rej=${pad(p.rejected, 4)} availChecks=${p.availableChecks} ${ms(run.totalMs / ITERATIONS)}/call`,
    );
  }
}

console.log("\nBag candidate generation");
for (const bagId of ["medium_bag", "fanny_pack", "warrior_backpack", "bottom_trawl"]) {
  const emptyBags = createBagState(DEFAULT_BACKPACK, [], catalog);
  if (!emptyBags.ok) throw new Error("empty bags");
  const run = repeat(ITERATIONS, () =>
    generateBagCandidates({ instanceId: "bag", itemId: bagId }, emptyBags.state, DEFAULT_BACKPACK, catalog),
  );
  console.log(`${pad(bagId, 20)} candidates=${pad(run.last.length, 4)} ${ms(run.totalMs / ITERATIONS)}/call`);
}

console.log("\nFull Adaptive G–O: candidate generation share of wall-clock");
console.log("case | total ms | gen ms | gen share | gen calls | accepted");
for (const entry of STAGE11_BENCHMARK_CASES) {
  const input = {
    inventory: entry.inventory,
    bags: entry.bags,
    items: entry.items,
    catalog,
    options: { metrics: true, dynamicOrdering: false },
  };
  const started = performance.now();
  const wrapped = withCandidateGenerationProfile(() => runAdaptiveOptimizer(input));
  const totalMs = performance.now() - started;
  const p = wrapped.profile;
  console.log(
    `${pad(entry.id.split("-")[0]!, 4)} ${pad(ms(totalMs), 10)} ${pad(ms(p.durationMs), 10)} ${pad(pct(p.durationMs, totalMs), 9)} ${pad(p.calls, 9)} ${pad(p.accepted, 8)}`,
  );
}
