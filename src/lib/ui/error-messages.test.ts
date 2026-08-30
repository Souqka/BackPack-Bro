import { describe, expect, it } from "vitest";
import { userFacingError } from "./error-messages.ts";

describe("userFacingError", () => {
  it("maps unknown item", () => {
    expect(userFacingError({ code: "UNKNOWN_ITEM", message: "x", itemId: "foo" })).toBe(
      'Item "foo" is not available in the catalog.',
    );
  });

  it("maps empty bags", () => {
    expect(userFacingError({ code: "NO_BAG_LAYOUT", message: "x" })).toBe(
      "Add at least one Bag before optimizing.",
    );
  });

  it("hides unexpected internals", () => {
    expect(userFacingError({ code: "UNEXPECTED", message: "stack" })).toBe(
      "Something went wrong while optimizing the backpack.",
    );
  });
});
