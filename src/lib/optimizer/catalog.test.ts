import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { catalogFromItems } from "../inventory/inventory.ts";
import type { Item } from "../inventory/types.ts";
import { generatePlacementCandidates } from "./candidates.ts";
import { getCandidateSignature } from "./deduplication.ts";
import { getUniqueRotations } from "./rotations.ts";
import { addCandidate, createSearchState } from "./state.ts";

function loadCatalog(): Map<string, Item> {
  const raw = readFileSync(path.join(process.cwd(), "data/normalized/items.json"), "utf8");
  const parsed = JSON.parse(raw) as { items: Item[] };
  return catalogFromItems(parsed.items);
}

const bag = { rows: 8, cols: 10 };

describe("реальный каталог", () => {
  it("Adamantite Ore на пустом 8×10: 80 кандидатов, 1 rotation", () => {
    const catalog = loadCatalog();
    const ore = catalog.get("adamantite_ore");
    expect(ore).toBeDefined();
    if (!ore) return;
    expect(getUniqueRotations(ore)).toEqual([0]);
    const empty = createSearchState(bag);
    expect(empty.ok).toBe(true);
    if (!empty.ok) return;
    const candidates = generatePlacementCandidates(
      { instanceId: "ore-1", itemId: "adamantite_ore" },
      empty.state,
      catalog,
    );
    expect(candidates).toHaveLength(80);
  });

  it("Adamantite Bar: 2 unique rotations, Star может быть снаружи", () => {
    const catalog = loadCatalog();
    const bar = catalog.get("adamantite_bar");
    expect(bar).toBeDefined();
    if (!bar) return;
    expect(getUniqueRotations(bar)).toEqual([0, 90]);
    const empty = createSearchState(bag);
    expect(empty.ok).toBe(true);
    if (!empty.ok) return;
    const candidates = generatePlacementCandidates(
      { instanceId: "bar-1", itemId: "adamantite_bar" },
      empty.state,
      catalog,
    );
    expect(candidates.length).toBe(124);
    expect(new Set(candidates.map(getCandidateSignature)).size).toBe(candidates.length);
    const starOutside = candidates.find((c) =>
      c.stars.some((star) => star.col >= bag.cols || star.row >= bag.rows),
    );
    expect(starOutside).toBeDefined();
    expect(starOutside?.cells.every((cell) => cell.col < bag.cols && cell.row < bag.rows)).toBe(true);
  });

  it("Starbloom: 2 unique rotations, collision с Ore отсекает часть кандидатов", () => {
    const catalog = loadCatalog();
    const bloom = catalog.get("starbloom");
    expect(bloom).toBeDefined();
    if (!bloom) return;
    expect(getUniqueRotations(bloom)).toEqual([0, 90]);

    const empty = createSearchState(bag);
    expect(empty.ok).toBe(true);
    if (!empty.ok) return;
    const free = generatePlacementCandidates(
      { instanceId: "bloom-1", itemId: "starbloom" },
      empty.state,
      catalog,
    );
    expect(free.length).toBe(126);

    const withOre = createSearchState(
      bag,
      [{ instanceId: "ore-1", itemId: "adamantite_ore", position: { row: 0, col: 1 }, rotation: 0 }],
      catalog,
    );
    expect(withOre.ok).toBe(true);
    if (!withOre.ok) return;
    const blocked = generatePlacementCandidates(
      { instanceId: "bloom-1", itemId: "starbloom" },
      withOre.state,
      catalog,
    );
    expect(blocked.length).toBeLessThan(free.length);
    expect(
      blocked.some((c) => c.cells.some((cell) => cell.row === 0 && cell.col === 1)),
    ).toBe(false);
  });

  it("armor_pack (квадрат) → 1 rotation; amethyst_blade (линия) → 2; black_cat (L) → 4", () => {
    const catalog = loadCatalog();
    const square = catalog.get("armor_pack");
    const line = catalog.get("amethyst_blade");
    const ell = catalog.get("black_cat");
    expect(square && line && ell).toBeTruthy();
    if (!square || !line || !ell) return;
    expect(getUniqueRotations(square)).toEqual([0]);
    expect(getUniqueRotations(line)).toEqual([0, 90]);
    expect(getUniqueRotations(ell)).toEqual([0, 90, 180, 270]);
  });

  it("big_chocolate_gift_box: квадратные cells, Star делает 4 unique rotations", () => {
    const catalog = loadCatalog();
    const box = catalog.get("big_chocolate_gift_box");
    expect(box).toBeDefined();
    if (!box) return;
    expect(box.geometry.cells).toHaveLength(4);
    expect(box.geometry.stars).toHaveLength(1);
    expect(getUniqueRotations(box)).toEqual([0, 90, 180, 270]);
  });

  it("Bar затем Ore на Star бара: addCandidate не считает collision", () => {
    const catalog = loadCatalog();
    const empty = createSearchState(bag);
    expect(empty.ok).toBe(true);
    if (!empty.ok) return;
    const bars = generatePlacementCandidates(
      { instanceId: "bar", itemId: "adamantite_bar" },
      empty.state,
      catalog,
    );
    const originBar = bars.find(
      (c) =>
        c.placement.rotation === 0 &&
        c.placement.position.row === 0 &&
        c.placement.position.col === 0,
    );
    expect(originBar).toBeDefined();
    if (!originBar) return;
    const withBar = addCandidate(empty.state, originBar);
    const ores = generatePlacementCandidates(
      { instanceId: "ore", itemId: "adamantite_ore" },
      withBar,
      catalog,
    );
    const onStar = ores.find(
      (c) => c.placement.position.row === 0 && c.placement.position.col === 0,
    );
    expect(onStar).toBeDefined();
    const next = addCandidate(withBar, onStar!);
    expect(next.items).toHaveLength(2);
    expect(next.occupiedCells.size).toBe(originBar.cells.length + 1);
  });
});
