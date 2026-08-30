import type { OptimizeInventoryError } from "./types.ts";

export function invalidInput(
  field: string,
  message: string,
  value?: unknown,
): Extract<OptimizeInventoryError, { code: "INVALID_INPUT" }> {
  return {
    code: "INVALID_INPUT",
    message,
    details: value === undefined ? { field } : { field, value },
  };
}

export function unknownItem(itemId: string): Extract<OptimizeInventoryError, { code: "UNKNOWN_ITEM" }> {
  return {
    code: "UNKNOWN_ITEM",
    message: `Unknown catalog item: ${itemId}`,
    itemId,
  };
}

export function invalidBag(itemId: string): Extract<OptimizeInventoryError, { code: "INVALID_BAG" }> {
  return {
    code: "INVALID_BAG",
    message: `Item is not a bag: ${itemId}`,
    itemId,
  };
}

export function invalidItem(itemId: string): Extract<OptimizeInventoryError, { code: "INVALID_ITEM" }> {
  return {
    code: "INVALID_ITEM",
    message: `Bags cannot be listed in itemIds: ${itemId}`,
    itemId,
  };
}

export function noBagLayout(): Extract<OptimizeInventoryError, { code: "NO_BAG_LAYOUT" }> {
  return {
    code: "NO_BAG_LAYOUT",
    message: "At least one bag is required for a valid game layout",
  };
}
