import {
  AbilityKind,
  CARD_CATALOG,
  CardType,
  TargetShape,
  TargetTeam,
  WEATHER_CHART,
  Weather,
  getTierStats,
} from "@tower/shared";
import { CardState } from "../schema/CardState.js";
import { EntityState } from "../schema/EntityState.js";
import { GameState } from "../schema/GameState.js";
import { buildOccupancy, cellKey, footprintCells } from "./grid.js";

export interface EffectiveMods {
  damageMultiplier: number;
  cooldownMultiplier: number;
  healthBonus: number;
}

/** Combat modifiers applied to an enemy by nearby player cards (debuffs). */
export interface EnemyMods {
  /** >1 slows the enemy's attacks. */
  cooldownMultiplier: number;
  /** <1 weakens the enemy's damage. */
  damageMultiplier: number;
}

/** Edge-to-edge Chebyshev gap between two footprints (0 = overlapping). */
function rectGap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): number {
  const hx = Math.max(b.x - (a.x + a.w - 1), a.x - (b.x + b.w - 1), 0);
  const hy = Math.max(b.y - (a.y + a.h - 1), a.y - (b.y + b.h - 1), 0);
  return Math.max(hx, hy);
}

/** Cards that occupy any of the 8-neighbor cells around the given card. */
export function getNeighborCards(state: GameState, card: CardState): CardState[] {
  const occ = buildOccupancy(state);
  const found = new Set<string>();
  const result: CardState[] = [];

  for (const cell of footprintCells(card.x, card.y, card.w, card.h)) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const id = occ.get(cellKey(cell.x + dx, cell.y + dy));
        if (!id || id === card.instanceId || found.has(id)) continue;
        const neighbor = state.cards.get(id);
        if (neighbor && neighbor.location === "board") {
          found.add(id);
          result.push(neighbor);
        }
      }
    }
  }
  return result;
}

/**
 * Compute the effective combat modifiers for a card given:
 *  - its own definition's synergy rules vs. neighbors,
 *  - aura abilities of neighbors (Buff/Debuff/Shield/Reflect target this card),
 *  - the current weather.
 */
export function computeEffectiveMods(state: GameState, card: CardState): EffectiveMods {
  const mods: EffectiveMods = {
    damageMultiplier: 1,
    cooldownMultiplier: 1,
    healthBonus: 0,
  };

  const def = CARD_CATALOG[card.defId];
  if (!def) return mods;

  const neighbors = getNeighborCards(state, card);

  // 1) This card's own synergy rules reacting to its neighbors.
  for (const rule of def.synergies) {
    const match = neighbors.some((n) => {
      if (rule.withCardId) return n.defId === rule.withCardId;
      if (rule.withType) return n.cardType === rule.withType;
      return false;
    });
    if (match) {
      if (rule.effect.damageMultiplier) mods.damageMultiplier *= rule.effect.damageMultiplier;
      if (rule.effect.cooldownMultiplier) mods.cooldownMultiplier *= rule.effect.cooldownMultiplier;
      if (rule.effect.healthBonus) mods.healthBonus += rule.effect.healthBonus;
    }
  }

  // 2) Neighboring aura cards (furnace buff, wind haste, fear debuff if enemy, etc.).
  for (const n of neighbors) {
    const nDef = CARD_CATALOG[n.defId];
    if (!nDef) continue;
    const nStats = getTierStats(nDef, n.tier);
    const sameOwner = n.ownerId === card.ownerId;
    for (const ability of nStats.abilities) {
      const aoe =
        ability.shape === TargetShape.Adjacent ||
        ability.shape === TargetShape.Surrounding;
      if (!aoe) continue;
      if (ability.kind === AbilityKind.Buff && sameOwner) {
        // power < 1 => cooldown reducer (wind); power > 1 => damage amp (furnace)
        if (ability.power < 1) mods.cooldownMultiplier *= ability.power;
        else mods.damageMultiplier *= ability.power;
      }
      if (ability.kind === AbilityKind.Debuff && !sameOwner) {
        mods.cooldownMultiplier *= ability.power; // power > 1 slows
        mods.damageMultiplier *= 1 / ability.power;
      }
    }
  }

  // 3) Weather chart by card family/type.
  const weather = state.weather as Weather;
  const wmod = WEATHER_CHART[weather]?.[card.cardType as CardType];
  if (wmod) {
    if (wmod.damageMultiplier) mods.damageMultiplier *= wmod.damageMultiplier;
    if (wmod.cooldownMultiplier) mods.cooldownMultiplier *= wmod.cooldownMultiplier;
  }

  return mods;
}

/**
 * Debuffs an enemy receives from nearby player cards. This is what makes the
 * Thinking family (fear totems, etc.) actually do its job: its Debuff aura, which
 * targets enemies, slows and weakens any minion/boss in range. Previously auras
 * only touched neighboring *cards*, so debuffs against entities did nothing.
 */
export function computeEnemyMods(state: GameState, enemy: EntityState): EnemyMods {
  const mods: EnemyMods = { cooldownMultiplier: 1, damageMultiplier: 1 };

  // Weather sways enemies by their family the same way it sways player cards:
  // Living goblins rage in the rain, Boom sparkers fizzle, etc. Rolled at floor
  // start and shown during shopping, so it's a read the party can plan around.
  if (enemy.family) {
    const wmod = WEATHER_CHART[state.weather as Weather]?.[enemy.family as CardType];
    if (wmod) {
      if (wmod.damageMultiplier) mods.damageMultiplier *= wmod.damageMultiplier;
      if (wmod.cooldownMultiplier) mods.cooldownMultiplier *= wmod.cooldownMultiplier;
    }
  }

  state.cards.forEach((card) => {
    if (card.location !== "board") return;
    const def = CARD_CATALOG[card.defId];
    if (!def) return;
    const stats = getTierStats(def, card.tier);
    for (const ability of stats.abilities) {
      if (ability.kind !== AbilityKind.Debuff) continue;
      if (ability.target !== TargetTeam.Enemies) continue;
      const range =
        ability.shape === TargetShape.Surrounding ? Math.max(1, ability.range ?? 1) : 1;
      if (rectGap(card, enemy) > range) continue;
      // power > 1: stronger dread. Slow attacks, sap damage.
      mods.cooldownMultiplier *= ability.power;
      mods.damageMultiplier *= 1 / ability.power;
    }
  });

  return mods;
}

/**
 * Total shield contribution available to a card from neighboring wall cards.
 * Walls shield connected allies until destroyed.
 */
export function shieldFromNeighbors(state: GameState, card: CardState): number {
  let shield = 0;
  for (const n of getNeighborCards(state, card)) {
    if (n.ownerId !== card.ownerId) continue;
    const nDef = CARD_CATALOG[n.defId];
    if (!nDef) continue;
    const stats = getTierStats(nDef, n.tier);
    for (const ability of stats.abilities) {
      if (ability.kind === AbilityKind.Shield) {
        shield += Math.floor(n.health * ability.power);
      }
    }
  }
  return shield;
}

/**
 * The strongest shield fraction protecting a card from neighboring walls. This
 * is the wall's Shield `power` (Wood 0.5, Stone 0.65, Iron 0.8), so a sturdier
 * wall actually absorbs more — previously every wall flatly soaked 50% and the
 * tiers felt identical. Walls don't stack; the best one wins.
 */
export function wallShieldFraction(state: GameState, card: CardState): number {
  let best = 0;
  for (const n of getNeighborCards(state, card)) {
    if (n.ownerId !== card.ownerId || n.health <= 0) continue;
    const nDef = CARD_CATALOG[n.defId];
    if (!nDef) continue;
    for (const ability of getTierStats(nDef, n.tier).abilities) {
      if (ability.kind === AbilityKind.Shield) best = Math.max(best, ability.power);
    }
  }
  return Math.min(0.9, best);
}

/**
 * Reflection fraction applied to incoming damage to a card, from neighbor mirrors.
 * Returns the highest reflect fraction among neighbors (they don't stack).
 */
export function reflectFromNeighbors(state: GameState, card: CardState): number {
  let best = 0;
  for (const n of getNeighborCards(state, card)) {
    if (n.ownerId !== card.ownerId) continue;
    const nDef = CARD_CATALOG[n.defId];
    if (!nDef) continue;
    const stats = getTierStats(nDef, n.tier);
    for (const ability of stats.abilities) {
      if (ability.kind === AbilityKind.Reflect) best = Math.max(best, ability.power);
    }
  }
  return best;
}
