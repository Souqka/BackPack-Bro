import * as cheerio from "cheerio";
import { TILE_ALT } from "../constants.ts";
import type { Cell, ItemGeometry } from "../types/normalized.ts";
import type { TemplateParams, UnparsedConstruct } from "../types/raw.ts";
import type { Logger } from "../utils/logger.ts";
import { param } from "../utils/wikitext.ts";

export type TileKind = "empty" | "item" | "star" | "unknown";

export interface GeometryParseResult {
  geometry: ItemGeometry;
  grid: TileKind[][];
  source: "html" | "wikitext" | "none";
  unparsed: UnparsedConstruct[];
}

/**
 * Parse item geometry from the Wiki Tiles table.
 *
 * The rendered infobox contains a `<table>` of 32px images whose `alt` values
 * are `Empty Tile`, `Item Tile`, or `Star` (from Template:TileEmpty/TileItem/TileStar).
 * Classification uses `alt` text, not pixels.
 *
 * Coordinates are `[row, col]` after cropping empty padding around every
 * occupied Item tile and Star tile. Stars are recorded in `stars` and never
 * copied into `cells`. Width/height are not stored — they are derived from
 * `cells` later. Only one canonical orientation is produced.
 *
 * If the HTML table is missing or malformed, the parser falls back to
 * `r{row}c{col}` template parameters (`e`/`i`/`s`) and records a warning.
 */
export function parseGeometry(
  html: string,
  params: TemplateParams,
  logger: Logger,
  itemName: string,
): GeometryParseResult {
  const unparsed: UnparsedConstruct[] = [];
  const fromHtml = parseGeometryFromHtml(html, logger, itemName, unparsed);
  if (fromHtml) {
    return { ...fromHtml, source: "html", unparsed };
  }

  const fromWiki = parseGeometryFromWikitext(params);
  if (fromWiki.grid.length > 0) {
    logger.warn(
      "geometry_html_missing",
      "Tiles HTML table missing or unreadable; used rXcY wikitext fallback",
      itemName,
    );
    return { ...fromWiki, source: "wikitext", unparsed };
  }

  logger.warn("geometry_missing", "No geometry table or rXcY grid found", itemName);
  unparsed.push({
    kind: "geometry",
    raw: "",
    reason: "No HTML tile table and no rXcY template parameters",
  });
  return {
    geometry: { cells: [], stars: [] },
    grid: [],
    source: "none",
    unparsed,
  };
}

export function parseGeometryFromHtml(
  html: string,
  logger: Logger,
  itemName: string,
  unparsed: UnparsedConstruct[],
): Omit<GeometryParseResult, "source" | "unparsed"> | null {
  const $ = cheerio.load(html);
  const table = $(".druid-data-Grid table").first();
  if (table.length === 0) return null;

  const grid: TileKind[][] = [];
  let unknownCount = 0;

  table.find("tr").each((_, tr) => {
    const row: TileKind[] = [];
    $(tr)
      .find("td")
      .each((__, td) => {
        const img = $(td).find("img").first();
        if (img.length === 0) {
          row.push("empty");
          return;
        }
        const alt = (img.attr("alt") ?? "").trim();
        const kind = classifyAlt(alt);
        if (kind === "unknown") {
          unknownCount += 1;
          unparsed.push({
            kind: "geometry_tile",
            raw: alt,
            reason: "Tile image alt was not Empty Tile / Item Tile / Star",
          });
        }
        row.push(kind);
      });
    if (row.length > 0) grid.push(row);
  });

  if (grid.length === 0) {
    logger.warn("geometry_empty_table", "Tiles table had no rows", itemName);
    return null;
  }

  if (unknownCount > 0) {
    logger.warn(
      "geometry_unknown_tile",
      `Geometry table has ${unknownCount} unrecognized tile alt(s)`,
      itemName,
    );
  }

  const geometry = canonicalizeGrid(grid);
  if (geometry.cells.length === 0) {
    logger.warn(
      "geometry_no_item_tiles",
      "Geometry table parsed but no Item Tile cells were found",
      itemName,
      { stars: geometry.stars.length },
    );
  }

  return { geometry, grid };
}

export function parseGeometryFromWikitext(
  params: TemplateParams,
): Omit<GeometryParseResult, "source" | "unparsed"> {
  const cells = new Map<string, TileKind>();
  let maxRow = 0;
  let maxCol = 0;

  for (const [key, value] of Object.entries(params)) {
    const match = /^r(\d+)c(\d+)$/i.exec(key);
    if (!match) continue;
    const row = Number(match[1]) - 1;
    const col = Number(match[2]) - 1;
    const kind = classifyWikitextToken(value);
    cells.set(`${row},${col}`, kind);
    maxRow = Math.max(maxRow, row);
    maxCol = Math.max(maxCol, col);
  }

  if (cells.size === 0) {
    return { geometry: { cells: [], stars: [] }, grid: [] };
  }

  const grid: TileKind[][] = [];
  for (let r = 0; r <= maxRow; r++) {
    const row: TileKind[] = [];
    for (let c = 0; c <= maxCol; c++) {
      row.push(cells.get(`${r},${c}`) ?? "empty");
    }
    grid.push(row);
  }

  return { geometry: canonicalizeGrid(grid), grid };
}

export function classifyAlt(alt: string): TileKind {
  const v = alt.trim().toLowerCase();
  if (v === TILE_ALT.empty.toLowerCase()) return "empty";
  if (v === TILE_ALT.item.toLowerCase()) return "item";
  if (v === TILE_ALT.star.toLowerCase()) return "star";
  return "unknown";
}

export function classifyWikitextToken(token: string): TileKind {
  const v = token.trim().toLowerCase();
  if (v === "e") return "empty";
  if (v === "i") return "item";
  if (v === "s") return "star";
  return "unknown";
}

/**
 * Crop empty padding and emit local `[row, col]` coordinates.
 * Origin is the top-left of the bounding box of Item tiles AND Stars.
 */
export function canonicalizeGrid(grid: TileKind[][]): ItemGeometry {
  const occupied: Array<{ row: number; col: number; kind: "item" | "star" }> = [];

  for (let row = 0; row < grid.length; row++) {
    const line = grid[row] ?? [];
    for (let col = 0; col < line.length; col++) {
      const kind = line[col];
      if (kind === "item" || kind === "star") {
        occupied.push({ row, col, kind });
      }
    }
  }

  if (occupied.length === 0) {
    return { cells: [], stars: [] };
  }

  const minRow = Math.min(...occupied.map((c) => c.row));
  const minCol = Math.min(...occupied.map((c) => c.col));

  const cells: Cell[] = [];
  const stars: Cell[] = [];

  for (const tile of occupied) {
    const local: Cell = [tile.row - minRow, tile.col - minCol];
    if (tile.kind === "item") cells.push(local);
    else stars.push(local);
  }

  cells.sort(compareCell);
  stars.sort(compareCell);
  return { cells, stars };
}

function compareCell(a: Cell, b: Cell): number {
  return a[0] === b[0] ? a[1] - b[1] : a[0] - b[0];
}

export function geometryFromParams(params: TemplateParams): ItemGeometry {
  return parseGeometryFromWikitext(params).geometry;
}

export { param };
