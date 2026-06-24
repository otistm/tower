import { CardType } from "@tower/shared";

/**
 * A minion archetype. The same base stats (from BALANCE.minion) are reshaped by
 * these multipliers so each family *feels* different on the board:
 *  - Living grunts are the baseline swarm.
 *  - Stuff brutes are slow, heavy walls of HP (soft to Boom, hard to chip).
 *  - Boom sparkers are fragile glass cannons that hit fast and hard.
 *
 * Variety is intentional: it turns anti-type cards into a real read ("there's a
 * pack of Living goblins - the lawnmower earns its keep") instead of a flat buff.
 */
export interface MinionArchetype {
  id: string;
  name: string;
  family: CardType;
  art: string;
  healthMult: number;
  attackMult: number;
  cooldownMult: number;
  /** Earliest floor this archetype can appear (keeps floor 1 a clean tutorial). */
  minFloor: number;
  /** Relative spawn weight among eligible archetypes. */
  weight: number;
}

export const MINION_ARCHETYPES: readonly MinionArchetype[] = [
  {
    id: "grunt",
    name: "Goblin Grunt",
    family: CardType.Living,
    art: "goblin",
    healthMult: 1.0,
    attackMult: 1.0,
    cooldownMult: 1.0,
    minFloor: 1,
    weight: 3,
  },
  {
    id: "brute",
    name: "Goblin Brute",
    family: CardType.Stuff,
    art: "goblin",
    healthMult: 1.6,
    attackMult: 0.85,
    cooldownMult: 1.25,
    minFloor: 2,
    weight: 2,
  },
  {
    id: "sparker",
    name: "Goblin Sparker",
    family: CardType.Boom,
    art: "goblin",
    healthMult: 0.65,
    attackMult: 1.35,
    cooldownMult: 0.8,
    minFloor: 2,
    weight: 2,
  },
] as const;

/** The boss is an armored knight: Stuff. Boom (fire) is the way through plate. */
export const BOSS_FAMILY: CardType = CardType.Stuff;

/** Obstacle art -> family, so terrain reads elementally (stone is Stuff, a tree is Living). */
export const OBSTACLE_FAMILY: Record<string, CardType> = {
  rock: CardType.Stuff,
  rubble: CardType.Stuff,
  crystal: CardType.Stuff,
  tree: CardType.Living,
};

/** Weighted pick among archetypes eligible for the given floor. */
export function pickMinionArchetype(floor: number, rng: () => number): MinionArchetype {
  const eligible = MINION_ARCHETYPES.filter((a) => floor >= a.minFloor);
  const total = eligible.reduce((s, a) => s + a.weight, 0);
  let roll = rng() * total;
  for (const a of eligible) {
    roll -= a.weight;
    if (roll <= 0) return a;
  }
  return eligible[eligible.length - 1];
}
