import type { Recipe, RecipeIngredient } from "../types/normalized.ts";
import type { TemplateParams, UnparsedConstruct, RawRecipe } from "../types/raw.ts";
import { slugifyItemName } from "../utils/ids.ts";
import type { Logger } from "../utils/logger.ts";
import { param } from "../utils/wikitext.ts";

export interface RecipesParseResult {
  recipes: Recipe[];
  recipesAll: RawRecipe[];
  usedInRecipes: RawRecipe[];
  unparsed: UnparsedConstruct[];
}

/**
 * Recipes from `recipeNResult` / `recipeNIngredientM` template parameters.
 *
 * A Wiki item page lists both recipes that *create* the item and recipes that
 * *use* it as an ingredient. Normalized `recipes` only keeps the former, with
 * ingredients collapsed by item ID (`2× Steel Bar` → one entry, quantity 2).
 *
 * Ingredient IDs are slugs of Wiki item names. If a name cannot be matched to
 * an ID (empty/malformed), a warning is emitted and the original name is kept
 * in diagnostics — the parser never invents an ID.
 */
export function parseRecipes(
  params: TemplateParams,
  currentName: string,
  logger: Logger,
  knownNames: Map<string, string>,
): RecipesParseResult {
  const unparsed: UnparsedConstruct[] = [];
  const recipesAll = extractRawRecipes(params);
  const currentId = slugifyItemName(currentName);
  const recipes: Recipe[] = [];
  const usedInRecipes: RawRecipe[] = [];

  for (const raw of recipesAll) {
    const resultId = slugifyItemName(raw.resultName);
    if (resultId === currentId || namesEqual(raw.resultName, currentName)) {
      const ingredients = collapseIngredients(
        raw.ingredientNames,
        logger,
        currentName,
        knownNames,
        unparsed,
      );
      if (ingredients.length > 0) {
        recipes.push({ ingredients });
      }
    } else {
      usedInRecipes.push(raw);
    }
  }

  return { recipes, recipesAll, usedInRecipes, unparsed };
}

export function extractRawRecipes(params: TemplateParams): RawRecipe[] {
  const recipes: RawRecipe[] = [];
  for (let n = 1; n <= 16; n++) {
    const resultName = param(params, `recipe${n}Result`);
    if (!resultName) continue;
    const ingredientNames: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const name = param(params, `recipe${n}Ingredient${i}`);
      if (name) ingredientNames.push(name);
    }
    recipes.push({ resultName, ingredientNames });
  }
  return recipes;
}

function collapseIngredients(
  names: string[],
  logger: Logger,
  itemName: string,
  knownNames: Map<string, string>,
  unparsed: UnparsedConstruct[],
): RecipeIngredient[] {
  const order: string[] = [];
  const quantities = new Map<string, number>();

  for (const name of names) {
    const resolved = resolveIngredientId(name, knownNames);
    if (!resolved) {
      logger.warn(
        "unresolved_recipe_ingredient",
        `Unresolved recipe ingredient: "${name}"`,
        itemName,
      );
      unparsed.push({
        kind: "recipe_ingredient",
        raw: name,
        reason: "Could not map Wiki ingredient name to an item ID",
      });
      continue;
    }
    if (!quantities.has(resolved)) order.push(resolved);
    quantities.set(resolved, (quantities.get(resolved) ?? 0) + 1);
  }

  return order.map((itemId) => ({
    itemId,
    quantity: quantities.get(itemId) ?? 1,
  }));
}

function resolveIngredientId(
  name: string,
  knownNames: Map<string, string>,
): string | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  const known = knownNames.get(lower);
  if (known) return known;
  const slug = slugifyItemName(trimmed);
  return slug || null;
}

function namesEqual(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
