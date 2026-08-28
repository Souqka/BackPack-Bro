/**
 * Строгая модель игровых механик Backpack Brawl.
 *
 * Типы собраны по полному корпусу Wiki (912 предметов, шаблон {{Item}}).
 * Неизвестные формулировки не отбрасываются — они становятся `{ type: "raw" }`.
 */

import type { KnownStatSlug, KnownStatusSlug } from "../constants.ts";

export type TimePhase = "dawn" | "day" | "dusk" | "night";

export type Subject = "self" | "opponent" | "both" | "both_combined";

/**
 * Известные статусы из корпуса Wiki. Неизвестное имя не ломает parser:
 * оно остаётся произвольной строкой.
 */
export type KnownStatus = KnownStatusSlug;
export type Status = KnownStatus | (string & {});

/** Боевые характеристики из корпуса Wiki. */
export type KnownStat = KnownStatSlug;
export type Stat = KnownStat | (string & {});

export type EffectUnit = "flat" | "percent";

export type StatOperation = "add" | "multiply";

/**
 * Масштаб «per Star …» / «per Bleed on opponent».
 * Это не Trigger: величина эффекта зависит от числа совпадений.
 */
export interface EffectScale {
  per: "star_occupant" | "star_item" | "status";
  itemTypes?: string[];
  status?: Status;
  subject?: Subject;
}

export interface GainEffect {
  type: "gain";
  status: Status;
  value: number;
  durationSeconds?: number;
  scale?: EffectScale;
  applyTo?: Array<"self" | "star_occupants">;
  raw?: string;
}

export interface InflictEffect {
  type: "inflict";
  status: Status;
  value: number;
  durationSeconds?: number;
  target?: Subject;
  scale?: EffectScale;
  raw?: string;
}

export interface HealEffect {
  type: "heal";
  value: number;
  scale?: EffectScale;
  raw?: string;
}

export interface DealDamageEffect {
  type: "deal_damage";
  value: number;
  scale?: EffectScale;
  raw?: string;
}

export interface ModifyStatEffect {
  type: "modify_stat";
  stat: Stat;
  operation: StatOperation;
  value: number;
  unit: EffectUnit;
  durationSeconds?: number;
  scale?: EffectScale;
  applyTo?: Array<"self" | "star_occupants">;
  occupantTypes?: string[];
  raw?: string;
}

export interface ReduceEffect {
  type: "reduce";
  what: "damage_taken" | "crit_damage_taken" | "stun_duration" | "cooldown" | "hits_required";
  value: number;
  unit: EffectUnit;
  durationSeconds?: number;
  raw?: string;
}

export interface CleanseEffect {
  type: "cleanse";
  status: Status;
  value: number;
  scale?: EffectScale;
  raw?: string;
}

export interface RemoveEffect {
  type: "remove";
  status: Status;
  value: number;
  raw?: string;
}

export interface StealEffect {
  type: "steal";
  status: Status;
  value: number;
  raw?: string;
}

export interface SpendEffect {
  type: "spend";
  status: Status;
  value: number;
  raw?: string;
}

export interface BlockDamageEffect {
  type: "block_damage";
  value: number;
  raw?: string;
}

export interface StunEffect {
  type: "stun";
  seconds: number;
  target?: "enemy_item" | "attacking_item" | "opponent";
  raw?: string;
}

export interface ExtraAttackEffect {
  type: "extra_attack";
  raw?: string;
}

export interface LoseEffect {
  type: "lose";
  status: Status;
  value: number;
  raw?: string;
}

export interface SpecialEffect {
  type: "special";
  id: string;
  value?: number;
  raw: string;
}

export interface RawEffect {
  type: "raw";
  raw: string;
}

export type Effect =
  | GainEffect
  | InflictEffect
  | HealEffect
  | DealDamageEffect
  | ModifyStatEffect
  | ReduceEffect
  | CleanseEffect
  | RemoveEffect
  | StealEffect
  | SpendEffect
  | BlockDamageEffect
  | StunEffect
  | ExtraAttackEffect
  | LoseEffect
  | SpecialEffect
  | RawEffect;

/**
 * Вероятность — обёртка, а не отдельный Effect.
 * Отсутствие `chance` означает 100%.
 */
export interface ChancedEffect {
  chance?: number;
  effect: Effect;
}

export type StarOccupantEvent =
  | "hit"
  | "critical_hit"
  | "use"
  | "consumed"
  | "activation"
  | "inflict_stun";

export type Trigger =
  | { type: "on_hit" }
  | { type: "on_critical_hit" }
  | { type: "start_of_phase"; phases: TimePhase[] }
  | { type: "during_phase"; phases: TimePhase[] }
  | { type: "on_time_of_day_change" }
  | { type: "on_shop_entered"; count?: number }
  | { type: "every_seconds"; seconds: number }
  | { type: "after_seconds"; seconds: number }
  | { type: "when_hit"; sourceTypes?: string[]; times?: number }
  | { type: "when_critically_hit"; sourceTypes?: string[] }
  | { type: "health_below"; percent: number }
  | { type: "while_equipped" }
  | { type: "while_blooms" }
  | { type: "on_self_activation" }
  | { type: "on_block" }
  | { type: "on_stun" }
  | { type: "out_of_stamina" }
  | { type: "when_consumed" }
  | { type: "when_opponent_heals" }
  | { type: "discharge"; staticAmount?: number }
  | { type: "per_status"; status: Status; subject: Subject }
  | { type: "on_star_activation" }
  | { type: "on_star_occupant"; event: StarOccupantEvent; itemTypes?: string[] }
  | { type: "compound"; any: Trigger[] }
  | { type: "raw"; raw: string };

export type Condition =
  | { type: "star_occupant_type"; itemTypes: string[] }
  | { type: "opponent_has_status"; status: Status; present: boolean }
  | { type: "raw"; raw: string };

export type Constraint =
  | { type: "max_uses_per_battle"; value: number; raw?: string }
  | { type: "remaining_uses"; value: number; max?: number; raw?: string }
  | { type: "quantity"; current: number; max: number; raw?: string }
  | { type: "counts_as"; name: string; value: number; raw?: string }
  | { type: "immunity"; status: Status; raw?: string }
  | { type: "raw"; raw: string };

/**
 * Одно правило Star: клетка Star совпадает с клеткой другого Item,
 * occupant проходит condition, затем срабатывает trigger и effects.
 * Star не является отдельным предметом инвентаря.
 */
export interface StarRule {
  trigger: Trigger | null;
  conditions: Condition[];
  effects: ChancedEffect[];
  rawText?: string;
}

export interface StarData {
  rules: StarRule[];
}

export interface Ability {
  trigger: Trigger | null;
  conditions: Condition[];
  effects: ChancedEffect[];
  constraints?: Constraint[];
  rawText?: string;
}
