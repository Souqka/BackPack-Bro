"use client";

import { cellBoxStyle } from "@/lib/ui/placement-view.ts";

export function StarMarker({
  row,
  col,
  instanceId,
}: {
  row: number;
  col: number;
  instanceId: string;
}) {
  return (
    <span
      data-testid="star-marker"
      data-star-instance={instanceId}
      data-row={row}
      data-col={col}
      className="flex items-start justify-end p-0.5 text-[10px] leading-none text-amber-300"
      style={cellBoxStyle(row, col)}
      aria-hidden
    >
      ★
    </span>
  );
}
