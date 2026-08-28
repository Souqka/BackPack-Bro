import { describe, expect, it } from "vitest";
import {
  canonicalizeGrid,
  classifyAlt,
  parseGeometry,
  parseGeometryFromHtml,
  type TileKind,
} from "../parsers/geometry.ts";
import { Logger } from "../utils/logger.ts";
import { loadFixture, paramsOf } from "./helpers.ts";

function tableHtml(grid: string[][]): string {
  const rows = grid
    .map(
      (row) =>
        `<tr>${row
          .map((alt) => `<td><img alt="${alt}" src="/images/x.png"></td>`)
          .join("")}</tr>`,
    )
    .join("");
  return `<div class="druid-data-Grid"><table><tbody>${rows}</tbody></table></div>`;
}

describe("geometry", () => {
  it("classifies Wiki tile alts", () => {
    expect(classifyAlt("Empty Tile")).toBe("empty");
    expect(classifyAlt("Item Tile")).toBe("item");
    expect(classifyAlt("Star")).toBe("star");
    expect(classifyAlt("Mystery")).toBe("unknown");
  });

  it("crops padding and keeps stars out of cells", () => {
    const grid: TileKind[][] = [
      ["empty", "empty", "empty", "empty"],
      ["empty", "star", "item", "star"],
      ["empty", "empty", "empty", "empty"],
    ];
    expect(canonicalizeGrid(grid)).toEqual({
      cells: [[0, 1]],
      stars: [
        [0, 0],
        [0, 2],
      ],
    });
  });

  it("parses Adamantite Bar HTML: 2 cells, 2 stars on the ends", () => {
    const fixture = loadFixture("adamantite_bar");
    const logger = new Logger();
    const result = parseGeometry(fixture.html, paramsOf("adamantite_bar"), logger, "Adamantite Bar");
    expect(result.source).toBe("html");
    expect(result.geometry).toEqual({
      cells: [
        [0, 1],
        [0, 2],
      ],
      stars: [
        [0, 0],
        [0, 3],
      ],
    });
  });

  it("parses Adamantite Ore as a single cell with no stars", () => {
    const fixture = loadFixture("adamantite_ore");
    const logger = new Logger();
    const result = parseGeometry(fixture.html, paramsOf("adamantite_ore"), logger, "Adamantite Ore");
    expect(result.geometry).toEqual({ cells: [[0, 0]], stars: [] });
  });

  it("parses Starbloom non-rectangular star geometry", () => {
    const fixture = loadFixture("starbloom");
    const logger = new Logger();
    const result = parseGeometry(fixture.html, paramsOf("starbloom"), logger, "Starbloom");
    expect(result.geometry.cells).toEqual([
      [0, 1],
      [1, 1],
    ]);
    expect(result.geometry.stars).toEqual([
      [0, 2],
      [1, 0],
    ]);
  });

  it("warns on unknown tile alts without throwing", () => {
    const html = tableHtml([
      ["Empty Tile", "Glitch Tile", "Item Tile"],
    ]);
    const logger = new Logger();
    const unparsed: { kind: string; raw: string; reason: string }[] = [];
    const parsed = parseGeometryFromHtml(html, logger, "Test", unparsed);
    // Unknown tiles are not occupied, so padding crop starts at the Item Tile.
    expect(parsed?.geometry.cells).toEqual([[0, 0]]);
    expect(unparsed.some((u) => u.raw === "Glitch Tile")).toBe(true);
    expect(logger.diagnostics.some((d) => d.code === "geometry_unknown_tile")).toBe(true);
  });

  it("falls back to rXcY wikitext when the HTML table is missing", () => {
    const logger = new Logger();
    const result = parseGeometry(
      "<div>no tiles</div>",
      paramsOf("adamantite_bar"),
      logger,
      "Adamantite Bar",
    );
    expect(result.source).toBe("wikitext");
    expect(result.geometry.cells).toHaveLength(2);
    expect(result.geometry.stars).toHaveLength(2);
    expect(logger.diagnostics.some((d) => d.code === "geometry_html_missing")).toBe(true);
  });
});
