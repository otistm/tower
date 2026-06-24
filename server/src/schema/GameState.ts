import { ArraySchema, MapSchema, Schema, type } from "@colyseus/schema";
import { CardState } from "./CardState.js";
import { EntityState } from "./EntityState.js";
import { PlayerState } from "./PlayerState.js";
import { ShopOffer } from "./ShopOffer.js";

/** Root synchronized state for one tower-climb room. */
export class GameState extends Schema {
  /** GamePhase value from shared types. */
  @type("string") phase: string = "lobby";

  /** Current floor number (1-indexed). */
  @type("uint16") floor: number = 1;

  /** Final floor; clearing it wins the run. */
  @type("uint16") maxFloor: number = 10;

  /** Weather value from shared types. */
  @type("string") weather: string = "clear";

  /** Board dimensions in cells. */
  @type("uint16") boardWidth: number = 16;
  @type("uint16") boardHeight: number = 12;

  /** Battle countdown. When it hits 0 during Battle without a key -> Defeat. */
  @type("float32") timeRemainingMs: number = 0;

  /** Has the floor's key been acquired (boss defeated)? */
  @type("boolean") keyAcquired: boolean = false;

  /** Current kill-combo length during battle (0 when not chaining). */
  @type("uint16") killStreak: number = 0;
  /** Time left in the combo window; chaining a kill refreshes it. */
  @type("float32") streakTimerMs: number = 0;

  /** When locked, the shop keeps its offers across the next floor refresh. */
  @type("boolean") shopLocked: boolean = false;

  /** All card instances (hand + board) keyed by instanceId. */
  @type({ map: CardState }) cards = new MapSchema<CardState>();

  /** All board entities keyed by entityId. */
  @type({ map: EntityState }) entities = new MapSchema<EntityState>();

  /** Connected players keyed by sessionId. */
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();

  /** Current shop offerings (shared pool; appearance gated by collections). */
  @type([ ShopOffer ]) shop = new ArraySchema<ShopOffer>();
}
