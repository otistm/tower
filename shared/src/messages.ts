import { GridPos } from "./types.js";

/** Client -> Server message names. */
export enum ClientMessage {
  /** Player drags a card from hand onto a board cell. */
  PlaceCard = "placeCard",
  /** Player picks a placed card back up into their hand. */
  PickUpCard = "pickUpCard",
  /** Player buys a card from the shop (during Shopping phase). */
  BuyCard = "buyCard",
  /** Player sells a card (only allowed in a shop). */
  SellCard = "sellCard",
  /** Player combines two identical cards to evolve. */
  EvolveCard = "evolveCard",
  /** Player offers a card to another player (trade). */
  OfferTrade = "offerTrade",
  /** Player responds to a trade offer. */
  RespondTrade = "respondTrade",
  /** Player signals ready to leave Shopping and begin Battle. */
  ReadyUp = "readyUp",
  /** Player inspects a cell (request detailed info). */
  Inspect = "inspect",
  /** Re-roll the shop offerings (costs gold). */
  RerollShop = "rerollShop",
  /** Toggle the shop lock so offers persist into the next floor. */
  LockShop = "lockShop",
  /** Start a fresh climb after a Defeat/Victory. */
  Restart = "restart",
  /** Report the client's visible board size (in cells) so the board can grow. */
  SetViewport = "setViewport",
}

/** Server -> Client one-off (non-state) events for transient UI feedback. */
export enum ServerEvent {
  /** A card triggered its ability (for VFX). */
  AbilityFired = "abilityFired",
  /** Damage dealt somewhere (for floating numbers). */
  Damage = "damage",
  /** A chest/secret was uncovered. */
  Discovery = "discovery",
  /** Gold was awarded from a defeated enemy/chest (drives coin fly VFX). */
  GoldAwarded = "goldAwarded",
  /** Floor cleared / key acquired. */
  FloorCleared = "floorCleared",
  /** A boss's guardians were all defeated; the boss is now vulnerable. */
  BossVulnerable = "bossVulnerable",
  /** Trade request directed at a player. */
  TradeRequest = "tradeRequest",
  /** Generic toast/log message. */
  Log = "log",
}

export interface PlaceCardPayload {
  /** Instance id of the card in the player's hand. */
  cardInstanceId: string;
  pos: GridPos;
}

export interface PickUpCardPayload {
  cardInstanceId: string;
}

export interface BuyCardPayload {
  /** Offer slot index in the shop. */
  offerIndex: number;
}

export interface SellCardPayload {
  cardInstanceId: string;
}

export interface EvolveCardPayload {
  /** The two same-tier instances to combine. */
  cardInstanceIdA: string;
  cardInstanceIdB: string;
}

export interface OfferTradePayload {
  toPlayerId: string;
  cardInstanceId: string;
}

export interface RespondTradePayload {
  tradeId: string;
  accept: boolean;
}

export interface InspectPayload {
  pos: GridPos;
}

export interface SetViewportPayload {
  /** Number of board columns the client wants visible (incl. discovery pad). */
  cols: number;
  /** Number of board rows the client wants visible (incl. discovery pad). */
  rows: number;
}

export interface AbilityFiredEvent {
  sourceCellKey: string;
  ability: string;
  /** Which side fired, so the client can tint friendly vs. hostile VFX. */
  team?: "ally" | "enemy";
  /** Elemental family of the source (CardType value) for elemental VFX tinting. */
  family?: string;
  targets: GridPos[];
}

export interface DamageEvent {
  pos: GridPos;
  amount: number;
  reflected?: boolean;
  /** True when an anti-type bonus landed (lawnmower vs Living, Boom vs Stuff). */
  crit?: boolean;
}

export interface DiscoveryEvent {
  pos: GridPos;
  rewardCardId?: string;
  gold?: number;
  message: string;
}

export interface GoldAwardedEvent {
  /** Top-left cell of the defeated entity that granted the gold. */
  pos: GridPos;
  /** Footprint of that entity, so the client can target its center. */
  w: number;
  h: number;
  gold: number;
}

export interface LogEvent {
  message: string;
  level?: "info" | "warn" | "error";
}
