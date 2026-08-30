import type { ItemGeometry } from "../inventory/types.ts";

/** Presentation projection of a production catalog Item. Not a second catalog. */
export interface CatalogItemView {
  id: string;
  name: string;
  rarity: string;
  types: string[];
  isBag: boolean;
  geometry: ItemGeometry;
  icon: string | null;
}
