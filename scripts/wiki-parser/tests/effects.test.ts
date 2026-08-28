import { describe, expect, it } from "vitest";
import { parseConstraintPhrase, parseEffectPhrase } from "../parsers/effects.ts";
import { parseTrigger } from "../parsers/triggers.ts";

describe("Effect", () => {
  it("нормализует Gain 20 Armor", () => {
    const result = parseEffectPhrase("Gain 20 Armor");
    expect(result.unparsed).toBe(false);
    expect(result.effects).toEqual([
      {
        effect: { type: "gain", status: "armor", value: 20, raw: "Gain 20 Armor" },
      },
    ]);
  });

  it("оборачивает вероятность вокруг того же Gain", () => {
    const result = parseEffectPhrase("20% chance to gain 24 Armor");
    expect(result.effects[0]?.chance).toBe(20);
    expect(result.effects[0]?.effect).toMatchObject({
      type: "gain",
      status: "armor",
      value: 24,
    });
  });

  it("нормализует Inflict 2 Bleed", () => {
    const result = parseEffectPhrase("Inflict 2 Bleed");
    expect(result.effects[0]?.effect).toMatchObject({
      type: "inflict",
      status: "bleed",
      value: 2,
    });
  });

  it("нормализует Reduce Damage taken by 18%", () => {
    const result = parseEffectPhrase("Reduce Damage taken by 18%");
    expect(result.effects[0]?.effect).toMatchObject({
      type: "reduce",
      what: "damage_taken",
      value: 18,
      unit: "percent",
    });
  });

  it("нормализует Star Melee Weapon Type gains +2 Damage", () => {
    const result = parseEffectPhrase("Star Melee Weapon Type gains +2 Damage");
    expect(result.effects[0]?.effect).toMatchObject({
      type: "modify_stat",
      stat: "damage",
      operation: "add",
      value: 2,
      unit: "flat",
      applyTo: ["star_occupants"],
      occupantTypes: ["melee_weapon"],
    });
  });

  it("нормализует Lose N Max Health и Star items gain", () => {
    const lose = parseEffectPhrase("Lose 3 Max Health");
    expect(lose.effects[0]?.effect).toMatchObject({
      type: "lose",
      status: "max_health",
      value: 3,
    });
    const starGain = parseEffectPhrase("Star items gain 4 Static");
    expect(starGain.effects[0]?.effect).toMatchObject({
      type: "gain",
      status: "static",
      value: 4,
      applyTo: ["star_occupants"],
    });
  });

  it("оставляет неизвестную фразу как raw", () => {
    const result = parseEffectPhrase("Moonlight reverses the backpack");
    expect(result.unparsed).toBe(true);
    expect(result.effects[0]?.effect).toEqual({
      type: "raw",
      raw: "Moonlight reverses the backpack",
    });
  });
});

describe("Constraint", () => {
  it("нормализует Can only be thrown once per battle", () => {
    expect(parseConstraintPhrase("Can only be thrown once per battle")).toEqual({
      type: "max_uses_per_battle",
      value: 1,
      raw: "Can only be thrown once per battle",
    });
  });
});

describe("Trigger", () => {
  it("сливает On Star activation и When Star item activates", () => {
    expect(parseTrigger("On Star activation").trigger).toEqual({ type: "on_star_activation" });
    expect(parseTrigger("When Star item activates").trigger).toEqual({ type: "on_star_activation" });
    expect(parseTrigger("On Star item activation").trigger).toEqual({ type: "on_star_activation" });
  });

  it("разбирает When this activates как on_self_activation", () => {
    expect(parseTrigger("When this activates").trigger).toEqual({ type: "on_self_activation" });
    expect(parseTrigger("When this item activates").trigger).toEqual({ type: "on_self_activation" });
  });

  it("разбирает On hit и Start of Dawn", () => {
    expect(parseTrigger("On hit").trigger).toEqual({ type: "on_hit" });
    expect(parseTrigger("Start of Dawn").trigger).toEqual({
      type: "start_of_phase",
      phases: ["dawn"],
    });
  });

  it("разбирает On Star Melee Weapon hit как occupant-событие", () => {
    const result = parseTrigger("On Star Melee Weapon hit");
    expect(result.trigger).toMatchObject({
      type: "on_star_occupant",
      event: "hit",
      itemTypes: ["melee_weapon"],
    });
    expect(result.conditions).toEqual([
      { type: "star_occupant_type", itemTypes: ["melee_weapon"] },
    ]);
  });

  it("разбирает When opponent heals", () => {
    expect(parseTrigger("When opponent heals").trigger).toEqual({ type: "when_opponent_heals" });
  });

  it("оставляет неизвестный триггер как raw", () => {
    expect(parseTrigger("Call of the Void").trigger).toEqual({
      type: "raw",
      raw: "Call of the Void",
    });
  });
});
