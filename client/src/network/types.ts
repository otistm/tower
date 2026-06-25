/**
 * Plain-object snapshot shapes mirroring the server's Colyseus schema
 * (obtained via room.state.toJSON()). Used for React rendering.
 */

export interface CardSnapshot {
  instanceId: string;
  defId: string;
  ownerId: string;
  location: string; // "hand" | "board"
  x: number;
  y: number;
  w: number;
  h: number;
  size: string;
  cardType: string;
  durability: string;
  tier: number;
  health: number;
  maxHealth: number;
  cooldownTotalMs: number;
  cooldownRemainingMs: number;
  attacking: boolean;
  takingDamage: boolean;
  shield: number;
  /** Rooted/frozen timer (ms) from a boss signature; >0 = cannot act. */
  frozenMs: number;
}

export interface EntitySnapshot {
  entityId: string;
  kind: string;
  family: string;
  art: string;
  x: number;
  y: number;
  w: number;
  h: number;
  health: number;
  maxHealth: number;
  attackPower: number;
  cooldownTotalMs: number;
  cooldownRemainingMs: number;
  blocking: boolean;
  hidden: boolean;
  rewardCardId: string;
  rewardGold: number;
  attacking: boolean;
  takingDamage: boolean;
  /** A guarded boss ignores damage until its guardians fall. */
  invulnerable: boolean;
  /** Marks a minion as one of a boss's guardians. */
  bossGuard: boolean;
}

export interface PlayerSnapshot {
  id: string;
  name: string;
  color: string;
  gold: number;
  ready: boolean;
  connected: boolean;
  collection: string[];
}

export interface ShopOfferSnapshot {
  defId: string;
  name: string;
  art: string;
  size: string;
  cardType: string;
  rarity: string;
  cost: number;
  sold: boolean;
}

export interface GameSnapshot {
  phase: string;
  floor: number;
  maxFloor: number;
  weather: string;
  biome: string;
  boardWidth: number;
  boardHeight: number;
  timeRemainingMs: number;
  keyAcquired: boolean;
  killStreak: number;
  shopLocked: boolean;
  rerollCount: number;
  cards: Record<string, CardSnapshot>;
  entities: Record<string, EntitySnapshot>;
  players: Record<string, PlayerSnapshot>;
  shop: ShopOfferSnapshot[];
}
