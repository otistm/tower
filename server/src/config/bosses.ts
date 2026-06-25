import { CardType } from "@tower/shared";

/**
 * A boss's signature ability. Each biome boss gets exactly one so it reads as a
 * distinct "boss moment" on its own cadence (independent of the basic attack).
 *  - entangle:    roots the strongest player card in range (pauses its cooldown)
 *  - emberAoe:    burst damage to every player card within `radius`
 *  - deepFreeze:  roots every player card within `radius` at once
 *  - summonQuake: summons fresh minions next to the boss and quakes the field
 */
export type BossSignatureKind = "entangle" | "emberAoe" | "deepFreeze" | "summonQuake";

export interface GuardianDef {
  /** How many guardians ring the boss (the boss stays invulnerable until 0). */
  count: number;
  /** Entity art key (reuses existing minion/obstacle art). */
  art: string;
  family: CardType;
  /** Short badge label shown on the guardian. */
  label: string;
  /** Stat multipliers applied to the floor's base minion stats. */
  hpMult: number;
  atkMult: number;
}

export interface BossDef {
  id: string;
  name: string;
  /** Entity art key (must exist in the client's entity art map). */
  art: string;
  /** Elemental family — drives which player cards crit it (anti-type bonus). */
  family: CardType;
  w: number;
  h: number;
  /** Basic-attack reach in cells. */
  range: number;
  /** Signature ability + how often it fires (ms) and how far it reaches. */
  signature: BossSignatureKind;
  signatureCooldownMs: number;
  signatureRadius: number;
  guardians: GuardianDef;
}

/**
 * One boss per biome band. Stats (HP/attack/cooldown/gold) still come from
 * BALANCE.boss scaling; this table layers on identity: family, footprint,
 * reach, a signature ability, and a guardian escort.
 */
export const BOSSES: Record<string, BossDef> = {
  // Band 1 — Verdant Wilds. A living bramble-beast; lawnmowers (vs Living) shine.
  thornmaw: {
    id: "thornmaw",
    name: "Thornmaw",
    art: "goblin_knight",
    family: CardType.Living,
    w: 3,
    h: 3,
    range: 2,
    signature: "entangle",
    signatureCooldownMs: 6000,
    signatureRadius: 3,
    guardians: {
      count: 2,
      art: "goblin",
      family: CardType.Living,
      label: "Wisp",
      hpMult: 0.7,
      atkMult: 0.6,
    },
  },

  // Band 2 — Ashen Foundry. An armored furnace; Boom (fire) melts its plate.
  molten_colossus: {
    id: "molten_colossus",
    name: "Molten Colossus",
    art: "goblin_knight",
    family: CardType.Stuff,
    w: 3,
    h: 3,
    range: 2,
    signature: "emberAoe",
    signatureCooldownMs: 5000,
    signatureRadius: 2,
    guardians: {
      count: 3,
      art: "crystal",
      family: CardType.Stuff,
      label: "Turret",
      hpMult: 1.1,
      atkMult: 0.7,
    },
  },

  // Band 3 — Frostspire. Ice tyrant; Boom (fire) is the way through.
  frost_tyrant: {
    id: "frost_tyrant",
    name: "Frost Tyrant",
    art: "goblin_knight",
    family: CardType.Stuff,
    w: 3,
    h: 3,
    range: 2,
    signature: "deepFreeze",
    signatureCooldownMs: 7000,
    signatureRadius: 2,
    guardians: {
      count: 4,
      art: "crystal",
      family: CardType.Stuff,
      label: "Sentinel",
      hpMult: 1.0,
      atkMult: 0.7,
    },
  },

  // Band 4 — The Summit. The final warden; summons adds and quakes the field.
  tower_sovereign: {
    id: "tower_sovereign",
    name: "Tower Sovereign",
    art: "goblin_knight",
    family: CardType.Stuff,
    w: 3,
    h: 3,
    range: 2,
    signature: "summonQuake",
    signatureCooldownMs: 6000,
    signatureRadius: 3,
    guardians: {
      count: 4,
      art: "goblin",
      family: CardType.Boom,
      label: "Warden",
      hpMult: 1.2,
      atkMult: 0.85,
    },
  },
};
