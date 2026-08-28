import type { ChancedEffect, Constraint, Effect, EffectScale, Status } from "../types/effects.ts";
import { extractItemTypes, matchStat, matchStatus } from "../utils/vocab.ts";

export interface EffectParseResult {
  effects: ChancedEffect[];
  constraint: Constraint | null;
  unparsed: boolean;
}

/**
 * Нормализовать одну Wiki-фразу эффекта.
 *
 * Вход: видимый текст после замены иконок («20% chance to gain 24 Armor»).
 * Выход: список ChancedEffect (вероятность — обёртка, не тип эффекта)
 * либо constraint, если фраза ограничивает использование предмета.
 *
 * Несколько «and»-фрагментов («Gain 3 Resist and 3 Max Health»)
 * разбиваются на отдельные Effect, если обе части распознаны.
 */
export function parseEffectPhrase(text: string): EffectParseResult {
  const raw = text.trim();
  if (!raw) {
    return { effects: [], constraint: null, unparsed: true };
  }

  const constraint = parseConstraintPhrase(raw);
  if (constraint && constraint.type !== "raw") {
    return { effects: [], constraint, unparsed: false };
  }

  const { chance, rest } = splitChance(raw);
  const { scale, rest: scaled } = splitScale(rest);

  const spendThen = scaled.match(/^use\s+(\d+(?:\.\d+)?)\s+(.+?)\s+to\s+(.+)$/i);
  if (spendThen) {
    const inner = parseEffectPhrase(spendThen[3] ?? "");
    const withChance = inner.effects.map((occ) => ({
      ...occ,
      chance: occ.chance ?? chance,
    }));
    const spendEffect: ChancedEffect = {
      ...(chance != null ? { chance } : {}),
      effect: {
        type: "spend",
        status: statusOrRaw(spendThen[2] ?? ""),
        value: Number(spendThen[1]),
        raw,
      },
    };
    return {
      effects: [spendEffect, ...withChance],
      constraint: null,
      unparsed: inner.unparsed,
    };
  }
  const pieces = splitAndClauses(scaled);
  const parsed: ChancedEffect[] = [];
  let anyRaw = false;

  for (const piece of pieces) {
    const effect = parseSingleEffect(piece, scale, raw);
    parsed.push({ ...(chance != null ? { chance } : {}), effect });
    if (effect.type === "raw") anyRaw = true;
  }

  if (parsed.length === 0) {
    return {
      effects: [{ ...(chance != null ? { chance } : {}), effect: { type: "raw", raw } }],
      constraint: null,
      unparsed: true,
    };
  }

  if (anyRaw && pieces.length > 1) {
    return {
      effects: [{ ...(chance != null ? { chance } : {}), effect: { type: "raw", raw } }],
      constraint: null,
      unparsed: true,
    };
  }

  return { effects: parsed, constraint: null, unparsed: anyRaw };
}

export function parseConstraintPhrase(text: string): Constraint | null {
  const raw = text.trim();

  const thrown = raw.match(/^can only be thrown once per battle$/i);
  if (thrown) return { type: "max_uses_per_battle", value: 1, raw };

  const usesLeft = raw.match(/^(\d+)\s+of\s+(\d+)\s+uses left$/i);
  if (usesLeft) {
    return {
      type: "remaining_uses",
      value: Number(usesLeft[1]),
      max: Number(usesLeft[2]),
      raw,
    };
  }
  if (/^one use left$/i.test(raw)) {
    return { type: "remaining_uses", value: 1, raw };
  }

  const qty = raw.match(/^quantity:\s*\(?(\d+)\s*\/\s*(\d+)\)?$/i);
  if (qty) {
    return { type: "quantity", current: Number(qty[1]), max: Number(qty[2]), raw };
  }

  const counts = raw.match(/^this counts as(?:\s+a)?\s+(\d+)?\s*(.+)$/i);
  if (counts) {
    return {
      type: "counts_as",
      name: (counts[2] ?? "").trim(),
      value: counts[1] ? Number(counts[1]) : 1,
      raw,
    };
  }

  const immune = raw.match(/^this is not affected by\s+(.+)$/i);
  if (immune) {
    const status = matchStatus(immune[1] ?? "");
    return { type: "immunity", status: status?.slug ?? (immune[1] ?? "").trim().toLowerCase(), raw };
  }

  return null;
}

function splitChance(text: string): { chance?: number; rest: string } {
  const m = text.match(/^(\d+(?:\.\d+)?)%\s+chance\s+to\s+(?:\:\s*)?(.*)$/i);
  if (!m) return { rest: text };
  return { chance: Number(m[1]), rest: (m[2] ?? "").trim() };
}

function splitScale(text: string): { scale?: EffectScale; rest: string } {
  const perStar = text.match(/^(.*?)\s+per\s+star\s+(.+)$/i);
  if (perStar) {
    const tail = (perStar[2] ?? "").trim();
    const { types } = extractItemTypes(tail);
    const rest = (perStar[1] ?? "").trim();
    if (/^items?$/i.test(tail) || types.length === 0) {
      return { scale: { per: "star_item" }, rest };
    }
    return { scale: { per: "star_occupant", itemTypes: types }, rest };
  }
  return { rest: text };
}

function splitAndClauses(text: string): string[] {
  if (/\band\b/i.test(text) && /gain|inflict|heal|steal|remove|cleanse/i.test(text)) {
    const parts = text.split(/\s+and\s+/i).map((p) => p.trim()).filter(Boolean);
    if (parts.length === 2 && looksLikeValueStatus(parts[1] ?? "")) {
      const first = parts[0] ?? "";
      const prefix = first.match(/^(gain|inflict|heal for|steal|remove|cleanse)\b/i)?.[1];
      if (prefix && !/^(gain|inflict|heal|steal|remove|cleanse)\b/i.test(parts[1] ?? "")) {
        return [first, `${prefix} ${parts[1]}`];
      }
      return parts;
    }
  }
  return [text];
}

function looksLikeValueStatus(text: string): boolean {
  return /^\+?\d+(?:\.\d+)?%?\s+\S+/.test(text.trim());
}

function parseSingleEffect(text: string, scale: EffectScale | undefined, raw: string): Effect {
  const t = text.trim();

  const spendThen = t.match(/^use\s+(\d+(?:\.\d+)?)\s+(.+?)\s+to\s+(.+)$/i);
  if (spendThen) {
    const status = statusOrRaw(spendThen[2] ?? "");
    const inner = parseSingleEffect(spendThen[3] ?? "", scale, raw);
    if (inner.type !== "raw") {
      return inner;
    }
    return {
      type: "spend",
      status,
      value: Number(spendThen[1]),
      raw,
    };
  }

  const starGains = t.match(/^star\s+(.+?)\s+gains?\s+\+?(\d+(?:\.\d+)?)(%?)\s+(.+)$/i);
  if (starGains) {
    const { types } = extractItemTypes(starGains[1] ?? "");
    const value = Number(starGains[2]);
    const percent = starGains[3] === "%";
    const what = (starGains[4] ?? "").trim();
    const stat = matchStat(what);
    const status = matchStatus(what);
    if (stat) {
      return {
        type: "modify_stat",
        stat: stat.slug,
        operation: "add",
        value,
        unit: percent ? "percent" : "flat",
        applyTo: ["star_occupants"],
        occupantTypes: types.length > 0 ? types : undefined,
        raw,
      };
    }
    if (status) {
      return {
        type: "gain",
        status: status.slug,
        value,
        applyTo: ["star_occupants"],
        raw,
      };
    }
  }

  const thisAndStar = t.match(/^this and star items gain\s+(\d+(?:\.\d+)?)\s+(.+)$/i);
  if (thisAndStar) {
    return {
      type: "gain",
      status: statusOrRaw(thisAndStar[2] ?? ""),
      value: Number(thisAndStar[1]),
      applyTo: ["self", "star_occupants"],
      raw,
    };
  }

  const reduceTaken = t.match(/^reduce\s+(.+?)\s+taken by\s+(\d+(?:\.\d+)?)(%?)(?:\s+for\s+(\d+(?:\.\d+)?)\s+seconds)?$/i);
  if (reduceTaken) {
    const whatRaw = (reduceTaken[1] ?? "").trim().toLowerCase();
    const what =
      whatRaw === "damage"
        ? "damage_taken"
        : whatRaw === "crit damage"
          ? "crit_damage_taken"
          : null;
    if (what) {
      return {
        type: "reduce",
        what,
        value: Number(reduceTaken[2]),
        unit: reduceTaken[3] === "%" ? "percent" : "flat",
        durationSeconds: reduceTaken[4] ? Number(reduceTaken[4]) : undefined,
        raw,
      };
    }
  }

  const reduceStun = t.match(/^reduce stun duration by\s+(\d+(?:\.\d+)?)%$/i);
  if (reduceStun) {
    return { type: "reduce", what: "stun_duration", value: Number(reduceStun[1]), unit: "percent", raw };
  }

  const reduceCd = t.match(/^reduce cooldown by\s+(\d+(?:\.\d+)?)\s+seconds?$/i);
  if (reduceCd) {
    return { type: "reduce", what: "cooldown", value: Number(reduceCd[1]), unit: "flat", raw };
  }

  const heal = t.match(/^heal(?:\s+for)?\s+(\d+(?:\.\d+)?)\s+health$/i);
  if (heal) {
    return { type: "heal", value: Number(heal[1]), scale, raw };
  }

  const deal = t.match(/^deal\s+(\d+(?:\.\d+)?)\s+damage$/i);
  if (deal) {
    return { type: "deal_damage", value: Number(deal[1]), scale, raw };
  }

  const block = t.match(/^block\s+(\d+(?:\.\d+)?)\s+damage$/i);
  if (block) {
    return { type: "block_damage", value: Number(block[1]), raw };
  }

  const extra = t.match(/^trigger an extra attack$|^trigger an attack$|^trigger a free attack$/i);
  if (extra) {
    return { type: "extra_attack", raw };
  }

  const stunItem = t.match(/^stun(?:\s+an)?(?:\s+(\d+))?\s*enemy item(?:s)?\s+for\s+(\d+(?:\.\d+)?)\s+seconds?$/i);
  if (stunItem) {
    return { type: "stun", seconds: Number(stunItem[2]), target: "enemy_item", raw };
  }

  const inflictStun = t.match(/^inflict stun for\s+(\d+(?:\.\d+)?)\s+seconds?$/i);
  if (inflictStun) {
    return { type: "stun", seconds: Number(inflictStun[1]), raw };
  }

  const cleanse = t.match(/^cleanse\s+(\d+(?:\.\d+)?)\s+(.+)$/i);
  if (cleanse) {
    return { type: "cleanse", status: statusOrRaw(cleanse[2] ?? ""), value: Number(cleanse[1]), scale, raw };
  }

  const remove = t.match(/^remove\s+(\d+(?:\.\d+)?)\s+(.+)$/i);
  if (remove) {
    return { type: "remove", status: statusOrRaw(remove[2] ?? ""), value: Number(remove[1]), raw };
  }

  const steal = t.match(/^steal\s+(\d+(?:\.\d+)?)\s+(.+)$/i);
  if (steal) {
    return {
      type: "steal",
      status: statusOrRaw((steal[2] ?? "").replace(/\s+from opponent$/i, "")),
      value: Number(steal[1]),
      raw,
    };
  }

  const inflict = t.match(/^inflict\s+(\d+(?:\.\d+)?)?\s*(.+)$/i);
  if (inflict && !/^inflicted\b/i.test(t)) {
    const value = inflict[1] ? Number(inflict[1]) : 1;
    let rest = (inflict[2] ?? "").trim();
    let target: InflictTarget | undefined;
    let durationSeconds: number | undefined;
    const both = rest.match(/^(.*?)\s+on both players$/i);
    if (both) {
      rest = (both[1] ?? "").trim();
      target = "both";
    }
    const dur = rest.match(/^(.*?)\s+for\s+(\d+(?:\.\d+)?)\s+seconds$/i);
    if (dur) {
      rest = (dur[1] ?? "").trim();
      durationSeconds = Number(dur[2]);
    }
    if (/^stun\b/i.test(rest) && durationSeconds != null) {
      return { type: "stun", seconds: durationSeconds, raw };
    }
    return {
      type: "inflict",
      status: statusOrRaw(rest),
      value,
      durationSeconds,
      target,
      scale,
      raw,
    };
  }

  const gain = t.match(/^gain\s+\+?(\d+(?:\.\d+)?)(%?)\s+(.+)$/i);
  if (gain) {
    const value = Number(gain[1]);
    const percent = gain[2] === "%";
    let rest = (gain[3] ?? "").trim();
    let durationSeconds: number | undefined;
    const dur = rest.match(/^(.*?)\s+for\s+(\d+(?:\.\d+)?)\s+seconds$/i);
    if (dur) {
      rest = (dur[1] ?? "").trim();
      durationSeconds = Number(dur[2]);
    }
    const minMax = rest.match(/^(?:min|max)\s+(.*)$/i);
    if (minMax) rest = (minMax[1] ?? "").trim();
    const stat = matchStat(rest);
    if (stat) {
      return {
        type: "modify_stat",
        stat: stat.slug,
        operation: "add",
        value,
        unit: percent ? "percent" : "flat",
        scale,
        raw,
      };
    }
    return {
      type: "gain",
      status: statusOrRaw(rest),
      value,
      durationSeconds,
      scale,
      raw,
    };
  }

  const fasterEvery = t.match(
    /^\+?(\d+(?:\.\d+)?)%\s+faster(?:\s+attacks|\s+activations)?\s+for every star\s+(.+)$/i,
  );
  if (fasterEvery) {
    const { types } = extractItemTypes(fasterEvery[2] ?? "");
    return {
      type: "modify_stat",
      stat: /activation/i.test(t) ? "activation_speed" : "attack_speed",
      operation: "add",
      value: Number(fasterEvery[1]),
      unit: "percent",
      scale: {
        per: types.length > 0 ? "star_occupant" : "star_item",
        itemTypes: types.length > 0 ? types : undefined,
      },
      raw,
    };
  }

  const faster = t.match(/^\+?(\d+(?:\.\d+)?)%\s+faster(?:\s+attacks|\s+activations)?$/i);
  if (faster) {
    return {
      type: "modify_stat",
      stat: /activation/i.test(t) ? "activation_speed" : "attack_speed",
      operation: "add",
      value: Number(faster[1]),
      unit: "percent",
      scale,
      raw,
    };
  }

  const starItemsGain = t.match(/^star items gain\s+(\d+(?:\.\d+)?)\s+(.+)$/i);
  if (starItemsGain) {
    return {
      type: "gain",
      status: statusOrRaw(starItemsGain[2] ?? ""),
      value: Number(starItemsGain[1]),
      applyTo: ["star_occupants"],
      raw,
    };
  }

  const increase = t.match(
    /^increase\s+(.+?)\s+by\s+(\d+(?:\.\d+)?)(%?)(?:\s+for\s+(\d+(?:\.\d+)?)\s+seconds)?$/i,
  );
  if (increase) {
    const stat = matchStat(increase[1] ?? "");
    if (stat) {
      return {
        type: "modify_stat",
        stat: stat.slug,
        operation: "add",
        value: Number(increase[2]),
        unit: increase[3] === "%" ? "percent" : "flat",
        durationSeconds: increase[4] ? Number(increase[4]) : undefined,
        scale,
        raw,
      };
    }
  }

  const lose = t.match(/^lose\s+(\d+(?:\.\d+)?)\s+(.+)$/i);
  if (lose) {
    return { type: "lose", status: statusOrRaw(lose[2] ?? ""), value: Number(lose[1]), raw };
  }

  const requireLess = t.match(/^(?:this\s+)?requires?\s+(\d+)\s+less\s+(.+?)\s+to activate$/i);
  if (requireLess) {
    return {
      type: "reduce",
      what: "hits_required",
      value: Number(requireLess[1]),
      unit: "flat",
      raw,
    };
  }

  const drain = t.match(/^drain\s+(\d+(?:\.\d+)?)\s+(.+)$/i);
  if (drain) {
    return { type: "remove", status: statusOrRaw(drain[2] ?? ""), value: Number(drain[1]), raw };
  }

  const trapSoul = t.match(/^trap\s+(\d+(?:\.\d+)?)\s+soul$/i);
  if (trapSoul) {
    return { type: "special", id: "trap_soul", value: Number(trapSoul[1]), raw };
  }

  const bloom = t.match(/^star\s+bloomers?\s+bloom for\s+(\d+(?:\.\d+)?)\s+seconds$/i);
  if (bloom) {
    return { type: "special", id: "star_bloomer_bloom", raw };
  }

  const specials: Array<[RegExp, string]> = [
    [/^go mining\b/i, "go_mining"],
    [/^go fishing\b/i, "go_fishing"],
    [/^open this$/i, "open_this"],
    [/^destroy this$/i, "destroy_this"],
    [/^this hatches$/i, "hatches"],
    [/^activate absorbed items$/i, "activate_absorbed_items"],
    [/^activate bleed$/i, "activate_bleed"],
    [/^activate poison$/i, "activate_poison"],
    [/^activate regeneration$/i, "activate_regeneration"],
    [/^break \d+ star rock\b/i, "break_star_rock"],
    [/^break \d+ star ore\b/i, "break_star_ore"],
  ];
  for (const [re, id] of specials) {
    if (re.test(t)) return { type: "special", id, raw };
  }

  return { type: "raw", raw };
}

type InflictTarget = NonNullable<import("../types/effects.ts").InflictEffect["target"]>;

function statusOrRaw(text: string): Status {
  const hit = matchStatus(text);
  if (hit && hit.rest === "") return hit.slug;
  if (hit) return hit.slug;
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
