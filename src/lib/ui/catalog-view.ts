import "server-only";
import { loadProductionCatalog } from "../optimizer/load-catalog.ts";
import { projectCatalogItem } from "./catalog-project.ts";
import type { CatalogItemView } from "./catalog-types.ts";

/** Production catalog only. Never a test fixture. */
export function loadCatalogView(): CatalogItemView[] {
  const catalog = loadProductionCatalog();
  return [...catalog.values()].map(projectCatalogItem).sort((a, b) => a.name.localeCompare(b.name));
}
