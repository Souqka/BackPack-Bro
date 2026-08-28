/**
 * Веса structural score.
 *
 * Боевые величины (Armor, Damage, Poison) не переводятся в очки:
 * без единой модели боя их нельзя сравнивать. Меняется только
 * число достоверно активированных взаимодействий.
 */

export interface ScoringWeights {
  /** Надбавка за одну активную Star. */
  activatedStar: number;
}

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  activatedStar: 1,
};

/**
 * Оценка невалидной расстановки.
 * Любой valid score конечен, поэтому invalid никогда не побеждает valid.
 */
export const INVALID_PLACEMENT_SCORE = Number.NEGATIVE_INFINITY;

export function resolveWeights(partial?: Partial<ScoringWeights>): ScoringWeights {
  return { ...DEFAULT_SCORING_WEIGHTS, ...partial };
}
