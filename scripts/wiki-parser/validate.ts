import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { KNOWN_RARITIES, WIKI_ORIGIN } from "./constants.ts";
import type { Cell, Item, ItemGeometry } from "./types/normalized.ts";
import type { CatalogValidationResult, ValidateCatalogOptions, ValidationIssue } from "./types/validation.ts";
import type { Logger } from "./utils/logger.ts";
import { originOf } from "./utils/geometry.ts";

const RARITY_SET = new Set<string>(KNOWN_RARITIES);

export type { CatalogValidationResult, ValidateCatalogOptions, ValidationIssue };

interface InternalIssue extends ValidationIssue {
  level: "warning" | "error";
}

/**
 * Полная проверка каталога для frontend и будущего optimizer.
 *
 * Проблемные записи не удаляются: ошибки и предупреждения возвращаются,
 * каталог остаётся полным снимком того, что удалось разобрать.
 */
export function validateCatalog(
  items: Item[],
  loggerOrOptions?: Logger | ValidateCatalogOptions,
  maybeOptions?: ValidateCatalogOptions,
): CatalogValidationResult {
  const { logger, options } = resolveArgs(loggerOrOptions, maybeOptions);
  const issues: InternalIssue[] = [];
  const ids = new Map<string, string>();
  const names = new Map<string, string>();
  const knownIds = options.knownIds ?? new Set(items.map((item) => item.id).filter(Boolean));
  const outputDir = options.outputDir;

  for (const item of items) {
    const label = item.name || item.id || "(unknown)";

    if (!item.id) {
      push(issues, logger, "error", "missing_id", "Отсутствует id", undefined, label);
    }
    if (!item.name) {
      push(issues, logger, "error", "missing_name", "Отсутствует name", item.id, label);
    }

    if (item.id) {
      const prev = ids.get(item.id);
      if (prev) {
        push(
          issues,
          logger,
          "error",
          "duplicate_id",
          `Обнаружен дублирующийся ID: "${item.id}" (также "${prev}")`,
          item.id,
          label,
        );
      } else {
        ids.set(item.id, item.name);
      }
    }
    if (item.name) {
      const key = item.name.toLowerCase();
      const prev = names.get(key);
      if (prev) {
        push(
          issues,
          logger,
          "error",
          "duplicate_name",
          `Обнаружено дублирующееся имя: "${item.name}" (также id "${prev}")`,
          item.id,
          label,
        );
      } else {
        names.set(key, item.id);
      }
    }

    if (!item.rarity) {
      push(issues, logger, "error", "missing_rarity", "У предмета отсутствует rarity", item.id, label);
    } else if (!RARITY_SET.has(item.rarity)) {
      push(
        issues,
        logger,
        "warning",
        "unknown_rarity",
        `У предмета неизвестная rarity "${item.rarity}"`,
        item.id,
        label,
      );
    }

    if (!item.types || item.types.length === 0) {
      push(issues, logger, "warning", "missing_types", "У предмета отсутствуют types", item.id, label);
    }

    validateGeometryItem(item, issues, logger, label);
    validateStarsAndRules(item, issues, logger, label);
    validateRecipes(item, knownIds, issues, logger, label);
    validateLevels(item, issues, logger, label);
    validateSource(item, issues, logger, label);
    validateEffects(item, issues, logger, label);
  }

  const result: CatalogValidationResult = {
    valid: issues.filter((i) => i.level === "error").length === 0,
    errors: issues.filter((i) => i.level === "error").map(publicIssue),
    warnings: issues.filter((i) => i.level === "warning").map(publicIssue),
  };

  return result;
}

/**
 * Проверка локальных файлов изображений. Асинхронна, потому что читает диск.
 * Ссылки на отсутствующие файлы обнуляются — в JSON не должно быть битых путей.
 */
export async function validateAndSanitizeImages(
  items: Item[],
  outputDir: string,
  logger?: Logger,
  options?: { requireImages?: boolean },
): Promise<CatalogValidationResult> {
  const issues: InternalIssue[] = [];
  const requireImages = options?.requireImages !== false;

  for (const item of items) {
    const label = item.name || item.id || "(unknown)";
    item.images = item.images ?? {};
    item.images.icon = await checkImageRef(
      item.images.icon,
      outputDir,
      item.id,
      "icon",
      issues,
      logger,
      label,
    );
    item.images.full = await checkImageRef(
      item.images.full,
      outputDir,
      item.id,
      "full",
      issues,
      logger,
      label,
    );
    if (requireImages && !item.images.icon && !item.images.full) {
      push(
        issues,
        logger,
        "warning",
        "missing_images",
        "У предмета отсутствует изображение",
        item.id,
        label,
      );
    }
  }

  return {
    valid: issues.filter((i) => i.level === "error").length === 0,
    errors: issues.filter((i) => i.level === "error").map(publicIssue),
    warnings: issues.filter((i) => i.level === "warning").map(publicIssue),
  };
}

function validateGeometryItem(
  item: Item,
  issues: InternalIssue[],
  logger: Logger | undefined,
  label: string,
): void {
  const geometry = item.geometry;
  if (!geometry?.cells?.length) {
    push(
      issues,
      logger,
      "error",
      "missing_geometry",
      `Пропущена страница без geometry: ${label}`,
      item.id,
      label,
    );
    return;
  }

  const cellIssues = inspectCells(geometry.cells, "cells");
  for (const msg of cellIssues) {
    push(issues, logger, "error", "invalid_geometry_cells", msg, item.id, label);
  }
  const starIssues = inspectCells(geometry.stars ?? [], "stars");
  for (const msg of starIssues) {
    push(issues, logger, "error", "invalid_geometry_stars", msg, item.id, label);
  }

  const cellSet = new Set((geometry.cells ?? []).map(cellKey));
  for (const star of geometry.stars ?? []) {
    if (cellSet.has(cellKey(star))) {
      push(
        issues,
        logger,
        "error",
        "star_overlaps_cell",
        `Star совпадает с Item-клеткой ${JSON.stringify(star)}`,
        item.id,
        label,
      );
    }
  }

  const origin = originOf(geometry);
  if (origin && (origin.minRow !== 0 || origin.minCol !== 0)) {
    push(
      issues,
      logger,
      "error",
      "geometry_not_cropped",
      `Каноническая geometry не начинается с [0, 0] (min=[${origin.minRow}, ${origin.minCol}])`,
      item.id,
      label,
    );
  }
}

function inspectCells(cells: Cell[], field: keyof ItemGeometry): string[] {
  const messages: string[] = [];
  const seen = new Set<string>();
  for (const cell of cells) {
    if (!isValidCell(cell)) {
      messages.push(`Некорректная координата geometry.${field} ${JSON.stringify(cell)}`);
      continue;
    }
    const key = cellKey(cell);
    if (seen.has(key)) {
      messages.push(`Дублирующаяся координата geometry.${field} ${JSON.stringify(cell)}`);
    }
    seen.add(key);
  }
  return messages;
}

function validateStarsAndRules(
  item: Item,
  issues: InternalIssue[],
  logger: Logger | undefined,
  label: string,
): void {
  if (item.star && item.star.rules.length === 0) {
    push(
      issues,
      logger,
      "warning",
      "empty_star_rules",
      "star присутствует, но rules пуст — ожидается null",
      item.id,
      label,
    );
  }
  if ((item.star?.rules.length ?? 0) > 0 && (!item.geometry?.stars || item.geometry.stars.length === 0)) {
    push(
      issues,
      logger,
      "warning",
      "star_rules_without_cells",
      "есть star.rules, но geometry.stars пуст",
      item.id,
      label,
    );
  }
}

function validateRecipes(
  item: Item,
  knownIds: Set<string>,
  issues: InternalIssue[],
  logger: Logger | undefined,
  label: string,
): void {
  for (const [index, recipe] of item.recipes.entries()) {
    if (!recipe.ingredients || recipe.ingredients.length === 0) {
      push(
        issues,
        logger,
        "error",
        "empty_recipe",
        `Пустой рецепт #${index + 1}`,
        item.id,
        label,
      );
      continue;
    }
    const seen = new Set<string>();
    for (const ingredient of recipe.ingredients) {
      if (!ingredient.itemId) {
        push(
          issues,
          logger,
          "error",
          "empty_recipe_ingredient",
          "Рецепт содержит пустой ID ингредиента",
          item.id,
          label,
        );
      } else if (!knownIds.has(ingredient.itemId)) {
        push(
          issues,
          logger,
          "warning",
          "unresolved_recipe_ingredient",
          `Ингредиент рецепта "${ingredient.itemId}" отсутствует в каталоге`,
          item.id,
          label,
        );
      }
      if (!Number.isFinite(ingredient.quantity) || ingredient.quantity < 1) {
        push(
          issues,
          logger,
          "error",
          "invalid_recipe_quantity",
          `Некорректное количество ингредиента ${ingredient.itemId}`,
          item.id,
          label,
        );
      }
      if (ingredient.itemId) {
        if (seen.has(ingredient.itemId)) {
          push(
            issues,
            logger,
            "warning",
            "duplicate_recipe_ingredient",
            `В рецепте дублируется ингредиент "${ingredient.itemId}" — количества должны быть объединены`,
            item.id,
            label,
          );
        }
        seen.add(ingredient.itemId);
      }
    }
  }
}

function validateLevels(
  item: Item,
  issues: InternalIssue[],
  logger: Logger | undefined,
  label: string,
): void {
  const seen = new Set<number>();
  for (const change of item.abilities.levelUp) {
    if (!Number.isInteger(change.level) || change.level < 2) {
      push(
        issues,
        logger,
        "warning",
        "invalid_level",
        `Некорректный номер уровня ${change.level}`,
        item.id,
        label,
      );
    }
    if (seen.has(change.level)) {
      push(
        issues,
        logger,
        "warning",
        "duplicate_level",
        `Дублирующийся уровень ${change.level}`,
        item.id,
        label,
      );
    }
    seen.add(change.level);
    if (!change.changes || change.changes.length === 0) {
      push(
        issues,
        logger,
        "warning",
        "empty_level_changes",
        `Уровень ${change.level} не содержит нормализованных изменений`,
        item.id,
        label,
      );
    }
  }
  const maxLevel = item.upgrade?.maxLevel;
  if (maxLevel != null && item.abilities.levelUp.length > 0) {
    const maxSeen = Math.max(...item.abilities.levelUp.map((c) => c.level));
    if (maxSeen > maxLevel) {
      push(
        issues,
        logger,
        "warning",
        "level_exceeds_max",
        `Уровень ${maxSeen} больше maxLevel ${maxLevel}`,
        item.id,
        label,
      );
    }
  }
}

function validateSource(
  item: Item,
  issues: InternalIssue[],
  logger: Logger | undefined,
  label: string,
): void {
  const url = item.source?.wikiUrl;
  if (!url) {
    push(issues, logger, "error", "missing_source_url", "Отсутствует source.wikiUrl", item.id, label);
    return;
  }
  const expectedPrefix = `${WIKI_ORIGIN}/wiki/`;
  if (!url.startsWith(expectedPrefix) || url.length <= expectedPrefix.length) {
    push(
      issues,
      logger,
      "error",
      "invalid_source_url",
      `Некорректный source URL: ${url}`,
      item.id,
      label,
    );
  }
}

function validateEffects(
  _item: Item,
  _issues: InternalIssue[],
  _logger: Logger | undefined,
  _label: string,
): void {
  // raw — допустимый исход Stage 2/3, не ошибка целостности.
  // Покрытие считается в catalog-report.
}

async function checkImageRef(
  publicPath: string | null | undefined,
  outputDir: string,
  itemId: string | undefined,
  kind: "icon" | "full",
  issues: InternalIssue[],
  logger: Logger | undefined,
  label: string,
): Promise<string | null> {
  if (!publicPath) return null;
  if (!publicPath.startsWith("/assets/items/")) {
    push(
      issues,
      logger,
      "error",
      "invalid_image_path",
      `Некорректный путь изображения ${kind}: ${publicPath}`,
      itemId,
      label,
    );
    return null;
  }
  const relative = publicPath.replace(/^\//, "");
  const abs = path.join(outputDir, relative);
  try {
    await access(abs);
    const info = await stat(abs);
    if (info.size <= 0) {
      push(
        issues,
        logger,
        "error",
        "empty_image_file",
        `Файл изображения ${kind} пуст: ${publicPath}`,
        itemId,
        label,
      );
      return null;
    }
    const buf = await readFile(abs);
    if (buf.length < 12 || !isWebp(buf)) {
      push(
        issues,
        logger,
        "error",
        "invalid_image_format",
        `Файл изображения ${kind} не является WebP: ${publicPath}`,
        itemId,
        label,
      );
      return null;
    }
    return publicPath;
  } catch {
    push(
      issues,
      logger,
      "error",
      "missing_image_file",
      `Локальный файл изображения не существует: ${publicPath}`,
      itemId,
      label,
    );
    return null;
  }
}

function isWebp(buf: Buffer): boolean {
  return buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP";
}

function isValidCell(cell: unknown): cell is Cell {
  return (
    Array.isArray(cell) &&
    cell.length === 2 &&
    Number.isInteger(cell[0]) &&
    Number.isInteger(cell[1]) &&
    (cell[0] as number) >= 0 &&
    (cell[1] as number) >= 0
  );
}

function cellKey(cell: Cell): string {
  return `${cell[0]},${cell[1]}`;
}

function publicIssue(issue: InternalIssue): ValidationIssue {
  return { itemId: issue.itemId, code: issue.code, message: issue.message };
}

function resolveArgs(
  loggerOrOptions?: Logger | ValidateCatalogOptions,
  maybeOptions?: ValidateCatalogOptions,
): { logger?: Logger; options: ValidateCatalogOptions } {
  if (loggerOrOptions && typeof (loggerOrOptions as Logger).warn === "function") {
    return { logger: loggerOrOptions as Logger, options: maybeOptions ?? {} };
  }
  return { options: (loggerOrOptions as ValidateCatalogOptions | undefined) ?? {} };
}

function push(
  issues: InternalIssue[],
  logger: Logger | undefined,
  level: "warning" | "error",
  code: string,
  message: string,
  itemId: string | undefined,
  itemName: string,
): void {
  issues.push({ level, code, message, itemId });
  if (!logger) return;
  if (level === "error") logger.error(code, message, itemName);
  else logger.warn(code, message, itemName);
}
