"use server";

import { optimizeInventory } from "@/lib/optimizer/api/service.ts";
import type { OptimizeInventoryInput, OptimizeInventoryResult } from "@/lib/optimizer/api/types.ts";

/**
 * Server boundary for the production optimizer.
 * Catalog is never taken from the client.
 */
export async function optimizeBackpackAction(
  input: OptimizeInventoryInput,
): Promise<OptimizeInventoryResult> {
  return optimizeInventory(input);
}
