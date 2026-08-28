import { describe, expect, it } from "vitest";
import { catalogFromItems } from "../inventory/inventory.ts";
import { positionKey } from "../inventory/geometry.ts";
import { testItem } from "../inventory/test-item.ts";
import { generatePlacementCandidates } from "./candidates.ts";
import { getCandidateSignature, getStateSignature } from "./deduplication.ts";
import { addCandidate, createSearchState, removePlacement } from "./state.ts";

const inventory = { rows: 4, cols: 5 };

function emptyState() {
  const result = createSearchState(inventory);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("ожидалось валидное состояние");
  return result.state;
}

describe("createSearchState", () => {
  it("пустой рюкзак без items", () => {
    const result = createSearchState(inventory);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.items).toEqual([]);
    expect(result.state.occupiedCells.size).toBe(0);
  });

  it("collision в начальном состоянии → ok false", () => {
    const ore = testItem({ id: "ore" });
    const result = createSearchState(
      inventory,
      [
        { instanceId: "a", itemId: "ore", position: { row: 1, col: 1 }, rotation: 0 },
        { instanceId: "b", itemId: "ore", position: { row: 1, col: 1 }, rotation: 0 },
      ],
      catalogFromItems([ore]),
    );
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === "collision")).toBe(true);
  });

  it("outOfBounds в начальном состоянии → ok false", () => {
    const ore = testItem({ id: "ore" });
    const result = createSearchState(
      inventory,
      [{ instanceId: "a", itemId: "ore", position: { row: 9, col: 9 }, rotation: 0 }],
      catalogFromItems([ore]),
    );
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === "out_of_bounds")).toBe(true);
  });
});

describe("add / remove", () => {
  it("add увеличивает occupied, remove восстанавливает", () => {
    const ore = testItem({ id: "ore" });
    const catalog = catalogFromItems([ore]);
    const empty = emptyState();
    const [candidate] = generatePlacementCandidates(
      { instanceId: "ore-1", itemId: "ore" },
      empty,
      catalog,
    );
    expect(candidate).toBeDefined();
    if (!candidate) return;

    const withItem = addCandidate(empty, candidate);
    expect(withItem.occupiedCells.size).toBe(1);
    expect(withItem.items).toHaveLength(1);
    expect(withItem.itemGeometries.has("ore-1")).toBe(true);
    expect(empty.occupiedCells.size).toBe(0);

    const restored = removePlacement(withItem, "ore-1");
    expect(restored.occupiedCells.size).toBe(0);
    expect(restored.items).toEqual([]);
    expect(restored.itemGeometries.size).toBe(0);
  });
});

describe("state signature", () => {
  it("[A, B] и [B, A] дают одинаковую подпись", () => {
    const ore = testItem({ id: "ore" });
    const catalog = catalogFromItems([ore]);
    const ab = createSearchState(
      inventory,
      [
        { instanceId: "a", itemId: "ore", position: { row: 0, col: 0 }, rotation: 0 },
        { instanceId: "b", itemId: "ore", position: { row: 0, col: 1 }, rotation: 0 },
      ],
      catalog,
    );
    const ba = createSearchState(
      inventory,
      [
        { instanceId: "b", itemId: "ore", position: { row: 0, col: 1 }, rotation: 0 },
        { instanceId: "a", itemId: "ore", position: { row: 0, col: 0 }, rotation: 0 },
      ],
      catalog,
    );
    expect(ab.ok && ba.ok).toBe(true);
    if (!ab.ok || !ba.ok) return;
    expect(getStateSignature(ab.state)).toBe(getStateSignature(ba.state));
  });
});

describe("candidate generation", () => {
  it("пустой рюкзак + 1 клетка → rows × cols кандидатов", () => {
    const ore = testItem({ id: "ore" });
    const catalog = catalogFromItems([ore]);
    const candidates = generatePlacementCandidates(
      { instanceId: "ore-1", itemId: "ore" },
      emptyState(),
      catalog,
    );
    expect(candidates).toHaveLength(inventory.rows * inventory.cols);
    const signatures = candidates.map(getCandidateSignature);
    expect(new Set(signatures).size).toBe(signatures.length);
  });

  it("занятая клетка исключает кандидата с collision", () => {
    const ore = testItem({ id: "ore" });
    const catalog = catalogFromItems([ore]);
    const occupied = createSearchState(
      inventory,
      [{ instanceId: "blocker", itemId: "ore", position: { row: 2, col: 2 }, rotation: 0 }],
      catalog,
    );
    expect(occupied.ok).toBe(true);
    if (!occupied.ok) return;
    const candidates = generatePlacementCandidates(
      { instanceId: "ore-1", itemId: "ore" },
      occupied.state,
      catalog,
    );
    expect(candidates).toHaveLength(inventory.rows * inventory.cols - 1);
    expect(
      candidates.some(
        (c) => c.placement.position.row === 2 && c.placement.position.col === 2,
      ),
    ).toBe(false);
  });

  it("multi-cell у края: клетки за границей не генерируются", () => {
    const rod = testItem({
      id: "rod",
      geometry: {
        cells: [
          [0, 0],
          [0, 1],
        ],
        stars: [],
      },
    });
    const catalog = catalogFromItems([rod]);
    const candidates = generatePlacementCandidates(
      { instanceId: "rod-1", itemId: "rod" },
      emptyState(),
      catalog,
    );
    for (const candidate of candidates) {
      expect(candidate.cells.every((cell) => cell.col < inventory.cols && cell.row < inventory.rows)).toBe(
        true,
      );
    }
    const horizontal = candidates.filter((c) => c.placement.rotation === 0);
    expect(horizontal.some((c) => c.placement.position.col === inventory.cols - 1)).toBe(false);
  });

  it("Star за границей, Item внутри → кандидат валиден", () => {
    const rod = testItem({
      id: "rod",
      geometry: {
        cells: [
          [0, 0],
          [0, 1],
        ],
        stars: [[0, 3]],
      },
    });
    const catalog = catalogFromItems([rod]);
    const candidates = generatePlacementCandidates(
      { instanceId: "rod-1", itemId: "rod" },
      emptyState(),
      catalog,
    );
    const withStarOutside = candidates.find((c) =>
      c.stars.some((star) => star.col >= inventory.cols || star.row >= inventory.rows),
    );
    expect(withStarOutside).toBeDefined();
    expect(withStarOutside?.cells.every((cell) => cell.col < inventory.cols)).toBe(true);
  });

  it("Star на Item-клетке другого предмета → кандидат валиден", () => {
    const source = testItem({
      id: "source",
      geometry: { cells: [[0, 0]], stars: [[0, 1]] },
    });
    const ore = testItem({ id: "ore" });
    const catalog = catalogFromItems([source, ore]);
    const withSource = createSearchState(
      inventory,
      [{ instanceId: "s", itemId: "source", position: { row: 0, col: 0 }, rotation: 0 }],
      catalog,
    );
    expect(withSource.ok).toBe(true);
    if (!withSource.ok) return;
    const candidates = generatePlacementCandidates(
      { instanceId: "ore-1", itemId: "ore" },
      withSource.state,
      catalog,
    );
    const onStar = candidates.find(
      (c) => c.placement.position.row === 0 && c.placement.position.col === 1,
    );
    expect(onStar).toBeDefined();
    expect(withSource.state.occupiedCells.has(positionKey({ row: 0, col: 1 }))).toBe(false);
  });

  it("Star на Star → кандидат валиден", () => {
    const left = testItem({
      id: "left",
      geometry: { cells: [[0, 0]], stars: [[0, 2]] },
    });
    const right = testItem({
      id: "right",
      geometry: { cells: [[0, 0]], stars: [[0, -1]] },
    });
    const catalog = catalogFromItems([left, right]);
    const withFirst = createSearchState(
      inventory,
      [{ instanceId: "a", itemId: "left", position: { row: 0, col: 0 }, rotation: 0 }],
      catalog,
    );
    expect(withFirst.ok).toBe(true);
    if (!withFirst.ok) return;
    const candidates = generatePlacementCandidates(
      { instanceId: "b", itemId: "right" },
      withFirst.state,
      catalog,
    );
    const starOnStar = candidates.find((c) =>
      c.stars.some((star) => star.row === 0 && star.col === 2),
    );
    expect(starOnStar).toBeDefined();
    expect(starOnStar?.cells.some((cell) => cell.row === 0 && cell.col === 0)).toBe(false);
  });
}); 
