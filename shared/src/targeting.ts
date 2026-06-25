/**
 * Pure grid-targeting geometry shared by the server (authoritative combat) and
 * the client (drag-time attack/effect previews). Keeping one implementation
 * here means the threat cells a player sees while hovering a card exactly match
 * what the server will resolve.
 */
import { AbilityDef, TargetShape } from "./types.js";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Cell {
  x: number;
  y: number;
}

/** Chebyshev gap (cells) between two footprints, edge-to-edge. 0 = overlapping. */
export function footprintGap(a: Rect, b: Rect): number {
  return Math.max(horizGap(a, b), vertGap(a, b));
}
export function horizGap(a: Rect, b: Rect): number {
  return Math.max(b.x - (a.x + a.w - 1), a.x - (b.x + b.w - 1), 0);
}
export function vertGap(a: Rect, b: Rect): number {
  return Math.max(b.y - (a.y + a.h - 1), a.y - (b.y + b.h - 1), 0);
}
export function rowsOverlap(a: Rect, b: Rect): boolean {
  return a.y <= b.y + b.h - 1 && b.y <= a.y + a.h - 1;
}
export function colsOverlap(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.w - 1 && b.x <= a.x + a.w - 1;
}

/** Whether `target` falls within `shape` (range cells) relative to `src`. */
export function withinShape(src: Rect, target: Rect, shape: TargetShape, range: number): boolean {
  const gap = footprintGap(src, target);
  switch (shape) {
    case TargetShape.SelfCell:
      return gap === 0;
    case TargetShape.Adjacent:
      return gap > 0 && gap <= 1;
    case TargetShape.Surrounding:
      return gap > 0 && gap <= Math.max(1, range);
    case TargetShape.Row:
      return rowsOverlap(src, target) && horizGap(src, target) <= range;
    case TargetShape.Column:
      return colsOverlap(src, target) && vertGap(src, target) <= range;
    case TargetShape.Global:
      return true;
    case TargetShape.Nearest:
    default:
      return gap <= range;
  }
}

/** Area shapes hit everything in range; point shapes hit one unless `aoe`. */
export function abilityIsAoe(ability: AbilityDef): boolean {
  switch (ability.shape) {
    case TargetShape.Row:
    case TargetShape.Column:
    case TargetShape.Surrounding:
    case TargetShape.Global:
      return true;
    default:
      return ability.aoe === true;
  }
}

/**
 * Every in-bounds cell an ability could affect from `src` (its reach), used for
 * the drag-time highlight. This is the threat *area*, independent of whether a
 * foe currently stands there. For Global it returns the whole board.
 */
export function rangeCells(
  src: Rect,
  shape: TargetShape,
  range: number,
  boardW: number,
  boardH: number,
): Cell[] {
  const cells: Cell[] = [];
  const r = Math.max(1, range);

  // Bound the scan to a box around the footprint (whole board for Global).
  let x0 = 0;
  let y0 = 0;
  let x1 = boardW - 1;
  let y1 = boardH - 1;
  if (shape !== TargetShape.Global) {
    x0 = Math.max(0, src.x - r);
    y0 = Math.max(0, src.y - r);
    x1 = Math.min(boardW - 1, src.x + src.w - 1 + r);
    y1 = Math.min(boardH - 1, src.y + src.h - 1 + r);
  }

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const cell: Rect = { x, y, w: 1, h: 1 };
      if (withinShape(src, cell, shape, r)) cells.push({ x, y });
    }
  }
  return cells;
}
