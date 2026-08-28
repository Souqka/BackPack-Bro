/**
 * Raw Wiki payload kept for debugging and re-normalization.
 * Normalized JSON must not be the only remaining copy of Wiki text.
 */

export interface RawWikiPage {
  title: string;
  pageId?: number;
  wikiUrl: string;
  wikitext: string;
  html: string;
  images: string[];
  fetchedAt: string;
}

export interface TemplateParams {
  [key: string]: string;
}

export interface RawRecipe {
  resultName: string;
  ingredientNames: string[];
}

export interface UnparsedConstruct {
  kind: string;
  raw: string;
  reason: string;
}

export interface Diagnostic {
  level: "info" | "warning" | "error";
  code: string;
  message: string;
  itemName?: string;
  detail?: unknown;
}

export interface RawItemRecord {
  page: Omit<RawWikiPage, "html"> & { htmlLength: number; html?: string };
  templateParams: TemplateParams;
  recipesAll: RawRecipe[];
  usedInRecipes: RawRecipe[];
  diagnostics: Diagnostic[];
  unparsed: UnparsedConstruct[];
  parsedAt: string;
  parserVersion: string;
}
