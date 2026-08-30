export const GRID_ROWS = 6;
export const GRID_COLS = 9;
/** Documentation of the CSS --cell-size breakpoints. Positioning uses the CSS variable, not these numbers. */
export const CELL_SIZE_DESKTOP_PX = 48;
export const CELL_SIZE_TABLET_PX = 42;
export const CELL_SIZE_MOBILE_PX = 36;
export const MAX_UI_RESULT_COUNT = 10;
export const RESULT_COUNT_CHOICES = [1, 3, 5] as const;
export const MAX_LINE_QUANTITY = 20;

export const QUALITY_LABELS = {
  fast: "Fast",
  balanced: "Balanced",
  high: "High",
} as const;
