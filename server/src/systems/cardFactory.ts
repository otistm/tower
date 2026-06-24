import {
  CARD_CATALOG,
  CardDef,
  CardTier,
  SIZE_BASE_COOLDOWN_MS,
  SIZE_FOOTPRINT,
  getTierStats,
} from "@tower/shared";
import { CardState } from "../schema/CardState.js";

let counter = 0;

/** Generate a unique instance id. */
export function newInstanceId(prefix = "card"): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter}`;
}

/** Compute the base (size-derived, tier-adjusted) cooldown for a card. */
export function computeBaseCooldown(def: CardDef, tier: CardTier): number {
  const stats = getTierStats(def, tier);
  return SIZE_BASE_COOLDOWN_MS[def.size] * stats.cooldownMultiplier;
}

/** Create a fresh CardState for a player's hand from a catalog def id. */
export function createCard(
  defId: string,
  ownerId: string,
  tier: CardTier = CardTier.Base,
): CardState {
  const def = CARD_CATALOG[defId];
  if (!def) throw new Error(`Unknown card def: ${defId}`);
  const stats = getTierStats(def, tier);
  const footprint = SIZE_FOOTPRINT[def.size];

  const card = new CardState();
  card.instanceId = newInstanceId(defId);
  card.defId = defId;
  card.ownerId = ownerId;
  card.location = "hand";
  card.x = -1;
  card.y = -1;
  card.w = footprint.w;
  card.h = footprint.h;
  card.size = def.size;
  card.cardType = def.type;
  card.durability = def.durability;
  card.tier = tier;
  card.maxHealth = stats.maxHealth ?? 0;
  card.health = stats.maxHealth ?? 0;
  card.cooldownTotalMs = computeBaseCooldown(def, tier);
  card.cooldownRemainingMs = card.cooldownTotalMs;
  card.shield = 0;
  return card;
}
