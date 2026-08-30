import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TooltipProvider } from "../ui/tooltip.tsx";
import { ActiveStats } from "./active-stats.tsx";
import { BackpackGrid } from "./backpack-grid.tsx";
import { ResultList } from "./result-list.tsx";
import { ResultSummary } from "./result-summary.tsx";
import { UnplacedItems } from "./unplaced-items.tsx";
import { loadProductionCatalog } from "../../lib/optimizer/load-catalog.ts";
import { catalogViewFromItems } from "../../lib/ui/catalog-project.ts";
import type { OptimizedLayoutResult, OptimizeInventorySuccess } from "../../lib/optimizer/api/types.ts";

const catalog = catalogViewFromItems(loadProductionCatalog().values());

const layoutResult: OptimizedLayoutResult = {
  layout: {
    rows: 6,
    cols: 9,
    bags: [{ instanceId: "bag-0", itemId: "medium_bag", row: 1, col: 2, rotation: 0 }],
    items: [
      { instanceId: "item-0", itemId: "adamantite_ore", row: 1, col: 2, rotation: 0 },
      { instanceId: "item-1", itemId: "black_cat", row: 1, col: 3, rotation: 90 },
    ],
    unplacedItems: [{ instanceId: "item-2", itemId: "starbloom" }],
    unplacedBags: [],
  },
  score: { valid: true, structuralScore: 2, activatedStars: 1, effectCoverage: 0 },
  complete: false,
  signature: "sig-1",
};

describe("BackpackGrid", () => {
  it("renders a 6x9 grid with bag and item instance metadata", () => {
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <BackpackGrid layout={layoutResult.layout} catalog={catalog} />
      </TooltipProvider>,
    );
    expect(html).toContain('data-testid="backpack-grid"');
    expect(html).toContain('data-rows="6"');
    expect(html).toContain('data-cols="9"');
    expect(html).toContain('data-bag-instance="bag-0"');
    expect(html).toContain('data-item-instance="item-0"');
    expect(html).toContain('data-item-instance="item-1"');
    expect(html).toContain('data-item-rotation="90"');
    expect([...html.matchAll(/data-testid="cell-/g)].length).toBe(54);
  });

  it("sizes the board from --cell-size and --grid-cols/--grid-rows, not stretched tracks", () => {
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <BackpackGrid layout={layoutResult.layout} catalog={catalog} />
      </TooltipProvider>,
    );
    expect(html).toContain("backpack-board");
    expect(html).toContain("--grid-cols:9");
    expect(html).toContain("--grid-rows:6");
    expect(html).toContain("repeat(9, var(--cell-size))");
    expect(html).toContain("repeat(6, var(--cell-size))");
    expect(html).toContain("calc(var(--cell-size) *");
    expect(html).toContain('data-testid="bag-layer"');
    expect(html).toContain('data-testid="item-layer"');
    expect(html).not.toContain("grid-column:");
  });

  it("does not change board geometry when Bags only is enabled", () => {
    const shown = renderToStaticMarkup(
      <TooltipProvider>
        <BackpackGrid layout={layoutResult.layout} catalog={catalog} />
      </TooltipProvider>,
    );
    const hidden = renderToStaticMarkup(
      <TooltipProvider>
        <BackpackGrid layout={layoutResult.layout} catalog={catalog} bagsOnly />
      </TooltipProvider>,
    );
    const shownBoard = shown.match(/data-testid="backpack-grid"[^>]*/)?.[0] ?? "";
    const hiddenBoard = hidden.match(/data-testid="backpack-grid"[^>]*/)?.[0] ?? "";
    expect(shownBoard).toContain("--grid-cols:9");
    expect(hiddenBoard).toContain("--grid-cols:9");
    expect(shownBoard).toContain("--grid-rows:6");
    expect(hiddenBoard).toContain("--grid-rows:6");
    expect(shown).toContain("calc(var(--cell-size) *");
    expect(hidden).toContain("calc(var(--cell-size) *");
    expect(hidden).not.toContain('data-testid="item-layer"');
    expect(hidden).toContain('data-testid="bag-layer"');
  });

  it("renders one image per item instance, not one image per occupied cell", () => {
    const layout = {
      rows: 6,
      cols: 9,
      bags: [{ instanceId: "bag-0", itemId: "medium_bag", row: 0, col: 0, rotation: 0 }],
      items: [
        { instanceId: "item-0", itemId: "adamantite_bar", row: 0, col: 0, rotation: 0 },
        { instanceId: "item-1", itemId: "starbloom", row: 0, col: 2, rotation: 0 },
      ],
      unplacedItems: [],
      unplacedBags: [],
    };
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <BackpackGrid layout={layout} catalog={catalog} />
      </TooltipProvider>,
    );
    expect([...html.matchAll(/data-testid="placed-item-/g)]).toHaveLength(2);
    expect([...html.matchAll(/<img\b/g)]).toHaveLength(2);
    expect(html).toContain('data-testid="placed-item-item-0"');
    expect(html).toContain('data-testid="placed-item-item-1"');
    expect(html).toContain('data-cell-count="2"');
    expect(html).toContain('data-instance-id="item-0"');
    expect(html).toContain('data-instance-id="item-1"');
  });

  it("rotates the visual footprint with placement rotation", () => {
    const layout = {
      rows: 6,
      cols: 9,
      bags: [],
      items: [
        { instanceId: "item-h", itemId: "adamantite_bar", row: 1, col: 1, rotation: 0 },
        { instanceId: "item-v", itemId: "adamantite_bar", row: 1, col: 4, rotation: 90 },
      ],
      unplacedItems: [],
      unplacedBags: [],
    };
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <BackpackGrid layout={layout} catalog={catalog} />
      </TooltipProvider>,
    );
    expect(html).toMatch(/data-testid="placed-item-item-h"[^>]*data-rotation="0"/);
    expect(html).toMatch(/data-testid="placed-item-item-v"[^>]*data-rotation="90"/);
    const horizontal = html.match(/data-testid="placed-item-item-h"[^>]*/)?.[0] ?? "";
    const vertical = html.match(/data-testid="placed-item-item-v"[^>]*/)?.[0] ?? "";
    expect(horizontal).toContain('data-max-col="');
    expect(vertical).toContain('data-max-row="');
    expect(horizontal.includes('data-min-col="2"') || horizontal.includes('data-min-col="1"')).toBe(true);
    const hMinCol = Number(/data-min-col="(\d+)"/.exec(horizontal)?.[1]);
    const hMaxCol = Number(/data-max-col="(\d+)"/.exec(horizontal)?.[1]);
    const vMinRow = Number(/data-min-row="(\d+)"/.exec(vertical)?.[1]);
    const vMaxRow = Number(/data-max-row="(\d+)"/.exec(vertical)?.[1]);
    expect(hMaxCol - hMinCol).toBe(1);
    expect(vMaxRow - vMinRow).toBe(1);
  });

  it("does not paint an L-shape hole as part of the item image", () => {
    const layout = {
      rows: 6,
      cols: 9,
      bags: [],
      items: [{ instanceId: "item-cat", itemId: "black_cat", row: 0, col: 0, rotation: 0 }],
      unplacedItems: [],
      unplacedBags: [],
    };
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <BackpackGrid layout={layout} catalog={catalog} />
      </TooltipProvider>,
    );
    expect(html).toContain('data-testid="placed-item-item-cat"');
    expect(html).toContain('data-irregular="true"');
    expect(html).toContain('data-cell-count="3"');
    expect([...html.matchAll(/<img\b/g)]).toHaveLength(1);
    expect(html).toContain('data-item-instance="item-cat"');
    expect(html).toContain('data-testid="cell-0-1"');
    const hole = html.match(/data-testid="cell-0-1"[^>]*/)?.[0] ?? "";
    expect(hole).not.toContain('data-item-instance="item-cat"');
  });

  it("renders bags as colored footprints without bag images", () => {
    const layout = {
      rows: 6,
      cols: 9,
      bags: [
        { instanceId: "bag-0", itemId: "medium_bag", row: 0, col: 0, rotation: 0 },
        { instanceId: "bag-1", itemId: "fanny_pack", row: 0, col: 3, rotation: 0 },
      ],
      items: [],
      unplacedItems: [],
      unplacedBags: [],
    };
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <BackpackGrid layout={layout} catalog={catalog} />
      </TooltipProvider>,
    );
    expect(html).toContain('data-testid="bag-footprint-bag-0"');
    expect(html).toContain('data-testid="bag-footprint-bag-1"');
    expect(html).not.toContain("/assets/items/medium_bag/");
    expect(html).not.toContain("/assets/items/fanny_pack/");
    expect([...html.matchAll(/<img\b/g)]).toHaveLength(0);
    expect(html).toContain('aria-label="Medium Bag"');
    expect(html).toContain('aria-label="Fanny Pack"');
    expect(html).toContain('data-bag-name="Medium Bag"');
    expect(html).not.toContain('aria-label="medium_bag"');
    expect(html).toContain("hsla(");
  });

  it("hides items and item stars in bags-only mode while keeping bags and occupancy metadata", () => {
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <BackpackGrid layout={layoutResult.layout} catalog={catalog} bagsOnly />
      </TooltipProvider>,
    );
    expect(html).toContain('data-bags-only="true"');
    expect(html).toContain('data-testid="bag-footprint-bag-0"');
    expect(html).not.toContain("placed-item-");
    expect(html).not.toContain("star-marker");
    expect(html).not.toContain("/assets/items/adamantite_ore/");
    expect(html).not.toContain("/assets/items/black_cat/");
    expect(html).toContain('data-item-instance="item-0"');
    expect(html).toContain('data-bag-instance="bag-0"');
  });

  it("keeps duplicate item instances visually distinct by instanceId", () => {
    const layout = {
      rows: 6,
      cols: 9,
      bags: [{ instanceId: "bag-0", itemId: "medium_bag", row: 0, col: 0, rotation: 0 }],
      items: [
        { instanceId: "item-0", itemId: "adamantite_ore", row: 0, col: 0, rotation: 0 },
        { instanceId: "item-1", itemId: "adamantite_ore", row: 0, col: 1, rotation: 0 },
      ],
      unplacedItems: [],
      unplacedBags: [],
    };
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <BackpackGrid layout={layout} catalog={catalog} />
      </TooltipProvider>,
    );
    expect(html).toContain('data-testid="placed-item-item-0"');
    expect(html).toContain('data-testid="placed-item-item-1"');
    expect([...html.matchAll(/data-testid="placed-item-item-/g)]).toHaveLength(2);
    expect([...html.matchAll(/<img\b/g)]).toHaveLength(2);
  });
});

describe("result presentation", () => {
  it("shows score, stars, incomplete, and unplaced instance identity", () => {
    const result: OptimizeInventorySuccess = {
      ok: true,
      layout: layoutResult.layout,
      score: layoutResult.score,
      complete: false,
      signature: layoutResult.signature,
      results: [layoutResult],
      execution: { stopReason: "stable_result", durationMs: 40 },
    };
    const summary = renderToStaticMarkup(<ResultSummary result={result} selected={layoutResult} />);
    expect(summary).toContain("Incomplete");
    expect(summary).toContain(">2<");
    expect(summary).toContain(">1<");
    const unplaced = renderToStaticMarkup(
      <UnplacedItems items={layoutResult.layout.unplacedItems} catalog={catalog} />,
    );
    expect(unplaced).toContain('data-instance-id="item-2"');
    expect(unplaced).toContain("Starbloom");
  });

  it("lists Top-N options without hiding instance-level results", () => {
    const second: OptimizedLayoutResult = {
      ...layoutResult,
      signature: "sig-2",
      score: { ...layoutResult.score, structuralScore: 1, activatedStars: 0 },
    };
    const html = renderToStaticMarkup(
      <ResultList results={[layoutResult, second]} selectedSignature="sig-1" onSelect={() => undefined} />,
    );
    expect(html).toContain("Result 1");
    expect(html).toContain("Result 2");
    expect(html).toContain('data-testid="result-option-0"');
    expect(html).toContain('data-testid="result-option-1"');
  });

  it("renders Active Stats from the selected result only", () => {
    const first = {
      ...layoutResult,
      score: {
        ...layoutResult.score,
        activeStats: [{ id: "armor", name: "Armor", value: 24 }],
      },
    };
    const second: OptimizedLayoutResult = {
      ...first,
      signature: "sig-2",
      score: {
        ...first.score,
        structuralScore: 1,
        activatedStars: 0,
        activeStats: [{ id: "mana", name: "Mana", value: 1 }],
      },
    };
    const firstHtml = renderToStaticMarkup(<ActiveStats stats={first.score.activeStats ?? []} />);
    const secondHtml = renderToStaticMarkup(<ActiveStats stats={second.score.activeStats ?? []} />);
    expect(firstHtml).toContain("Armor");
    expect(firstHtml).toContain("24");
    expect(firstHtml).not.toContain("Mana");
    expect(secondHtml).toContain("Mana");
    expect(secondHtml).not.toContain("Armor");
  });
});
