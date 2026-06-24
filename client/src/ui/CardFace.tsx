import { CARD_CATALOG, getTierStats, SIZE_FOOTPRINT } from "@tower/shared";
import { CARD_TYPE_GRADIENT, TIER_COLOR, cardArtUrl } from "./cardVisuals";

interface CardFaceProps {
  defId: string;
  tier: number;
  /** Base cell size in px; the face scales by the card footprint. */
  unit: number;
  selected?: boolean;
}

/**
 * A full-bleed card face: tier art when available, otherwise a type gradient.
 * No persistent UI chrome on the card itself, per design.
 */
export function CardFace({ defId, tier, unit, selected }: CardFaceProps) {
  const def = CARD_CATALOG[defId];
  if (!def) return null;
  const stats = getTierStats(def, tier as 1 | 2 | 3);
  const { w, h } = SIZE_FOOTPRINT[def.size];
  const artUrl = cardArtUrl(stats.art);

  return (
    <div
      className={`card-face${artUrl ? " card-face--art" : ""}`}
      style={{
        width: unit * w,
        height: unit * h,
        background: artUrl ? undefined : CARD_TYPE_GRADIENT[def.type],
        backgroundImage: artUrl ? `url("${artUrl}")` : undefined,
        boxShadow: selected
          ? `0 0 0 3px ${TIER_COLOR[tier]}, 0 6px 18px rgba(0,0,0,0.5)`
          : `0 0 0 2px ${TIER_COLOR[tier]}, 0 4px 12px rgba(0,0,0,0.45)`,
      }}
      title={stats.name}
    >
      <span className="card-face__name">{stats.name}</span>
    </div>
  );
}
