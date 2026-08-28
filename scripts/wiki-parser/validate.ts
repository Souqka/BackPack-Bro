import { KNOWN_RARITIES } from "./constants.ts";
import type { Item } from "./types/normalized.ts";
import type { Logger } from "./utils/logger.ts";

const RARITY_SET = new Set<string>(KNOWN_RARITIES);

export interface ValidationIssue {
  level: "warning" | "error";
  message: string;
  itemId?: string;
}

/**
 * Post-parse validation. Failures are logged; the catalog is still written so
 * raw data is not lost. Duplicate IDs/names are errors.
 */
export function validateCatalog(items: Item[], logger: Logger): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ids = new Map<string, string>();
  const names = new Map<string, string>();

  for (const item of items) {
    const label = item.name || item.id || "(unknown)";

    if (!item.id) {
      push(issues, logger, "error", "Отсутствует id", label, item.id);
    }
    if (!item.name) {
      push(issues, logger, "error", "Отсутствует name", label, item.id);
    }
    if (!item.rarity || !RARITY_SET.has(item.rarity)) {
      push(
        issues,
        logger,
        "error",
        `Некорректная редкость "${item.rarity || ""}"`,
        label,
        item.id,
      );
    }
    if (!item.geometry?.cells?.length) {
      push(issues, logger, "error", "geometry.cells пуст", label, item.id);
    }
    if (item.geometry) {
      for (const cell of [...item.geometry.cells, ...item.geometry.stars]) {
        if (!isValidCell(cell)) {
          push(
            issues,
            logger,
            "error",
            `Некорректная координата geometry ${JSON.stringify(cell)}`,
            label,
            item.id,
          );
        }
      }
    }

    if (item.star && item.star.rules.length === 0) {
      push(
        issues,
        logger,
        "warning",
        "star присутствует, но rules пуст — ожидается null",
        label,
        item.id,
      );
    }
    if ((item.star?.rules.length ?? 0) > 0 && (!item.geometry?.stars || item.geometry.stars.length === 0)) {
      push(
        issues,
        logger,
        "warning",
        "есть star.rules, но geometry.stars пуст",
        label,
        item.id,
      );
    }

    for (const recipe of item.recipes) {
      for (const ingredient of recipe.ingredients) {
        if (!ingredient.itemId) {
          push(issues, logger, "error", "Рецепт содержит пустой ID ингредиента", label, item.id);
        }
        if (!Number.isFinite(ingredient.quantity) || ingredient.quantity < 1) {
          push(
            issues,
            logger,
            "error",
            `Некорректное количество ингредиента ${ingredient.itemId}`,
            label,
            item.id,
          );
        }
      }
    }

    if (item.id) {
      const prev = ids.get(item.id);
      if (prev) {
        push(issues, logger, "error", `Дублирующийся id "${item.id}" (также "${prev}")`, label, item.id);
      } else {
        ids.set(item.id, item.name);
      }
    }
    if (item.name) {
      const key = item.name.toLowerCase();
      const prev = names.get(key);
      if (prev) {
        push(issues, logger, "error", `Дублирующееся имя "${item.name}" (также id "${prev}")`, label, item.id);
      } else {
        names.set(key, item.id);
      }
    }
  }

  return issues;
}

function isValidCell(cell: unknown): boolean {
  return (
    Array.isArray(cell) &&
    cell.length === 2 &&
    Number.isInteger(cell[0]) &&
    Number.isInteger(cell[1]) &&
    (cell[0] as number) >= 0 &&
    (cell[1] as number) >= 0
  );
}

function push(
  issues: ValidationIssue[],
  logger: Logger,
  level: "warning" | "error",
  message: string,
  itemName: string,
  itemId?: string,
): void {
  issues.push({ level, message, itemId });
  if (level === "error") logger.error("validation", message, itemName);
  else logger.warn("validation", message, itemName);
}
