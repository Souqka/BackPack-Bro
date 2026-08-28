import { describe, expect, it } from "vitest";
import { evaluateStarActivations } from "./activation.ts";
import { catalogFromItems } from "./inventory.ts";
import { occupantRule, testItem, universalStarRule } from "./test-item.ts";
import type { StarOverlap } from "./types.ts";

const overlap: StarOverlap = {
  sourceInstanceId: "src",
  targetInstanceId: "tgt",
  starPosition: { row: 0, col: 1 },
  targetCell: { row: 0, col: 1 },
};

function ids(): Map<string, string> {
  return new Map([
    ["src", "source"],
    ["tgt", "target"],
  ]);
}

describe("star activation", () => {
  it("star === null → no_star_data", () => {
    const source = testItem({ id: "source", geometry: { cells: [[0, 0]], stars: [[0, 1]] } });
    const target = testItem({ id: "target", types: ["melee_weapon"] });
    const result = evaluateStarActivations([overlap], ids(), catalogFromItems([source, target]));
    expect(result[0]).toMatchObject({ active: false, reason: "no_star_data" });
  });

  it("condition совпадает с target type", () => {
    const source = testItem({
      id: "source",
      star: { rules: [occupantRule(["melee_weapon"])] },
    });
    const target = testItem({ id: "target", types: ["melee_weapon", "accessory"] });
    const result = evaluateStarActivations([overlap], ids(), catalogFromItems([source, target]));
    expect(result[0]).toMatchObject({ active: true, reason: "active" });
  });

  it("condition не совпадает", () => {
    const source = testItem({
      id: "source",
      star: { rules: [occupantRule(["melee_weapon"])] },
    });
    const target = testItem({ id: "target", types: ["food"] });
    const result = evaluateStarActivations([overlap], ids(), catalogFromItems([source, target]));
    expect(result[0]).toMatchObject({ active: false, reason: "condition_not_met" });
  });

  it("несколько target types: достаточно одного совпадения (ИЛИ)", () => {
    const source = testItem({
      id: "source",
      star: { rules: [occupantRule(["melee_weapon", "ranged_weapon"])] },
    });
    const target = testItem({ id: "target", types: ["ranged_weapon"] });
    const result = evaluateStarActivations([overlap], ids(), catalogFromItems([source, target]));
    expect(result[0]?.active).toBe(true);
  });

  it("raw condition не активирует Star", () => {
    const source = testItem({
      id: "source",
      star: {
        rules: [
          {
            trigger: { type: "on_star_activation" },
            conditions: [{ type: "raw", raw: "only during Blood Moon" }],
            effects: [],
          },
        ],
      },
    });
    const target = testItem({ id: "target", types: ["melee_weapon"] });
    const result = evaluateStarActivations([overlap], ids(), catalogFromItems([source, target]));
    expect(result[0]).toMatchObject({ active: false, reason: "raw_condition" });
  });

  it("on_star_activation без type-condition → универсальная активация", () => {
    const source = testItem({
      id: "source",
      star: { rules: [universalStarRule()] },
    });
    const target = testItem({ id: "target", types: ["food"] });
    const result = evaluateStarActivations([overlap], ids(), catalogFromItems([source, target]));
    expect(result[0]).toMatchObject({ active: true, reason: "active" });
  });

  it("on_star_occupant без itemTypes (имя предмета Wiki) → unsupported_condition", () => {
    const source = testItem({
      id: "source",
      star: {
        rules: [
          {
            trigger: { type: "on_star_occupant", event: "hit" },
            conditions: [],
            effects: [],
          },
        ],
      },
    });
    const target = testItem({ id: "target", types: ["tool"] });
    const result = evaluateStarActivations([overlap], ids(), catalogFromItems([source, target]));
    expect(result[0]).toMatchObject({ active: false, reason: "unsupported_condition" });
  });

  it("occupantTypes на эффекте без Condition — проверка target type", () => {
    const source = testItem({
      id: "source",
      star: {
        rules: [
          {
            trigger: { type: "every_seconds", seconds: 3 },
            conditions: [],
            effects: [
              {
                effect: {
                  type: "modify_stat",
                  stat: "damage",
                  operation: "add",
                  value: 1,
                  unit: "flat",
                  applyTo: ["star_occupants"],
                  occupantTypes: ["rat"],
                },
              },
            ],
          },
        ],
      },
    });
    const rat = testItem({ id: "target", types: ["rat"] });
    const food = testItem({ id: "food", types: ["food"] });
    const hit = evaluateStarActivations(
      [overlap],
      ids(),
      catalogFromItems([source, rat]),
    );
    expect(hit[0]).toMatchObject({ active: true, reason: "active" });
    const miss = evaluateStarActivations(
      [{ ...overlap, targetInstanceId: "tgt" }],
      new Map([
        ["src", "source"],
        ["tgt", "food"],
      ]),
      catalogFromItems([source, food]),
    );
    expect(miss[0]).toMatchObject({ active: false, reason: "condition_not_met" });
  });

  it("opponent_has_status на этапе placement не вычисляется", () => {
    const source = testItem({
      id: "source",
      star: {
        rules: [
          {
            trigger: { type: "on_hit" },
            conditions: [{ type: "opponent_has_status", status: "bleed", present: true }],
            effects: [],
          },
        ],
      },
    });
    const target = testItem({ id: "target" });
    const result = evaluateStarActivations([overlap], ids(), catalogFromItems([source, target]));
    expect(result[0]).toMatchObject({ active: false, reason: "unsupported_condition" });
  });
});
