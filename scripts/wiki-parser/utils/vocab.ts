/**
 * Сопоставление Wiki-имён статусов, статов и типов предметов.
 * Длинные имена проверяются первыми, чтобы «Max Health» не стал «Health».
 */

import { KNOWN_ITEM_TYPES, KNOWN_STAT_NAMES, KNOWN_STATUS_NAMES } from "../constants.ts";
import { normalizeTypeSlug, slugifyItemName } from "./ids.ts";

export interface NamedMatch {
  slug: string;
  matched: string;
  rest: string;
}

const TYPE_ENTRIES = [...KNOWN_ITEM_TYPES]
  .map((name) => ({ name, slug: normalizeTypeSlug(name) }))
  .sort((a, b) => b.name.length - a.name.length);

const STATUS_ENTRIES = [...KNOWN_STATUS_NAMES]
  .map((name) => ({ name, slug: slugifyItemName(name) }))
  .sort((a, b) => b.name.length - a.name.length);

const STAT_ENTRIES = [
  ...[...KNOWN_STAT_NAMES].map((name) => ({ name, slug: slugifyItemName(name) })),
  { name: "faster attacks", slug: "attack_speed" },
  { name: "faster activations", slug: "activation_speed" },
  { name: "min Damage", slug: "min_damage" },
  { name: "max Damage", slug: "max_damage" },
].sort((a, b) => b.name.length - a.name.length);

export function matchNamed(
  text: string,
  entries: Array<{ name: string; slug: string }>,
): NamedMatch | null {
  const trimmed = text.trim().replace(/^the\s+/i, "");
  for (const entry of entries) {
    const re = new RegExp(`^${escapeRe(entry.name)}\\b`, "i");
    const m = trimmed.match(re);
    if (m) {
      return {
        slug: entry.slug,
        matched: entry.name,
        rest: trimmed.slice(m[0].length).trim(),
      };
    }
  }
  return null;
}

export function matchStatus(text: string): NamedMatch | null {
  return matchNamed(text, STATUS_ENTRIES);
}

export function matchStat(text: string): NamedMatch | null {
  return matchNamed(text, STAT_ENTRIES);
}

/**
 * Вытащить последовательность типов предметов из фразы Wiki
 * («Melee Weapon Ranged Weapon Pet», «Potion», «Star items»).
 */
export function extractItemTypes(text: string): { types: string[]; rest: string } {
  let remaining = text
    .replace(/\btype\b/gi, " ")
    .replace(/\bitems?\b/gi, " ")
    .replace(/\band\b/gi, " ")
    .replace(/[/,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const types: string[] = [];
  let progressed = true;
  while (remaining && progressed) {
    progressed = false;
    const hit = matchNamed(remaining, TYPE_ENTRIES);
    if (hit) {
      types.push(hit.slug);
      remaining = hit.rest;
      progressed = true;
    }
  }
  return { types, rest: remaining.trim() };
}

export function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Правки очевидных опечаток Wiki, чтобы не плодить raw.
 * Исходный текст всегда сохраняется в rawText сущности.
 */
export function correctWikiTypos(text: string): string {
  return text
    .replace(/\bStarat of Dawn\b/gi, "Start of Dawn")
    .replace(/\bOn hi t\b/gi, "On hit")
    .replace(/\bAfer\b/gi, "After")
    .replace(/\bDischrage\b/gi, "Discharge")
    .replace(/\bWhen time if day changes\b/gi, "When time of day changes")
    .replace(/\bOne shop entered\b/gi, "On shop entered")
    .replace(/\bsecoonds\b/gi, "seconds")
    .replace(/\bOuantity\b/gi, "Quantity")
    .replace(/\bavialable\b/gi, "available");
}
