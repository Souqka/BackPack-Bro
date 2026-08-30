"use client";

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
      className="pointer-events-none z-[3] flex items-start justify-end p-0.5 text-[10px] leading-none text-amber-300"
      style={{ gridColumn: col + 1, gridRow: row + 1 }}
      aria-hidden
    >
      ★
    </span>
  );
}
