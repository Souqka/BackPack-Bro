"use client";

import { useReducer, useTransition } from "react";
import type { OptimizeInventoryInput, OptimizeInventoryResult } from "@/lib/optimizer/api/types.ts";
import {
  initialOptimizerState,
  optimizerReducer,
  selectedLayout,
  toOptimizeInput,
} from "@/lib/ui/optimizer-state.ts";

export function useOptimizer(
  optimize: (input: OptimizeInventoryInput) => Promise<OptimizeInventoryResult>,
) {
  const [state, dispatch] = useReducer(optimizerReducer, initialOptimizerState);
  const [isPending, startTransition] = useTransition();
  const busy = state.status === "optimizing" || isPending;

  function run(): void {
    if (busy) return;
    const input = toOptimizeInput(state);
    dispatch({ type: "OPTIMIZE_STARTED" });
    startTransition(async () => {
      try {
        const result = await optimize(input);
        dispatch({ type: "OPTIMIZE_FINISHED", result });
      } catch {
        dispatch({ type: "OPTIMIZE_UNEXPECTED" });
      }
    });
  }

  return {
    state,
    dispatch,
    run,
    busy,
    selected: selectedLayout(state),
  };
}
