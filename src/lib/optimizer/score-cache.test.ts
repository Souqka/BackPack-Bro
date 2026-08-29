import { describe, expect, it } from "vitest";
import { createBagState } from "./bags/state.ts";
import { incrementalScoringSupported } from "./layout-change.ts";
import { loadProductionCatalog } from "./load-catalog.ts";
import {
  createScoreCache,
  getScoreCacheKey,
  scoreCacheHitRate,
  scoreLayout,
  withActiveScoreCache,
} from "./score-cache.ts";
import type { OptimizerState } from "./search-types.ts";
import { createSearchState } from "./state.ts";
import { DEFAULT_BACKPACK } from "./types.ts";
import type { PlacedItem } from "./types.ts";
import type { PlacedBag } from "./bags/types.ts";

const catalog = loadProductionCatalog();

function makeState(bags: PlacedBag[], items: PlacedItem[], backpack = DEFAULT_BACKPACK): OptimizerState {
  const bagState = createBagState(backpack, bags, catalog);
  const itemState = createSearchState(backpack, items, catalog);
  if (!bagState.ok) throw new Error(bagState.issues.join("; "));
  if (!itemState.ok) throw new Error(itemState.issues.map((issue) => issue.message).join("; "));
  return { backpack, bags: bagState.state, items: itemState.state };
}

const mediumBag: PlacedBag = {
  instanceId: "bag",
  itemId: "medium_bag",
  position: { row: 0, col: 0 },
  rotation: 0,
};

describe("score cache key", () => {
  it("не зависит от порядка items в массиве", () => {
    const oreA: PlacedItem = {
      instanceId: "ore-1",
      itemId: "adamantite_ore",
      position: { row: 0, col: 0 },
      rotation: 0,
    };
    const oreB: PlacedItem = {
      instanceId: "ore-2",
      itemId: "adamantite_ore",
      position: { row: 0, col: 1 },
      rotation: 0,
    };
    const ab = makeState([mediumBag], [oreA, oreB]);
    const ba = makeState([mediumBag], [oreB, oreA]);
    expect(getScoreCacheKey(ab)).toBe(getScoreCacheKey(ba));
  });

  it("не зависит от порядка bags в массиве", () => {
    const bagA: PlacedBag = {
      instanceId: "bag-a",
      itemId: "fanny_pack",
      position: { row: 0, col: 0 },
      rotation: 0,
    };
    const bagB: PlacedBag = {
      instanceId: "bag-b",
      itemId: "fanny_pack",
      position: { row: 1, col: 0 },
      rotation: 0,
    };
    const ore: PlacedItem = {
      instanceId: "ore",
      itemId: "adamantite_ore",
      position: { row: 0, col: 0 },
      rotation: 0,
    };
    const ab = makeState([bagA, bagB], [ore]);
    const ba = makeState([bagB, bagA], [ore]);
    expect(getScoreCacheKey(ab)).toBe(getScoreCacheKey(ba));
  });

  it("разный rotation → разный key", () => {
    const bar0: PlacedItem = {
      instanceId: "bar",
      itemId: "adamantite_bar",
      position: { row: 0, col: 0 },
      rotation: 0,
    };
    const bar90: PlacedItem = { ...bar0, rotation: 90 };
    const a = makeState([mediumBag], [bar0]);
    const b = makeState([mediumBag], [bar90]);
    expect(getScoreCacheKey(a)).not.toBe(getScoreCacheKey(b));
  });

  it("разная позиция → разный key", () => {
    const ore0: PlacedItem = {
      instanceId: "ore",
      itemId: "adamantite_ore",
      position: { row: 0, col: 0 },
      rotation: 0,
    };
    const ore1: PlacedItem = { ...ore0, position: { row: 0, col: 1 } };
    const a = makeState([mediumBag], [ore0]);
    const b = makeState([mediumBag], [ore1]);
    expect(getScoreCacheKey(a)).not.toBe(getScoreCacheKey(b));
  });

  it("два экземпляра одного itemId различаются по instanceId", () => {
    const ore1: PlacedItem = {
      instanceId: "ore-1",
      itemId: "adamantite_ore",
      position: { row: 0, col: 0 },
      rotation: 0,
    };
    const ore2: PlacedItem = {
      instanceId: "ore-2",
      itemId: "adamantite_ore",
      position: { row: 0, col: 1 },
      rotation: 0,
    };
    const swapped = makeState(
      [mediumBag],
      [
        { ...ore1, position: ore2.position },
        { ...ore2, position: ore1.position },
      ],
    );
    const original = makeState([mediumBag], [ore1, ore2]);
    expect(getScoreCacheKey(original)).not.toBe(getScoreCacheKey(swapped));
  });

  it("одинаковые Item placements и разная Bag topology → разные keys", () => {
    const ore: PlacedItem = {
      instanceId: "ore",
      itemId: "adamantite_ore",
      position: { row: 0, col: 0 },
      rotation: 0,
    };
    const medium = makeState([mediumBag], [ore]);
    const fanny = makeState(
      [{ instanceId: "bag", itemId: "fanny_pack", position: { row: 0, col: 0 }, rotation: 0 }],
      [ore],
    );
    expect(getScoreCacheKey(medium)).not.toBe(getScoreCacheKey(fanny));
  });

  it("разный Star overlap → разные keys, scores не смешиваются", () => {
    const bar: PlacedItem = {
      instanceId: "bar",
      itemId: "adamantite_bar",
      position: { row: 0, col: 0 },
      rotation: 0,
    };
    const onStar: PlacedItem = {
      instanceId: "ore",
      itemId: "adamantite_ore",
      position: { row: 0, col: 0 },
      rotation: 0,
    };
    const offStar: PlacedItem = { ...onStar, position: { row: 1, col: 0 } };
    const activated = makeState([mediumBag], [bar, onStar]);
    const inactive = makeState([mediumBag], [bar, offStar]);
    expect(getScoreCacheKey(activated)).not.toBe(getScoreCacheKey(inactive));

    const cache = createScoreCache();
    const a = scoreLayout(activated, catalog, cache);
    const b = scoreLayout(inactive, catalog, cache);
    expect(a.breakdown.activatedStars).not.toBe(b.breakdown.activatedStars);
    expect(cache.snapshot().hits).toBe(0);
    expect(cache.snapshot().misses).toBe(2);
  });

  it("размер рюкзака входит в key", () => {
    const ore: PlacedItem = {
      instanceId: "ore",
      itemId: "adamantite_ore",
      position: { row: 0, col: 0 },
      rotation: 0,
    };
    const a = makeState([mediumBag], [ore], { rows: 6, cols: 9 });
    const b = makeState([mediumBag], [ore], { rows: 5, cols: 8 });
    expect(getScoreCacheKey(a)).not.toBe(getScoreCacheKey(b));
  });
});

describe("score cache hits/misses", () => {
  it("одинаковый layout: miss, затем hit, score identical", () => {
    const state = makeState(
      [mediumBag],
      [
        {
          instanceId: "ore-1",
          itemId: "adamantite_ore",
          position: { row: 0, col: 0 },
          rotation: 0,
        },
        {
          instanceId: "ore-2",
          itemId: "adamantite_ore",
          position: { row: 1, col: 1 },
          rotation: 0,
        },
      ],
    );
    const cache = createScoreCache();
    const first = scoreLayout(state, catalog, cache);
    expect(cache.snapshot()).toMatchObject({ hits: 0, misses: 1, evaluations: 1, uniqueLayoutsScored: 1 });
    const second = scoreLayout(state, catalog, cache);
    expect(second).toBe(first);
    expect(second.score).toBe(first.score);
    expect(cache.snapshot()).toMatchObject({ hits: 1, misses: 1, evaluations: 2, uniqueLayoutsScored: 1 });
    expect(cache.snapshot().evaluations).toBe(cache.snapshot().hits + cache.snapshot().misses);
  });

  it("порядок массива: один key и hit на втором scoring", () => {
    const oreA: PlacedItem = {
      instanceId: "ore-1",
      itemId: "adamantite_ore",
      position: { row: 0, col: 0 },
      rotation: 0,
    };
    const oreB: PlacedItem = {
      instanceId: "ore-2",
      itemId: "adamantite_ore",
      position: { row: 0, col: 1 },
      rotation: 0,
    };
    const cache = createScoreCache();
    const first = scoreLayout(makeState([mediumBag], [oreA, oreB]), catalog, cache);
    const second = scoreLayout(makeState([mediumBag], [oreB, oreA]), catalog, cache);
    expect(second).toBe(first);
    expect(cache.snapshot().hits).toBe(1);
    expect(cache.snapshot().misses).toBe(1);
  });

  it("disabled cache: каждый вызов — miss, uniqueLayouts меньше evaluations", () => {
    const state = makeState(
      [mediumBag],
      [{ instanceId: "ore", itemId: "adamantite_ore", position: { row: 0, col: 0 }, rotation: 0 }],
    );
    const cache = createScoreCache({ enabled: false });
    scoreLayout(state, catalog, cache);
    scoreLayout(state, catalog, cache);
    const metrics = cache.snapshot();
    expect(metrics.hits).toBe(0);
    expect(metrics.misses).toBe(2);
    expect(metrics.evaluations).toBe(2);
    expect(metrics.uniqueLayoutsScored).toBe(1);
    expect(scoreCacheHitRate(metrics)).toBe(0);
  });

  it("кэшированный PlacementScore нельзя мутировать", () => {
    const state = makeState(
      [mediumBag],
      [{ instanceId: "ore", itemId: "adamantite_ore", position: { row: 0, col: 0 }, rotation: 0 }],
    );
    const cache = createScoreCache();
    const scored = scoreLayout(state, catalog, cache);
    expect(() => {
      (scored as { score: number }).score = 999;
    }).toThrow();
  });

  it("withActiveScoreCache ограничивает lifetime одним блоком", () => {
    const state = makeState(
      [mediumBag],
      [{ instanceId: "ore", itemId: "adamantite_ore", position: { row: 0, col: 0 }, rotation: 0 }],
    );
    const cache = createScoreCache();
    withActiveScoreCache(cache, () => {
      scoreLayout(state, catalog);
      scoreLayout(state, catalog);
    });
    expect(cache.snapshot().hits).toBe(1);
    const outside = createScoreCache();
    scoreLayout(state, catalog, outside);
    expect(outside.snapshot().misses).toBe(1);
    expect(outside.snapshot().hits).toBe(0);
  });
});

describe("incremental scoring boundaries", () => {
  it("поддерживаемые local moves можно пытаться оценить incremental", () => {
    const kinds = [
      "item_place",
      "item_relocate",
      "item_rotate",
      "item_swap",
      "item_remove",
      "bag_relocate",
      "bag_rotate",
      "bag_swap",
      "repair",
    ] as const;
    for (const kind of kinds) {
      expect(incrementalScoringSupported({ kind })).toBe(true);
    }
  });
});
