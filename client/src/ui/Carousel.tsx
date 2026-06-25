import { useGameStore } from "../network/store";
import { BOARD_CELL_PX, CARD_DISPLAY_SCALE } from "./board/constants";
import { HandCard } from "./HandCard";

/**
 * The player's hand: a horizontal strip below the board. Cards render at the
 * board's cell size so a card in hand matches its on-board footprint, and they
 * overflow the strip (rather than scroll) when there are many.
 */
export function Carousel() {
  const snapshot = useGameStore((s) => s.snapshot);
  const sessionId = useGameStore((s) => s.sessionId);

  if (!snapshot || !sessionId) return null;

  const hand = Object.values(snapshot.cards).filter(
    (c) => c.ownerId === sessionId && c.location === "hand",
  );

  const unit = BOARD_CELL_PX * CARD_DISPLAY_SCALE;

  return (
    <div className="carousel">
      <div className="carousel__scroll">
        {hand.length === 0 && <div className="carousel__empty">No cards in hand. Buy some in the shop.</div>}
        {hand.map((c) => (
          <HandCard
            key={c.instanceId}
            instanceId={c.instanceId}
            defId={c.defId}
            tier={c.tier}
            unit={unit}
          />
        ))}
      </div>
    </div>
  );
}
