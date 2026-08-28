import { describe, expect, it } from "vitest";
import { catalogFromItems } from "../inventory/inventory.ts";
import { testItem } from "../inventory/test-item.ts";
import { getUniqueRotations } from "./rotations.ts";

describe("unique rotations", () => {
  it("квадрат 2×2 без Star → 1 orientation", () => {
    const square = testItem({
      id: "square",
      geometry: {
        cells: [
          [0, 0],
          [0, 1],
          [1, 0],
          [1, 1],
        ],
        stars: [],
      },
    });
    expect(getUniqueRotations(square)).toEqual([0]);
  });

  it("линия без Star → 2 orientations", () => {
    const line = testItem({
      id: "line",
      geometry: {
        cells: [
          [0, 0],
          [1, 0],
          [2, 0],
        ],
        stars: [],
      },
    });
    expect(getUniqueRotations(line)).toEqual([0, 90]);
  });

  it("L-форма без Star → 4 orientations", () => {
    const ell = testItem({
      id: "ell",
      geometry: {
        cells: [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
        stars: [],
      },
    });
    expect(getUniqueRotations(ell)).toEqual([0, 90, 180, 270]);
  });

  it("одинаковые cells, разные Stars после rotation остаются уникальными", () => {
    const barWithOneStar = testItem({
      id: "asymmetric_star",
      geometry: {
        cells: [
          [0, 0],
          [0, 1],
        ],
        stars: [[0, -1]],
      },
    });
    const rotations = getUniqueRotations(barWithOneStar);
    expect(rotations.length).toBeGreaterThan(2);
    expect(rotations).toEqual([0, 90, 180, 270]);
  });

  it("одиночная клетка → 1 orientation", () => {
    const ore = testItem({ id: "ore" });
    expect(getUniqueRotations(ore)).toEqual([0]);
  });
});

describe("unique rotations catalog helper", () => {
  it("catalogFromItems не влияет на подпись поворота", () => {
    const item = testItem({
      id: "line",
      geometry: {
        cells: [
          [0, 0],
          [0, 1],
        ],
        stars: [],
      },
    });
    expect(catalogFromItems([item]).get("line")).toBe(item);
    expect(getUniqueRotations(item)).toEqual([0, 90]);
  });
});
