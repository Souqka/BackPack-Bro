import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ActiveStats } from "./active-stats.tsx";
import { ActiveSynergies } from "./active-synergies.tsx";
import { BagBonuses } from "./bag-bonuses.tsx";
import { BackpackGrid } from "./backpack-grid.tsx";
import { ResultList } from "./result-list.tsx";
import { ResultSummary } from "./result-summary.tsx";
import { UnplacedItems } from "./unplaced-items.tsx";
import { TooltipProvider } from "../ui/tooltip.tsx";
import { optimizeInventory } from "../../lib/optimizer/api/service.ts";
import { loadProductionCatalog } from "../../lib/optimizer/load-catalog.ts";
import { catalogViewFromItems } from "../../lib/ui/catalog-project.ts";
import { optimizerReducer, initialOptimizerState, selectedLayout, defaultGridViewOptions } from "../../lib/ui/optimizer-state.ts";
import { synergyId } from "../../lib/ui/grid-interaction.ts";

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

  it("Case G: one visual object per item instance and bags without images", () => {
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
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <BackpackGrid layout={result.layout} catalog={views} />
      </TooltipProvider>,
    );
    expect([...html.matchAll(/data-testid="placed-item-/g)]).toHaveLength(result.layout.items.length);
    expect([...html.matchAll(/<img\b/g)]).toHaveLength(result.layout.items.length);
    expect(html).not.toContain("/assets/items/medium_bag/");
    expect(html).not.toContain("/assets/items/warrior_backpack/");
    expect(html).toContain('data-testid="bag-footprint-bag-0"');
    expect(html).toContain('data-testid="bag-footprint-bag-1"');
    expect(result.score.activeStats).toBeDefined();
    const stats = renderToStaticMarkup(<ActiveStats stats={result.score.activeStats ?? []} />);
    expect(stats).toContain('data-testid="active-stats"');
    if ((result.score.activeStats?.length ?? 0) > 0) {
      expect(stats).toContain("data-stat-id=");
    }
  });

  it("Items layer toggle hides items without changing the optimizer result", () => {
    const result = optimizeInventory(
      {
        bagItemIds: ["warrior_backpack", "medium_bag"],
        itemIds: ["adamantite_bar", "adamantite_bar", "starbloom", "starbloom"],
        options: { quality: "fast", resultCount: 1 },
      },
      catalog,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    let state = optimizerReducer(initialOptimizerState, { type: "OPTIMIZE_FINISHED", result });
    const scoreBefore = selectedLayout(state)?.score.structuralScore;
    state = optimizerReducer(state, { type: "SET_VIEW_OPTION", option: "showItems", value: false });
    expect(state.result).toBe(result);
    expect(state.view.showBags).toBe(true);
    expect(state.view.showItemOutlines).toBe(true);
    expect(selectedLayout(state)?.score.structuralScore).toBe(scoreBefore);
    const hidden = renderToStaticMarkup(
      <TooltipProvider>
        <BackpackGrid layout={result.layout} catalog={views} view={state.view} />
      </TooltipProvider>,
    );
    expect(hidden).not.toContain("placed-item-");
    expect(hidden).not.toContain("star-marker");
    expect(hidden).toContain("bag-footprint-");
    expect(hidden).toContain("Warrior Backpack");
    expect(hidden).toContain("Medium Bag");
  });

  it("Case H: duplicate bags keep instance identity and catalog display names", () => {
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
        <BackpackGrid
          layout={result.layout}
          catalog={views}
          view={{ ...defaultGridViewOptions, showItems: false }}
        />
      </TooltipProvider>,
    );
    expect(html).toContain('data-instance-id="bag-0"');
    expect(html).toContain('data-instance-id="bag-1"');
    expect(html).toContain('data-instance-id="bag-2"');
    expect([...html.matchAll(/data-bag-name="Fanny Pack"/g)].length).toBeGreaterThanOrEqual(1);
    expect(html).not.toContain('data-bag-name="fanny_pack"');
    expect(html).not.toContain("/assets/items/fanny_pack/");
  });

  it("Active Stats follow the selected Top-N result without a new search", () => {
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
    const firstStats = selectedLayout(state)?.score.activeStats ?? [];
    const firstHtml = renderToStaticMarkup(<ActiveStats stats={firstStats} />);
    expect(firstHtml).toContain('data-testid="active-stats"');
    const second = result.results[1]!;
    state = optimizerReducer(state, { type: "SELECT_RESULT", signature: second.signature });
    expect(state.result).toBe(result);
    const switched = selectedLayout(state);
    expect(switched?.signature).toBe(second.signature);
    const secondHtml = renderToStaticMarkup(<ActiveStats stats={switched?.score.activeStats ?? []} />);
    expect(secondHtml).toContain('data-testid="active-stats"');
    expect(switched?.score.activeStats).toEqual(second.score.activeStats);
  });

  it("Case E: hiding items does not drop unplaced list or Active Stats", () => {
    const result = optimizeInventory(
      {
        bagItemIds: ["fanny_pack"],
        itemIds: ["adamantite_ore", "adamantite_ore", "adamantite_bar"],
        options: { quality: "fast", resultCount: 1 },
      },
      catalog,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    let state = optimizerReducer(initialOptimizerState, { type: "OPTIMIZE_FINISHED", result });
    state = optimizerReducer(state, { type: "SET_VIEW_OPTION", option: "showItems", value: false });
    const selected = selectedLayout(state)!;
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <BackpackGrid layout={selected.layout} catalog={views} view={state.view} />
        <ActiveStats stats={selected.score.activeStats ?? []} />
        <UnplacedItems items={selected.layout.unplacedItems} catalog={views} />
      </TooltipProvider>,
    );
    expect(html).toContain('data-testid="active-stats"');
    expect(html).not.toContain("placed-item-");
    if (selected.layout.unplacedItems.length > 0) {
      expect(html).toContain('data-testid="unplaced-items"');
      expect(html).toContain(`data-instance-id="${selected.layout.unplacedItems[0]!.instanceId}"`);
    }
  });

  it("Backpack Bonuses come from the serialized DTO and stay separate from Active Stats", () => {
    const result = optimizeInventory(
      {
        bagItemIds: ["warrior_backpack", "medium_bag"],
        itemIds: ["adamantite_bar", "adamantite_bar", "starbloom", "starbloom"],
        options: { quality: "fast", resultCount: 1 },
      },
      catalog,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const selected = result.results[0]!;
    expect(selected.bagBonuses).toBeDefined();
    const bonuses = renderToStaticMarkup(<BagBonuses bonuses={selected.bagBonuses ?? []} />);
    const stats = renderToStaticMarkup(<ActiveStats stats={selected.score.activeStats ?? []} />);
    expect(stats).toContain('data-testid="active-stats"');
    expect(bonuses).not.toContain('data-testid="active-stats"');
    if ((selected.bagBonuses?.length ?? 0) > 0) {
      expect(bonuses).toContain('data-testid="bag-bonuses"');
      expect(bonuses).toContain("data-stat-id=");
    } else {
      expect(bonuses).toContain('data-testid="bag-bonuses-empty"');
    }
  });

  it("Case G: explanation uses scoring activations and instance-level synergies", () => {
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
    const selected = result.results[0]!;
    expect(selected.explanation?.activatedStars.length).toBe(selected.score.activatedStars);
    const html = renderToStaticMarkup(
      <ActiveSynergies
        explanation={selected.explanation}
        catalog={views}
        previewSynergyId={null}
        selectedSynergyId={null}
        onPreview={() => undefined}
        onSelect={() => undefined}
      />,
    );
    if ((selected.explanation?.activatedStars.length ?? 0) === 0) {
      expect(html).toContain("No active Star synergies");
      return;
    }
    expect(html).toContain('data-testid="active-synergies"');
    const first = selected.explanation!.activatedStars[0]!;
    expect(html).toContain(`data-source-instance="${first.sourceInstanceId}"`);
    expect(html).toContain(`data-target-instance="${first.targetInstanceId}"`);
    const grid = renderToStaticMarkup(
      <TooltipProvider>
        <BackpackGrid layout={selected.layout} catalog={views} activeSynergy={first} />
      </TooltipProvider>,
    );
    expect(grid).toContain(`data-visual-role="source"`);
    expect(grid).toContain(`data-visual-role="target"`);
    expect(grid).toContain(`data-row="${first.row}"`);
    expect(grid).toContain(`data-col="${first.col}"`);
    expect(grid).toContain('data-emphasized="true"');
  });

  it("Top-N switches explanation without a new optimize and drops the previous synergy id", () => {
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
    const first = selectedLayout(state)!;
    const firstLink = first.explanation?.activatedStars[0];
    const firstId = firstLink ? synergyId(firstLink) : null;
    const second = result.results[1]!;
    state = optimizerReducer(state, { type: "SELECT_RESULT", signature: second.signature });
    expect(state.result).toBe(result);
    const switched = selectedLayout(state)!;
    expect(switched.signature).toBe(second.signature);
    expect(switched.explanation).toEqual(second.explanation);
    expect(switched.explanation).not.toBe(first.explanation);
    const secondHtml = renderToStaticMarkup(
      <ActiveSynergies
        explanation={switched.explanation}
        catalog={views}
        previewSynergyId={null}
        selectedSynergyId={firstId}
        onPreview={() => undefined}
        onSelect={() => {
          throw new Error("onSelect should not run optimize");
        }}
      />,
    );
    if (firstId) {
      expect(secondHtml).not.toContain(`aria-pressed="true"`);
    }
  });
});
