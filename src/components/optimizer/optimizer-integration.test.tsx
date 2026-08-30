import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BackpackGrid } from "./backpack-grid.tsx";
import { ResultList } from "./result-list.tsx";
import { ResultSummary } from "./result-summary.tsx";
import { UnplacedItems } from "./unplaced-items.tsx";
import { TooltipProvider } from "../ui/tooltip.tsx";
import { optimizeInventory } from "../../lib/optimizer/api/service.ts";
import { loadProductionCatalog } from "../../lib/optimizer/load-catalog.ts";
import { catalogViewFromItems } from "../../lib/ui/catalog-project.ts";
import { optimizerReducer, initialOptimizerState, selectedLayout } from "../../lib/ui/optimizer-state.ts";

const catalog = loadProductionCatalog();
const views = catalogViewFromItems(catalog.values());

describe("optimizer UI integration", () => {
  it("Case A: grid, layout, and score come from optimizeInventory", () => {
    const result = optimizeInventory(
      {
        bagItemIds: ["medium_bag"],
        itemIds: ["adamantite_ore", "adamantite_ore"],
        options: { quality: "fast", resultCount: 1 },
      },
      catalog,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <BackpackGrid layout={result.layout} catalog={views} />
        <ResultSummary result={result} selected={result.results[0]!} />
      </TooltipProvider>,
    );
    expect(html).toContain('data-testid="backpack-grid"');
    expect(html).toContain('data-bag-instance="bag-0"');
    expect(html).toContain('data-item-instance="item-0"');
    expect(html).toContain('data-item-instance="item-1"');
    expect(html).toContain("Complete");
    expect(html).toContain(`data-testid="stat-score"`);
  });

  it("Case G: UI shows the production optimizer score, not a greedy placeholder", () => {
    const result = optimizeInventory(
      {
        bagItemIds: ["warrior_backpack", "medium_bag"],
        itemIds: ["adamantite_bar", "adamantite_bar", "starbloom", "starbloom"],
        options: { quality: "balanced", resultCount: 1 },
      },
      catalog,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.score.structuralScore).toBe(6);
    expect(result.score.activatedStars).toBe(6);
    const html = renderToStaticMarkup(<ResultSummary result={result} selected={result.results[0]!} />);
    expect(html).toContain(">6<");
    expect(html).toContain("Complete");
  });

  it("Case H: multiple bags, items on bag cells, unplaced handling", () => {
    const result = optimizeInventory(
      {
        bagItemIds: ["fanny_pack", "fanny_pack", "fanny_pack"],
        itemIds: ["adamantite_bar", "adamantite_ore", "starbloom"],
        options: { quality: "balanced", resultCount: 1 },
      },
      catalog,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <BackpackGrid layout={result.layout} catalog={views} />
        <UnplacedItems items={result.layout.unplacedItems} catalog={views} />
      </TooltipProvider>,
    );
    expect(html).toContain('data-bag-instance="bag-0"');
    expect(html).toContain('data-bag-instance="bag-1"');
    expect(html).toContain('data-bag-instance="bag-2"');
    if (result.layout.unplacedItems.length > 0) {
      expect(html).toContain("data-instance-id=");
    } else {
      expect(result.complete).toBe(true);
      expect(html).toContain("data-item-instance=");
    }
  });

  it("Top-N: switching results does not call optimizeInventory again", () => {
    const result = optimizeInventory(
      {
        bagItemIds: ["medium_bag", "fanny_pack"],
        itemIds: ["adamantite_bar", "adamantite_ore", "starbloom"],
        options: { quality: "fast", resultCount: 3 },
      },
      catalog,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.results.length).toBeGreaterThan(1);
    let state = optimizerReducer(initialOptimizerState, { type: "OPTIMIZE_FINISHED", result });
    const firstSignature = state.selectedSignature;
    const second = result.results[1]!;
    state = optimizerReducer(state, { type: "SELECT_RESULT", signature: second.signature });
    expect(state.status).toBe("success");
    expect(state.selectedSignature).toBe(second.signature);
    expect(state.selectedSignature).not.toBe(firstSignature);
    expect(selectedLayout(state)?.signature).toBe(second.signature);
    const list = renderToStaticMarkup(
      <ResultList
        results={result.results}
        selectedSignature={state.selectedSignature}
        onSelect={() => {
          throw new Error("onSelect should not run optimize");
        }}
      />,
    );
    expect(list).toContain("Result 1");
    expect(list).toContain(`result-option-${result.results.length - 1}`);
  });
});
