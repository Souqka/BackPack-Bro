/**
 * Словари, собранные из Cargo/wikitext backpackbrawl.wiki.gg (2026-08-28).
 * Не выдуманы: неизвестное значение остаётся строкой и не ломает parser.
 */

export const PARSER_VERSION = "0.2.0";

export const WIKI_ORIGIN = "https://backpackbrawl.wiki.gg";
export const WIKI_API = `${WIKI_ORIGIN}/api.php`;
export const USER_AGENT =
  "BackpackBrawlOptimizer/0.2.0 (https://github.com/Souqka/BackPack-Bro; wiki item parser)";

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

/**
 * Боевые ресурсы и статусы из формулировок Gain/Inflict Wiki.
 * Порядок важен: более длинные имена проверяются первыми.
 */
export const KNOWN_STATUS_NAMES = [
  "Max Health",
  "Crit Chance",
  "Crit Damage",
  "Armor",
  "Mana",
  "Health",
  "Stamina",
  "Luck",
  "Bleed",
  "Poison",
  "Blind",
  "Thorns",
  "Burn",
  "Chill",
  "Haste",
  "Regeneration",
  "Resist",
  "Dodge",
  "Buff",
  "Debuff",
  "Curse",
  "Insanity",
  "Empower",
  "Lifesteal",
  "Fatigue",
  "Gold",
  "Static",
  "Soul",
  "Stun",
] as const;

/** Нормализованные slug тех же статусов (`Armor` → `armor`). */
export const KNOWN_STATUS_SLUGS = [
  "max_health",
  "crit_chance",
  "crit_damage",
  "armor",
  "mana",
  "health",
  "stamina",
  "luck",
  "bleed",
  "poison",
  "blind",
  "thorns",
  "burn",
  "chill",
  "haste",
  "regeneration",
  "resist",
  "dodge",
  "buff",
  "debuff",
  "curse",
  "insanity",
  "empower",
  "lifesteal",
  "fatigue",
  "gold",
  "static",
  "soul",
  "stun",
] as const;

export type KnownStatusSlug = (typeof KNOWN_STATUS_SLUGS)[number];

/**
 * Характеристики предмета из level-up и modify-формулировок Wiki.
 */
export const KNOWN_STAT_NAMES = [
  "Crit Chance",
  "Crit Damage",
  "Max Health",
  "Damage",
  "Accuracy",
  "Cooldown",
  "Stamina Recovery",
] as const;

export const KNOWN_STAT_SLUGS = [
  "crit_chance",
  "crit_damage",
  "max_health",
  "damage",
  "accuracy",
  "cooldown",
  "stamina_recovery",
  "attack_speed",
  "activation_speed",
  "min_damage",
  "max_damage",
] as const;

export type KnownStatSlug = (typeof KNOWN_STAT_SLUGS)[number];

export const TILE_ALT = {
  empty: "Empty Tile",
  item: "Item Tile",
  star: "Star",
} as const;

export const ICON_WEBP_WIDTH = 96;
export const FULL_WEBP_QUALITY = 82;
export const ICON_WEBP_QUALITY = 82;
