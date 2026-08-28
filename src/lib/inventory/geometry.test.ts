import { describe, expect, it } from "vitest";
import { resolvePlacedGeometry, rotateGeometry } from "./geometry.ts";
import { testItem } from "./test-item.ts";
import type { PlacedItem } from "./types.ts";

const bar = testItem({
  id: "bar",
  geometry: {
    cells: [
      [0, 1],
      [0, 2],
    ],
    stars: [
      [0, 0],
      [0, 3],
    ],
  },
});

function placed(rotation: 0 | 90 | 180 | 270, row = 2, col = 4): PlacedItem {
  return { instanceId: "a", itemId: "bar", position: { row, col }, rotation };
}

describe("resolvePlacedGeometry", () => {
  it("без rotation сдвигает локальные клетки на position", () => {
    const resolved = resolvePlacedGeometry(bar, placed(0));
    expect(resolved.cells).toEqual([
      { row: 2, col: 5 },
      { row: 2, col: 6 },
    ]);
    expect(resolved.stars).toEqual([
      { row: 2, col: 4 },
      { row: 2, col: 7 },
    ]);
  });

  it("rotation 90 вращает cells и stars вместе", () => {
    const local = rotateGeometry(bar.geometry, 90);
    expect(local.cells).toEqual([
      [1, 0],
      [2, 0],
    ]);
    expect(local.stars).toEqual([
      [0, 0],
      [3, 0],
    ]);
    const resolved = resolvePlacedGeometry(bar, placed(90, 1, 1));
    expect(resolved.cells).toEqual([
      { row: 2, col: 1 },
      { row: 3, col: 1 },
    ]);
    expect(resolved.stars).toEqual([
      { row: 1, col: 1 },
      { row: 4, col: 1 },
    ]);
  });

  it("rotation 180", () => {
    const resolved = resolvePlacedGeometry(bar, placed(180, 0, 0));
    const local = rotateGeometry(bar.geometry, 180);
    expect(resolved.cells).toEqual(
      local.cells.map(([row, col]) => ({ row, col })),
    );
    expect(resolved.stars).toEqual(
      local.stars.map(([row, col]) => ({ row, col })),
    );
  });

  it("rotation 270", () => {
    const resolved = resolvePlacedGeometry(bar, placed(270, 5, 5));
    const local = rotateGeometry(bar.geometry, 270);
    expect(resolved.cells).toEqual(
      local.cells.map(([row, col]) => ({ row: 5 + row, col: 5 + col })),
    );
    expect(resolved.stars).toEqual(
      local.stars.map(([row, col]) => ({ row: 5 + row, col: 5 + col })),
    );
  });
});
