"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OptimizeInventorySuccess } from "@/lib/optimizer/api/types.ts";
import type { OptimizedLayoutResult } from "@/lib/optimizer/api/types.ts";

export function ResultSummary({
  result,
  selected,
}: {
  result: OptimizeInventorySuccess;
  selected: OptimizedLayoutResult;
}) {
  const placed = selected.layout.items.length;
  const unplaced = selected.layout.unplacedItems.length;
  const total = placed + unplaced;
  const score = selected.score.structuralScore;
  return (
    <Card data-testid="result-summary">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Result</CardTitle>
        <Badge variant={selected.complete ? "success" : "warning"} data-testid="complete-badge">
          {selected.complete ? "Complete" : "Incomplete"}
        </Badge>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
          <Stat label="Score" value={score === null ? "Invalid" : String(score)} testId="stat-score" />
          <Stat label="Stars" value={String(selected.score.activatedStars)} testId="stat-stars" />
          <Stat label="Items" value={`${placed} / ${total}`} testId="stat-items" />
          <Stat label="Unplaced" value={String(unplaced)} testId="stat-unplaced" />
          <Stat label="Time" value={`${result.execution.durationMs} ms`} testId="stat-duration" />
          <Stat label="Coverage" value={String(selected.score.effectCoverage)} testId="stat-coverage" />
        </dl>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}
