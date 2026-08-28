/**
 * Нормализованный контракт предмета после Stage 2.
 *
 * Координаты geometry — `[row, col]` в локальной системе после обрезки пустых
 * клеток вокруг Item Tile и Star. Star не входит в `cells` и не является
 * отдельным предметом инвентаря.
 *
 * Effect / Trigger / Condition / Constraint — строгие discriminated unions
 * по реальным формулировкам Wiki; неизвестное остаётся `{ type: "raw" }`.
 */

import type { KnownRarity } from "../constants.ts";
import type {
  Ability as AbilityModel,
  ChancedEffect,
  Constraint,
  StarData,
  Trigger,
} from "./effects.ts";

export type { ChancedEffect, Constraint, StarData, Trigger } from "./effects.ts";
export type {
  Condition,
  Effect,
  StarRule,
} from "./effects.ts";

/** `[row, col]` в канонической локальной геометрии. */
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
  /** true, если текст Wiki слишком нерегулярен для надёжного разбора. */
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

export type Ability = AbilityModel;

export interface LevelUpChange {
  level: number;
  trigger: Trigger | null;
  changes: ChancedEffect[];
  rawText?: string;
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
  constraints: Constraint[];
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
  usedIn: Record<string, string[]>;
}
