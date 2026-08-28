import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import type { Ability, Constraint, StarData, StarRule } from "../types/effects.ts";
import type { UnparsedConstruct } from "../types/raw.ts";
import { headingSection, visibleText } from "../utils/html.ts";
import type { Logger } from "../utils/logger.ts";
import { flattenWikitext, param } from "../utils/wikitext.ts";
import { parseEffectPhrase } from "./effects.ts";
import { parseTrigger } from "./triggers.ts";

export interface AbilitiesParseResult {
  initial: Ability[];
  constraints: Constraint[];
  star: StarData | null;
  unparsed: UnparsedConstruct[];
}

interface RawAbilityBlock {
  trigger: string | null;
  effectTexts: string[];
  rawText: string;
}

/**
 * Initial Abilities Wiki → Ability / Constraint / StarRule.
 *
 * Star-эффекты не смешиваются с item abilities и не с level-up.
 * Trigger с Star (occupant hit / on_star_activation) и эффекты вида
 * «Star Melee Weapon gains +2 Damage» попадают в `star.rules`.
 * Ограничения без триггера («Can only be thrown once per battle») —
 * в `constraints` предмета, не в Effect.
 */
export function parseAbilities(
  html: string,
  params: Record<string, string>,
  logger: Logger,
  itemName: string,
  hasStarCells: boolean,
): AbilitiesParseResult {
  const unparsed: UnparsedConstruct[] = [];
  const fromHtml = parseAbilityBlocksFromHtml(html);
  const blocks = fromHtml.length > 0 ? fromHtml : parseAbilityBlocksFromParams(params);

  const initial: Ability[] = [];
  const constraints: Constraint[] = [];
  const starRules: StarRule[] = [];

  for (const block of blocks) {
    const triggerInfo = parseTrigger(block.trigger);
    if (triggerInfo.trigger?.type === "raw") {
      logger.warn(
        "unparsed_trigger",
        `Триггер оставлен как raw: "${block.trigger}"`,
        itemName,
      );
      unparsed.push({
        kind: "trigger",
        raw: block.trigger ?? "",
        reason: "Формулировка триггера не совпала с известными Wiki-паттернами",
      });
    }

    const chanced = [];
    const blockConstraints: Constraint[] = [];
    for (const text of block.effectTexts) {
      const parsed = parseEffectPhrase(text);
      if (parsed.constraint) {
        if (parsed.constraint.type === "raw") {
          logger.warn("unknown_constraint", `Неизвестное ограничение: ${text}`, itemName);
          unparsed.push({ kind: "constraint", raw: text, reason: "Constraint не распознан" });
        }
        (block.trigger ? blockConstraints : constraints).push(parsed.constraint);
        continue;
      }
      for (const occ of parsed.effects) {
        if (occ.effect.type === "raw") {
          logger.warn("unknown_effect_structure", `Неизвестная структура эффекта: ${text}`, itemName);
          unparsed.push({
            kind: "effect",
            raw: text,
            reason: "Формулировка эффекта не совпала с известными Wiki-паттернами",
          });
        }
        chanced.push(occ);
      }
    }

    const ability: Ability = {
      trigger: triggerInfo.trigger,
      conditions: triggerInfo.conditions,
      effects: chanced,
      constraints: blockConstraints.length > 0 ? blockConstraints : undefined,
      rawText: block.rawText,
    };

    if (isStarRule(ability, block.trigger)) {
      starRules.push({
        trigger: ability.trigger,
        conditions: ability.conditions,
        effects: ability.effects,
        rawText: ability.rawText,
      });
    } else if (ability.effects.length > 0 || ability.trigger) {
      initial.push(ability);
    }
  }

  let star: StarData | null = null;
  if (starRules.length > 0) {
    star = { rules: starRules };
  }
  if (hasStarCells && starRules.length === 0) {
    logger.warn(
      "star_without_effects",
      "У предмета есть клетки Star, но нет Star-способности",
      itemName,
    );
  }
  if (!hasStarCells && starRules.length > 0) {
    logger.warn(
      "star_ability_without_tiles",
      "Найдена Star-способность, но в geometry нет клеток Star",
      itemName,
    );
  }

  return { initial, constraints, star, unparsed };
}

function isStarRule(ability: Ability, triggerText: string | null): boolean {
  const t = ability.trigger;
  if (t?.type === "on_star_activation" || t?.type === "on_star_occupant") return true;
  if (/\bstar\b/i.test(triggerText ?? "") && !/\bper star\b/i.test(triggerText ?? "")) return true;
  return ability.effects.some((occ) => {
    const e = occ.effect;
    if (e.type === "modify_stat" && e.applyTo?.includes("star_occupants")) return true;
    if (e.type === "gain" && e.applyTo?.includes("star_occupants") && !e.scale) return true;
    return false;
  });
}

export function parseAbilityBlocksFromHtml(html: string): RawAbilityBlock[] {
  const $ = cheerio.load(html);
  const section = headingSection($, "Initial_Abilities");
  if (section.length === 0) return [];

  const abilities: RawAbilityBlock[] = [];
  let current: RawAbilityBlock | null = null;

  section.each((_, node) => {
    const el = $(node);
    if (node.type !== "tag") return;
    const tag = node.tagName.toLowerCase();

    if (tag === "p") {
      const bold = el.find("b").first();
      const text = visibleText($, el);
      if (bold.length > 0) {
        if (current) abilities.push(current);
        const trigger = visibleText($, bold).replace(/:\s*$/, "").trim();
        current = { trigger, effectTexts: [], rawText: text };
      } else if (text && text !== "This item has no initial abilities") {
        if (current) abilities.push(current);
        current = null;
        abilities.push({ trigger: null, effectTexts: [text], rawText: text });
      }
      return;
    }

    if (tag === "ul") {
      const items = collectListItems($, el);
      if (current) {
        current.effectTexts.push(...items);
        current.rawText = [current.rawText, items.join("; ")].filter(Boolean).join(" ").trim();
      } else if (items.length > 0) {
        abilities.push({ trigger: null, effectTexts: items, rawText: items.join("; ") });
      }
    }
  });

  if (current) abilities.push(current);
  return abilities.filter((a) => a.trigger || a.effectTexts.length > 0);
}

export function parseAbilityBlocksFromParams(params: Record<string, string>): RawAbilityBlock[] {
  const abilities: RawAbilityBlock[] = [];
  for (let n = 1; n <= 5; n++) {
    const trigger = flattenWikitext(param(params, `ability${n}Trigger`));
    const effectTexts: string[] = [];
    for (let e = 1; e <= 7; e++) {
      const value = flattenWikitext(param(params, `ability${n}Effect${e}`));
      if (value) effectTexts.push(value);
    }
    if (!trigger && effectTexts.length === 0) continue;
    abilities.push({
      trigger: trigger || null,
      effectTexts,
      rawText: [trigger, ...effectTexts].filter(Boolean).join(": "),
    });
  }
  return abilities;
}

function collectListItems($: cheerio.CheerioAPI, ul: cheerio.Cheerio<AnyNode>): string[] {
  const items: string[] = [];
  ul.children("li").each((_, li) => {
    const text = visibleText($, $(li));
    if (text) items.push(text);
  });
  return items;
}
