"use client";

import { useMemo, useState } from "react";
import { optimizeBackpackAction } from "@/app/actions/optimize";
import { ActiveStats } from "@/components/optimizer/active-stats";
import { ActiveSynergies } from "@/components/optimizer/active-synergies";
import { BagBonuses } from "@/components/optimizer/bag-bonuses";
import { OptimizerControls } from "@/components/optimizer/optimizer-controls";
import { BackpackGrid } from "@/components/optimizer/backpack-grid";
import { ResultList } from "@/components/optimizer/result-list";
import { ResultSummary } from "@/components/optimizer/result-summary";
import { UnplacedItems } from "@/components/optimizer/unplaced-items";
import { ViewToggles } from "@/components/optimizer/view-toggles";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useOptimizer } from "@/hooks/use-optimizer";
import type { CatalogItemView } from "@/lib/ui/catalog-types.ts";
import { userFacingError } from "@/lib/ui/error-messages.ts";
import { resolveActiveSynergy } from "@/lib/ui/grid-interaction.ts";
import type { OptimizedLayoutResult, OptimizeInventorySuccess } from "@/lib/optimizer/api/types.ts";
import type { Dispatch } from "react";
import type { GridViewOptions, OptimizerUiAction } from "@/lib/ui/optimizer-state.ts";

export function OptimizerPanel({ catalog }: { catalog: CatalogItemView[] }) {
  const catalogMap = useMemo(() => new Map(catalog.map((item) => [item.id, item])), [catalog]);
  const { state, dispatch, run, busy, selected } = useOptimizer(optimizeBackpackAction);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(280px,320px)_minmax(0,1fr)] lg:items-start">
      <OptimizerControls
        catalog={catalogMap}
        state={state}
        dispatch={dispatch}
        busy={busy}
        onOptimize={run}
      />
      <div className="flex min-w-0 w-full max-w-xl flex-col gap-4">
        {state.status === "optimizing" ? (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm" role="status">
            <Skeleton className="h-4 w-4 rounded-full" />
            <span>Optimizing backpack...</span>
          </div>
        ) : null}
        {state.status === "error" && state.error ? (
          <Alert data-testid="optimizer-error">
            <AlertTitle>Could not optimize</AlertTitle>
            <AlertDescription>{userFacingError(state.error)}</AlertDescription>
          </Alert>
        ) : null}
        {state.result && selected ? (
          <SelectedResultView
            key={selected.signature}
            result={state.result}
            selected={selected}
            catalog={catalogMap}
            view={state.view}
            dispatch={dispatch}
          />
        ) : (
          <div className="flex w-fit max-w-full flex-col gap-2">
            <ViewToggles
              view={state.view}
              onChange={(option, value) => dispatch({ type: "SET_VIEW_OPTION", option, value })}
            />
            <div className="max-w-full overflow-x-auto">
              <div className="w-fit rounded-lg border border-border bg-zinc-900 p-1.5">
                <BackpackGrid layout={null} catalog={catalogMap} view={state.view} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SelectedResultView({
  result,
  selected,
  catalog,
  view,
  dispatch,
}: {
  result: OptimizeInventorySuccess;
  selected: OptimizedLayoutResult;
  catalog: Map<string, CatalogItemView>;
  view: GridViewOptions;
  dispatch: Dispatch<OptimizerUiAction>;
}) {
  const [hoveredInstanceId, setHoveredInstanceId] = useState<string | null>(null);
  const [previewSynergyId, setPreviewSynergyId] = useState<string | null>(null);
  const [selectedSynergyId, setSelectedSynergyId] = useState<string | null>(null);
  const activations = selected.explanation?.activatedStars ?? [];
  const activeSynergy = resolveActiveSynergy(activations, previewSynergyId, selectedSynergyId);

  return (
    <>
      <div className="flex w-fit max-w-full flex-col gap-2">
        <ViewToggles
          view={view}
          onChange={(option, value) => dispatch({ type: "SET_VIEW_OPTION", option, value })}
        />
        <div className="max-w-full overflow-x-auto">
          <div className="w-fit rounded-lg border border-border bg-zinc-900 p-1.5">
            <BackpackGrid
              layout={selected.layout}
              catalog={catalog}
              view={view}
              hoveredInstanceId={hoveredInstanceId}
              onHoverInstance={setHoveredInstanceId}
              activeSynergy={activeSynergy}
            />
          </div>
        </div>
      </div>
      <ResultSummary result={result} selected={selected} />
      <ActiveStats
        stats={selected.score.activeStats ?? []}
        activatedStars={selected.score.activatedStars}
      />
      <BagBonuses bonuses={selected.bagBonuses ?? []} />
      <ActiveSynergies
        explanation={selected.explanation}
        catalog={catalog}
        previewSynergyId={previewSynergyId}
        selectedSynergyId={selectedSynergyId}
        onPreview={setPreviewSynergyId}
        onSelect={setSelectedSynergyId}
      />
      <ResultList
        results={result.results}
        selectedSignature={selected.signature}
        onSelect={(signature) => dispatch({ type: "SELECT_RESULT", signature })}
      />
      <UnplacedItems items={selected.layout.unplacedItems} catalog={catalog} />
    </>
  );
}
