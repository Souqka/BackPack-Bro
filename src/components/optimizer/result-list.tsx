"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OptimizedLayoutResult } from "@/lib/optimizer/api/types.ts";

export function ResultList({
  results,
  selectedSignature,
  onSelect,
}: {
  results: OptimizedLayoutResult[];
  selectedSignature: string | null;
  onSelect: (signature: string) => void;
}) {
  if (results.length <= 1) return null;
  return (
    <Card data-testid="result-list">
      <CardHeader>
        <CardTitle>Top results</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {results.map((entry, index) => {
          const selected = entry.signature === selectedSignature;
          const score = entry.score.structuralScore;
          return (
            <Button
              key={entry.signature}
              type="button"
              variant={selected ? "default" : "outline"}
              className="h-auto w-full justify-between py-2"
              aria-pressed={selected}
              data-testid={`result-option-${index}`}
              onClick={() => onSelect(entry.signature)}
            >
              <span>Result {index + 1}</span>
              <span className="text-xs font-normal">
                Score {score === null ? "—" : score} · {entry.score.activatedStars} Stars
                {entry.complete ? "" : " · Incomplete"}
              </span>
            </Button>
          );
        })}
      </CardContent>
    </Card>
  );
}
