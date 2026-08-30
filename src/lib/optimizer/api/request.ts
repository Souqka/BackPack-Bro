import type { Item } from "../../inventory/types.ts";
import type { RunOptimizerInput } from "../search-types.ts";
import type { ValidatedOptimizeInventoryInput } from "./validate.ts";

export function bagInstanceId(index: number): string {
  return `bag-${index}`;
}

export function itemInstanceId(index: number): string {
  return `item-${index}`;
}

/**
 * Maps validated public input onto RunOptimizerInput.
 * Duplicate catalog itemIds become distinct instances with deterministic ids.
 */
export function toRunOptimizerInput(
  input: ValidatedOptimizeInventoryInput,
  catalog: Map<string, Item>,
): RunOptimizerInput {
  return {
    backpack: input.backpack,
    bags: input.bagItemIds.map((itemId, index) => ({
      instanceId: bagInstanceId(index),
      itemId,
    })),
    items: input.itemIds.map((itemId, index) => ({
      instanceId: itemInstanceId(index),
      itemId,
    })),
    catalog,
  };
}
