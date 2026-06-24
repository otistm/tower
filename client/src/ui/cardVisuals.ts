import { CardType } from "@tower/shared";

/** CSS gradient per card type, standing in for full-bleed art. */
export const CARD_TYPE_GRADIENT: Record<string, string> = {
  [CardType.Stuff]: "linear-gradient(160deg, #94a3b8, #475569)",
  [CardType.Living]: "linear-gradient(160deg, #86efac, #15803d)",
  [CardType.Boom]: "linear-gradient(160deg, #fdba74, #c2410c)",
  [CardType.Thinking]: "linear-gradient(160deg, #c4b5fd, #6d28d9)",
  [CardType.Built]: "linear-gradient(160deg, #fde047, #a16207)",
};

/** Solid family color, for enemy type badges/rings over their art. */
export const CARD_TYPE_COLOR: Record<string, string> = {
  [CardType.Stuff]: "#94a3b8",
  [CardType.Living]: "#4ade80",
  [CardType.Boom]: "#fb923c",
  [CardType.Thinking]: "#a78bfa",
  [CardType.Built]: "#facc15",
};

export const TIER_COLOR: Record<number, string> = {
  1: "#94a3b8",
  2: "#38bdf8",
  3: "#fbbf24",
};

export const RARITY_COLOR: Record<string, string> = {
  common: "#94a3b8",
  uncommon: "#4ade80",
  rare: "#38bdf8",
  epic: "#c084fc",
  legendary: "#fbbf24",
};

/** Aspect ratio (w/h) per card size for layout. */
export const SIZE_RATIO: Record<string, { w: number; h: number }> = {
  tiny: { w: 1, h: 1 },
  small: { w: 2, h: 2 },
  medium: { w: 2, h: 3 },
  large: { w: 3, h: 3 },
};

/**
 * Full-bleed card art keyed by tier `art` field from the catalog.
 * Files live in client/public/cards/ and are served at /cards/<key>.png.
 */
export const CARD_ART: Record<string, string> = {
  tiger_pup: "/cards/tiger_pup.png",
  moss_patch: "/cards/moss_patch.png",
  mower_push: "/cards/mower_push.png",
  wind_breeze: "/cards/breeze.png",
  wall_wood: "/cards/wood_wall.png",
};

/** Resolve a catalog art key to a public URL, or null if no image yet. */
export function cardArtUrl(artKey: string): string | null {
  return CARD_ART[artKey] ?? null;
}

/** Full-bleed entity art keyed by the server `art` field (or entity kind). */
export const ENTITY_ART: Record<string, string> = {
  goblin: "/entities/goblin.png",
  goblin_knight: "/entities/goblin_knight.png",
  chest: "/cards/chest.png",
};

export function entityArtUrl(artKey: string, kind?: string): string | null {
  return (
    ENTITY_ART[artKey] ??
    (kind === "minion"
      ? ENTITY_ART.goblin
      : kind === "boss"
        ? ENTITY_ART.goblin_knight
        : kind === "chest"
          ? ENTITY_ART.chest
          : null)
  );
}
