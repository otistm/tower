import { Schema, type } from "@colyseus/schema";

/** A single purchasable card slot in the shop at the start of a floor. */
export class ShopOffer extends Schema {
  @type("string") defId: string = "";
  @type("string") name: string = "";
  @type("string") art: string = "";
  @type("string") size: string = "small";
  @type("string") cardType: string = "stuff";
  @type("string") rarity: string = "common";
  @type("int32") cost: number = 0;
  @type("boolean") sold: boolean = false;
}
