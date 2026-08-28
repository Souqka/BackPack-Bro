import * as cheerio from "cheerio";
import type { ItemStats } from "../types/normalized.ts";
import type { TemplateParams } from "../types/raw.ts";
import { infoboxData } from "../utils/html.ts";
import { param } from "../utils/wikitext.ts";

/**
 * Combat stats from Item template fields, with infobox HTML as fallback.
 *
 * Wiki fields: damageMin, damageMax, cooldown, accuracy, staminaCost,
 * critChance, critDamage. Empty template values mean the item has no stats
 * (e.g. Adamantite Bar) — the result is `null`, not zeros.
 */
export function parseStats(html: string, params: TemplateParams): ItemStats | null {
  const $ = cheerio.load(html);

  const damageMin = numberFrom(param(params, "damageMin"));
  const damageMax = numberFrom(param(params, "damageMax"));
  const cooldown = numberFrom(param(params, "cooldown"));
  const accuracy = numberFrom(param(params, "accuracy"));
  const staminaCost = numberFrom(param(params, "staminaCost"));
  const critChance = numberFrom(param(params, "critChance"));
  const critDamage = numberFrom(param(params, "critDamage"));

  let stats: ItemStats = {
    damageMin,
    damageMax,
    cooldown,
    accuracy,
    staminaCost,
    critChance,
    critDamage,
  };

  if (!hasAnyStat(stats)) {
    stats = {
      ...parseDamageRange(infoboxData($, "Damage")),
      cooldown: parseSeconds(infoboxData($, "Cooldown")),
      accuracy: parsePercent(infoboxData($, "Accuracy")),
      staminaCost: parseLeadingNumber(infoboxData($, "StaminaCost")),
      critChance: parsePercent(infoboxData($, "CritChance")),
      critDamage: parsePercent(infoboxData($, "CritDamage")),
    };
  }

  return hasAnyStat(stats) ? stripEmpty(stats) : null;
}

function hasAnyStat(stats: ItemStats): boolean {
  return Object.values(stats).some((v) => v != null);
}

function stripEmpty(stats: ItemStats): ItemStats {
  const out: ItemStats = {};
  for (const [key, value] of Object.entries(stats) as Array<[keyof ItemStats, number | null | undefined]>) {
    if (value != null) out[key] = value;
  }
  return out;
}

function numberFrom(raw: string): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function parseDamageRange(text: string): Pick<ItemStats, "damageMin" | "damageMax"> {
  const match = text.replace(/[–—]/g, "-").match(/(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)/);
  if (!match) {
    const single = parseLeadingNumber(text);
    return { damageMin: single, damageMax: single };
  }
  return { damageMin: Number(match[1]), damageMax: Number(match[2]) };
}

function parseSeconds(text: string): number | null {
  const match = text.match(/(-?\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

function parsePercent(text: string): number | null {
  const match = text.replace(/^\+/, "").match(/(-?\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

function parseLeadingNumber(text: string): number | null {
  const match = text.match(/(-?\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}
