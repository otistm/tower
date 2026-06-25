import { Weather } from "@tower/shared";

/**
 * A themed band of floors. Biomes give the climb a sense of place and a shifting
 * challenge: each band has its own weather, terrain, enemy mix, and a signature
 * boss (defined in bosses.ts) that caps the band on its final floor.
 */
export interface BiomeDef {
  id: string;
  name: string;
  /** Inclusive floor range this biome covers. */
  minFloor: number;
  maxFloor: number;
  /** Weather pool; one is rolled per floor so the band feels cohesive. */
  weathers: Weather[];
  /** Obstacle art keys this biome scatters around. */
  obstacleArt: string[];
  /** Minion archetype ids (from bestiary) + spawn weights for this band. */
  archetypes: { id: string; weight: number }[];
  /** Boss id (BOSSES key) that guards the band's final floor. */
  bossId: string;
}

export const BIOMES: readonly BiomeDef[] = [
  {
    id: "verdant",
    name: "Verdant Wilds",
    minFloor: 1,
    maxFloor: 3,
    weathers: [Weather.Clear, Weather.Rain, Weather.Fog],
    obstacleArt: ["tree", "crystal", "rock"],
    archetypes: [
      { id: "grunt", weight: 3 },
      { id: "sparker", weight: 1 },
    ],
    bossId: "thornmaw",
  },
  {
    id: "ashen",
    name: "Ashen Foundry",
    minFloor: 4,
    maxFloor: 6,
    weathers: [Weather.Heat, Weather.Storm],
    obstacleArt: ["rock", "rubble"],
    archetypes: [
      { id: "brute", weight: 2 },
      { id: "sparker", weight: 3 },
    ],
    bossId: "molten_colossus",
  },
  {
    id: "frost",
    name: "Frostspire",
    minFloor: 7,
    maxFloor: 9,
    weathers: [Weather.Snow],
    obstacleArt: ["crystal", "rock"],
    archetypes: [
      { id: "brute", weight: 2 },
      { id: "frostling", weight: 3 },
    ],
    bossId: "frost_tyrant",
  },
  {
    id: "summit",
    name: "The Summit",
    minFloor: 10,
    maxFloor: 10,
    weathers: [Weather.Storm],
    obstacleArt: ["rubble", "crystal"],
    archetypes: [
      { id: "brute", weight: 2 },
      { id: "sparker", weight: 2 },
      { id: "frostling", weight: 1 },
    ],
    bossId: "tower_sovereign",
  },
] as const;

/** The biome covering a given floor (clamps to the last band past the summit). */
export function biomeForFloor(floor: number): BiomeDef {
  return (
    BIOMES.find((b) => floor >= b.minFloor && floor <= b.maxFloor) ?? BIOMES[BIOMES.length - 1]
  );
}

/** A floor caps its band (and thus spawns the band boss) on its final floor. */
export function isBossFloor(floor: number): boolean {
  return biomeForFloor(floor).maxFloor === floor;
}
