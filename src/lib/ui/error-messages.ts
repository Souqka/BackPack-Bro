import type { OptimizeInventoryError } from "../optimizer/api/types.ts";

export type DisplayError = OptimizeInventoryError | { code: "UNEXPECTED"; message: string };

export function userFacingError(error: DisplayError): string {
  switch (error.code) {
    case "UNKNOWN_ITEM":
      return `Item "${error.itemId}" is not available in the catalog.`;
    case "INVALID_BAG":
      return `"${error.itemId}" is not a Bag.`;
    case "INVALID_ITEM":
      return `"${error.itemId}" is a Bag and cannot be added as an Item.`;
    case "NO_BAG_LAYOUT":
      return "Add at least one Bag before optimizing.";
    case "INVALID_INPUT":
      return error.message;
    case "UNEXPECTED":
      return "Something went wrong while optimizing the backpack.";
  }
}
