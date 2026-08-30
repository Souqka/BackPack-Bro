import { describe, expect, it } from "vitest";
import { loadProductionCatalog } from "../optimizer/load-catalog.ts";
import { catalogViewFromItems } from "./catalog-project.ts";
import { buildGridModel, cellsForPlacement, footprintForPlacement, occupiedMaskStyle } from "./placement-view.ts";

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
    expect(occupiedMaskStyle(footprint!)?.maskImage.split(",")).toHaveLength(3);
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
