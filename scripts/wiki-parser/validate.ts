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
      push(issues, logger, "error", "Missing id", label, item.id);
    }
    if (!item.name) {
      push(issues, logger, "error", "Missing name", label, item.id);
    }
    if (!item.rarity || !RARITY_SET.has(item.rarity)) {
      push(
        issues,
        logger,
        "error",
        `Invalid rarity "${item.rarity || ""}"`,
        label,
        item.id,
      );
    }
    if (!item.geometry?.cells?.length) {
      push(issues, logger, "error", "geometry.cells is empty", label, item.id);
    }
    if (item.geometry) {
      for (const cell of [...item.geometry.cells, ...item.geometry.stars]) {
        if (!isValidCell(cell)) {
          push(
            issues,
            logger,
            "error",
            `Invalid geometry coordinate ${JSON.stringify(cell)}`,
            label,
            item.id,
          );
        }
      }
    }

    for (const recipe of item.recipes) {
      for (const ingredient of recipe.ingredients) {
        if (!ingredient.itemId) {
          push(issues, logger, "error", "Recipe contains empty ingredient ID", label, item.id);
        }
        if (!Number.isFinite(ingredient.quantity) || ingredient.quantity < 1) {
          push(
            issues,
            logger,
            "error",
            `Invalid ingredient quantity for ${ingredient.itemId}`,
            label,
            item.id,
          );
        }
      }
    }

    if (item.id) {
      const prev = ids.get(item.id);
      if (prev) {
        push(issues, logger, "error", `Duplicate id "${item.id}" (also "${prev}")`, label, item.id);
      } else {
        ids.set(item.id, item.name);
      }
    }
    if (item.name) {
      const key = item.name.toLowerCase();
      const prev = names.get(key);
      if (prev) {
        push(issues, logger, "error", `Duplicate name "${item.name}" (also id "${prev}")`, label, item.id);
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
