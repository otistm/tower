import { Schema, type } from "@colyseus/schema";

/**
 * A live instance of a card. References a CardDef in the shared catalog by `defId`.
 * Lives either in a player's hand (`location = "hand"`) or on the board
 * (`location = "board"` with x/y set).
 */
export class CardState extends Schema {
  @type("string") instanceId: string = "";
  @type("string") defId: string = "";
  @type("string") ownerId: string = "";

  /** "hand" | "board" */
  @type("string") location: string = "hand";

  /** Board position (top-left cell for multi-cell cards). -1 when in hand. */
  @type("int16") x: number = -1;
  @type("int16") y: number = -1;

  /** Footprint in cells. */
  @type("uint8") w: number = 1;
  @type("uint8") h: number = 1;

  /** Mirrors the def for convenience/UI without a catalog lookup. */
  @type("string") size: string = "small";
  @type("string") cardType: string = "stuff";
  @type("string") durability: string = "persistent";
  @type("uint8") tier: number = 1;

  /** Combat stats for the current tier (0 maxHealth = inert/no health). */
  @type("int32") health: number = 0;
  @type("int32") maxHealth: number = 0;

  /** Autobattler cooldown. cooldownRemaining counts down to 0, then fires. */
  @type("float32") cooldownTotalMs: number = 0;
  @type("float32") cooldownRemainingMs: number = 0;

  /** Transient combat flags (drive the footer progress bar / VFX on client). */
  @type("boolean") attacking: boolean = false;
  @type("boolean") takingDamage: boolean = false;

  /** Temporary shield pool absorbed before health (from walls/mirrors). */
  @type("int32") shield: number = 0;

  /** Summoned token (from a Spawn ability): not bought, not returned to hand. */
  @type("boolean") token: boolean = false;
  /** For tokens: ms of life left on the board before fading (0 = permanent). */
  @type("float32") lifetimeMs: number = 0;
}
