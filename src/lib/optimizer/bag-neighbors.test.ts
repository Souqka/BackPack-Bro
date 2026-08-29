import { describe, expect, it } from "vitest";
import { canonicalBagSignature, generateBagNeighbors, limitBagNeighbors } from "./bag-neighbors.ts";
import { createBagState } from "./bags/state.ts";
import { loadProductionCatalog } from "./load-catalog.ts";
import { DEFAULT_BACKPACK } from "./types.ts";
import type { PlacedBag } from "./bags/types.ts";

const catalog = loadProductionCatalog();

function bags(placed: PlacedBag[]) {
  const result = createBagState(DEFAULT_BACKPACK, placed, catalog);
  if (!result.ok) throw new Error(result.issues.join("; "));
  return result.state;
}

describe("bag neighbor generation", () => {
  it("relocate перемещает Bag на другую валидную позицию", () => {
    const state = bags([
      { instanceId: "bag-a", itemId: "medium_bag", position: { row: 0, col: 0 }, rotation: 0 },
    ]);
    const neighbors = generateBagNeighbors(state, DEFAULT_BACKPACK, catalog);
    const relocates = neighbors.filter((neighbor) => neighbor.operation === "relocate");
    expect(relocates.length).toBeGreaterThan(0);
    expect(relocates.some((neighbor) => neighbor.row !== 0 || neighbor.col !== 0)).toBe(true);
    expect(relocates.every((neighbor) => neighbor.bags.bags[0]!.rotation === 0)).toBe(true);
  });

  it("rotate использует unique rotations и не дублирует эквивалентную геометрию", () => {
    const state = bags([
      { instanceId: "pack", itemId: "fanny_pack", position: { row: 0, col: 0 }, rotation: 0 },
    ]);
    const neighbors = generateBagNeighbors(state, DEFAULT_BACKPACK, catalog);
    const rotates = neighbors.filter((neighbor) => neighbor.operation === "rotate");
    expect(rotates.length).toBeGreaterThan(0);
    expect(rotates.some((neighbor) => neighbor.rotation === 90)).toBe(true);
    expect(rotates.every((neighbor) => neighbor.signature !== canonicalBagSignature(state))).toBe(true);
  });

  it("swap Bags допустим, если обе позы валидны", () => {
    const state = bags([
      { instanceId: "bag-a", itemId: "medium_bag", position: { row: 0, col: 0 }, rotation: 0 },
      { instanceId: "bag-b", itemId: "medium_bag", position: { row: 0, col: 3 }, rotation: 0 },
    ]);
    const neighbors = generateBagNeighbors(state, DEFAULT_BACKPACK, catalog);
    const swaps = neighbors.filter((neighbor) => neighbor.operation === "swap");
    expect(swaps.length).toBeGreaterThan(0);
    const swapped = swaps[0]!;
    const a = swapped.bags.bags.find((bag) => bag.instanceId === "bag-a")!;
    const b = swapped.bags.bags.find((bag) => bag.instanceId === "bag-b")!;
    expect(a.position).toEqual({ row: 0, col: 3 });
    expect(b.position).toEqual({ row: 0, col: 0 });
  });

  it("invalid neighbors не проходят: клетки внутри 6×9, Bags не пересекаются", () => {
    const state = bags([
      { instanceId: "bag-a", itemId: "medium_bag", position: { row: 0, col: 0 }, rotation: 0 },
      { instanceId: "bag-b", itemId: "fanny_pack", position: { row: 3, col: 0 }, rotation: 0 },
    ]);
    const neighbors = generateBagNeighbors(state, DEFAULT_BACKPACK, catalog);
    expect(neighbors.length).toBeGreaterThan(0);
    for (const neighbor of neighbors) {
      expect(neighbor.bags.occupiedCells.size).toBe(6);
      for (const key of neighbor.bags.occupiedCells.keys()) {
        const [row, col] = key.split(":").map(Number);
        expect(row).toBeGreaterThanOrEqual(0);
        expect(row).toBeLessThan(6);
        expect(col).toBeGreaterThanOrEqual(0);
        expect(col).toBeLessThan(9);
      }
      const rebuilt = createBagState(DEFAULT_BACKPACK, neighbor.bags.bags, catalog);
      expect(rebuilt.ok).toBe(true);
    }
  });

  it("порядок neighbors детерминирован", () => {
    const state = bags([
      { instanceId: "bag-a", itemId: "medium_bag", position: { row: 1, col: 1 }, rotation: 0 },
      { instanceId: "bag-b", itemId: "fanny_pack", position: { row: 4, col: 2 }, rotation: 0 },
    ]);
    const first = generateBagNeighbors(state, DEFAULT_BACKPACK, catalog).map((neighbor) => ({
      op: neighbor.operation,
      signature: neighbor.signature,
    }));
    const second = generateBagNeighbors(state, DEFAULT_BACKPACK, catalog).map((neighbor) => ({
      op: neighbor.operation,
      signature: neighbor.signature,
    }));
    expect(first).toEqual(second);
  });

  it("duplicate signature удаляется", () => {
    const state = bags([
      { instanceId: "bag-a", itemId: "medium_bag", position: { row: 0, col: 0 }, rotation: 0 },
      { instanceId: "bag-b", itemId: "medium_bag", position: { row: 2, col: 2 }, rotation: 0 },
    ]);
    const neighbors = generateBagNeighbors(state, DEFAULT_BACKPACK, catalog);
    const signatures = neighbors.map((neighbor) => neighbor.signature);
    expect(new Set(signatures).size).toBe(signatures.length);
    expect(signatures.includes(canonicalBagSignature(state))).toBe(false);
  });

  it("limitBagNeighbors чередует операции и сохраняет детерминизм", () => {
    const state = bags([
      { instanceId: "bag-a", itemId: "fanny_pack", position: { row: 0, col: 0 }, rotation: 0 },
      { instanceId: "bag-b", itemId: "fanny_pack", position: { row: 2, col: 0 }, rotation: 0 },
    ]);
    const neighbors = generateBagNeighbors(state, DEFAULT_BACKPACK, catalog);
    const limited = limitBagNeighbors(neighbors, 6);
    expect(limited).toHaveLength(6);
    expect(limited.some((neighbor) => neighbor.operation === "relocate")).toBe(true);
    expect(limited.some((neighbor) => neighbor.operation === "rotate")).toBe(true);
    expect(limitBagNeighbors(neighbors, 6).map((n) => n.signature)).toEqual(limited.map((n) => n.signature));
  });
});
