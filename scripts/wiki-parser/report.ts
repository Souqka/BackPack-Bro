/**
 * Автоматический отчёт о качестве каталога. Цифры только из данных прогона.
 */

import type { NormalizedCatalog } from "./types/normalized.ts";
import type { Effect, Trigger } from "./types/effects.ts";
import type { CatalogValidationResult } from "./types/validation.ts";
import { originOf, starOffsetsFromNearestCell } from "./utils/geometry.ts";

export interface ParseRunStats {
  listed: number;
  parsed: number;
  successful: number;
  skipped: number;
  skippedPages: Array<{ title: string; reason: string }>;
  failedPages: Array<{ title: string; reason: string }>;
}

export interface CatalogReport {
  generatedAt: string;
  parserVersion: string;
  schemaVersion: string;
  source: string;
  run: ParseRunStats;
  validation: {
    valid: boolean;
    errorCount: number;
    warningCount: number;
    errorsByCode: Record<string, number>;
    warningsByCode: Record<string, number>;
  };
  items: {
    total: number;
    rarity: Record<string, number>;
    types: Record<string, number>;
    heroes: Record<string, number>;
  };
  geometry: {
    itemsWithCells: number;
    emptyCells: number;
    notCroppedToOrigin: number;
    cellCountHistogram: Record<string, number>;
  };
  stars: {
    itemsWithStars: number;
    totalStars: number;
    maxStarsOnOneItem: number;
    offsetCounts: Record<string, number>;
    distanceCounts: Record<string, number>;
  };
  effects: Record<string, number>;
  triggers: Record<string, number>;
  conditions: Record<string, number>;
  constraints: Record<string, number>;
  levelUpChangeTypes: Record<string, number>;
  recipes: {
    itemsWithRecipes: number;
    totalRecipes: number;
    totalIngredients: number;
    unresolvedIngredientIds: string[];
  };
  images: {
    withIcon: number;
    withFull: number;
    missingBoth: number;
  };
  raw: {
    effects: number;
    triggers: number;
    conditions: number;
    constraints: number;
    patterns: Array<{ pattern: string; count: number; examples: string[] }>;
  };
}

export function buildCatalogReport(options: {
  catalog: NormalizedCatalog;
  schemaVersion: string;
  validation: CatalogValidationResult;
  run: ParseRunStats;
}): CatalogReport {
  const items = options.catalog.items;
  const rarity: Record<string, number> = {};
  const types: Record<string, number> = {};
  const heroes: Record<string, number> = {};
  const cellCountHistogram: Record<string, number> = {};
  const offsetCounts: Record<string, number> = {};
  const distanceCounts: Record<string, number> = {};
  const effects: Record<string, number> = {};
  const triggers: Record<string, number> = {};
  const conditions: Record<string, number> = {};
  const constraints: Record<string, number> = {};
  const levelUpChangeTypes: Record<string, number> = {};

  let itemsWithCells = 0;
  let emptyCells = 0;
  let notCroppedToOrigin = 0;
  let itemsWithStars = 0;
  let totalStars = 0;
  let maxStarsOnOneItem = 0;
  let itemsWithRecipes = 0;
  let totalRecipes = 0;
  let totalIngredients = 0;
  let withIcon = 0;
  let withFull = 0;
  let missingBoth = 0;

  const rawTexts: Record<string, { count: number; examples: string[] }> = {};
  const knownIds = new Set(items.map((i) => i.id));
  const unresolved = new Set<string>();

  for (const item of items) {
    bump(rarity, item.rarity || "_none");
    if (item.types.length === 0) bump(types, "_none");
    for (const t of item.types) bump(types, t);
    bump(heroes, item.hero && item.hero.trim() ? item.hero : "_none");

    const cellN = item.geometry?.cells?.length ?? 0;
    bump(cellCountHistogram, String(cellN));
    if (cellN > 0) itemsWithCells += 1;
    else emptyCells += 1;

    const origin = item.geometry ? originOf(item.geometry) : null;
    if (origin && (origin.minRow !== 0 || origin.minCol !== 0)) notCroppedToOrigin += 1;

    const starN = item.geometry?.stars?.length ?? 0;
    if (starN > 0) {
      itemsWithStars += 1;
      totalStars += starN;
      maxStarsOnOneItem = Math.max(maxStarsOnOneItem, starN);
      if (item.geometry) {
        for (const offset of starOffsetsFromNearestCell(item.geometry)) {
          const key = `[${offset[0]}, ${offset[1]}]`;
          bump(offsetCounts, key);
          const dist = Math.max(Math.abs(offset[0]), Math.abs(offset[1]));
          bump(distanceCounts, dist <= 1 ? "adjacent" : `distance ${dist}`);
        }
      }
    }

    for (const c of item.constraints) {
      bump(constraints, c.type);
      if (c.type === "raw") addRaw(rawTexts, c.raw, "constraint");
    }

    for (const ability of item.abilities.initial) {
      countTrigger(ability.trigger, triggers, rawTexts);
      for (const cond of ability.conditions) {
        bump(conditions, cond.type);
        if (cond.type === "raw") addRaw(rawTexts, cond.raw, "condition");
      }
      for (const occ of ability.effects) countEffect(occ.effect, effects, rawTexts);
      for (const c of ability.constraints ?? []) {
        bump(constraints, c.type);
        if (c.type === "raw") addRaw(rawTexts, c.raw, "constraint");
      }
    }

    for (const change of item.abilities.levelUp) {
      countTrigger(change.trigger, triggers, rawTexts);
      for (const occ of change.changes) {
        bump(levelUpChangeTypes, occ.effect.type);
        countEffect(occ.effect, effects, rawTexts);
      }
    }

    for (const rule of item.star?.rules ?? []) {
      countTrigger(rule.trigger, triggers, rawTexts);
      for (const cond of rule.conditions) {
        bump(conditions, cond.type);
        if (cond.type === "raw") addRaw(rawTexts, cond.raw, "condition");
      }
      for (const occ of rule.effects) countEffect(occ.effect, effects, rawTexts);
    }

    if (item.recipes.length > 0) itemsWithRecipes += 1;
    totalRecipes += item.recipes.length;
    for (const recipe of item.recipes) {
      totalIngredients += recipe.ingredients.length;
      for (const ing of recipe.ingredients) {
        if (ing.itemId && !knownIds.has(ing.itemId)) unresolved.add(ing.itemId);
      }
    }

    if (item.images?.icon) withIcon += 1;
    if (item.images?.full) withFull += 1;
    if (!item.images?.icon && !item.images?.full) missingBoth += 1;
  }

  const errorsByCode: Record<string, number> = {};
  const warningsByCode: Record<string, number> = {};
  for (const issue of options.validation.errors) bump(errorsByCode, issue.code);
  for (const issue of options.validation.warnings) bump(warningsByCode, issue.code);

  const rawPatterns = Object.entries(rawTexts)
    .map(([pattern, v]) => ({ pattern, count: v.count, examples: v.examples }))
    .sort((a, b) => b.count - a.count || a.pattern.localeCompare(b.pattern));

  return {
    generatedAt: options.catalog.generatedAt,
    parserVersion: options.catalog.parserVersion,
    schemaVersion: options.schemaVersion,
    source: options.catalog.wikiOrigin,
    run: options.run,
    validation: {
      valid: options.validation.valid,
      errorCount: options.validation.errors.length,
      warningCount: options.validation.warnings.length,
      errorsByCode,
      warningsByCode,
    },
    items: { total: items.length, rarity, types, heroes },
    geometry: { itemsWithCells, emptyCells, notCroppedToOrigin, cellCountHistogram },
    stars: { itemsWithStars, totalStars, maxStarsOnOneItem, offsetCounts, distanceCounts },
    effects,
    triggers,
    conditions,
    constraints,
    levelUpChangeTypes,
    recipes: {
      itemsWithRecipes,
      totalRecipes,
      totalIngredients,
      unresolvedIngredientIds: [...unresolved].sort(),
    },
    images: { withIcon, withFull, missingBoth },
    raw: {
      effects: effects.raw ?? 0,
      triggers: triggers.raw ?? 0,
      conditions: conditions.raw ?? 0,
      constraints: constraints.raw ?? 0,
      patterns: rawPatterns,
    },
  };
}

export function renderCatalogReportMarkdown(report: CatalogReport): string {
  const lines: string[] = [];
  lines.push("# Backpack Brawl — Отчёт о базе данных");
  lines.push("");
  lines.push(`Всего страниц Wiki: ${report.run.listed}`);
  lines.push("");
  lines.push(`Успешно распарсено: ${report.run.successful}`);
  lines.push("");
  lines.push(`Пропущено: ${report.run.skipped}`);
  lines.push("");
  lines.push(`Ошибок: ${report.validation.errorCount}`);
  lines.push("");
  lines.push(`Предупреждений: ${report.validation.warningCount}`);
  lines.push("");
  lines.push(`Всего предметов: ${report.items.total}`);
  lines.push("");
  lines.push(`parserVersion: ${report.parserVersion}`);
  lines.push(`schemaVersion: ${report.schemaVersion}`);
  lines.push(`source: ${report.source}`);
  lines.push(`generatedAt: ${report.generatedAt}`);
  lines.push("");

  section(lines, "Rarity", report.items.rarity);
  section(lines, "Item Types", report.items.types);
  section(lines, "Heroes", report.items.heroes);

  lines.push("## Geometry");
  lines.push("");
  lines.push(`Предметов с клетками: ${report.geometry.itemsWithCells}`);
  lines.push(`Без клеток: ${report.geometry.emptyCells}`);
  lines.push(`Не обрезано к [0, 0]: ${report.geometry.notCroppedToOrigin}`);
  lines.push("");
  lines.push("Размер (число клеток):");
  for (const [k, n] of sortedEntries(report.geometry.cellCountHistogram)) {
    lines.push(`- ${k}: ${n}`);
  }
  lines.push("");

  lines.push("## Stars");
  lines.push("");
  lines.push(`Items with stars: ${report.stars.itemsWithStars}`);
  lines.push(`Total stars: ${report.stars.totalStars}`);
  lines.push(`Max stars on one item: ${report.stars.maxStarsOnOneItem}`);
  lines.push("");
  lines.push("Star distances (Chebyshev от ближайшей Item-клетки):");
  for (const [k, n] of sortedEntries(report.stars.distanceCounts)) {
    lines.push(`- ${k}: ${n}`);
  }
  lines.push("");
  lines.push("Star offset `[dRow, dCol]`:");
  for (const [k, n] of sortedEntries(report.stars.offsetCounts)) {
    lines.push(`- ${k}: ${n}`);
  }
  lines.push("");

  section(lines, "Effects", report.effects);
  section(lines, "Triggers", report.triggers);
  section(lines, "Conditions", report.conditions);
  section(lines, "Constraints", report.constraints);

  lines.push("## Levels");
  lines.push("");
  for (const [k, n] of sortedEntries(report.levelUpChangeTypes)) {
    lines.push(`- ${k}: ${n}`);
  }
  lines.push("");

  lines.push("## Recipes");
  lines.push("");
  lines.push(`Предметов с рецептами: ${report.recipes.itemsWithRecipes}`);
  lines.push(`Всего рецептов: ${report.recipes.totalRecipes}`);
  lines.push(`Всего ингредиентов: ${report.recipes.totalIngredients}`);
  lines.push(`Неразрешённых ID ингредиентов: ${report.recipes.unresolvedIngredientIds.length}`);
  if (report.recipes.unresolvedIngredientIds.length > 0) {
    for (const id of report.recipes.unresolvedIngredientIds.slice(0, 50)) {
      lines.push(`- ${id}`);
    }
    if (report.recipes.unresolvedIngredientIds.length > 50) {
      lines.push(`- … ещё ${report.recipes.unresolvedIngredientIds.length - 50}`);
    }
  }
  lines.push("");

  lines.push("## Images");
  lines.push("");
  lines.push(`С icon: ${report.images.withIcon}`);
  lines.push(`С full: ${report.images.withFull}`);
  lines.push(`Без обоих: ${report.images.missingBoth}`);
  lines.push("");

  lines.push("## Raw конструкции");
  lines.push("");
  lines.push(`effects.raw: ${report.raw.effects}`);
  lines.push(`triggers.raw: ${report.raw.triggers}`);
  lines.push(`conditions.raw: ${report.raw.conditions}`);
  lines.push(`constraints.raw: ${report.raw.constraints}`);
  lines.push("");
  for (const pat of report.raw.patterns.slice(0, 80)) {
    lines.push(`### ${pat.pattern}`);
    lines.push("");
    lines.push(`Count: ${pat.count}`);
    lines.push("");
    for (const ex of pat.examples) {
      lines.push(`- ${ex}`);
    }
    lines.push("");
  }

  if (optionsFailed(report)) {
    lines.push("## Пропущенные и неразобранные страницы");
    lines.push("");
    for (const page of report.run.skippedPages) {
      lines.push(`- пропуск: ${page.title} — ${page.reason}`);
    }
    for (const page of report.run.failedPages) {
      lines.push(`- ошибка: ${page.title} — ${page.reason}`);
    }
    lines.push("");
  }

  lines.push("## Коды валидации");
  lines.push("");
  lines.push("Ошибки:");
  for (const [k, n] of sortedEntries(report.validation.errorsByCode)) {
    lines.push(`- ${k}: ${n}`);
  }
  lines.push("");
  lines.push("Предупреждения:");
  for (const [k, n] of sortedEntries(report.validation.warningsByCode)) {
    lines.push(`- ${k}: ${n}`);
  }
  lines.push("");

  return lines.join("\n");
}

function optionsFailed(report: CatalogReport): boolean {
  return report.run.skippedPages.length > 0 || report.run.failedPages.length > 0;
}

function countTrigger(
  trigger: Trigger | null,
  triggers: Record<string, number>,
  rawTexts: Record<string, { count: number; examples: string[] }>,
): void {
  if (!trigger) {
    bump(triggers, "_none");
    return;
  }
  bump(triggers, trigger.type);
  if (trigger.type === "raw") addRaw(rawTexts, trigger.raw, "trigger");
  if (trigger.type === "compound") {
    for (const inner of trigger.any) countTrigger(inner, triggers, rawTexts);
  }
}

function countEffect(
  effect: Effect,
  effects: Record<string, number>,
  rawTexts: Record<string, { count: number; examples: string[] }>,
): void {
  bump(effects, effect.type);
  if (effect.type === "raw") addRaw(rawTexts, effect.raw, "effect");
  if (effect.type === "special") addRaw(rawTexts, `${effect.id}: ${effect.raw}`, "special");
}

function addRaw(
  map: Record<string, { count: number; examples: string[] }>,
  text: string,
  kind: string,
): void {
  const pattern = generalize(text);
  const key = `${kind}: ${pattern}`;
  const entry = map[key] ?? { count: 0, examples: [] };
  entry.count += 1;
  if (entry.examples.length < 5 && !entry.examples.includes(text)) {
    entry.examples.push(text);
  }
  map[key] = entry;
}

function generalize(text: string): string {
  return text
    .replace(/\d+(?:\.\d+)?%/g, "{pct}")
    .replace(/\d+(?:\.\d+)?/g, "{n}")
    .replace(/\s+/g, " ")
    .trim();
}

function bump(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

function sortedEntries(map: Record<string, number>): Array<[string, number]> {
  return Object.entries(map).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function section(lines: string[], title: string, map: Record<string, number>): void {
  lines.push(`## ${title}`);
  lines.push("");
  for (const [k, n] of sortedEntries(map)) {
    lines.push(`- ${k}: ${n}`);
  }
  lines.push("");
}

