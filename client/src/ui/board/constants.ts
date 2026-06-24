/** Board-space pixel size of one grid cell (before camera zoom). */
export const CELL = 132;
/** Gap between cells in board space. A thin gap keeps the mosaic tight. */
export const GAP = 3;

/** Pixel size of an N-cell span including inter-cell gaps. */
export const cardPx = (n: number): number => n * CELL + (n - 1) * GAP;
/** Stride from one cell origin to the next. */
export const STRIDE = CELL + GAP;
