import { describe, expect, it } from "vitest";
import { catalogFromItems } from "../inventory/inventory.ts";
import { testItem } from "../inventory/test-item.ts";
import type { Item } from "../inventory/types.ts";
import { generatePlacementCandidatesBaseline } from "./candidates.baseline.ts";
import { generatePlacementCandidates } from "./candidates.ts";
import { generateBagCandidates } from "./bags/candidates.ts";
import { createBagState } from "./bags/state.ts";
import { getCandidateSignature } from "./deduplication.ts";
import { loadProductionCatalog } from "./load-catalog.ts";
import { createSearchState } from "./state.ts";
import type { ItemToPlace, PlacementCandidate, SearchState } from "./types.ts";

const inventory = { rows: 6, cols: 8 };

function expectSameCandidates(optimized: PlacementCandidate[], baseline: PlacementCandidate[]): void {
  expect(optimized).toHaveLength(baseline.length);
  for (let index = 0; index < baseline.length; index++) {
    const a = optimized[index]!;
    const b = baseline[index]!;
    expect(a.placement).toEqual(b.placement);
    expect(a.cells).toEqual(b.cells);
    expect(a.stars).toEqual(b.stars);
  }
}

function both(
  item: ItemToPlace,
  state: SearchState,
  catalog: Map<string, Item>,
  available?: ReadonlySet<string>,
): void {
  const optimized = generatePlacementCandidates(item, state, catalog, available);
  const baseline = generatePlacementCandidatesBaseline(item, state, catalog, available);
  expectSameCandidates(optimized, baseline);
  const signatures = optimized.map(getCandidateSignature);
  expect(new Set(signatures).size).toBe(signatures.length);
  for (let index = 1; index < optimized.length; index++) {
    const prev = optimized[index - 1]!.placement;
    const next = optimized[index]!.placement;
    const ordered =
      prev.rotation < next.rotation ||
      (prev.rotation === next.rotation && prev.position.row < next.position.row) ||
      (prev.rotation === next.rotation &&
        prev.position.row === next.position.row &&
        prev.position.col <= next.position.col);
    expect(ordered).toBe(true);
  }
}

function empty(grid = inventory): SearchState {
  const result = createSearchState(grid);
  if (!result.ok) throw new Error("empty state");
  return result.state;
}

describe("differential: rotations", () => {
  it("0/90/180/270 L-shape совпадает с baseline", () => {
    const ell = testItem({
      id: "ell",
      geometry: { cells: [[0, 0], [1, 0], [1, 1]], stars: [] },
    });
    const catalog = catalogFromItems([ell]);
    both({ instanceId: "ell-1", itemId: "ell" }, empty(), catalog);
  });

  it("симметричный квадрат и линия", () => {
    const square = testItem({
      id: "square",
      geometry: { cells: [[0, 0], [0, 1], [1, 0], [1, 1]], stars: [] },
    });
    const line = testItem({
      id: "line",
      geometry: { cells: [[0, 0], [1, 0], [2, 0]], stars: [] },
    });
    both({ instanceId: "s", itemId: "square" }, empty(), catalogFromItems([square]));
    both({ instanceId: "l", itemId: "line" }, empty(), catalogFromItems([line]));
  });

  it("квадрат с асимметричной Star", () => {
    const item = testItem({
      id: "star-square",
      geometry: { cells: [[0, 0], [0, 1], [1, 0], [1, 1]], stars: [[0, -1]] },
    });
    both({ instanceId: "x", itemId: "star-square" }, empty(), catalogFromItems([item]));
  });
});

describe("differential: grid", () => {
  it("пустой / частично занятый / плотный / exact fit / impossible", () => {
    const ore = testItem({ id: "ore" });
    const rod = testItem({
      id: "rod",
      geometry: { cells: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [0, 7]], stars: [] },
    });
    const catalog = catalogFromItems([ore, rod]);
    const vacant = empty();
    both({ instanceId: "a", itemId: "ore" }, vacant, catalog);

    const partial = createSearchState(inventory, [
      { instanceId: "b", itemId: "ore", position: { row: 2, col: 3 }, rotation: 0 },
    ], catalog);
    expect(partial.ok).toBe(true);
    if (!partial.ok) return;
    both({ instanceId: "a", itemId: "ore" }, partial.state, catalog);

    const blockers = [];
    for (let row = 0; row < inventory.rows; row++) {
      for (let col = 0; col < inventory.cols; col++) {
        if (row === 5 && col === 7) continue;
        blockers.push({
          instanceId: `o-${row}-${col}`,
          itemId: "ore",
          position: { row, col },
          rotation: 0 as const,
        });
      }
    }
    const dense = createSearchState(inventory, blockers, catalog);
    expect(dense.ok).toBe(true);
    if (!dense.ok) return;
    both({ instanceId: "last", itemId: "ore" }, dense.state, catalog);
    expect(generatePlacementCandidates({ instanceId: "last", itemId: "ore" }, dense.state, catalog)).toHaveLength(1);

    const tiny = empty({ rows: 1, cols: 8 });
    both({ instanceId: "rod", itemId: "rod" }, tiny, catalog);
    expect(generatePlacementCandidates({ instanceId: "rod", itemId: "rod" }, tiny, catalog).length).toBeGreaterThan(0);

    const impossible = empty({ rows: 1, cols: 4 });
    both({ instanceId: "rod", itemId: "rod" }, impossible, catalog);
    expect(generatePlacementCandidates({ instanceId: "rod", itemId: "rod" }, impossible, catalog)).toEqual([]);
  });

  it("границы: multi-cell не выходит за inventory, Star может", () => {
    const rod = testItem({
      id: "rod",
      geometry: { cells: [[0, 0], [0, 1]], stars: [[0, 3]] },
    });
    const catalog = catalogFromItems([rod]);
    const state = empty({ rows: 4, cols: 5 });
    both({ instanceId: "rod-1", itemId: "rod" }, state, catalog);
    const candidates = generatePlacementCandidates({ instanceId: "rod-1", itemId: "rod" }, state, catalog);
    expect(candidates.some((c) => c.stars.some((star) => star.col >= 5))).toBe(true);
    expect(candidates.every((c) => c.cells.every((cell) => cell.col < 5 && cell.row < 4))).toBe(true);
  });
});

describe("differential: bags", () => {
  const production = loadProductionCatalog();

  it("availableCells / irregular / several Bags / Star вне Bags", () => {
    const backpack = { rows: 6, cols: 9 };
    const medium = createBagState(
      backpack,
      [{ instanceId: "bag", itemId: "medium_bag", position: { row: 0, col: 0 }, rotation: 0 }],
      production,
    );
    expect(medium.ok).toBe(true);
    if (!medium.ok) return;
    const emptyItems = empty(backpack);
    both(
      { instanceId: "ore", itemId: "adamantite_ore" },
      emptyItems,
      production,
      medium.state.availableCells,
    );
    both(
      { instanceId: "bar", itemId: "adamantite_bar" },
      emptyItems,
      production,
      medium.state.availableCells,
    );

    const two = createBagState(
      backpack,
      [
        { instanceId: "a", itemId: "fanny_pack", position: { row: 0, col: 0 }, rotation: 0 },
        { instanceId: "b", itemId: "fanny_pack", position: { row: 3, col: 4 }, rotation: 0 },
      ],
      production,
    );
    expect(two.ok).toBe(true);
    if (!two.ok) return;
    both({ instanceId: "cat", itemId: "black_cat" }, emptyItems, production, two.state.availableCells);

    const warrior = createBagState(
      backpack,
      [{ instanceId: "w", itemId: "warrior_backpack", position: { row: 0, col: 0 }, rotation: 0 }],
      production,
    );
    expect(warrior.ok).toBe(true);
    if (!warrior.ok) return;
    both({ instanceId: "bloom", itemId: "starbloom" }, emptyItems, production, warrior.state.availableCells);
    const bloom = generatePlacementCandidates(
      { instanceId: "bloom", itemId: "starbloom" },
      emptyItems,
      production,
      warrior.state.availableCells,
    );
    expect(
      bloom.some(
        (candidate) =>
          candidate.stars.some((star) => !warrior.state.availableCells.has(`${star.row}:${star.col}`)) &&
          candidate.cells.every((cell) => warrior.state.availableCells.has(`${cell.row}:${cell.col}`)),
      ),
    ).toBe(true);
  });

  it("Bag generation baseline === optimized", () => {
    const backpack = { rows: 6, cols: 9 };
    const emptyBags = createBagState(backpack, [], production);
    expect(emptyBags.ok).toBe(true);
    if (!emptyBags.ok) return;
    for (const bagId of ["medium_bag", "fanny_pack", "warrior_backpack", "bottom_trawl"]) {
      const optimized = generateBagCandidates(
        { instanceId: "bag", itemId: bagId },
        emptyBags.state,
        backpack,
        production,
      );
      const baseline = generatePlacementCandidatesBaseline(
        { instanceId: "bag", itemId: bagId },
        {
          inventory: backpack,
          items: emptyBags.state.bags,
          occupiedCells: emptyBags.state.occupiedCells,
          itemGeometries: emptyBags.state.geometries,
        },
        production,
      );
      expectSameCandidates(optimized, baseline);
    }
  });
});

describe("differential: production items", () => {
  const production = loadProductionCatalog();

  it("несколько одинаковых itemId, разные instanceId", () => {
    const state = empty({ rows: 8, cols: 10 });
    both({ instanceId: "ore-1", itemId: "adamantite_ore" }, state, production);
    both({ instanceId: "ore-2", itemId: "adamantite_ore" }, state, production);
    const a = generatePlacementCandidates({ instanceId: "ore-1", itemId: "adamantite_ore" }, state, production);
    const b = generatePlacementCandidates({ instanceId: "ore-2", itemId: "adamantite_ore" }, state, production);
    expect(a.map((c) => c.placement.position)).toEqual(b.map((c) => c.placement.position));
    expect(a[0]?.placement.instanceId).toBe("ore-1");
    expect(b[0]?.placement.instanceId).toBe("ore-2");
  });

  it("production set: ore / bar / starbloom / black_cat / gift box", () => {
    const state = empty({ rows: 8, cols: 10 });
    for (const itemId of [
      "adamantite_ore",
      "adamantite_bar",
      "starbloom",
      "black_cat",
      "big_chocolate_gift_box",
    ]) {
      both({ instanceId: `${itemId}-1`, itemId }, state, production);
    }
  });
});
