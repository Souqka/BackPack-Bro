import { describe, expect, it } from "vitest";
import { createBagState } from "./bags/state.ts";
import { loadProductionCatalog } from "./load-catalog.ts";
import {
  getBagPartialStateSignature,
  getItemPartialStateSignature,
  remainingMultisetSignature,
} from "./state-signature.ts";
import type { OptimizerState } from "./search-types.ts";
import { createSearchState } from "./state.ts";
import { createTranspositionTable } from "./transposition.ts";
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

describe("partial state signature", () => {
  it("порядок remaining не влияет на ключ", () => {
    const state = makeState([mediumBag], [oreA]);
    const remaining = [
      { instanceId: "bloom", itemId: "starbloom" },
      { instanceId: "bar", itemId: "adamantite_bar" },
    ];
    expect(getItemPartialStateSignature(state, remaining)).toBe(
      getItemPartialStateSignature(state, [...remaining].reverse()),
    );
    expect(remainingMultisetSignature(remaining)).toBe(remainingMultisetSignature([...remaining].reverse()));
  });

  it("порядок placed items не влияет на ключ", () => {
    const ab = makeState([mediumBag], [oreA, oreB]);
    const ba = makeState([mediumBag], [oreB, oreA]);
    const remaining = [{ instanceId: "bloom", itemId: "starbloom" }];
    expect(getItemPartialStateSignature(ab, remaining)).toBe(getItemPartialStateSignature(ba, remaining));
  });

  it("разный remaining → не equivalent", () => {
    const state = makeState([mediumBag], [oreA]);
    const withB = getItemPartialStateSignature(state, [{ instanceId: "ore-2", itemId: "adamantite_ore" }]);
    const withBloom = getItemPartialStateSignature(state, [{ instanceId: "bloom", itemId: "starbloom" }]);
    expect(withB).not.toBe(withBloom);
  });

  it("duplicate instances не схлопываются по itemId", () => {
    const state = makeState([mediumBag], []);
    const a = remainingMultisetSignature([
      { instanceId: "ore-1", itemId: "adamantite_ore" },
      { instanceId: "ore-2", itemId: "adamantite_ore" },
    ]);
    const b = remainingMultisetSignature([{ instanceId: "ore-1", itemId: "adamantite_ore" }]);
    expect(a).not.toBe(b);
  });

  it("разная rotation → разный state", () => {
    const rot0 = makeState([mediumBag], [{ ...oreA, itemId: "adamantite_bar", rotation: 0 }]);
    const rot90 = makeState([mediumBag], [{ ...oreA, itemId: "adamantite_bar", rotation: 90 }]);
    expect(getItemPartialStateSignature(rot0, [])).not.toBe(getItemPartialStateSignature(rot90, []));
  });

  it("разная Bag topology / availableCells → разный state", () => {
    const items = [oreA];
    const medium = makeState([mediumBag], items);
    const fanny = makeState(
      [{ instanceId: "bag", itemId: "fanny_pack", position: { row: 0, col: 0 }, rotation: 0 }],
      items,
    );
    expect(getItemPartialStateSignature(medium, [])).not.toBe(getItemPartialStateSignature(fanny, []));
    expect(getBagPartialStateSignature(DEFAULT_BACKPACK, medium.bags, [])).not.toBe(
      getBagPartialStateSignature(DEFAULT_BACKPACK, fanny.bags, []),
    );
  });
});

describe("transposition table", () => {
  it("одинаковый partial state с двух путей: второй pruned", () => {
    const table = createTranspositionTable({ enabled: true });
    const state = makeState([mediumBag], [oreA, oreB]);
    const remaining = [{ instanceId: "bloom", itemId: "starbloom" }];
    const key = getItemPartialStateSignature(state, remaining);
    expect(table.shouldAccept(key)).toBe(true);
    expect(table.shouldAccept(key)).toBe(false);
    const metrics = table.snapshot();
    expect(metrics.transpositionAccepted).toBe(1);
    expect(metrics.transpositionHits).toBe(1);
    expect(metrics.transpositionPruned).toBe(1);
    expect(metrics.transpositionReplacements).toBe(0);
  });

  it("heuristic не доминирует чужой future space", () => {
    const table = createTranspositionTable({ enabled: true });
    const state = makeState([mediumBag], [oreA]);
    const keyB = getItemPartialStateSignature(state, [{ instanceId: "ore-2", itemId: "adamantite_ore" }]);
    const keyC = getItemPartialStateSignature(state, [{ instanceId: "bloom", itemId: "starbloom" }]);
    expect(table.shouldAccept(keyB, 100)).toBe(true);
    expect(table.shouldAccept(keyC, 1)).toBe(true);
    expect(table.snapshot().transpositionPruned).toBe(0);
    expect(table.snapshot().transpositionAccepted).toBe(2);
  });

  it("disabled table ничего не prune'ит", () => {
    const table = createTranspositionTable({ enabled: false });
    const key = "same";
    expect(table.shouldAccept(key)).toBe(true);
    expect(table.shouldAccept(key)).toBe(true);
    expect(table.snapshot().transpositionPruned).toBe(0);
    expect(table.snapshot().transpositionHits).toBe(0);
  });
});
