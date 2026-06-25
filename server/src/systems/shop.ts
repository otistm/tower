import { CARD_CATALOG, CardTier, Rarity, getTierStats } from "@tower/shared";
import { ArraySchema } from "@colyseus/schema";
import { BALANCE } from "../config/balance.js";
import { STARTER_POOL } from "../config/progression.js";
import { GameState } from "../schema/GameState.js";
import { ShopOffer } from "../schema/ShopOffer.js";

export { STARTER_POOL };

const RARITY_WEIGHT: Record<string, number> = {
  [Rarity.Common]: 50,
  [Rarity.Uncommon]: 28,
  [Rarity.Rare]: 14,
  [Rarity.Epic]: 6,
  [Rarity.Legendary]: 2,
};

const SHOP_SIZE = BALANCE.shop.size;

/**
 * The pool of card ids eligible for the shop = the union of every player's
 * collection. Only cards a player has bought/found/discovered can appear.
 * If no one has unlocked anything yet, fall back to a basic starter pool so the
 * very first shop is never empty.
 */
function eligiblePool(state: GameState): string[] {
  const set = new Set<string>();
  state.players.forEach((p) => p.collection.forEach((id) => set.add(id)));
  if (set.size === 0) return STARTER_POOL.slice();
  // Never offer summoned tokens (e.g. bees) even if one slips into a collection.
  return Array.from(set).filter((id) => !CARD_CATALOG[id]?.token);
}

function weightedPick(pool: string[]): string {
  const weights = pool.map((id) => RARITY_WEIGHT[CARD_CATALOG[id]?.rarity] ?? 10);
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/** Roll a fresh set of shop offers for the current floor. */
export function rollShop(state: GameState): void {
  const pool = eligiblePool(state);
  const offers = new ArraySchema<ShopOffer>();
  for (let i = 0; i < SHOP_SIZE && pool.length > 0; i++) {
    const defId = weightedPick(pool);
    const def = CARD_CATALOG[defId];
    if (!def) continue;
    const stats = getTierStats(def, CardTier.Base);
    const offer = new ShopOffer();
    offer.defId = defId;
    offer.name = stats.name;
    offer.art = stats.art;
    offer.size = def.size;
    offer.cardType = def.type;
    offer.rarity = def.rarity;
    // Cost scales slightly with floor so later shops cost more.
    offer.cost = Math.max(
      1,
      Math.round(stats.buyCost * (1 + (state.floor - 1) * BALANCE.shop.costFloorScale)),
    );
    offer.sold = false;
    offers.push(offer);
  }
  state.shop = offers;
}
