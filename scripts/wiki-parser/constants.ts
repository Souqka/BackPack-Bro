/**
 * Parser identity and Wiki-derived vocabularies.
 *
 * Rarity / type lists were collected from the live Cargo `Item` table on
 * backpackbrawl.wiki.gg (2026-08-28). They are snapshots of Wiki data, not
 * invented game rules. Unknown values must be preserved and warned about.
 */

export const PARSER_VERSION = "0.1.0";

export const WIKI_ORIGIN = "https://backpackbrawl.wiki.gg";
export const WIKI_API = `${WIKI_ORIGIN}/api.php`;
export const USER_AGENT =
  "BackpackBrawlOptimizer/0.1.0 (https://github.com/Souqka/BackPack-Bro; wiki item parser)";

export const KNOWN_RARITIES = [
  "common",
  "rare",
  "epic",
  "legendary",
  "unique",
  "mythic",
  "relic",
  "special",
] as const;

export type KnownRarity = (typeof KNOWN_RARITIES)[number];

/**
 * Item types observed as `type1`/`type2`/`type3`/`type4` in the Wiki Cargo table.
 * Display names are stored here; normalized output uses snake_case slugs.
 */
export const KNOWN_ITEM_TYPES = [
  "Abyssal",
  "Accessory",
  "Armor",
  "Bag",
  "Bee",
  "Bell",
  "Bloomer",
  "Bolt",
  "Bomb",
  "Bramble",
  "Butterfly",
  "Cat",
  "Charm",
  "Crab",
  "Dart",
  "Deep",
  "Fish",
  "Fly",
  "Food",
  "Golem",
  "Honey",
  "Ingredient",
  "Jelly Bean",
  "Katana",
  "Lobster",
  "Melee Weapon",
  "Mineral",
  "Part",
  "Pet",
  "Plant",
  "Potion",
  "Pumpkin",
  "Ranged Weapon",
  "Rat",
  "Rune",
  "Scroll",
  "Shallow",
  "Skull",
  "Tool",
] as const;

export const TILE_ALT = {
  empty: "Empty Tile",
  item: "Item Tile",
  star: "Star",
} as const;

export const ICON_WEBP_WIDTH = 96;
export const FULL_WEBP_QUALITY = 82;
export const ICON_WEBP_QUALITY = 82;
