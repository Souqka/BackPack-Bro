"use client";

import { starCellCenterStyle } from "@/lib/ui/placement-view.ts";

export function StarMarker({
  row,
  col,
  instanceId,
  emphasized = false,
}: {
  row: number;
  col: number;
  instanceId: string;
  emphasized?: boolean;
}) {
  return (
    <span
      data-testid="star-marker"
      data-star-instance={instanceId}
      data-row={row}
      data-col={col}
      data-emphasized={emphasized ? "true" : "false"}
      className={emphasized ? "pointer-events-none text-amber-200" : "pointer-events-none text-amber-300"}
      style={{
        ...starCellCenterStyle(row, col),
        ...(emphasized
          ? { filter: "drop-shadow(0 0 6px rgba(252, 211, 77, 0.95))" }
          : undefined),
      }}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="h-full w-full fill-current drop-shadow" aria-hidden>
        <path d="M12 2.4 14.7 8.7 21.6 9.6 16.6 14.3 18 21.2 12 17.8 6 21.2 7.4 14.3 2.4 9.6 9.3 8.7Z" />
      </svg>
    </span>
  );
}
