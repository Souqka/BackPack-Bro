import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import type { LevelUpChange, UpgradeInfo } from "../types/normalized.ts";
import type { TemplateParams, UnparsedConstruct } from "../types/raw.ts";
import { headingSection, visibleText } from "../utils/html.ts";
import type { Logger } from "../utils/logger.ts";
import { flattenWikitext, param } from "../utils/wikitext.ts";
import { normalizeEffect } from "./abilities.ts";

export interface LevelsParseResult {
  levelUp: LevelUpChange[];
  upgrade: UpgradeInfo | null;
  unparsed: UnparsedConstruct[];
}

/**
 * Parse the Level Up Bonus table.
 *
 * Wiki rarity/`name` selects a bonus table inside Template:LevelUpBonus;
 * percentages and stat lines are therefore only reliable from rendered HTML,
 * not from the short `levelUpAbilityEffect` wikitext parameter.
 *
 * A `colspan` header row (`When this activates:`) applies as `trigger` to the
 * following level rows until the next header. Each `<li>` (or the cell text)
 * becomes its own change. Special rarity pages that say the item cannot be
 * levelled up yield `upgrade.maxLevel = null` and an empty `levelUp` list.
 *
 * Levels of one Wiki item stay on that item — no `item_level_N` IDs.
 */
export function parseLevels(
  html: string,
  params: TemplateParams,
  logger: Logger,
  itemName: string,
  rarity: string,
): LevelsParseResult {
  const unparsed: UnparsedConstruct[] = [];
  const $ = cheerio.load(html);
  const section = headingSection($, "Level_Up_Bonus");
  const table = section.filter("table").add(section.find("table")).first();

  if (table.length === 0) {
    const prose = visibleText($, section);
    if (/cannot be level+ed up/i.test(prose) || rarity === "special") {
      return { levelUp: [], upgrade: { maxLevel: null }, unparsed };
    }
    if (prose) {
      logger.warn("levels_unparsed_prose", `Level Up Bonus was not a table: ${prose}`, itemName);
      unparsed.push({ kind: "levels", raw: prose, reason: "Level-up section had no table" });
    }
    return { levelUp: [], upgrade: null, unparsed };
  }

  const levelUp: LevelUpChange[] = [];
  let currentTrigger: string | null = flattenWikitext(param(params, "levelUpAbilityTrigger")) || null;

  table.find("tr").each((_, tr) => {
    const cells = $(tr).children("td, th");
    if (cells.length === 0) return;

    const first = cells.first();
    const colspan = Number(first.attr("colspan") ?? "1");
    if (colspan >= 2) {
      const header = visibleText($, first).replace(/:\s*$/, "");
      if (header && !/^level$/i.test(header)) {
        currentTrigger = header;
      }
      return;
    }

    if (cells.length < 2) return;
    const levelText = visibleText($, $(cells.get(0) as Element));
    if (!/^\d+$/.test(levelText)) return;

    const bonusCell = $(cells.get(1) as Element);
    const listItems: string[] = [];
    bonusCell.find("li").each((__, li) => {
      const text = visibleText($, $(li));
      if (text) listItems.push(text);
    });
    if (listItems.length === 0) {
      const fallback = visibleText($, bonusCell);
      if (fallback) listItems.push(fallback);
    }

    const changes = listItems.map((text) =>
      normalizeLevelChange(text, logger, itemName, unparsed),
    );

    levelUp.push({
      level: Number(levelText),
      trigger: currentTrigger,
      changes,
      rawText: listItems.join("; "),
    });
  });

  const maxLevel =
    levelUp.length > 0 ? Math.max(...levelUp.map((row) => row.level)) : null;

  return {
    levelUp,
    upgrade: { maxLevel },
    unparsed,
  };
}

function normalizeLevelChange(
  text: string,
  logger: Logger,
  itemName: string,
  unparsed: UnparsedConstruct[],
): unknown {
  const gainStat = text.match(/^gain\s+\+?(\d+(?:\.\d+)?)(?:\s+min|\s+max)?\s+(.+)$/i);
  if (gainStat) {
    return {
      verb: "gain",
      amount: Number(gainStat[1]),
      status: (gainStat[2] ?? "")
        .replace(/\s+min$/i, "")
        .replace(/\s+max$/i, "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, ""),
      raw: text,
    };
  }

  const requiresLess = text.match(/requires\s+(\d+)\s+less\s+(.+?)\s+to activate/i);
  if (requiresLess) {
    return {
      verb: "require_less",
      amount: Number(requiresLess[1]),
      status: (requiresLess[2] ?? "").trim().toLowerCase().replace(/\s+/g, "_"),
      raw: text,
    };
  }

  return normalizeEffect(text, logger, itemName, unparsed);
}
