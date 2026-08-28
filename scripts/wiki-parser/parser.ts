import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PARSER_VERSION, WIKI_ORIGIN } from "./constants.ts";
import { WikiFetcher } from "./fetcher.ts";
import { parseAbilities } from "./parsers/abilities.ts";
import { parseGeneralInfo } from "./parsers/general-info.ts";
import { parseGeometry } from "./parsers/geometry.ts";
import { parseAndDownloadImages } from "./parsers/images.ts";
import { parseLevels } from "./parsers/levels.ts";
import { parseRecipes } from "./parsers/recipes.ts";
import { parseStats } from "./parsers/stats.ts";
import type { Item, NormalizedCatalog } from "./types/normalized.ts";
import type { Diagnostic, RawItemRecord, RawWikiPage, UnparsedConstruct } from "./types/raw.ts";
import { slugifyItemName } from "./utils/ids.ts";
import type { Logger } from "./utils/logger.ts";
import { parseItemTemplate } from "./utils/wikitext.ts";
import { validateCatalog } from "./validate.ts";

export interface ParseRunOptions {
  outputDir: string;
  itemTitles?: string[];
  limit?: number;
  skipImages?: boolean;
  fetcher?: WikiFetcher;
}

export interface ParseRunResult {
  catalog: NormalizedCatalog;
  rawItems: RawItemRecord[];
  unparsed: UnparsedConstruct[];
}

/**
 * Orchestrate fetch → extract → normalize → validate → write.
 * Individual Wiki pages that fail are logged and skipped; the run continues.
 */
export async function parseItems(
  options: ParseRunOptions,
  logger: Logger,
): Promise<ParseRunResult> {
  const fetcher = options.fetcher ?? new WikiFetcher();
  const knownNames = new Map<string, string>();

  let titles: string[];
  if (options.itemTitles && options.itemTitles.length > 0) {
    titles = options.itemTitles;
  } else {
    logger.info("Listing items from Wiki Cargo table");
    const listed = await fetcher.listItems();
    for (const entry of listed) {
      knownNames.set(entry.name.toLowerCase(), slugifyItemName(entry.name));
      knownNames.set(entry.title.toLowerCase(), slugifyItemName(entry.name || entry.title));
    }
    titles = listed.map((e) => e.title);
    logger.info(`Found ${titles.length} item pages`);
  }

  if (options.limit != null && options.limit >= 0) {
    titles = titles.slice(0, options.limit);
  }

  for (const title of titles) {
    knownNames.set(title.toLowerCase(), slugifyItemName(title));
  }

  const items: Item[] = [];
  const rawItems: RawItemRecord[] = [];
  const allUnparsed: UnparsedConstruct[] = [];

  for (const title of titles) {
    logger.parsed += 1;
    logger.info(`Parsing item: ${title}`);
    try {
      const page = await fetcher.fetchPage(title);
      const result = await parseOneItem(page, {
        logger,
        knownNames,
        outputDir: options.outputDir,
        skipImages: options.skipImages === true,
        fetcher,
      });
      items.push(result.item);
      rawItems.push(result.raw);
      allUnparsed.push(...result.raw.unparsed);
      logger.successful += 1;
      logger.info(
        `Geometry: ${result.item.geometry.cells.length} cells, ${result.item.geometry.stars.length} stars`,
        title,
      );
      logger.info(`Recipes: ${result.item.recipes.length}`, title);
      logger.info(`Levels: ${result.item.upgrade?.maxLevel ?? 0}`, title);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("parse_failed", `Failed to parse item: ${title} (${message})`, title);
    }
  }

  validateCatalog(items, logger);

  const catalog: NormalizedCatalog = {
    parserVersion: PARSER_VERSION,
    generatedAt: new Date().toISOString(),
    wikiOrigin: WIKI_ORIGIN,
    items,
  };

  await writeOutputs(options.outputDir, catalog, rawItems);
  return { catalog, rawItems, unparsed: allUnparsed };
}

export interface ItemParseContext {
  logger: Logger;
  knownNames: Map<string, string>;
  outputDir: string;
  skipImages: boolean;
  fetcher: WikiFetcher | null;
}

export async function parseOneItem(
  page: RawWikiPage,
  ctx: ItemParseContext,
): Promise<{ item: Item; raw: RawItemRecord }> {
  const params = parseItemTemplate(page.wikitext);
  const general = parseGeneralInfo(page.html, params, ctx.logger, page.title);
  const name = general.name || page.title;
  const id = slugifyItemName(name);

  const geometryResult = parseGeometry(page.html, params, ctx.logger, name);
  const stats = parseStats(page.html, params);
  const abilities = parseAbilities(
    page.html,
    params,
    ctx.logger,
    name,
    geometryResult.geometry.stars.length > 0,
  );
  const levels = parseLevels(page.html, params, ctx.logger, name, general.rarity);
  const recipes = parseRecipes(params, name, ctx.logger, ctx.knownNames);
  const images = await parseAndDownloadImages({
    html: page.html,
    itemId: id,
    itemName: name,
    wikiImages: page.images,
    outputDir: ctx.outputDir,
    skipDownload: ctx.skipImages,
    fetcher: ctx.fetcher,
    logger: ctx.logger,
  });

  const unparsed: UnparsedConstruct[] = [
    ...general.unparsed,
    ...geometryResult.unparsed,
    ...abilities.unparsed,
    ...levels.unparsed,
    ...recipes.unparsed,
  ];

  const item: Item = {
    id,
    name,
    rarity: general.rarity,
    types: general.types,
    hero: general.hero,
    unlock: general.unlock,
    purchasable: general.purchasable,
    cost: general.cost,
    geometry: geometryResult.geometry,
    stats,
    abilities: {
      initial: abilities.initial,
      levelUp: levels.levelUp,
    },
    star: abilities.star,
    upgrade: levels.upgrade,
    recipes: recipes.recipes,
    images: images.images,
    source: {
      wikiUrl: page.wikiUrl,
      imageUrls: images.sourceUrls,
      parsedAt: new Date().toISOString(),
      parserVersion: PARSER_VERSION,
    },
  };

  const raw: RawItemRecord = {
    page: {
      title: page.title,
      pageId: page.pageId,
      wikiUrl: page.wikiUrl,
      wikitext: page.wikitext,
      images: page.images,
      fetchedAt: page.fetchedAt,
      htmlLength: page.html.length,
      html: page.html,
    },
    templateParams: params,
    recipesAll: recipes.recipesAll,
    usedInRecipes: recipes.usedInRecipes,
    diagnostics: uniqueDiagnostics(
      ctx.logger.itemDiagnostics(name).concat(ctx.logger.itemDiagnostics(page.title)),
    ),
    unparsed,
    parsedAt: item.source.parsedAt,
    parserVersion: PARSER_VERSION,
  };

  return { item, raw };
}

function uniqueDiagnostics(list: Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>();
  const out: Diagnostic[] = [];
  for (const d of list) {
    const key = `${d.level}:${d.code}:${d.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out;
}

async function writeOutputs(
  outputDir: string,
  catalog: NormalizedCatalog,
  rawItems: RawItemRecord[],
): Promise<void> {
  const normalizedDir = path.join(outputDir, "data", "normalized");
  const rawDir = path.join(outputDir, "data", "raw", "items");
  await mkdir(normalizedDir, { recursive: true });
  await mkdir(rawDir, { recursive: true });

  await writeFile(
    path.join(normalizedDir, "items.json"),
    JSON.stringify(catalog, null, 2) + "\n",
    "utf8",
  );

  for (const raw of rawItems) {
    const id = slugifyItemName(raw.page.title);
    await writeFile(path.join(rawDir, `${id}.json`), JSON.stringify(raw, null, 2) + "\n", "utf8");
  }
}
