/**
 * Normalized item contract produced by the Wiki parser.
 *
 * Coordinates in `geometry` are `[row, col]` in the item's local system after
 * cropping empty padding around occupied Item tiles and Star tiles.
 * Star tiles are NOT included in `cells`.
 *
 * Effect / condition / trigger values stay loosely typed on purpose: stage 1
 * extracts Wiki data faithfully. A strict game DSL comes later from this JSON.
 */

import type { KnownRarity } from "../constants.ts";

/** `[row, col]` in the canonical local geometry. */
export type Cell = [row: number, col: number];

export type Rarity = KnownRarity | string;

export type ItemType = string;

export interface ItemGeometry {
  cells: Cell[];
  stars: Cell[];
}

export interface UnlockInfo {
  raw: string;
  initiallyAvailable?: boolean;
  heroLevel?: number | null;
  area?: number | null;
  rank?: string | null;
  seasonEvent?: number | null;
  /** True when the Wiki text is too irregular to split reliably. */
  unparsed?: boolean;
}

export interface ItemStats {
  damageMin?: number | null;
  damageMax?: number | null;
  cooldown?: number | null;
  accuracy?: number | null;
  staminaCost?: number | null;
  critChance?: number | null;
  critDamage?: number | null;
}

/**
 * One Initial Abilities block from the Wiki.
 * `effects` may contain lightly structured objects or `{ raw }` fallbacks.
 */
export interface Ability {
  trigger?: string | null;
  condition?: unknown;
  effects: unknown[];
  rawText?: string;
}

export interface LevelUpChange {
  level: number;
  trigger?: string | null;
  changes: unknown[];
  rawText?: string;
}

export interface StarActivation {
  raw?: string;
  trigger?: string | null;
  target?: {
    types?: string[];
  };
}

export interface StarData {
  activation: StarActivation;
  effects: unknown[];
}

export interface UpgradeInfo {
  maxLevel?: number | null;
}

export interface RecipeIngredient {
  itemId: string;
  quantity: number;
}

export interface Recipe {
  ingredients: RecipeIngredient[];
}

export interface ItemImages {
  icon?: string | null;
  full?: string | null;
}

export interface ItemSource {
  wikiUrl: string;
  imageUrls?: string[];
  parsedAt: string;
  parserVersion: string;
}

export interface Item {
  id: string;
  name: string;
  rarity: Rarity;
  types: ItemType[];
  hero?: string | null;
  unlock?: UnlockInfo | null;
  purchasable?: boolean | null;
  cost?: number | null;
  geometry: ItemGeometry;
  stats?: ItemStats | null;
  abilities: {
    initial: Ability[];
    levelUp: LevelUpChange[];
  };
  star?: StarData | null;
  upgrade?: UpgradeInfo | null;
  recipes: Recipe[];
  images: ItemImages;
  source: ItemSource;
}

export interface NormalizedCatalog {
  parserVersion: string;
  generatedAt: string;
  wikiOrigin: string;
  items: Item[];
}
