import type { Item } from "../../inventory/types.ts";
import { DEFAULT_BACKPACK, type Backpack } from "../types.ts";
import { invalidBag, invalidInput, invalidItem, noBagLayout, unknownItem } from "./errors.ts";
import { MAX_PRODUCTION_COLS, MAX_PRODUCTION_ROWS, resolveProductionOptions } from "./defaults.ts";
import type { OptimizeInventoryError, OptimizeInventoryInput } from "./types.ts";
import type { ResolvedProductionOptions } from "./defaults.ts";

export interface ValidatedOptimizeInventoryInput {
  backpack: Backpack;
  bagItemIds: string[];
  itemIds: string[];
  options: ResolvedProductionOptions;
}

export type ValidateOptimizeInventoryResult =
  | { ok: true; value: ValidatedOptimizeInventoryInput }
  | { ok: false; error: OptimizeInventoryError };

export function validateOptimizeInventoryInput(
  input: unknown,
  catalog: Map<string, Item>,
): ValidateOptimizeInventoryResult {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: invalidInput("input", "input must be an object", input) };
  }
  const raw = input as Partial<OptimizeInventoryInput>;

  const bagItemIds = parseIdList(raw.bagItemIds, "bagItemIds");
  if (!bagItemIds.ok) return bagItemIds;
  const itemIds = parseIdList(raw.itemIds, "itemIds");
  if (!itemIds.ok) return itemIds;

  if (bagItemIds.value.length === 0) {
    return { ok: false, error: noBagLayout() };
  }

  const backpack = parseBackpack(raw.rows, raw.cols);
  if (!backpack.ok) return backpack;

  const options = resolveProductionOptions(raw.options);
  if (!options.ok) return options;

  for (const itemId of bagItemIds.value) {
    const item = catalog.get(itemId);
    if (!item) return { ok: false, error: unknownItem(itemId) };
    if (!item.types.includes("bag")) return { ok: false, error: invalidBag(itemId) };
  }

  for (const itemId of itemIds.value) {
    const item = catalog.get(itemId);
    if (!item) return { ok: false, error: unknownItem(itemId) };
    if (item.types.includes("bag")) return { ok: false, error: invalidItem(itemId) };
  }

  return {
    ok: true,
    value: {
      backpack: backpack.value,
      bagItemIds: bagItemIds.value,
      itemIds: itemIds.value,
      options: options.value,
    },
  };
}

function parseIdList(
  value: unknown,
  field: "bagItemIds" | "itemIds",
): { ok: true; value: string[] } | { ok: false; error: OptimizeInventoryError } {
  if (value === undefined) {
    return { ok: false, error: invalidInput(field, `${field} is required`) };
  }
  if (!Array.isArray(value)) {
    return { ok: false, error: invalidInput(field, `${field} must be an array of strings`, value) };
  }
  const ids: string[] = [];
  for (let index = 0; index < value.length; index++) {
    const entry = value[index];
    if (typeof entry !== "string" || entry.length === 0) {
      return {
        ok: false,
        error: invalidInput(`${field}[${index}]`, `${field} entries must be non-empty strings`, entry),
      };
    }
    ids.push(entry);
  }
  return { ok: true, value: ids };
}

function parseBackpack(
  rows: unknown,
  cols: unknown,
): { ok: true; value: Backpack } | { ok: false; error: OptimizeInventoryError } {
  const parsedRows = parseDimension(rows, "rows", DEFAULT_BACKPACK.rows, MAX_PRODUCTION_ROWS);
  if (!parsedRows.ok) return parsedRows;
  const parsedCols = parseDimension(cols, "cols", DEFAULT_BACKPACK.cols, MAX_PRODUCTION_COLS);
  if (!parsedCols.ok) return parsedCols;
  return { ok: true, value: { rows: parsedRows.value, cols: parsedCols.value } };
}

function parseDimension(
  value: unknown,
  field: "rows" | "cols",
  fallback: number,
  max: number,
): { ok: true; value: number } | { ok: false; error: OptimizeInventoryError } {
  if (value === undefined) return { ok: true, value: fallback };
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > max) {
    return {
      ok: false,
      error: invalidInput(field, `${field} must be an integer from 1 to ${max}`, value),
    };
  }
  return { ok: true, value };
}
