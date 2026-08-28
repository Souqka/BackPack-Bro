/**
 * Production-каталог для optimizer и benchmark.
 * Не дублирует предметы: читает `data/normalized/items.json`.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { catalogFromItems } from "../inventory/inventory.ts";
import type { Item } from "../inventory/types.ts";

export function loadProductionCatalog(root: string = process.cwd()): Map<string, Item> {
  const filePath = path.join(root, "data/normalized/items.json");
  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as { items: Item[] };
  return catalogFromItems(parsed.items);
}
