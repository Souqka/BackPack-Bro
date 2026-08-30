import type { QuantityLine } from "./expand-quantities.ts";

export interface OptimizerExample {
  id: string;
  label: string;
  bags: QuantityLine[];
  items: QuantityLine[];
}

/** Production item ids from the existing benchmark suite. Not synthetic data. */
export const OPTIMIZER_EXAMPLES: OptimizerExample[] = [
  {
    id: "A-simple",
    label: "Simple (A)",
    bags: [{ itemId: "medium_bag", quantity: 1 }],
    items: [{ itemId: "adamantite_ore", quantity: 2 }],
  },
  {
    id: "G-competing-stars",
    label: "Competing Stars (G)",
    bags: [
      { itemId: "warrior_backpack", quantity: 1 },
      { itemId: "medium_bag", quantity: 1 },
    ],
    items: [
      { itemId: "adamantite_bar", quantity: 2 },
      { itemId: "starbloom", quantity: 2 },
    ],
  },
  {
    id: "H-multiple-bags",
    label: "Multiple Bags (H)",
    bags: [{ itemId: "fanny_pack", quantity: 3 }],
    items: [
      { itemId: "adamantite_bar", quantity: 1 },
      { itemId: "adamantite_ore", quantity: 1 },
      { itemId: "starbloom", quantity: 1 },
    ],
  },
  {
    id: "E-tight-space",
    label: "Unplaced (E)",
    bags: [{ itemId: "fanny_pack", quantity: 1 }],
    items: [
      { itemId: "adamantite_ore", quantity: 2 },
      { itemId: "adamantite_bar", quantity: 1 },
    ],
  },
];
