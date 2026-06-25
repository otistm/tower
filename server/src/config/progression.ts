import { SHOP_CARD_IDS } from "@tower/shared";

/**
 * The climb starts you with a tight, legible toolkit — one attacker, one wall,
 * one healer, one tempo buff — so floor 1 is a clear read instead of paradox of
 * choice. The rest of the roster unlocks as you clear floors (see FLOOR_UNLOCKS).
 */
export const STARTER_POOL: readonly string[] = ["tiger", "wall", "moss", "wind"];

/**
 * Cards added to every player's collection when they REACH the given floor
 * (i.e. after clearing the previous one). Spread so the toolbox grows steadily
 * and the full shop-eligible roster is unlocked by ~floor 8. Loosely themed to
 * the band you're entering (fire tools as you reach the foundry, etc.).
 */
export const FLOOR_UNLOCKS: Record<number, string[]> = {
  2: ["furnace", "lawnmower"],
  3: ["lockpick"],
  4: ["rocket", "fear_totem"],
  5: ["beehive"],
  6: ["mirror"],
  7: ["diamond_ring"],
  8: ["dragon"],
};

/** Build id -> earliest unlock floor from the starter set + the unlock table. */
const UNLOCK_FLOOR: Record<string, number> = (() => {
  const map: Record<string, number> = {};
  for (const id of STARTER_POOL) map[id] = 1;
  for (const [floor, ids] of Object.entries(FLOOR_UNLOCKS)) {
    for (const id of ids) map[id] = Math.min(map[id] ?? Infinity, Number(floor));
  }
  return map;
})();

/** Earliest floor a card becomes available (Infinity if never gated in). */
export function unlockFloorOf(id: string): number {
  return UNLOCK_FLOOR[id] ?? Infinity;
}

/**
 * Pool a chest can reward on a given floor. Chests are early discovery: they may
 * hand you a card up to a couple bands... a couple floors ahead of schedule, but
 * never something wildly out of depth (no dragon from a floor-1 chest).
 */
export function chestRewardPool(floor: number): string[] {
  const lookahead = floor + 2;
  const pool = SHOP_CARD_IDS.filter((id) => unlockFloorOf(id) <= lookahead);
  return pool.length > 0 ? pool : SHOP_CARD_IDS.slice();
}
