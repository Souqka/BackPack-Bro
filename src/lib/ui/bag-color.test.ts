import { describe, expect, it } from "vitest";
import { bagColorForItemId } from "./bag-color.ts";

describe("bagColorForItemId", () => {
  it("is deterministic for the same bag itemId", () => {
    expect(bagColorForItemId("medium_bag")).toEqual(bagColorForItemId("medium_bag"));
    expect(bagColorForItemId("fanny_pack")).toEqual(bagColorForItemId("fanny_pack"));
  });

  it("maps different bag types to different hues", () => {
    const medium = bagColorForItemId("medium_bag");
    const fanny = bagColorForItemId("fanny_pack");
    const warrior = bagColorForItemId("warrior_backpack");
    expect(medium.hue).not.toBe(fanny.hue);
    expect(fanny.hue).not.toBe(warrior.hue);
    expect(medium.fill).not.toBe(fanny.fill);
  });

  it("does not invent per-bag catalog colors — only hashes itemId", () => {
    const color = bagColorForItemId("medium_bag");
    expect(color.fill).toContain(`hsla(${color.hue}`);
    expect(color.border).toContain(`hsl(${color.hue}`);
  });
});
