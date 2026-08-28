import * as cheerio from "cheerio";
import { KNOWN_ITEM_TYPES, KNOWN_RARITIES } from "../constants.ts";
import type { UnlockInfo } from "../types/normalized.ts";
import type { TemplateParams, UnparsedConstruct } from "../types/raw.ts";
import { infoboxData } from "../utils/html.ts";
import { normalizeRarity, normalizeTypeSlug } from "../utils/ids.ts";
import type { Logger } from "../utils/logger.ts";
import { flattenWikitext, numberedParams, param } from "../utils/wikitext.ts";

export interface GeneralInfoResult {
  name: string;
  rarity: string;
  types: string[];
  hero: string | null;
  unlock: UnlockInfo | null;
  purchasable: boolean | null;
  cost: number | null;
  unparsed: UnparsedConstruct[];
}

const KNOWN_TYPE_SLUGS = new Set(KNOWN_ITEM_TYPES.map((t) => normalizeTypeSlug(t)));
const KNOWN_RARITY_SET = new Set<string>(KNOWN_RARITIES);

/**
 * Read identity fields from the Item template first, then fill gaps from the
 * rendered infobox HTML. Template parameters are the structured source; HTML
 * is used when a field is missing from wikitext.
 */
export function parseGeneralInfo(
  html: string,
  params: TemplateParams,
  logger: Logger,
  itemNameForLog: string,
): GeneralInfoResult {
  const $ = cheerio.load(html);
  const unparsed: UnparsedConstruct[] = [];

  const name =
    param(params, "name") ||
    infoboxData($, "Name") ||
    $(".druid-title").first().text().trim();

  const rarityRaw = param(params, "rarity") || infoboxData($, "Rarity");
  const rarity = rarityRaw ? normalizeRarity(rarityRaw) : "";
  if (rarity && !KNOWN_RARITY_SET.has(rarity)) {
    logger.warn(
      "unknown_rarity",
      `Unknown rarity "${rarityRaw}"`,
      itemNameForLog,
      { rarity: rarityRaw },
    );
  }

  const typeNames = [
    param(params, "type1"),
    param(params, "type2"),
    param(params, "type3"),
    param(params, "type4"),
  ].filter(Boolean);

  if (typeNames.length === 0) {
    const htmlTypes = infoboxData($, "Types");
    if (htmlTypes) {
      for (const piece of htmlTypes.split(/[,/]/).map((s) => s.trim()).filter(Boolean)) {
        typeNames.push(piece);
      }
    }
  }

  const types: string[] = [];
  for (const typeName of typeNames) {
    const slug = normalizeTypeSlug(typeName);
    types.push(slug);
    if (!KNOWN_TYPE_SLUGS.has(slug)) {
      logger.warn(
        "unknown_item_type",
        `Unknown item type "${typeName}"`,
        itemNameForLog,
        { type: typeName },
      );
    }
  }

  const heroRaw = param(params, "hero") || infoboxData($, "Hero");
  const hero = heroRaw || null;

  const costRaw = param(params, "cost") || infoboxData($, "Cost").replace(/[^\d.-]/g, "");
  const cost = parseOptionalNumber(costRaw);

  const purchasableRaw = param(params, "purchasable") || infoboxData($, "Purchasable");
  const purchasable = parseYesNo(purchasableRaw);

  const unlockRaw = param(params, "unlockSource") || infoboxData($, "UnlockSource");
  const unlock = unlockRaw ? parseUnlock(unlockRaw, logger, itemNameForLog, unparsed) : null;

  return { name, rarity, types, hero, unlock, purchasable, cost, unparsed };
}

function parseYesNo(raw: string): boolean | null {
  const v = raw.trim().toLowerCase();
  if (v === "yes" || v === "true") return true;
  if (v === "no" || v === "false") return false;
  return null;
}

function parseOptionalNumber(raw: string): number | null {
  const v = raw.trim();
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Structured unlock from Wiki `unlockSource`.
 *
 * Simple patterns (`Initially available`, `Hero Level 4`, `Hero Level 2 and Area 7`,
 * `Emerald Rank`, `Season 1 Event`) are split into fields. Hero-specific
 * alternatives ("Shared Area 10 or Dorf Area 4") stay as `raw` with `unparsed`.
 */
export function parseUnlock(
  raw: string,
  logger: Logger,
  itemName: string,
  unparsed: UnparsedConstruct[],
): UnlockInfo {
  const text = flattenWikitext(raw);
  const info: UnlockInfo = { raw: text };

  if (/initially\s+ava+i?lable/i.test(text)) {
    info.initiallyAvailable = true;
  }

  const level = text.match(/hero\s+level\s+(\d+)/i) ?? text.match(/\blevel\s+(\d+)/i);
  if (level?.[1]) info.heroLevel = Number(level[1]);

  const area = text.match(/\barea\s+(\d+)/i);
  if (area?.[1]) info.area = Number(area[1]);

  const rank = text.match(/\b(silver|gold|emerald)\s+rank\b/i);
  if (rank?.[1]) info.rank = rank[1].toLowerCase();

  const season = text.match(/season\s+(\d+)\s+event/i);
  if (season?.[1]) info.seasonEvent = Number(season[1]);

  const hasHeroAlternatives = /\bor\b/i.test(text) && /area|level|initially/i.test(text);
  const recognized =
    info.initiallyAvailable ||
    info.heroLevel != null ||
    info.area != null ||
    info.rank != null ||
    info.seasonEvent != null;

  if (hasHeroAlternatives || !recognized) {
    info.unparsed = true;
    unparsed.push({
      kind: "unlock",
      raw: text,
      reason: hasHeroAlternatives
        ? "Hero-specific alternative unlocks are not split into structured variants"
        : "Unlock text did not match known simple patterns",
    });
    logger.warn(
      "unparsed_unlock",
      `Unlock source kept as raw: "${text}"`,
      itemName,
    );
  }

  return info;
}

export { numberedParams };
