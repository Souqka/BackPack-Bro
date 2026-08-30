"use client";

import { useMemo } from "react";
import { optimizeBackpackAction } from "@/app/actions/optimize";
import { OptimizerControls } from "@/components/optimizer/optimizer-controls";
import { BackpackGrid } from "@/components/optimizer/backpack-grid";
import { ResultList } from "@/components/optimizer/result-list";
import { ResultSummary } from "@/components/optimizer/result-summary";
import { UnplacedItems } from "@/components/optimizer/unplaced-items";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useOptimizer } from "@/hooks/use-optimizer";
import type { CatalogItemView } from "@/lib/ui/catalog-types.ts";
import { userFacingError } from "@/lib/ui/error-messages.ts";

export function OptimizerPanel({ catalog }: { catalog: CatalogItemView[] }) {
  const catalogMap = useMemo(() => new Map(catalog.map((item) => [item.id, item])), [catalog]);
  const { state, dispatch, run, busy, selected } = useOptimizer(optimizeBackpackAction);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]">
      <OptimizerControls
        catalog={catalogMap}
        state={state}
        dispatch={dispatch}
        busy={busy}
        onOptimize={run}
      />
      <div className="flex flex-col gap-4">
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
        <BackpackGrid layout={selected?.layout ?? null} catalog={catalogMap} />
        {state.result && selected ? (
          <>
            <ResultSummary result={state.result} selected={selected} />
            <ResultList
              results={state.result.results}
              selectedSignature={state.selectedSignature}
              onSelect={(signature) => dispatch({ type: "SELECT_RESULT", signature })}
            />
            <UnplacedItems items={selected.layout.unplacedItems} catalog={catalogMap} />
          </>
        ) : null}
      </div>
    </div>
  );
}
