import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import type { ChancedEffect } from "../types/effects.ts";
import type { LevelUpChange, UpgradeInfo } from "../types/normalized.ts";
import type { TemplateParams, UnparsedConstruct } from "../types/raw.ts";
import { headingSection, visibleText } from "../utils/html.ts";
import type { Logger } from "../utils/logger.ts";
import { flattenWikitext, param } from "../utils/wikitext.ts";
import { parseEffectPhrase } from "./effects.ts";
import { parseTrigger } from "./triggers.ts";

export interface LevelsParseResult {
  levelUp: LevelUpChange[];
  upgrade: UpgradeInfo | null;
  unparsed: UnparsedConstruct[];
}

/**
 * Таблица Level Up Bonus.
 *
 * Проценты и статы надёжно читаются только из HTML (Template:LevelUpBonus),
 * не из короткого `levelUpAbilityEffect`. Строки уровня используют те же
 * Effect/ChancedEffect, что и Initial Abilities — отдельной DSL нет.
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
      logger.warn("levels_unparsed_prose", `Level Up Bonus не таблица: ${prose}`, itemName);
      unparsed.push({ kind: "levels", raw: prose, reason: "Секция уровней без таблицы" });
    }
    return { levelUp: [], upgrade: null, unparsed };
  }

  const levelUp: LevelUpChange[] = [];
  const defaultTriggerText = flattenWikitext(param(params, "levelUpAbilityTrigger")) || null;
  let currentTriggerText: string | null = defaultTriggerText;

  table.find("tr").each((_, tr) => {
    const cells = $(tr).children("td, th");
    if (cells.length === 0) return;

    const first = cells.first();
    const colspan = Number(first.attr("colspan") ?? "1");
    if (colspan >= 2) {
      const header = visibleText($, first).replace(/:\s*$/, "").trim();
      if (header && !/^level$/i.test(header)) {
        currentTriggerText = header;
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

    const changes: ChancedEffect[] = [];
    for (const text of listItems) {
      const parsed = parseEffectPhrase(text);
      if (parsed.unparsed) {
        logger.warn("unknown_effect_structure", `Неизвестная структура эффекта: ${text}`, itemName);
        unparsed.push({ kind: "level_up", raw: text, reason: "Строка уровня не нормализована" });
      }
      changes.push(...parsed.effects);
    }

    const triggerInfo = parseTrigger(currentTriggerText);
    levelUp.push({
      level: Number(levelText),
      trigger: triggerInfo.trigger,
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
