import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import type { Ability, StarActivation, StarData } from "../types/normalized.ts";
import type { TemplateParams, UnparsedConstruct } from "../types/raw.ts";
import { headingSection, visibleText } from "../utils/html.ts";
import type { Logger } from "../utils/logger.ts";
import { flattenWikitext, param } from "../utils/wikitext.ts";

export interface AbilitiesParseResult {
  initial: Ability[];
  star: StarData | null;
  unparsed: UnparsedConstruct[];
}

const STAR_TRIGGER = /\bstar\b/i;

/**
 * Split Wiki "Initial Abilities" into item abilities vs Star effects.
 *
 * Item abilities and Star effects are stored separately and are not mixed
 * with Level Up Bonus rows (those live in `levels.ts`).
 *
 * A block is treated as a Star effect when its trigger mentions Star
 * (`When Star item activates`, `On Star activation`). Effects that only
 * *mention* stars (`per Star item`) stay on the item ability.
 *
 * Effect objects are lightly structured when the sentence is a simple
 * chance/gain pattern. Everything else is `{ raw }` plus a warning so the
 * original Wiki text is never dropped.
 */
export function parseAbilities(
  html: string,
  params: TemplateParams,
  logger: Logger,
  itemName: string,
  hasStarCells: boolean,
): AbilitiesParseResult {
  const unparsed: UnparsedConstruct[] = [];
  const fromHtml = parseAbilitiesFromHtml(html);
  const abilities = fromHtml.length > 0 ? fromHtml : parseAbilitiesFromParams(params);

  const initial: Ability[] = [];
  const starEffects: unknown[] = [];
  const starTriggers: string[] = [];

  for (const ability of abilities) {
    const trigger = ability.trigger ?? "";
    const isStarAbility = STAR_TRIGGER.test(trigger);
    const structured = {
      ...ability,
      effects: ability.effects.map((effect) =>
        normalizeEffect(effect, logger, itemName, unparsed),
      ),
    };

    if (isStarAbility) {
      starTriggers.push(trigger);
      starEffects.push(
        ...structured.effects.map((effect) =>
          typeof effect === "object" && effect !== null
            ? { ...effect, trigger }
            : { raw: effect, trigger },
        ),
      );
    } else {
      initial.push(structured);
    }
  }

  let star: StarData | null = null;
  if (hasStarCells || starEffects.length > 0) {
    const activation = parseStarActivation(starTriggers, logger, itemName, unparsed);
    star = { activation, effects: starEffects };
    if (hasStarCells && starEffects.length === 0) {
      logger.warn(
        "star_without_effects",
        "Item has Star tiles but no Star-triggered ability text",
        itemName,
      );
    }
    if (!hasStarCells && starEffects.length > 0) {
      logger.warn(
        "star_ability_without_tiles",
        "Star-triggered ability found but geometry has no Star tiles",
        itemName,
      );
    }
  }

  return { initial, star, unparsed };
}

export function parseAbilitiesFromHtml(html: string): Ability[] {
  const $ = cheerio.load(html);
  const section = headingSection($, "Initial_Abilities");
  if (section.length === 0) return [];

  const abilities: Ability[] = [];
  let current: Ability | null = null;

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
        current = { trigger, effects: [], rawText: text };
      } else if (text && text !== "This item has no initial abilities") {
        // Template:Initial_abilities renders triggerless blocks as a bare <p>.
        // Do not attach them to the previous triggered ability.
        if (current) abilities.push(current);
        current = null;
        abilities.push({ trigger: null, effects: [text], rawText: text });
      }
      return;
    }

    if (tag === "ul") {
      const items = collectListItems($, el);
      if (current) {
        current.effects.push(...items);
        current.rawText = joinRaw(current.rawText, items.join("; "));
      } else if (items.length > 0) {
        abilities.push({ trigger: null, effects: items, rawText: items.join("; ") });
      }
    }
  });

  if (current) abilities.push(current);
  return abilities.filter((a) => (a.trigger && a.trigger.length > 0) || a.effects.length > 0);
}

export function parseAbilitiesFromParams(params: TemplateParams): Ability[] {
  const abilities: Ability[] = [];
  for (let n = 1; n <= 5; n++) {
    const trigger = flattenWikitext(param(params, `ability${n}Trigger`));
    const effects: string[] = [];
    for (let e = 1; e <= 7; e++) {
      const value = flattenWikitext(param(params, `ability${n}Effect${e}`));
      if (value) effects.push(value);
    }
    if (!trigger && effects.length === 0) continue;
    abilities.push({
      trigger: trigger || null,
      effects,
      rawText: [trigger, ...effects].filter(Boolean).join(": "),
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

function joinRaw(prefix: string | undefined, extra: string): string {
  return [prefix, extra].filter(Boolean).join(" ").trim();
}

/**
 * Conservative effect normalizer. Unknown sentences become `{ raw }` so later
 * stages can design a real Effect DSL from actual Wiki phrasing.
 */
export function normalizeEffect(
  effect: unknown,
  logger: Logger,
  itemName: string,
  unparsed: UnparsedConstruct[],
): unknown {
  if (typeof effect !== "string") return effect;
  const text = effect.trim();
  if (!text) return { raw: text };

  const chanceGain = text.match(
    /^(\d+(?:\.\d+)?)%\s+chance\s+to\s+gain\s+(\d+(?:\.\d+)?)\s+(.+)$/i,
  );
  if (chanceGain) {
    return {
      chancePercent: Number(chanceGain[1]),
      verb: "gain",
      amount: Number(chanceGain[2]),
      status: slugStatus(chanceGain[3] ?? ""),
      raw: text,
    };
  }

  const chance = text.match(/^(\d+(?:\.\d+)?)%\s+chance\s+to\s+(.+)$/i);
  if (chance) {
    unparsed.push({
      kind: "effect",
      raw: text,
      reason: "Chance effect is not a simple 'gain N status' pattern",
    });
    logger.warn("unknown_effect_structure", `Unknown effect structure: ${text}`, itemName);
    return { chancePercent: Number(chance[1]), remainder: chance[2], raw: text };
  }

  const gain = text.match(/^gain\s+\+?(\d+(?:\.\d+)?)%?\s+(.+)$/i);
  if (gain) {
    return {
      verb: "gain",
      amount: Number(gain[1]),
      status: slugStatus(gain[2] ?? ""),
      raw: text,
    };
  }

  unparsed.push({
    kind: "effect",
    raw: text,
    reason: "No reliable effect pattern matched",
  });
  logger.warn("unknown_effect_structure", `Unknown effect structure: ${text}`, itemName);
  return { raw: text };
}

function slugStatus(raw: string): string {
  return raw
    .replace(/\s+per\s+.+$/i, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Star activation is extracted from trigger text only. If the Wiki does not
 * name a target item type, `activation.raw` keeps the original sentence.
 */
export function parseStarActivation(
  triggers: string[],
  logger: Logger,
  itemName: string,
  unparsed: UnparsedConstruct[],
): StarActivation {
  if (triggers.length === 0) {
    return {};
  }

  const raw = unique(triggers).join("; ");
  const types: string[] = [];
  const typeMatch = raw.match(
    /(?:on|when(?:\s+this)?(?:\s+star)?(?:\s+is)?(?:\s+on|adjacent(?:\s+to)?)?)\s+(?:an?\s+)?([a-z][a-z ]+?)\s+type/i,
  );
  if (typeMatch?.[1]) {
    types.push(
      typeMatch[1]
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_"),
    );
  }

  if (types.length > 0) {
    return { raw, trigger: raw, target: { types } };
  }

  unparsed.push({
    kind: "star_activation",
    raw,
    reason: "Star trigger has no structured target type in Wiki text",
  });
  logger.warn(
    "unparsed_star_activation",
    `Star activation kept as raw: "${raw}"`,
    itemName,
  );
  return { raw, trigger: raw };
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
