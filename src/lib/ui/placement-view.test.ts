import { describe, expect, it } from "vitest";
import { loadProductionCatalog } from "../optimizer/load-catalog.ts";
import { catalogViewFromItems } from "./catalog-project.ts";
import { buildGridModel, cellsForPlacement, footprintBoxStyle, footprintForPlacement, occupiedMaskStyle, perimeterEdges, starCellCenterStyle } from "./placement-view.ts";

const catalog = catalogViewFromItems(loadProductionCatalog().values());

describe("cellsForPlacement", () => {
  it("keeps 6x9 occupancy in optimizer coordinates", () => {
    const bag = catalog.get("medium_bag")!;
    const resolved = cellsForPlacement(bag, {
      instanceId: "bag-0",
      itemId: "medium_bag",
      row: 2,
      col: 4,
      rotation: 0,
    });
    expect(resolved.cells.every((cell) => cell.row >= 2 && cell.col >= 4)).toBe(true);
    expect(resolved.cells.some((cell) => cell.row === 2 && cell.col === 4)).toBe(true);
  });

  it("rotates L-shaped black_cat geometry by 90 degrees", () => {
    const cat = catalog.get("black_cat")!;
    expect(cat.geometry.cells).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
    ]);
    const unrotated = cellsForPlacement(cat, {
      instanceId: "item-0",
      itemId: "black_cat",
      row: 0,
      col: 0,
      rotation: 0,
    });
    const rotated = cellsForPlacement(cat, {
      instanceId: "item-0",
      itemId: "black_cat",
      row: 0,
      col: 0,
      rotation: 90,
    });
    expect(unrotated.cells).not.toEqual(rotated.cells);
    expect(new Set(rotated.cells.map((cell) => `${cell.row}:${cell.col}`)).size).toBe(3);
  });
});

describe("footprintForPlacement", () => {
  it("sizes the visual box from rotateGeometry cells, not itemId", () => {
    const bar = catalog.get("adamantite_bar")!;
    const at0 = footprintForPlacement(bar, {
      instanceId: "item-0",
      itemId: "adamantite_bar",
      row: 2,
      col: 3,
      rotation: 0,
    });
    const at90 = footprintForPlacement(bar, {
      instanceId: "item-0",
      itemId: "adamantite_bar",
      row: 2,
      col: 3,
      rotation: 90,
    });
    expect(at0?.cells).toHaveLength(2);
    expect(at90?.cells).toHaveLength(2);
    expect(at0?.bboxCols).toBe(2);
    expect(at0?.bboxRows).toBe(1);
    expect(at90?.bboxCols).toBe(1);
    expect(at90?.bboxRows).toBe(2);
    expect(`${at0?.minRow}:${at0?.minCol}-${at0?.maxRow}:${at0?.maxCol}`).not.toBe(
      `${at90?.minRow}:${at90?.minCol}-${at90?.maxRow}:${at90?.maxCol}`,
    );
  });

  it("does not treat L-shape bbox holes as occupied", () => {
    const cat = catalog.get("black_cat")!;
    const footprint = footprintForPlacement(cat, {
      instanceId: "item-0",
      itemId: "black_cat",
      row: 0,
      col: 0,
      rotation: 0,
    });
    expect(footprint).not.toBeNull();
    const keys = new Set(footprint!.cells.map((cell) => `${cell.row}:${cell.col}`));
    expect(keys.has("0:0")).toBe(true);
    expect(keys.has("1:0")).toBe(true);
    expect(keys.has("1:1")).toBe(true);
    expect(keys.has("0:1")).toBe(false);
    expect(footprint!.bboxRows * footprint!.bboxCols).toBe(4);
    expect(occupiedMaskStyle(footprint!)?.maskImage?.split(",")).toHaveLength(3);
  });

  it("sizes the visual box from rotated occupied cells using --cell-size", () => {
    const bar = catalog.get("adamantite_bar")!;
    const footprint = footprintForPlacement(bar, {
      instanceId: "item-0",
      itemId: "adamantite_bar",
      row: 2,
      col: 3,
      rotation: 0,
    })!;
    const box = footprintBoxStyle(footprint);
    expect(box.position).toBe("absolute");
    expect(box.top).toBe(`calc(var(--cell-size) * ${footprint.minRow})`);
    expect(box.left).toBe(`calc(var(--cell-size) * ${footprint.minCol})`);
    expect(box.width).toBe(`calc(var(--cell-size) * ${footprint.bboxCols})`);
    expect(box.height).toBe(`calc(var(--cell-size) * ${footprint.bboxRows})`);
    expect(footprint.bboxCols).toBe(2);
    expect(footprint.bboxRows).toBe(1);
  });
});

describe("buildGridModel", () => {
  it("paints bags under items on overlapping cells", () => {
    const model = buildGridModel(
      {
        rows: 6,
        cols: 9,
        bags: [{ instanceId: "bag-0", itemId: "medium_bag", row: 0, col: 0, rotation: 0 }],
        items: [{ instanceId: "item-0", itemId: "adamantite_ore", row: 0, col: 0, rotation: 0 }],
        unplacedItems: [],
        unplacedBags: [],
      },
      catalog,
    );
    const origin = model[0]![0]!;
    expect(origin.bags[0]?.instanceId).toBe("bag-0");
    expect(origin.items[0]?.instanceId).toBe("item-0");
  });

  it("keeps duplicate instances distinct", () => {
    const model = buildGridModel(
      {
        rows: 6,
        cols: 9,
        bags: [{ instanceId: "bag-0", itemId: "medium_bag", row: 0, col: 0, rotation: 0 }],
        items: [
          { instanceId: "item-0", itemId: "adamantite_ore", row: 0, col: 0, rotation: 0 },
          { instanceId: "item-1", itemId: "adamantite_ore", row: 0, col: 1, rotation: 0 },
        ],
        unplacedItems: [],
        unplacedBags: [],
      },
      catalog,
    );
    expect(model[0]![0]!.items[0]?.instanceId).toBe("item-0");
    expect(model[0]![1]!.items[0]?.instanceId).toBe("item-1");
  });
});

function occupancy(cells: Array<{ row: number; col: number }>): Set<string> {
  return new Set(cells.map((cell) => `${cell.row}:${cell.col}`));
}

function hasInternalBorder(
  cells: Array<{ row: number; col: number }>,
  edges: ReturnType<typeof perimeterEdges>,
): boolean {
  const occupied = occupancy(cells);
  const delta = { top: [-1, 0], bottom: [1, 0], left: [0, -1], right: [0, 1] } as const;
  return edges.some((edge) => {
    const [dRow, dCol] = delta[edge.side];
    return occupied.has(`${edge.row + dRow}:${edge.col + dCol}`);
  });
}

describe("perimeterEdges", () => {
  it("outlines a rectangle without internal borders", () => {
    const cells = [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 0 },
      { row: 1, col: 1 },
    ];
    const edges = perimeterEdges(cells);
    expect(edges).toHaveLength(8);
    expect(hasInternalBorder(cells, edges)).toBe(false);
  });

  it("outlines a 1x3 line without internal borders", () => {
    const cells = [
      { row: 2, col: 3 },
      { row: 2, col: 4 },
      { row: 2, col: 5 },
    ];
    const edges = perimeterEdges(cells);
    expect(edges).toHaveLength(8);
    expect(hasInternalBorder(cells, edges)).toBe(false);
    expect(edges.filter((edge) => edge.side === "left")).toHaveLength(1);
    expect(edges.filter((edge) => edge.side === "right")).toHaveLength(1);
  });

  it("follows the L-shape outer path, not a per-cell box", () => {
    const cat = catalog.get("black_cat")!;
    const footprint = footprintForPlacement(cat, {
      instanceId: "item-0",
      itemId: "black_cat",
      row: 1,
      col: 2,
      rotation: 0,
    })!;
    const edges = perimeterEdges(footprint.cells);
    expect(footprint.cells).toHaveLength(3);
    expect(edges).toHaveLength(8);
    expect(hasInternalBorder(footprint.cells, edges)).toBe(false);
    const hole = occupancy(footprint.cells).has("1:3");
    expect(hole).toBe(false);
  });

  it("keeps only the outer perimeter after rotation", () => {
    const cat = catalog.get("black_cat")!;
    const rotated = cellsForPlacement(cat, {
      instanceId: "item-0",
      itemId: "black_cat",
      row: 0,
      col: 0,
      rotation: 90,
    });
    const edges = perimeterEdges(rotated.cells);
    expect(rotated.cells).toHaveLength(3);
    expect(edges).toHaveLength(8);
    expect(hasInternalBorder(rotated.cells, edges)).toBe(false);
  });
});

describe("starCellCenterStyle", () => {
  it("centers the star on the cell at two-thirds of cell size", () => {
    const style = starCellCenterStyle(2, 4);
    expect(style.top).toBe("calc(var(--cell-size) * 2 + var(--cell-size) * 0.5)");
    expect(style.left).toBe("calc(var(--cell-size) * 4 + var(--cell-size) * 0.5)");
    expect(style.width).toBe("calc(var(--cell-size) * 0.66)");
    expect(style.height).toBe("calc(var(--cell-size) * 0.66)");
    expect(style.transform).toBe("translate(-50%, -50%)");
  });

  it("uses rotated geometry cell coordinates, not the item image bbox", () => {
    const bar = catalog.get("adamantite_bar")!;
    const at0 = footprintForPlacement(bar, {
      instanceId: "item-0",
      itemId: "adamantite_bar",
      row: 2,
      col: 3,
      rotation: 0,
    })!;
    const at90 = footprintForPlacement(bar, {
      instanceId: "item-0",
      itemId: "adamantite_bar",
      row: 2,
      col: 3,
      rotation: 90,
    })!;
    expect(at0.stars.length).toBeGreaterThan(0);
    expect(at90.stars.length).toBe(at0.stars.length);
    const keys0 = at0.stars.map((star) => `${star.row}:${star.col}`).sort();
    const keys90 = at90.stars.map((star) => `${star.row}:${star.col}`).sort();
    expect(keys0).not.toEqual(keys90);
    for (const star of [...at0.stars, ...at90.stars]) {
      const style = starCellCenterStyle(star.row, star.col);
      expect(style.top).toBe(`calc(var(--cell-size) * ${star.row} + var(--cell-size) * 0.5)`);
      expect(style.left).toBe(`calc(var(--cell-size) * ${star.col} + var(--cell-size) * 0.5)`);
      expect(style.width).toBe("calc(var(--cell-size) * 0.66)");
      expect(style.transform).toBe("translate(-50%, -50%)");
    }
  });
});
