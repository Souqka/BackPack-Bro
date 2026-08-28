import { describe, expect, it } from "vitest";
import { rotateGeometry, starOffsetsFromNearestCell, type Rotation } from "../utils/geometry.ts";
import type { ItemGeometry } from "../types/normalized.ts";

const rectangle: ItemGeometry = {
  cells: [
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
  ],
  stars: [],
};

const lShape: ItemGeometry = {
  cells: [
    [0, 0],
    [1, 0],
    [1, 1],
  ],
  stars: [],
};

const multiStar: ItemGeometry = {
  cells: [
    [0, 1],
    [0, 2],
  ],
  stars: [
    [0, 0],
    [0, 3],
  ],
};

const distantStar: ItemGeometry = {
  cells: [[0, 0]],
  stars: [[0, 3]],
};

describe("rotateGeometry", () => {
  it("rotation 0 сохраняет каноническую форму", () => {
    expect(rotateGeometry(lShape, 0)).toEqual(lShape);
    expect(rotateGeometry(multiStar, 0)).toEqual(multiStar);
  });

  it("rotation 90/180/270 для прямоугольника", () => {
    expect(rotateGeometry(rectangle, 90)).toEqual(rectangle);
    expect(rotateGeometry(rectangle, 180)).toEqual(rectangle);
    expect(rotateGeometry(rectangle, 270)).toEqual(rectangle);
  });

  it("rotation 90/180/270 для L-образного Item", () => {
    expect(rotateGeometry(lShape, 90)).toEqual({
      cells: [
        [0, 0],
        [0, 1],
        [1, 0],
      ],
      stars: [],
    });
    expect(rotateGeometry(lShape, 180)).toEqual({
      cells: [
        [0, 0],
        [0, 1],
        [1, 1],
      ],
      stars: [],
    });
    expect(rotateGeometry(lShape, 270)).toEqual({
      cells: [
        [0, 1],
        [1, 0],
        [1, 1],
      ],
      stars: [],
    });
  });

  it("одновременно вращает несколько Star", () => {
    const rotated = rotateGeometry(multiStar, 90);
    expect(rotated.cells).toEqual([
      [1, 0],
      [2, 0],
    ]);
    expect(rotated.stars).toEqual([
      [0, 0],
      [3, 0],
    ]);
    const back = rotateGeometry(rotateGeometry(rotateGeometry(rotated, 90), 90), 90);
    expect(back).toEqual(multiStar);
  });

  it("вращает Star на расстоянии от cells и обрезает к [0, 0]", () => {
    expect(rotateGeometry(distantStar, 90)).toEqual({
      cells: [[0, 0]],
      stars: [[3, 0]],
    });
    expect(rotateGeometry(distantStar, 180)).toEqual({
      cells: [[0, 3]],
      stars: [[0, 0]],
    });
    expect(rotateGeometry(distantStar, 270)).toEqual({
      cells: [[3, 0]],
      stars: [[0, 0]],
    });
  });

  it.each([0, 90, 180, 270] as Rotation[])("после %s minRow=minCol=0", (rotation) => {
    const g = rotateGeometry(multiStar, rotation);
    const occupied = [...g.cells, ...g.stars];
    expect(Math.min(...occupied.map((c) => c[0]))).toBe(0);
    expect(Math.min(...occupied.map((c) => c[1]))).toBe(0);
  });
});

describe("starOffsetsFromNearestCell", () => {
  it("считает разности координат, не игровую метрику", () => {
    expect(starOffsetsFromNearestCell(multiStar)).toEqual([
      [0, -1],
      [0, 1],
    ]);
    expect(starOffsetsFromNearestCell(distantStar)).toEqual([[0, 3]]);
  });
});
