import { describe, expect, it } from "vitest";
import { analyzeInventory } from "../inventory/inventory.ts";
import { countFutureStarPotential, evaluatePartialState } from "./heuristic.ts";
import { loadProductionCatalog } from "./load-catalog.ts";
import { emptyBagState } from "./bags/state.ts";
import { generateBagCandidates } from "./bags/candidates.ts";
import { addBagCandidate } from "./bags/state.ts";
import { createSearchState } from "./state.ts";
import { DEFAULT_BACKPACK } from "./types.ts";
import type { OptimizerState } from "./search-types.ts";

const catalog = loadProductionCatalog();

describe("futurePotential", () => {
  it("считает потенциальную Star Bar→Ore, если Star ещё свободна и на клетке Bag", () => {
    const itemsState = createSearchState(DEFAULT_BACKPACK);
    expect(itemsState.ok).toBe(true);
    if (!itemsState.ok) return;
    const bags = generateBagCandidates(
      { instanceId: "bag", itemId: "warrior_backpack" },
      emptyBagState(),
      DEFAULT_BACKPACK,
      catalog,
    );
    const origin = bags.find((c) => c.placement.position.row === 0 && c.placement.position.col === 0);
    expect(origin).toBeDefined();
    const bagState = addBagCandidate(emptyBagState(), origin!, DEFAULT_BACKPACK);
    const withBar = createSearchState(
      DEFAULT_BACKPACK,
      [{ instanceId: "bar", itemId: "adamantite_bar", position: { row: 0, col: 0 }, rotation: 0 }],
      catalog,
    );
    expect(withBar.ok).toBe(true);
    if (!withBar.ok) return;

    const state: OptimizerState = {
      backpack: DEFAULT_BACKPACK,
      bags: bagState,
      items: withBar.state,
    };
    const potential = countFutureStarPotential(
      state,
      [{ instanceId: "ore", itemId: "adamantite_ore" }],
      catalog,
    );
    expect(potential).toBeGreaterThan(0);
  });

  it("не считает raw/unknown mechanic как синергию (wizard_hat)", () => {
    const itemsState = createSearchState(DEFAULT_BACKPACK);
    expect(itemsState.ok).toBe(true);
    if (!itemsState.ok) return;
    const bags = generateBagCandidates(
      { instanceId: "bag", itemId: "bottom_trawl" },
      emptyBagState(),
      DEFAULT_BACKPACK,
      catalog,
    );
    const origin = bags.find((c) => c.placement.position.row === 0 && c.placement.position.col === 0);
    expect(origin).toBeDefined();
    const bagState = addBagCandidate(emptyBagState(), origin!, DEFAULT_BACKPACK);
    const withOre = createSearchState(
      DEFAULT_BACKPACK,
      [{ instanceId: "ore", itemId: "adamantite_ore", position: { row: 0, col: 0 }, rotation: 0 }],
      catalog,
    );
    expect(withOre.ok).toBe(true);
    if (!withOre.ok) return;
    const state: OptimizerState = {
      backpack: DEFAULT_BACKPACK,
      bags: bagState,
      items: withOre.state,
    };
    const potential = countFutureStarPotential(
      state,
      [{ instanceId: "hat", itemId: "wizard_hat" }],
      catalog,
    );
    expect(potential).toBe(0);
    const heuristic = evaluatePartialState(state, [{ instanceId: "hat", itemId: "wizard_hat" }], catalog);
    expect(Number.isFinite(heuristic.total) || heuristic.total === Number.NEGATIVE_INFINITY).toBe(true);
  });

  it("пустой анализ inventory для размещённого Bar валиден", () => {
    const analysis = analyzeInventory(
      {
        inventory: DEFAULT_BACKPACK,
        items: [{ instanceId: "bar", itemId: "adamantite_bar", position: { row: 0, col: 1 }, rotation: 0 }],
      },
      catalog,
    );
    expect(analysis.valid).toBe(true);
  });
});
