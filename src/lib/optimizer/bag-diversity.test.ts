import { describe, expect, it } from "vitest";
import { bagTopologySimilarity, selectDiverseBagSeeds } from "./bag-diversity.ts";
import { canonicalBagSignature } from "./bag-neighbors.ts";
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

describe("bag seed diversity", () => {
  it("одинаковые signatures → dedup", () => {
    const a = bags([{ instanceId: "bag", itemId: "medium_bag", position: { row: 0, col: 0 }, rotation: 0 }]);
    const clone = bags([{ instanceId: "bag", itemId: "medium_bag", position: { row: 0, col: 0 }, rotation: 0 }]);
    expect(canonicalBagSignature(a)).toBe(canonicalBagSignature(clone));
    const picked = selectDiverseBagSeeds([a, clone], 4, 0.7);
    expect(picked).toHaveLength(1);
  });

  it("похожие layouts режутся threshold", () => {
    const a = bags([
      { instanceId: "bag", itemId: "warrior_backpack", position: { row: 0, col: 0 }, rotation: 0 },
    ]);
    const b = bags([
      { instanceId: "bag", itemId: "warrior_backpack", position: { row: 1, col: 0 }, rotation: 0 },
    ]);
    expect(bagTopologySimilarity(a, b).similarity).toBeGreaterThan(0.4);
    const picked = selectDiverseBagSeeds([a, b], 4, 0.4);
    expect(picked).toHaveLength(1);
    expect(canonicalBagSignature(picked[0]!)).toBe(canonicalBagSignature(a));
  });

  it("достаточно разные layouts → оба seeds", () => {
    const a = bags([{ instanceId: "bag", itemId: "medium_bag", position: { row: 0, col: 0 }, rotation: 0 }]);
    const b = bags([{ instanceId: "bag", itemId: "medium_bag", position: { row: 0, col: 4 }, rotation: 0 }]);
    expect(bagTopologySimilarity(a, b).similarity).toBeLessThan(0.2);
    const picked = selectDiverseBagSeeds([a, b], 4, 0.7);
    expect(picked).toHaveLength(2);
  });

  it("порядок детерминирован: первый candidate — первый seed", () => {
    const a = bags([{ instanceId: "bag", itemId: "medium_bag", position: { row: 0, col: 0 }, rotation: 0 }]);
    const b = bags([{ instanceId: "bag", itemId: "medium_bag", position: { row: 3, col: 3 }, rotation: 0 }]);
    const first = selectDiverseBagSeeds([a, b], 2, 0.7).map((seed) => canonicalBagSignature(seed));
    const second = selectDiverseBagSeeds([a, b], 2, 0.7).map((seed) => canonicalBagSignature(seed));
    expect(first).toEqual(second);
    expect(first[0]).toBe(canonicalBagSignature(a));
  });

  it("меньше seeds, если уникальных topology недостаточно", () => {
    const a = bags([{ instanceId: "bag", itemId: "medium_bag", position: { row: 0, col: 0 }, rotation: 0 }]);
    const near = bags([
      { instanceId: "bag", itemId: "warrior_backpack", position: { row: 0, col: 0 }, rotation: 0 },
    ]);
    const near2 = bags([
      { instanceId: "bag", itemId: "warrior_backpack", position: { row: 1, col: 0 }, rotation: 0 },
    ]);
    const picked = selectDiverseBagSeeds([near, near2, a], 5, 0.4);
    expect(picked.length).toBeLessThan(5);
    expect(picked.length).toBeGreaterThanOrEqual(1);
  });
});
