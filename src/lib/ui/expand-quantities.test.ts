import { describe, expect, it } from "vitest";
import { addLine, expandQuantities, setLineQuantity } from "./expand-quantities.ts";

describe("expandQuantities", () => {
  it("repeats item ids instead of collapsing duplicates", () => {
    expect(
      expandQuantities([
        { itemId: "adamantite_ore", quantity: 3 },
        { itemId: "starbloom", quantity: 1 },
      ]),
    ).toEqual(["adamantite_ore", "adamantite_ore", "adamantite_ore", "starbloom"]);
  });

  it("treats quantity 0 as no instances", () => {
    expect(expandQuantities([{ itemId: "medium_bag", quantity: 0 }])).toEqual([]);
  });
});

describe("quantity lines", () => {
  it("adds a new line then increments", () => {
    const once = addLine([], "adamantite_ore", 20);
    expect(once).toEqual([{ itemId: "adamantite_ore", quantity: 1 }]);
    expect(addLine(once, "adamantite_ore", 20)).toEqual([{ itemId: "adamantite_ore", quantity: 2 }]);
  });

  it("removes a line at quantity 0", () => {
    expect(setLineQuantity([{ itemId: "medium_bag", quantity: 2 }], "medium_bag", 0)).toEqual([]);
  });
});
