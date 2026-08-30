import type { Item } from "../../inventory/types.ts";
import { runAdaptiveOptimizer } from "../adaptive-search.ts";
import { loadProductionCatalog } from "../load-catalog.ts";
import { toRunOptimizerInput } from "./request.ts";
import { serializeOptimizerResult } from "./serialize.ts";
import type { OptimizeInventoryInput, OptimizeInventoryResult } from "./types.ts";
import { validateOptimizeInventoryInput } from "./validate.ts";

/**
 * Production entry point. Synchronous: Adaptive Search is synchronous.
 * Catalog defaults to production `data/normalized/items.json` — never a test fixture.
 */
export function optimizeInventory(
  input: OptimizeInventoryInput,
  catalog?: Map<string, Item>,
): OptimizeInventoryResult {
  const resolvedCatalog = catalog ?? loadProductionCatalog();
  const validated = validateOptimizeInventoryInput(input, resolvedCatalog);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }
  const runInput = toRunOptimizerInput(validated.value, resolvedCatalog);
  const adaptive = runAdaptiveOptimizer(runInput, validated.value.options.adaptive);
  return serializeOptimizerResult(adaptive, validated.value.options.publicResultCount, resolvedCatalog);
}
