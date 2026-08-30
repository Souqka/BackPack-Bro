import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TooltipProvider } from "../ui/tooltip.tsx";
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
});
