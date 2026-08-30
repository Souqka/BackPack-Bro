import { describe, expect, it } from "vitest";
import {
  initialOptimizerState,
  optimizerReducer,
  selectedLayout,
  toOptimizeInput,
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
});
