import { GameSnapshot } from "../../network/types";

/**
 * Client-side placement validation mirroring the server's authoritative check.
 * Used only for live drag preview feedback; the server has the final say.
 */
export function buildOccupancy(snapshot: GameSnapshot): Map<string, string> {
  const occ = new Map<string, string>();
  for (const c of Object.values(snapshot.cards)) {
    if (c.location !== "board") continue;
    for (let dy = 0; dy < c.h; dy++) {
      for (let dx = 0; dx < c.w; dx++) {
        occ.set(`${c.x + dx},${c.y + dy}`, c.instanceId);
      }
    }
  }
  for (const e of Object.values(snapshot.entities)) {
    if (!e.blocking) continue;
    for (let dy = 0; dy < e.h; dy++) {
      for (let dx = 0; dx < e.w; dx++) {
        occ.set(`${e.x + dx},${e.y + dy}`, e.entityId);
      }
    }
  }
  return occ;
}

export function canPlace(
  snapshot: GameSnapshot,
  x: number,
  y: number,
  w: number,
  h: number,
  ignoreId?: string,
): boolean {
  if (x < 0 || y < 0 || x + w > snapshot.boardWidth || y + h > snapshot.boardHeight) {
    return false;
  }
  const occ = buildOccupancy(snapshot);
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const occupant = occ.get(`${x + dx},${y + dy}`);
      if (occupant && occupant !== ignoreId) return false;
    }
  }
  return true;
}
