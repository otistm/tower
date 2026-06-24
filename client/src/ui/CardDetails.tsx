import {
  CARD_CATALOG,
  CardTier,
  SIZE_BASE_COOLDOWN_MS,
  getTierStats,
} from "@tower/shared";
import { CardFace } from "./CardFace";
import { TIER_COLOR } from "./cardVisuals";

interface CardDetailsProps {
  defId: string;
  tier: CardTier;
  /** Live health for a placed/owned instance; omit to show the tier's max. */
  currentHealth?: number;
}

/**
 * Presentational detail view for a card definition at a given tier: art, name,
 * tags, lore, stats, abilities, and synergies. Shared by the board Inspector
 * and the shop so a card reads the same wherever you look at it.
 */
export function CardDetails({ defId, tier, currentHealth }: CardDetailsProps) {
  const def = CARD_CATALOG[defId];
  if (!def) return null;
  const stats = getTierStats(def, tier);
  const baseCd = SIZE_BASE_COOLDOWN_MS[def.size] * stats.cooldownMultiplier;
  const maxHealth = stats.maxHealth ?? 0;

  return (
    <>
      <div className="inspector__head">
        <CardFace defId={defId} tier={tier} unit={70} />
        <div>
          <h3 style={{ color: TIER_COLOR[tier] }}>{stats.name}</h3>
          <div className="inspector__tags">
            <span>{def.type}</span>
            <span>{def.size}</span>
            <span>Tier {tier}</span>
            <span>{def.durability}</span>
          </div>
        </div>
      </div>

      <p className="inspector__lore">{def.lore}</p>

      <div className="inspector__stats">
        {maxHealth ? (
          <span>HP {currentHealth ?? maxHealth}/{maxHealth}</span>
        ) : (
          <span>No health</span>
        )}
        <span>Cooldown {(baseCd / 1000).toFixed(1)}s</span>
        <span>Sell {stats.sellValue}g</span>
      </div>

      <div className="inspector__abilities">
        {stats.abilities.map((a, i) => (
          <div key={i} className="inspector__ability">
            <strong>{a.kind}</strong> - {a.description}
          </div>
        ))}
      </div>

      {def.synergies.length > 0 && (
        <div className="inspector__synergies">
          <h4>Synergies</h4>
          {def.synergies.map((s, i) => (
            <div key={i}>{s.description}</div>
          ))}
        </div>
      )}
    </>
  );
}
