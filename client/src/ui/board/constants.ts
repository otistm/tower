/** Board-space pixel size of one grid cell (before camera zoom). */
export const CELL = 132;
/** On-screen card scale applied after fit-to-view sizing. */
export const CARD_DISPLAY_SCALE = 0.95;
/** Fixed on-screen size (px) of one grid cell; lower this to shrink the grid. */
export const BOARD_CELL_PX = 88;
/** Extra rows/columns beyond the visible area, to pan into and discover. */
export const DISCOVERY_PAD = 4;
/** Gap between cells in board space. A thin gap keeps the mosaic tight. */
export const GAP = 3;

/** Pixel size of an N-cell span including inter-cell gaps. */
export const cardPx = (n: number): number => n * CELL + (n - 1) * GAP;
/** Stride from one cell origin to the next. */
export const STRIDE = CELL + GAP;
