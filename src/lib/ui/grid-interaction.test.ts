import { describe, expect, it } from "vitest";
import {
  resolveActiveSynergy,
  resolveItemVisualRole,
  synergyId,
  toggleSynergySelection,
} from "./grid-interaction.ts";
import type { OptimizedStarActivation } from "../optimizer/api/types.ts";

const bloomA: OptimizedStarActivation = {
  sourceInstanceId: "bloom-a",
  sourceItemId: "starbloom",
  targetInstanceId: "bar-a",
  targetItemId: "adamantite_bar",
  row: 1,
  col: 2,
};

const bloomB: OptimizedStarActivation = {
  sourceInstanceId: "bloom-b",
  sourceItemId: "starbloom",
  targetInstanceId: "bar-b",
  targetItemId: "adamantite_bar",
  row: 3,
  col: 4,
};

const activations = [bloomA, bloomB];

describe("synergyId", () => {
  it("is stable and instance-specific", () => {
    expect(synergyId(bloomA)).toBe("bloom-a:bar-a:1:2");
    expect(synergyId(bloomA)).toBe(synergyId({ ...bloomA }));
    expect(synergyId(bloomA)).not.toBe(synergyId(bloomB));
  });
});

describe("resolveActiveSynergy", () => {
  it("lets hovered preview win over a selected synergy", () => {
    expect(resolveActiveSynergy(activations, synergyId(bloomB), synergyId(bloomA))).toEqual(bloomB);
    expect(resolveActiveSynergy(activations, null, synergyId(bloomA))).toEqual(bloomA);
    expect(resolveActiveSynergy(activations, null, null)).toBeNull();
  });

  it("returns null when the id belongs to another layout", () => {
    expect(resolveActiveSynergy(activations, "gone:gone:0:0", null)).toBeNull();
    expect(resolveActiveSynergy([], synergyId(bloomA), synergyId(bloomA))).toBeNull();
  });
});

describe("toggleSynergySelection", () => {
  it("selects on first click and clears on the same id", () => {
    expect(toggleSynergySelection(null, synergyId(bloomA))).toBe(synergyId(bloomA));
    expect(toggleSynergySelection(synergyId(bloomA), synergyId(bloomA))).toBeNull();
    expect(toggleSynergySelection(synergyId(bloomA), synergyId(bloomB))).toBe(synergyId(bloomB));
  });
});

describe("resolveItemVisualRole", () => {
  it("prioritizes synergy roles over item hover and dims unrelated items", () => {
    expect(resolveItemVisualRole("bloom-a", bloomA, "bar-b")).toBe("source");
    expect(resolveItemVisualRole("bar-a", bloomA, "bar-a")).toBe("target");
    expect(resolveItemVisualRole("bloom-b", bloomA, "bloom-b")).toBe("dimmed");
    expect(resolveItemVisualRole("bloom-a", null, "bloom-a")).toBe("hovered");
    expect(resolveItemVisualRole("bloom-a", null, null)).toBe("normal");
  });
});
