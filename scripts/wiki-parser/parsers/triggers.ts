import type { Condition, StarOccupantEvent, TimePhase, Trigger } from "../types/effects.ts";
import { extractItemTypes, matchStatus } from "../utils/vocab.ts";
import { correctWikiTypos } from "../utils/vocab.ts";

export interface TriggerParseResult {
  trigger: Trigger | null;
  conditions: Condition[];
}

const PHASES: TimePhase[] = ["dawn", "day", "dusk", "night"];

/**
 * Разобрать Wiki-триггер в discriminated union.
 *
 * «When Star item activates» и «On Star activation» считаются одним
 * событием `on_star_activation`: Star совпала с клеткой другого Item.
 * «On Star Melee Weapon hit» — событие occupant'а, не удар самого предмета.
 */
export function parseTrigger(text: string | null | undefined): TriggerParseResult {
  if (!text) return { trigger: null, conditions: [] };
  const raw = correctWikiTypos(text).trim().replace(/:\s*$/, "");
  if (!raw) return { trigger: null, conditions: [] };

  const compound = raw.match(/^(start of dawn)\s+and\s+(every\s+[\d.]+\s+seconds)$/i);
  if (compound) {
    const a = parseTrigger(compound[1]);
    const b = parseTrigger(compound[2]);
    if (a.trigger && b.trigger && a.trigger.type !== "raw" && b.trigger.type !== "raw") {
      return { trigger: { type: "compound", any: [a.trigger, b.trigger] }, conditions: [] };
    }
  }

  const parsed = parseSingleTrigger(raw);
  return parsed;
}

function parseSingleTrigger(raw: string): TriggerParseResult {
  if (/^on hit$/i.test(raw)) return { trigger: { type: "on_hit" }, conditions: [] };

  const onHitIf = raw.match(/^on hit if opponent has (no\s+)?(.+)$/i);
  if (onHitIf) {
    const status = matchStatus(onHitIf[2] ?? "")?.slug ?? slugish(onHitIf[2] ?? "");
    return {
      trigger: { type: "on_hit" },
      conditions: [{ type: "opponent_has_status", status, present: !onHitIf[1] }],
    };
  }

  if (/^on critical hit$/i.test(raw) || /^when you critically hit$/i.test(raw)) {
    return { trigger: { type: "on_critical_hit" }, conditions: [] };
  }

  if (
    /^when star item activates$/i.test(raw) ||
    /^on star item activations?$/i.test(raw) ||
    /^on star activation$/i.test(raw)
  ) {
    return { trigger: { type: "on_star_activation" }, conditions: [] };
  }

  const starOcc = parseStarOccupantTrigger(raw);
  if (starOcc) return starOcc;

  const startPhases = raw.match(/^start of\s+(.+)$/i);
  if (startPhases) {
    const phases = parsePhases(startPhases[1] ?? "");
    if (phases.length > 0) return { trigger: { type: "start_of_phase", phases }, conditions: [] };
  }

  const during = raw.match(/^during\s+(.+)$/i);
  if (during) {
    const phases = parsePhases(during[1] ?? "");
    if (phases.length > 0) return { trigger: { type: "during_phase", phases }, conditions: [] };
  }

  if (/^when time of day changes$/i.test(raw)) {
    return { trigger: { type: "on_time_of_day_change" }, conditions: [] };
  }

  const shop = raw.match(/^on(?:\s+(\d+))?\s+shops? entered/i);
  if (shop) {
    return {
      trigger: { type: "on_shop_entered", count: shop[1] ? Number(shop[1]) : undefined },
      conditions: [],
    };
  }

  const everySec = raw.match(/^every\s+(\d+(?:\.\d+)?)\s+seconds?$/i);
  if (everySec) {
    return { trigger: { type: "every_seconds", seconds: Number(everySec[1]) }, conditions: [] };
  }

  const afterSec = raw.match(/^after\s+(\d+(?:\.\d+)?)\s+seconds?$/i);
  if (afterSec) {
    return { trigger: { type: "after_seconds", seconds: Number(afterSec[1]) }, conditions: [] };
  }

  const whenHit = raw.match(/^when hit(?:\s+(\d+)\s+times)?\s*(?:\((.+)\))?$/i);
  if (whenHit) {
    const sourceTypes = whenHit[2] ? extractItemTypes(whenHit[2]).types : undefined;
    return {
      trigger: {
        type: "when_hit",
        sourceTypes: sourceTypes && sourceTypes.length > 0 ? sourceTypes : undefined,
        times: whenHit[1] ? Number(whenHit[1]) : undefined,
      },
      conditions: [],
    };
  }

  const whenCritHit = raw.match(/^when critically hit\s*(?:\((.+)\))?$/i);
  if (whenCritHit) {
    const sourceTypes = whenCritHit[1] ? extractItemTypes(whenCritHit[1]).types : undefined;
    return {
      trigger: {
        type: "when_critically_hit",
        sourceTypes: sourceTypes && sourceTypes.length > 0 ? sourceTypes : undefined,
      },
      conditions: [],
    };
  }

  const health = raw.match(/^health below\s+(\d+)%$/i);
  if (health) {
    return { trigger: { type: "health_below", percent: Number(health[1]) }, conditions: [] };
  }

  if (/^while equipped$/i.test(raw)) return { trigger: { type: "while_equipped" }, conditions: [] };
  if (/^while this blooms$/i.test(raw)) return { trigger: { type: "while_blooms" }, conditions: [] };
  if (/^when this(?: item)? activates$/i.test(raw)) {
    return { trigger: { type: "on_self_activation" }, conditions: [] };
  }
  if (/^when blocking damage$/i.test(raw)) {
    return { trigger: { type: "on_block" }, conditions: [] };
  }
  if (/^on stun$/i.test(raw) || /^when you get stun$/i.test(raw)) {
    return { trigger: { type: "on_stun" }, conditions: [] };
  }
  if (/^out of stamina$/i.test(raw)) return { trigger: { type: "out_of_stamina" }, conditions: [] };
  if (/^when consumed$/i.test(raw)) return { trigger: { type: "when_consumed" }, conditions: [] };

  const discharge = raw.match(/^discharge\s*\((\d+)\s*static\s*\)$/i);
  if (discharge) {
    return { trigger: { type: "discharge", staticAmount: Number(discharge[1]) }, conditions: [] };
  }

  const perStatus = raw.match(/^per\s+(.+?)\s+on\s+(opponent|you|both players combined)$/i);
  if (perStatus) {
    const status = matchStatus(perStatus[1] ?? "")?.slug ?? slugish(perStatus[1] ?? "");
    const subjectRaw = (perStatus[2] ?? "opponent").toLowerCase();
    const subject =
      subjectRaw.startsWith("both") ? "both_combined" : subjectRaw === "you" ? "self" : "opponent";
    return { trigger: { type: "per_status", status, subject }, conditions: [] };
  }

  const perSoul = raw.match(/^per soul trapped$/i);
  if (perSoul) {
    return { trigger: { type: "per_status", status: "soul", subject: "self" }, conditions: [] };
  }

  return { trigger: { type: "raw", raw }, conditions: [] };
}

function parseStarOccupantTrigger(raw: string): TriggerParseResult | null {
  const m = raw.match(/^on star\s+(.+)$/i);
  if (!m) return null;
  const rest = (m[1] ?? "").trim();

  const eventMap: Array<[RegExp, StarOccupantEvent]> = [
    [/critical hit$/i, "critical_hit"],
    [/inflicting stun$/i, "inflict_stun"],
    [/consumed$/i, "consumed"],
    [/activations?$/i, "activation"],
    [/\buse$/i, "use"],
    [/\bhit$/i, "hit"],
  ];

  for (const [re, event] of eventMap) {
    if (!re.test(rest)) continue;
    const typePart = rest.replace(re, "").trim();
    if (/^items?$/i.test(typePart)) {
      return { trigger: { type: "on_star_occupant", event }, conditions: [] };
    }
    const { types } = extractItemTypes(typePart);
    const conditions: Condition[] =
      types.length > 0 ? [{ type: "star_occupant_type", itemTypes: types }] : [];
    return {
      trigger: { type: "on_star_occupant", event, itemTypes: types.length > 0 ? types : undefined },
      conditions,
    };
  }
  return null;
}

function parsePhases(text: string): TimePhase[] {
  const found: TimePhase[] = [];
  const lower = text.toLowerCase();
  for (const phase of PHASES) {
    if (lower.includes(phase)) found.push(phase);
  }
  return found;
}

function slugish(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
