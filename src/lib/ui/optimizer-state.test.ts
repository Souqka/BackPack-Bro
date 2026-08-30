import { describe, expect, it } from "vitest";
import {
  initialOptimizerState,
  optimizerReducer,
  selectedLayout,
  toOptimizeInput,
  defaultGridViewOptions,
} from "./optimizer-state.ts";
import { OPTIMIZER_EXAMPLES } from "./examples.ts";
import type { OptimizeInventorySuccess } from "../optimizer/api/types.ts";

function success(overrides?: Partial<OptimizeInventorySuccess>): OptimizeInventorySuccess {
  const first = {
    layout: {
      rows: 6,
      cols: 9,
      bags: [],
      items: [],
      unplacedItems: [],
      unplacedBags: [],
    },
    score: { valid: true, structuralScore: 6, activatedStars: 6, effectCoverage: 0 },
    complete: true,
    signature: "sig-a",
  };
  const second = { ...first, signature: "sig-b", score: { ...first.score, structuralScore: 5, activatedStars: 5 } };
  return {
    ok: true,
    layout: first.layout,
    score: first.score,
    complete: true,
    signature: "sig-a",
    results: [first, second],
    execution: { stopReason: "stable_result", durationMs: 12 },
    ...overrides,
  };
}

describe("optimizerReducer", () => {
  it("starts with balanced quality and resultCount 1", () => {
    expect(initialOptimizerState.quality).toBe("balanced");
    expect(initialOptimizerState.resultCount).toBe(1);
  });

  it("expands quantities into production API arrays", () => {
    let state = optimizerReducer(initialOptimizerState, { type: "ADD_BAG", itemId: "medium_bag" });
    state = optimizerReducer(state, { type: "ADD_ITEM", itemId: "adamantite_ore" });
    state = optimizerReducer(state, { type: "ADD_ITEM", itemId: "adamantite_ore" });
    expect(toOptimizeInput(state)).toEqual({
      bagItemIds: ["medium_bag"],
      itemIds: ["adamantite_ore", "adamantite_ore"],
      options: { quality: "balanced", resultCount: 1 },
    });
  });

  it("loads example G without collapsing duplicate bars", () => {
    const example = OPTIMIZER_EXAMPLES.find((entry) => entry.id === "G-competing-stars")!;
    const state = optimizerReducer(initialOptimizerState, { type: "LOAD_EXAMPLE", example });
    expect(toOptimizeInput(state).itemIds).toEqual([
      "adamantite_bar",
      "adamantite_bar",
      "starbloom",
      "starbloom",
    ]);
  });

  it("clamps resultCount to the production max", () => {
    const state = optimizerReducer(initialOptimizerState, { type: "SET_RESULT_COUNT", resultCount: 99 });
    expect(state.resultCount).toBe(10);
  });

  it("SELECT_RESULT does not start a new search", () => {
    const loaded = optimizerReducer(initialOptimizerState, {
      type: "OPTIMIZE_FINISHED",
      result: success(),
    });
    const switched = optimizerReducer(loaded, { type: "SELECT_RESULT", signature: "sig-b" });
    expect(switched.status).toBe("success");
    expect(switched.selectedSignature).toBe("sig-b");
    expect(selectedLayout(switched)?.signature).toBe("sig-b");
    expect(switched.result).toBe(loaded.result);
  });

  it("maps NO_BAG_LAYOUT to an error state without throwing", () => {
    const state = optimizerReducer(initialOptimizerState, {
      type: "OPTIMIZE_FINISHED",
      result: { ok: false, error: { code: "NO_BAG_LAYOUT", message: "bags" } },
    });
    expect(state.status).toBe("error");
    expect(state.error?.code).toBe("NO_BAG_LAYOUT");
  });

  it("SET_VIEW_OPTION is render state and does not clear the optimizer result", () => {
    const loaded = optimizerReducer(initialOptimizerState, {
      type: "OPTIMIZE_FINISHED",
      result: success(),
    });
    expect(loaded.view).toEqual(defaultGridViewOptions);
    const hidden = optimizerReducer(loaded, { type: "SET_VIEW_OPTION", option: "showItems", value: false });
    expect(hidden.view.showItems).toBe(false);
    expect(hidden.view.showBags).toBe(true);
    expect(hidden.view.showItemOutlines).toBe(true);
    expect(hidden.status).toBe("success");
    expect(hidden.result).toBe(loaded.result);
    expect(hidden.selectedSignature).toBe("sig-a");
    expect(hidden.result?.score.structuralScore).toBe(6);
    const shown = optimizerReducer(hidden, { type: "SET_VIEW_OPTION", option: "showItems", value: true });
    expect(shown.view.showItems).toBe(true);
    expect(shown.view.showBags).toBe(true);
    expect(shown.result).toBe(loaded.result);
  });

  it("toggling one view layer does not change the others or the optimizer result", () => {
    const loaded = optimizerReducer(initialOptimizerState, {
      type: "OPTIMIZE_FINISHED",
      result: success(),
    });
    const bagsOff = optimizerReducer(loaded, { type: "SET_VIEW_OPTION", option: "showBags", value: false });
    expect(bagsOff.view).toEqual({ showItems: true, showBags: false, showItemOutlines: true });
    expect(bagsOff.result).toBe(loaded.result);
    const outlinesOff = optimizerReducer(bagsOff, {
      type: "SET_VIEW_OPTION",
      option: "showItemOutlines",
      value: false,
    });
    expect(outlinesOff.view).toEqual({ showItems: true, showBags: false, showItemOutlines: false });
    expect(outlinesOff.result).toBe(loaded.result);
    expect(outlinesOff.selectedSignature).toBe("sig-a");
  });

  it("preserves view options when a new search is requested via dirty actions", () => {
    let state = optimizerReducer(initialOptimizerState, {
      type: "SET_VIEW_OPTION",
      option: "showItems",
      value: false,
    });
    state = optimizerReducer(state, { type: "OPTIMIZE_FINISHED", result: success() });
    expect(state.view.showItems).toBe(false);
    state = optimizerReducer(state, { type: "SET_QUALITY", quality: "fast" });
    expect(state.view.showItems).toBe(false);
    expect(state.view.showBags).toBe(true);
    expect(state.result).toBeNull();
  });
});
