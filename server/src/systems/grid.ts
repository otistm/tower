import { GridPos } from "@tower/shared";
import { GameState } from "../schema/GameState.js";

/** Stringify a cell for occupancy maps. */
export function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

/** Iterate every cell covered by a footprint at (x, y). */
export function footprintCells(x: number, y: number, w: number, h: number): GridPos[] {
  const cells: GridPos[] = [];
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      cells.push({ x: x + dx, y: y + dy });
    }
  }
  return cells;
}

export function inBounds(state: GameState, x: number, y: number, w = 1, h = 1): boolean {
  return x >= 0 && y >= 0 && x + w <= state.boardWidth && y + h <= state.boardHeight;
}

/**
 * Build a map of occupied cells -> occupant id (card instanceId or entityId).
 * Used to validate placement and to resolve targeting.
 */
export function buildOccupancy(state: GameState): Map<string, string> {
  const occ = new Map<string, string>();
  state.cards.forEach((c) => {
    if (c.location !== "board") return;
    for (const cell of footprintCells(c.x, c.y, c.w, c.h)) {
      occ.set(cellKey(cell.x, cell.y), c.instanceId);
    }
  });
  state.entities.forEach((e) => {
    if (!e.blocking) return;
    for (const cell of footprintCells(e.x, e.y, e.w, e.h)) {
      occ.set(cellKey(cell.x, cell.y), e.entityId);
    }
  });
  return occ;
}

/** Can a card with footprint (w,h) be placed at (x,y)? */
export function canPlace(
  state: GameState,
  x: number,
  y: number,
  w: number,
  h: number,
  ignoreId?: string,
): boolean {
  if (!inBounds(state, x, y, w, h)) return false;
  const occ = buildOccupancy(state);
  for (const cell of footprintCells(x, y, w, h)) {
    const occupant = occ.get(cellKey(cell.x, cell.y));
    if (occupant && occupant !== ignoreId) return false;
  }
  return true;
}

/** Chebyshev (8-neighborhood) distance between two footprint-anchored objects. */
export function distance(a: GridPos, b: GridPos): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/** Center-ish anchor of a footprint, for distance checks. */
export function anchor(x: number, y: number, w: number, h: number): GridPos {
  return { x: x + (w - 1) / 2, y: y + (h - 1) / 2 };
}
