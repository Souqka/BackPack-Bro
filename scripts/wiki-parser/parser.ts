import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PARSER_VERSION, SCHEMA_VERSION, WIKI_ORIGIN } from "./constants.ts";
import { WikiFetcher } from "./fetcher.ts";
import { buildCatalogIndexes } from "./indexes.ts";
import { parseAbilities } from "./parsers/abilities.ts";
import { parseGeneralInfo } from "./parsers/general-info.ts";
import { parseGeometry } from "./parsers/geometry.ts";
import { parseAndDownloadImages } from "./parsers/images.ts";
import { parseLevels } from "./parsers/levels.ts";
import { parseRecipes } from "./parsers/recipes.ts";
import { parseStats } from "./parsers/stats.ts";
import { buildCatalogReport, renderCatalogReportMarkdown, type ParseRunStats } from "./report.ts";
import type { Item, NormalizedCatalog } from "./types/normalized.ts";
import type { Diagnostic, RawItemRecord, RawWikiPage, UnparsedConstruct } from "./types/raw.ts";
import type { CatalogValidationResult } from "./types/validation.ts";
import { slugifyItemName } from "./utils/ids.ts";
import type { Logger } from "./utils/logger.ts";
import { parseItemTemplate } from "./utils/wikitext.ts";
import { validateAndSanitizeImages, validateCatalog } from "./validate.ts";

export { buildUsedInIndex } from "./indexes.ts";

export interface ParseRunOptions {
  outputDir: string;
  itemTitles?: string[];
  limit?: number;
  skipImages?: boolean;
  /** Разбирать из уже сохранённых raw JSON, Wiki не дергать, если html есть. */
  resume?: boolean;
  delayMs?: number;
  fetcher?: WikiFetcher;
}

export interface ParseRunResult {
  catalog: NormalizedCatalog;
  rawItems: RawItemRecord[];
  unparsed: UnparsedConstruct[];
  validation: CatalogValidationResult;
  run: ParseRunStats;
}

/**
 * Конвейер: Wiki → raw → строгая нормализация → валидация → production JSON.
 * Ошибка на одной странице не останавливает остальные.
 */
export async function parseItems(
  options: ParseRunOptions,
  logger: Logger,
): Promise<ParseRunResult> {
  const fetcher = options.fetcher ?? new WikiFetcher(options.delayMs);
  const knownNames = new Map<string, string>();
  const skippedPages: Array<{ title: string; reason: string }> = [];
  const failedPages: Array<{ title: string; reason: string }> = [];

  let titles: string[];
  if (options.itemTitles && options.itemTitles.length > 0) {
    titles = options.itemTitles;
    logger.listed = titles.length;
  } else {
    logger.info("Загрузка списка предметов из Cargo Wiki");
    const listed = await fetcher.listItems();
    for (const entry of listed) {
      knownNames.set(entry.name.toLowerCase(), slugifyItemName(entry.name));
      knownNames.set(entry.title.toLowerCase(), slugifyItemName(entry.name || entry.title));
    }
    titles = listed.map((e) => e.title);
    logger.listed = listed.length;
    logger.info(`Найдено страниц предметов: ${titles.length}`);
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
    logger.info(`Разбор предмета: ${title}`);
    try {
      const page = await loadPage(title, {
        fetcher,
        outputDir: options.outputDir,
        resume: options.resume === true,
        logger,
      });
      if (!page) {
        const reason = "Нет HTML/wikitext и не удалось загрузить страницу";
        logger.warn("skipped_empty_page", `Пропущена пустая страница: ${title}`, title);
        logger.skipped += 1;
        skippedPages.push({ title, reason });
        continue;
      }

      const params = parseItemTemplate(page.wikitext);
      if (Object.keys(params).length === 0) {
        const reason = "нет шаблона {{Item}}";
        logger.warn("skipped_not_item", `Пропущена страница без шаблона Item: ${title}`, title);
        logger.skipped += 1;
        skippedPages.push({ title, reason });
        continue;
      }

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
        `Геометрия: ${result.item.geometry.cells.length} клеток, ${result.item.geometry.stars.length} star`,
        title,
      );
      logger.info(`Рецепты: ${result.item.recipes.length}`, title);
      logger.info(`Уровни: ${result.item.upgrade?.maxLevel ?? 0}`, title);

      await writeRawItem(options.outputDir, result.raw);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("parse_failed", `Не удалось разобрать предмет: ${title} (${message})`, title);
      failedPages.push({ title, reason: message });
    }
  }

  const imageValidation = await validateAndSanitizeImages(items, options.outputDir, logger, {
    requireImages: options.skipImages !== true,
  });
  const validation = validateCatalog(items, logger, { outputDir: options.outputDir });
  validation.errors.push(...imageValidation.errors);
  validation.warnings.push(...imageValidation.warnings);
  validation.valid = validation.errors.length === 0;

  const catalog: NormalizedCatalog = {
    parserVersion: PARSER_VERSION,
    generatedAt: new Date().toISOString(),
    wikiOrigin: WIKI_ORIGIN,
    items,
  };

  const run: ParseRunStats = {
    listed: logger.listed,
    parsed: logger.parsed,
    successful: logger.successful,
    skipped: logger.skipped,
    skippedPages,
    failedPages,
  };

  await writeOutputs(options.outputDir, catalog, rawItems, validation, run);
  return { catalog, rawItems, unparsed: allUnparsed, validation, run };
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
    constraints: abilities.constraints,
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

async function loadPage(
  title: string,
  ctx: {
    fetcher: WikiFetcher;
    outputDir: string;
    resume: boolean;
    logger: Logger;
  },
): Promise<RawWikiPage | null> {
  if (ctx.resume) {
    const cached = await readCachedPage(ctx.outputDir, title);
    if (cached?.html) {
      ctx.logger.info("Страница: из raw-кэша", title);
      return cached;
    }
  }
  return ctx.fetcher.fetchPage(title);
}

async function readCachedPage(outputDir: string, title: string): Promise<RawWikiPage | null> {
  const id = slugifyItemName(title);
  const filePath = path.join(outputDir, "data", "raw", "items", `${id}.json`);
  try {
    const raw = JSON.parse(await readFile(filePath, "utf8")) as RawItemRecord;
    const html = raw.page.html;
    if (!html) return null;
    return {
      title: raw.page.title || title,
      pageId: raw.page.pageId,
      wikiUrl: raw.page.wikiUrl,
      wikitext: raw.page.wikitext,
      html,
      images: raw.page.images ?? [],
      fetchedAt: raw.page.fetchedAt,
    };
  } catch {
    return null;
  }
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

async function writeRawItem(outputDir: string, raw: RawItemRecord): Promise<void> {
  const rawDir = path.join(outputDir, "data", "raw", "items");
  await mkdir(rawDir, { recursive: true });
  const id = slugifyItemName(raw.page.title);
  await writeFile(path.join(rawDir, `${id}.json`), JSON.stringify(raw, null, 2) + "\n", "utf8");
}

async function writeOutputs(
  outputDir: string,
  catalog: NormalizedCatalog,
  rawItems: RawItemRecord[],
  validation: CatalogValidationResult,
  run: ParseRunStats,
): Promise<void> {
  const normalizedDir = path.join(outputDir, "data", "normalized");
  const indexesDir = path.join(normalizedDir, "indexes");
  const reportsDir = path.join(outputDir, "data", "reports");
  await mkdir(indexesDir, { recursive: true });
  await mkdir(reportsDir, { recursive: true });

  await writeFile(
    path.join(normalizedDir, "items.json"),
    JSON.stringify(catalog, null, 2) + "\n",
    "utf8",
  );

  const meta = {
    schemaVersion: SCHEMA_VERSION,
    parserVersion: PARSER_VERSION,
    generatedAt: catalog.generatedAt,
    itemCount: catalog.items.length,
    source: `${WIKI_ORIGIN}/`,
  };
  await writeFile(path.join(normalizedDir, "catalog-meta.json"), JSON.stringify(meta, null, 2) + "\n", "utf8");

  const indexes = buildCatalogIndexes(catalog.items);
  await writeFile(path.join(indexesDir, "by-id.json"), JSON.stringify(indexes.byId, null, 2) + "\n", "utf8");
  await writeFile(path.join(indexesDir, "by-type.json"), JSON.stringify(indexes.byType, null, 2) + "\n", "utf8");
  await writeFile(
    path.join(indexesDir, "by-rarity.json"),
    JSON.stringify(indexes.byRarity, null, 2) + "\n",
    "utf8",
  );
  await writeFile(path.join(indexesDir, "by-hero.json"), JSON.stringify(indexes.byHero, null, 2) + "\n", "utf8");
  await writeFile(
    path.join(indexesDir, "used-in-recipes.json"),
    JSON.stringify(indexes.usedInRecipes, null, 2) + "\n",
    "utf8",
  );

  const report = buildCatalogReport({
    catalog,
    schemaVersion: SCHEMA_VERSION,
    validation,
    run,
  });
  await writeFile(path.join(reportsDir, "catalog-report.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
  await writeFile(path.join(reportsDir, "catalog-report.md"), renderCatalogReportMarkdown(report), "utf8");

  for (const raw of rawItems) {
    await writeRawItem(outputDir, raw);
  }
}
