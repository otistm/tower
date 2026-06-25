import { Schema, type } from "@colyseus/schema";

/**
 * A non-player occupant of the board: minion, boss, obstacle, chest, secret,
 * terrain modifier, portal, or door. Drives both rules and rendering.
 */
export class EntityState extends Schema {
  @type("string") entityId: string = "";

  /** EntityKind value from shared types. */
  @type("string") kind: string = "minion";

  /**
   * Elemental family (a CardType value) for enemies/obstacles. Drives anti-type
   * bonuses (e.g. a lawnmower shreds Living foes; Boom melts Stuff) and lets
   * weather sway enemies the same way it sways player cards. Empty = untyped
   * (doors, portals, scorched terrain).
   */
  @type("string") family: string = "";

  /** Art/sprite key for rendering. */
  @type("string") art: string = "";

  @type("int16") x: number = 0;
  @type("int16") y: number = 0;
  @type("uint8") w: number = 1;
  @type("uint8") h: number = 1;

  /** Combat stats (obstacles/chests may have health; terrain may be 0). */
  @type("int32") health: number = 0;
  @type("int32") maxHealth: number = 0;

  /** For enemies: how hard/fast they hit. */
  @type("int32") attackPower: number = 0;
  @type("float32") cooldownTotalMs: number = 0;
  @type("float32") cooldownRemainingMs: number = 0;
  /**
   * Unmodified cooldown from floor generation. Debuffs (e.g. fear totems) scale
   * this into `cooldownTotalMs` each tick, so the charge bar denominator always
   * matches the value it counts down from.
   */
  @type("float32") baseCooldownMs: number = 0;

  /** Does this entity block card placement on its cells? */
  @type("boolean") blocking: boolean = true;

  /** Hidden until discovered (chests/secrets). */
  @type("boolean") hidden: boolean = false;

  /** Reward references (for chests/secrets/boss key). */
  @type("string") rewardCardId: string = "";
  @type("int32") rewardGold: number = 0;

  /** Transient combat flags. */
  @type("boolean") attacking: boolean = false;
  @type("boolean") takingDamage: boolean = false;

  /** For transient entities (scorched terrain): ms left before it fades. */
  @type("float32") lifetimeMs: number = 0;

  // --- Boss / guardian mechanics ---
  /**
   * While true, this entity ignores all incoming damage. Bosses spawn
   * invulnerable and only drop the shield once their guardians are defeated.
   */
  @type("boolean") invulnerable: boolean = false;
  /** Marks a minion as one of a boss's guardians (gates the boss shield). */
  @type("boolean") bossGuard: boolean = false;

  /**
   * Boss signature ability (a BossSignature kind id, e.g. "emberAoe"). Empty for
   * non-bosses. Fires on its own cadence so it reads as a distinct boss moment.
   */
  @type("string") signature: string = "";
  @type("float32") signatureTotalMs: number = 0;
  @type("float32") signatureRemainingMs: number = 0;
  /** Radius (cells) the signature reaches around the boss. */
  @type("uint8") signatureRadius: number = 0;
}
