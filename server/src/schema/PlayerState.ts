import { ArraySchema, Schema, type } from "@colyseus/schema";

/** A connected co-op player. */
export class PlayerState extends Schema {
  @type("string") id: string = "";
  @type("string") name: string = "Climber";
  @type("string") color: string = "#ffcc00";

  /** Earned gold. Players never receive gold blindly. */
  @type("int32") gold: number = 0;

  /** Ready to leave Shopping and start the Battle. */
  @type("boolean") ready: boolean = false;

  @type("boolean") connected: boolean = true;

  /**
   * Unlocked collection: card def ids the player has bought/found/discovered.
   * Only these appear in the shop. Starts empty (or with a small starter set).
   */
  @type([ "string" ]) collection = new ArraySchema<string>();
}
