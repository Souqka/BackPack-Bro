import { describe, expect, it } from "vitest";
import { catalogFromItems } from "../../inventory/inventory.ts";
import { testItem, universalStarRule } from "../../inventory/test-item.ts";
import type { Item, PlacedItem } from "../../inventory/types.ts";
import { emptyBagState } from "../../optimizer/bags/state.ts";
import { createScoreCache, scoreLayout } from "../../optimizer/score-cache.ts";
import type { OptimizerState } from "../../optimizer/search-types.ts";
import { createSearchState } from "../../optimizer/state.ts";
import { analyzePlacementScore } from "../analyzer.ts";
import {
  assertEquivalentPlacementScore,
  collectAffectedRegion,
  createItemPlaceMove,
  createItemRelocateMove,
  createItemSwapMove,
  createRepairMove,
  snapshotFromCandidate,
  snapshotPlaced,
  tryIncrementalPlacementScore,
  withIncrementalScoring,
  type IncrementalScoreContext,
  type LayoutMove,
} from "./index.ts";

function tile(id: string, stars: Array<[number, number]> = [[0, 1]]): Item {
  return testItem({
    id,
    geometry: { cells: [[0, 0]], stars },
    star: { rules: [universalStarRule()] },
  });
}

function lShape(id: string): Item {
  return testItem({
    id,
    geometry: { cells: [[0, 0], [1, 0], [1, 1]], stars: [[0, 1]] },
    star: { rules: [universalStarRule()] },
  });
}

function makeState(items: PlacedItem[], catalog: Map<string, Item>, backpack = { rows: 6, cols: 6 }): OptimizerState {
  const itemState = createSearchState(backpack, items, catalog);
  if (!itemState.ok) throw new Error(itemState.issues.map((issue) => issue.message).join("; "));
  return { backpack, bags: emptyBagState(), items: itemState.state };
}

function placed(
  instanceId: string,
  itemId: string,
  row: number,
  col: number,
  rotation: 0 | 90 | 180 | 270 = 0,
): PlacedItem {
  return { instanceId, itemId, position: { row, col }, rotation };
}

function relocateMove(previous: OptimizerState, next: OptimizerState, instanceId: string): LayoutMove {
  const prev = snapshotPlaced(previous.items, instanceId);
  const nxt = snapshotPlaced(next.items, instanceId);
  if (!prev || !nxt) throw new Error(`missing geometry for ${instanceId}`);
  const itemId = next.items.items.find((item) => item.instanceId === instanceId)?.itemId ?? instanceId;
  return createItemRelocateMove(instanceId, itemId, prev, nxt);
}

function scoreBoth(
  previous: OptimizerState,
  next: OptimizerState,
  catalog: Map<string, Item>,
  moves: LayoutMove[],
) {
  const previousScore = scoreLayout(previous, catalog);
  const context: IncrementalScoreContext = { previousState: previous, previousScore, moves };
  const incremental = tryIncrementalPlacementScore(next, catalog, context);
  const full = analyzePlacementScore({ inventory: next.backpack, items: next.items.items }, catalog);
  return { previousScore, incremental, full, context };
}

describe("item relocate", () => {
  const source = tile("source");
  const target = testItem({ id: "target" });
  const extra = testItem({ id: "extra" });
  const catalog = catalogFromItems([source, target, extra]);

  it("старая Star activation исчезает, новая появляется, unaffected сохранены", () => {
    const previous = makeState(
      [
        placed("s", "source", 0, 0),
        placed("t", "target", 2, 2),
        placed("e", "extra", 5, 5),
      ],
      catalog,
    );
    const next = makeState(
      [
        placed("s", "source", 0, 0),
        placed("t", "target", 0, 1),
        placed("e", "extra", 5, 5),
      ],
      catalog,
    );
    const { previousScore, incremental, full } = scoreBoth(previous, next, catalog, [
      relocateMove(previous, next, "t"),
    ]);
    expect(previousScore.breakdown.activatedStars).toBe(0);
    expect(incremental.mode).toBe("incremental");
    expect(incremental.score.breakdown.activatedStars).toBe(1);
    expect(incremental.affectedInstanceIds).toEqual(expect.arrayContaining(["s", "t"]));
    expect(incremental.affectedInstanceIds).not.toContain("e");
    assertEquivalentPlacementScore(incremental.score, full);
    expect(full.score).toBe(1);
  });

  it("incremental === full после relocate", () => {
    const previous = makeState([placed("s", "source", 0, 0), placed("t", "target", 0, 1)], catalog);
    const next = makeState([placed("s", "source", 0, 0), placed("t", "target", 3, 3)], catalog);
    const { incremental, full } = scoreBoth(previous, next, catalog, [relocateMove(previous, next, "t")]);
    expect(incremental.mode).toBe("incremental");
    expect(incremental.score.breakdown.activatedStars).toBe(0);
    assertEquivalentPlacementScore(incremental.score, full);
  });
});

describe("item rotation", () => {
  it("cells и Stars вращаются, interactions пересчитаны", () => {
    const source = lShape("source");
    const target = testItem({ id: "target" });
    const catalog = catalogFromItems([source, target]);
    const previous = makeState(
      [placed("s", "source", 1, 1, 0), placed("t", "target", 5, 5)],
      catalog,
    );
    const next = makeState(
      [placed("s", "source", 1, 1, 90), placed("t", "target", 5, 5)],
      catalog,
    );
    const prevSnap = snapshotPlaced(previous.items, "s")!;
    const nextSnap = snapshotPlaced(next.items, "s")!;
    expect(prevSnap.cells).not.toEqual(nextSnap.cells);
    const { incremental, full } = scoreBoth(previous, next, catalog, [
      { type: "item_rotate", instanceId: "s", itemId: "source", previous: prevSnap, next: nextSnap },
    ]);
    expect(incremental.mode).toBe("incremental");
    assertEquivalentPlacementScore(incremental.score, full);
  });
});

describe("item swap", () => {
  it("affected boundary включает оба Items, результат === full", () => {
    const source = tile("source");
    const target = testItem({ id: "target" });
    const catalog = catalogFromItems([source, target]);
    const previous = makeState([placed("s", "source", 0, 0), placed("t", "target", 0, 1)], catalog);
    const next = makeState([placed("s", "source", 0, 1), placed("t", "target", 0, 0)], catalog);
    const move = createItemSwapMove(
      {
        instanceId: "s",
        itemId: "source",
        previous: snapshotPlaced(previous.items, "s")!,
        next: snapshotPlaced(next.items, "s")!,
      },
      {
        instanceId: "t",
        itemId: "target",
        previous: snapshotPlaced(previous.items, "t")!,
        next: snapshotPlaced(next.items, "t")!,
      },
    );
    const { incremental, full } = scoreBoth(previous, next, catalog, [move]);
    expect(incremental.mode).toBe("incremental");
    expect(incremental.affectedInstanceIds).toEqual(["s", "t"]);
    assertEquivalentPlacementScore(incremental.score, full);
  });
});

describe("multiple stars", () => {
  it("изменяется только часть interactions", () => {
    const source = tile("source", [
      [0, 1],
      [1, 0],
    ]);
    const target = testItem({ id: "target" });
    const other = testItem({ id: "other" });
    const catalog = catalogFromItems([source, target, other]);
    const previous = makeState(
      [placed("s", "source", 1, 1), placed("t", "target", 1, 2), placed("o", "other", 5, 5)],
      catalog,
    );
    const next = makeState(
      [placed("s", "source", 1, 1), placed("t", "target", 2, 1), placed("o", "other", 5, 5)],
      catalog,
    );
    const { incremental, full } = scoreBoth(previous, next, catalog, [relocateMove(previous, next, "t")]);
    expect(incremental.mode).toBe("incremental");
    expect(incremental.affectedInstanceIds).toEqual(expect.arrayContaining(["s", "t"]));
    expect(incremental.affectedInstanceIds).not.toContain("o");
    assertEquivalentPlacementScore(incremental.score, full);
  });
});

describe("incoming star", () => {
  it("чужой source входит в affected set, если Star лежала на moved Item", () => {
    const source = tile("source");
    const target = testItem({ id: "target" });
    const catalog = catalogFromItems([source, target]);
    const previous = makeState([placed("s", "source", 0, 0), placed("t", "target", 0, 1)], catalog);
    const next = makeState([placed("s", "source", 0, 0), placed("t", "target", 3, 3)], catalog);
    const region = collectAffectedRegion(
      [relocateMove(previous, next, "t")],
      previous.items,
      next.items,
    );
    expect([...region.instanceIds].sort()).toEqual(["s", "t"]);
    const { incremental, full } = scoreBoth(previous, next, catalog, [relocateMove(previous, next, "t")]);
    expect(incremental.mode).toBe("incremental");
    assertEquivalentPlacementScore(incremental.score, full);
  });
});

describe("outgoing star", () => {
  it("moved Item — source Star, target меняется", () => {
    const source = tile("source");
    const a = testItem({ id: "a" });
    const b = testItem({ id: "b" });
    const catalog = catalogFromItems([source, a, b]);
    const previous = makeState(
      [placed("s", "source", 0, 0), placed("a", "a", 0, 1), placed("b", "b", 0, 3)],
      catalog,
    );
    const next = makeState(
      [placed("s", "source", 0, 2), placed("a", "a", 0, 1), placed("b", "b", 0, 3)],
      catalog,
    );
    const { incremental, full } = scoreBoth(previous, next, catalog, [relocateMove(previous, next, "s")]);
    expect(incremental.mode).toBe("incremental");
    expect(incremental.affectedInstanceIds).toEqual(expect.arrayContaining(["s", "a", "b"]));
    assertEquivalentPlacementScore(incremental.score, full);
    expect(full.score).toBe(1);
  });
});

describe("star outside backpack", () => {
  it("Star вне сетки допустима, если Item cells внутри", () => {
    const source = tile("source");
    const target = testItem({ id: "target" });
    const catalog = catalogFromItems([source, target]);
    const backpack = { rows: 4, cols: 4 };
    const previous = makeState(
      [placed("s", "source", 0, 3), placed("t", "target", 2, 2)],
      catalog,
      backpack,
    );
    const next = makeState(
      [placed("s", "source", 1, 3), placed("t", "target", 2, 2)],
      catalog,
      backpack,
    );
    const geom = previous.items.itemGeometries.get("s")!;
    expect(geom.stars.some((star) => star.col >= backpack.cols)).toBe(true);
    const { incremental, full } = scoreBoth(previous, next, catalog, [relocateMove(previous, next, "s")]);
    expect(incremental.mode).toBe("incremental");
    assertEquivalentPlacementScore(incremental.score, full);
  });
});

describe("no star data", () => {
  it("star === null не создаёт invented synergy", () => {
    const source = testItem({
      id: "source",
      geometry: { cells: [[0, 0]], stars: [[0, 1]] },
      star: null,
    });
    const target = testItem({ id: "target" });
    const catalog = catalogFromItems([source, target]);
    const previous = makeState([placed("s", "source", 0, 0), placed("t", "target", 2, 2)], catalog);
    const next = makeState([placed("s", "source", 0, 0), placed("t", "target", 0, 1)], catalog);
    const { incremental, full } = scoreBoth(previous, next, catalog, [relocateMove(previous, next, "t")]);
    expect(incremental.mode).toBe("incremental");
    expect(incremental.score.synergies).toEqual([]);
    expect(incremental.score.score).toBe(0);
    assertEquivalentPlacementScore(incremental.score, full);
  });
});

describe("raw / unsupported", () => {
  it("raw condition не интерпретируется по-новому", () => {
    const source = testItem({
      id: "source",
      geometry: { cells: [[0, 0]], stars: [[0, 1]] },
      star: {
        rules: [
          {
            trigger: { type: "on_star_activation" },
            conditions: [{ type: "raw", raw: "only during Blood Moon" }],
            effects: [],
          },
        ],
      },
    });
    const target = testItem({ id: "target" });
    const catalog = catalogFromItems([source, target]);
    const previous = makeState([placed("s", "source", 0, 0), placed("t", "target", 2, 2)], catalog);
    const next = makeState([placed("s", "source", 0, 0), placed("t", "target", 0, 1)], catalog);
    const { incremental, full } = scoreBoth(previous, next, catalog, [relocateMove(previous, next, "t")]);
    expect(incremental.mode).toBe("incremental");
    expect(incremental.score.breakdown.unknownInteractions).toBe(1);
    expect(incremental.score.score).toBe(0);
    assertEquivalentPlacementScore(incremental.score, full);
  });

  it("unsupported occupant не активирует Star", () => {
    const source = testItem({
      id: "source",
      geometry: { cells: [[0, 0]], stars: [[0, 1]] },
      star: {
        rules: [
          {
            trigger: { type: "on_star_occupant", event: "hit" },
            conditions: [],
            effects: [],
          },
        ],
      },
    });
    const target = testItem({ id: "target", types: ["tool"] });
    const catalog = catalogFromItems([source, target]);
    const previous = makeState([placed("s", "source", 0, 0), placed("t", "target", 2, 2)], catalog);
    const next = makeState([placed("s", "source", 0, 0), placed("t", "target", 0, 1)], catalog);
    const { incremental, full } = scoreBoth(previous, next, catalog, [relocateMove(previous, next, "t")]);
    expect(incremental.mode).toBe("incremental");
    expect(incremental.score.breakdown.unsupportedInteractions).toBe(1);
    assertEquivalentPlacementScore(incremental.score, full);
  });
});

describe("multi-move", () => {
  it("несколько displaced Items — один incremental recompute", () => {
    const source = tile("source");
    const a = testItem({ id: "a" });
    const b = testItem({ id: "b" });
    const catalog = catalogFromItems([source, a, b]);
    const previous = makeState(
      [placed("s", "source", 0, 0), placed("a", "a", 0, 1), placed("b", "b", 3, 3)],
      catalog,
    );
    const next = makeState(
      [placed("s", "source", 0, 0), placed("a", "a", 4, 4), placed("b", "b", 0, 1)],
      catalog,
    );
    const repair = createRepairMove([
      {
        instanceId: "a",
        itemId: "a",
        previous: snapshotPlaced(previous.items, "a")!,
        next: snapshotPlaced(next.items, "a")!,
      },
      {
        instanceId: "b",
        itemId: "b",
        previous: snapshotPlaced(previous.items, "b")!,
        next: snapshotPlaced(next.items, "b")!,
      },
    ]);
    const { incremental, full } = scoreBoth(previous, next, catalog, [repair]);
    expect(incremental.mode).toBe("incremental");
    expect(incremental.affectedInstanceIds).toEqual(expect.arrayContaining(["a", "b", "s"]));
    assertEquivalentPlacementScore(incremental.score, full);
  });
});

describe("fallback", () => {
  it("несовпадающий move → full_fallback, итог === full", () => {
    const source = tile("source");
    const target = testItem({ id: "target" });
    const catalog = catalogFromItems([source, target]);
    const previous = makeState([placed("s", "source", 0, 0), placed("t", "target", 0, 1)], catalog);
    const next = makeState([placed("s", "source", 0, 0), placed("t", "target", 3, 3)], catalog);
    const previousScore = scoreLayout(previous, catalog);
    const stale = createItemRelocateMove(
      "t",
      "target",
      snapshotPlaced(previous.items, "t")!,
      snapshotFromCandidate("t", "target", { row: 1, col: 1 }, 0, [{ row: 1, col: 1 }], []),
    );
    const result = tryIncrementalPlacementScore(next, catalog, {
      previousState: previous,
      previousScore,
      moves: [stale],
    });
    const full = analyzePlacementScore({ inventory: next.backpack, items: next.items.items }, catalog);
    expect(result.mode).toBe("full_fallback");
    assertEquivalentPlacementScore(result.score, full);
  });
});

describe("cache interaction", () => {
  const source = tile("source");
  const target = testItem({ id: "target" });
  const catalog = catalogFromItems([source, target]);

  it("cache hit не запускает incremental; miss запускает и сохраняет", () => {
    const previous = makeState([placed("s", "source", 0, 0), placed("t", "target", 2, 2)], catalog);
    const next = makeState([placed("s", "source", 0, 0), placed("t", "target", 0, 1)], catalog);
    const cache = createScoreCache();
    const previousScore = scoreLayout(previous, catalog, cache);
    expect(cache.snapshot().incrementalScoreAttempts).toBe(0);
    const context: IncrementalScoreContext = {
      previousState: previous,
      previousScore,
      moves: [relocateMove(previous, next, "t")],
    };
    const first = scoreLayout(next, catalog, cache, context);
    const afterMiss = cache.snapshot();
    expect(afterMiss.misses).toBe(2);
    expect(afterMiss.incrementalScoreAttempts).toBe(1);
    expect(afterMiss.incrementalScoreSuccesses).toBe(1);
    expect(afterMiss.evaluations).toBe(afterMiss.hits + afterMiss.misses);
    const second = scoreLayout(next, catalog, cache, context);
    const afterHit = cache.snapshot();
    expect(second).toBe(first);
    expect(afterHit.hits).toBe(1);
    expect(afterHit.incrementalScoreAttempts).toBe(1);
    expect(afterHit.evaluations).toBe(afterHit.hits + afterHit.misses);
    assertEquivalentPlacementScore(first, analyzePlacementScore({ inventory: next.backpack, items: next.items.items }, catalog));
  });

  it("disabled incremental не считает attempts", () => {
    const previous = makeState([placed("s", "source", 0, 0), placed("t", "target", 2, 2)], catalog);
    const next = makeState([placed("s", "source", 0, 0), placed("t", "target", 0, 1)], catalog);
    const cache = createScoreCache();
    const previousScore = scoreLayout(previous, catalog, cache);
    withIncrementalScoring({ enabled: false, verify: false }, () => {
      scoreLayout(next, catalog, cache, {
        previousState: previous,
        previousScore,
        moves: [relocateMove(previous, next, "t")],
      });
    });
    expect(cache.snapshot().incrementalScoreAttempts).toBe(0);
    expect(cache.snapshot().incrementalScoreSuccesses).toBe(0);
  });
});

describe("bag-only", () => {
  it("Items не изменились → предыдущий score переиспользуется", () => {
    const source = tile("source");
    const target = testItem({ id: "target" });
    const catalog = catalogFromItems([source, target]);
    const previous = makeState([placed("s", "source", 0, 0), placed("t", "target", 0, 1)], catalog);
    const next = {
      ...previous,
      bags: emptyBagState(),
    };
    const previousScore = scoreLayout(previous, catalog);
    const result = tryIncrementalPlacementScore(next, catalog, {
      previousState: previous,
      previousScore,
      moves: [{ type: "bag_relocate", instanceId: "bag", itemId: "medium_bag" }],
    });
    expect(result.mode).toBe("incremental");
    expect(result.score).toBe(previousScore);
    expect(result.reason).toBe("items unchanged");
  });
});

describe("item place", () => {
  it("новый Item пересчитывает incoming Stars", () => {
    const source = tile("source");
    const target = testItem({ id: "target" });
    const catalog = catalogFromItems([source, target]);
    const previous = makeState([placed("s", "source", 0, 0)], catalog);
    const next = makeState([placed("s", "source", 0, 0), placed("t", "target", 0, 1)], catalog);
    const move = createItemPlaceMove("t", "target", snapshotPlaced(next.items, "t")!);
    const { incremental, full } = scoreBoth(previous, next, catalog, [move]);
    expect(incremental.mode).toBe("incremental");
    expect(incremental.score.score).toBe(1);
    assertEquivalentPlacementScore(incremental.score, full);
  });
});
