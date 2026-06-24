/**
 * Core domain types shared between the Colyseus server and the Phaser/React client.
 * These are framework-agnostic plain types/enums describing the game's rules.
 */

/** Footprint of a card on the grid. */
export enum CardSize {
  Tiny = "tiny", // 1x1 (trinkets/drops like a wooden sword)
  Small = "small", // 2x2
  Medium = "medium", // 2x3
  Large = "large", // 3x3
}

/** Grid footprint (width x height in cells) for each card size. */
export const SIZE_FOOTPRINT: Record<CardSize, { w: number; h: number }> = {
  [CardSize.Tiny]: { w: 1, h: 1 },
  [CardSize.Small]: { w: 2, h: 2 },
  [CardSize.Medium]: { w: 2, h: 3 },
  [CardSize.Large]: { w: 3, h: 3 },
};

/**
 * Base cooldown (ms) before a card triggers its effect, derived from its size.
 * Smaller cards trigger faster than larger cards.
 */
export const SIZE_BASE_COOLDOWN_MS: Record<CardSize, number> = {
  [CardSize.Tiny]: 1000,
  [CardSize.Small]: 1200,
  [CardSize.Medium]: 2000,
  [CardSize.Large]: 3500,
};

/**
 * The five elemental families.
 * - Stuff: stone, metal, sea, ice. Durable, heavy, slow. Walls and rust.
 * - Living: moss, bugs, animals, forests. Grows, swarms, self-heals.
 * - Boom: fire, lightning, storms. The only real damage, but fast-fading and weak.
 * - Thinking: fear, forgetting, guessing, sadness. Alters behavior; never physical damage.
 * - Built: tools, engines, forts, rules. Special jobs; inert until used; shelters.
 */
export enum CardType {
  Stuff = "stuff",
  Living = "living",
  Boom = "boom",
  Thinking = "thinking",
  Built = "built",
}

/** Short display name per family, for badges and inspector text. */
export const CARD_TYPE_LABEL: Record<CardType, string> = {
  [CardType.Stuff]: "Stuff",
  [CardType.Living]: "Living",
  [CardType.Boom]: "Boom",
  [CardType.Thinking]: "Thinking",
  [CardType.Built]: "Built",
};

/** Evolution tier. Combining two of the same card+tier produces the next tier. */
export enum CardTier {
  Base = 1,
  Evolved = 2,
  Grand = 3,
}

/** How a card behaves over a tower climb. */
export enum CardDurability {
  /** Reusable for the whole climb (e.g. a tiger). */
  Persistent = "persistent",
  /** Destroyed after a single use (e.g. a single-blast rocket). */
  Consumable = "consumable",
}

/** What a card primarily does when its cooldown fires. */
export enum AbilityKind {
  Attack = "attack", // deal damage to enemies
  Heal = "heal", // restore health to allies
  Buff = "buff", // strengthen adjacent allies
  Debuff = "debuff", // weaken adjacent enemies
  Shield = "shield", // protect connected cards (walls, mirrors)
  Reflect = "reflect", // bounce incoming attacks (mirror)
  Spawn = "spawn", // create new entities (forest, swarm)
  Economy = "economy", // produce/convert gold (diamond ring)
  Terrain = "terrain", // modify the board (lawnmower, rocket scorch)
  Utility = "utility", // misc/special (key, chest, portal)
}

/** Targeting pattern an ability uses on the grid. */
export enum TargetShape {
  SelfCell = "self", // affects only this card's cell(s)
  Adjacent = "adjacent", // 4-neighborhood
  Surrounding = "surrounding", // 8-neighborhood
  Row = "row",
  Column = "column",
  Nearest = "nearest", // nearest valid target on the board
  Global = "global",
}

/** Who an ability targets. */
export enum TargetTeam {
  Enemies = "enemies",
  Allies = "allies",
  Any = "any",
  Empty = "empty", // empty cells (terrain effects, spawns)
}

/** Weather conditions on a floor. Each can buff/debuff card types. */
export enum Weather {
  Clear = "clear",
  Rain = "rain", // debuffs Boom (fire), buffs Living
  Storm = "storm", // buffs Boom (lightning), hazards
  Snow = "snow", // slows cooldowns, buffs Stuff (ice)
  Fog = "fog", // buffs Thinking, reduces accuracy
  Heat = "heat", // buffs Boom (fire), debuffs Living
}

/** Types of contents that can occupy a board cell besides player cards. */
export enum EntityKind {
  PlayerCard = "playerCard",
  Minion = "minion",
  Boss = "boss",
  Obstacle = "obstacle", // walls, rubble - block placement
  Chest = "chest", // contains loot/cards
  Secret = "secret", // hidden until uncovered
  Terrain = "terrain", // grass, water, scorched earth (non-blocking modifiers)
  Portal = "portal", // entrance to a mini-board / hidden shop
  Door = "door", // exit to next floor; opened by the key
}

/** A single ability definition attached to a card. */
export interface AbilityDef {
  kind: AbilityKind;
  power: number;
  target: TargetTeam;
  shape: TargetShape;
  /** Optional range in cells for Nearest/area shapes. */
  range?: number;
  /** For Spawn abilities: the catalog id of the token to create. */
  spawnId?: string;
  /**
   * For Attack abilities: fraction of damage dealt that heals the attacker
   * (0..1). Gives predators a "feed on the kill" identity instead of behaving
   * like an inert turret. Living things should sustain themselves.
   */
  lifesteal?: number;
  /**
   * For Attack abilities: the enemy family this ability is especially good
   * against (e.g. a lawnmower vs. Living, Boom vs. Stuff). Damage against a
   * foe of this family is scaled by `bonusMultiplier`.
   */
  bonusVsType?: CardType;
  /** Damage multiplier applied when a target matches `bonusVsType` (e.g. 1.5). */
  bonusMultiplier?: number;
  /** Human-readable flavor of what happens. */
  description: string;
}

/** Per-tier stats for a card. Index 0 = Base, 1 = Evolved, 2 = Grand. */
export interface TierStats {
  name: string;
  /** Max health. null/undefined means the card has no health (inert object). */
  maxHealth?: number;
  /** Cooldown multiplier applied to the size base cooldown. */
  cooldownMultiplier: number;
  /** Gold value when sold in a shop. */
  sellValue: number;
  /** Cost to buy in the shop (only relevant at Base typically). */
  buyCost: number;
  /** Image/sprite key for this tier (full-bleed art). */
  art: string;
  /** Abilities active at this tier. */
  abilities: AbilityDef[];
}

/** Adjacency synergy: when `withType` is a neighbor, modify this card. */
export interface SynergyRule {
  /** Neighbor card type that triggers the synergy. */
  withType?: CardType;
  /** Or a specific neighbor card definition id. */
  withCardId?: string;
  /** Buff/debuff applied. */
  effect: {
    damageMultiplier?: number;
    cooldownMultiplier?: number;
    healthBonus?: number;
  };
  description: string;
}

/** How a card's type/family reacts to weather. */
export interface WeatherModifier {
  damageMultiplier?: number;
  cooldownMultiplier?: number;
}

/** Static definition of a card (the "blueprint"). Instances reference this. */
export interface CardDef {
  id: string;
  /** Display family/name root, e.g. "tiger". */
  family: string;
  type: CardType;
  size: CardSize;
  durability: CardDurability;
  /** Stats per tier; must contain 3 entries (Base, Evolved, Grand). */
  tiers: [TierStats, TierStats, TierStats];
  /** Adjacency synergies. */
  synergies: SynergyRule[];
  /** Short description of the card's real-world behavior. */
  lore: string;
  /** Rarity affects shop appearance odds. */
  rarity: Rarity;
  /**
   * Token cards are summoned by Spawn abilities, never bought or discovered.
   * They are excluded from the shop and chest pools and cleaned up between floors.
   */
  token?: boolean;
  /**
   * Drop-only cards are granted by gameplay (e.g. a wooden sword from a slain
   * goblin), never sold in shops or stashed in chests. Unlike tokens they are
   * real, persistent cards the player keeps.
   */
  dropOnly?: boolean;
}

export enum Rarity {
  Common = "common",
  Uncommon = "uncommon",
  Rare = "rare",
  Epic = "epic",
  Legendary = "legendary",
}

/** Per-type weather chart. */
export const WEATHER_CHART: Record<Weather, Partial<Record<CardType, WeatherModifier>>> = {
  [Weather.Clear]: {},
  [Weather.Rain]: {
    [CardType.Boom]: { damageMultiplier: 0.5 },
    [CardType.Living]: { damageMultiplier: 1.2, cooldownMultiplier: 0.9 },
  },
  [Weather.Storm]: {
    [CardType.Boom]: { damageMultiplier: 1.5, cooldownMultiplier: 0.8 },
    [CardType.Living]: { damageMultiplier: 0.9 },
  },
  [Weather.Snow]: {
    [CardType.Stuff]: { damageMultiplier: 1.2 },
    [CardType.Living]: { cooldownMultiplier: 1.3 },
    [CardType.Boom]: { damageMultiplier: 0.8 },
  },
  [Weather.Fog]: {
    [CardType.Thinking]: { damageMultiplier: 1.4, cooldownMultiplier: 0.8 },
  },
  [Weather.Heat]: {
    [CardType.Boom]: { damageMultiplier: 1.4 },
    [CardType.Living]: { damageMultiplier: 0.8, cooldownMultiplier: 1.2 },
    [CardType.Stuff]: { damageMultiplier: 1.0 },
  },
};

/** Phase of a floor / the overall climb. */
export enum GamePhase {
  Lobby = "lobby",
  Shopping = "shopping", // start of floor: buy cards
  Battle = "battle", // autobattle in progress
  FloorCleared = "floorCleared", // boss defeated, key acquired
  Defeat = "defeat", // ran out of cards or time
  Victory = "victory", // tower complete
}

/** A coordinate on the board grid. */
export interface GridPos {
  x: number;
  y: number;
}
