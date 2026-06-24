import { CARD_CATALOG, CARD_TYPE_LABEL, CardTier, CardType, GamePhase, getTierStats } from "@tower/shared";
import { useGameStore } from "../network/store";
import { CardSnapshot } from "../network/types";
import { CARD_TYPE_COLOR } from "./cardVisuals";
import { CardDetails } from "./CardDetails";

/** Which of our cards counter each enemy family (for the inspector hint). */
const FAMILY_COUNTER: Partial<Record<string, string>> = {
  [CardType.Living]: "Lawnmowers shred Living foes.",
  [CardType.Stuff]: "Boom (dragons, rockets) melts Stuff.",
};

interface InspectorProps {
  selectedCardId: string | null;
  onClose: () => void;
}

/** Detail panel for a selected hand card or an inspected board cell. */
export function Inspector({ selectedCardId, onClose }: InspectorProps) {
  const snapshot = useGameStore((s) => s.snapshot);
  const sessionId = useGameStore((s) => s.sessionId);
  const selectedCell = useGameStore((s) => s.selectedCell);
  const sellCard = useGameStore((s) => s.sellCard);
  const pickUpCard = useGameStore((s) => s.pickUpCard);
  const evolveCard = useGameStore((s) => s.evolveCard);

  if (!snapshot) return null;

  // Resolve the subject: a chosen hand card, or whatever is on the inspected cell.
  let card: CardSnapshot | undefined = selectedCardId
    ? snapshot.cards[selectedCardId]
    : undefined;
  let entityKind: string | null = null;

  if (!card && selectedCell) {
    card = Object.values(snapshot.cards).find(
      (c) =>
        c.location === "board" &&
        selectedCell.x >= c.x &&
        selectedCell.x < c.x + c.w &&
        selectedCell.y >= c.y &&
        selectedCell.y < c.y + c.h,
    );
    if (!card) {
      const entity = Object.values(snapshot.entities).find(
        (e) =>
          selectedCell.x >= e.x &&
          selectedCell.x < e.x + e.w &&
          selectedCell.y >= e.y &&
          selectedCell.y < e.y + e.h,
      );
      entityKind = entity ? entity.kind : null;
      if (entity) {
        return (
          <div className="inspector">
            <button className="inspector__close" onClick={onClose}>
              x
            </button>
            <h3>{entity.hidden ? "Something hidden" : entity.kind}</h3>
            {!entity.hidden && entity.family && (
              <p className="inspector__family">
                Type:{" "}
                <span
                  className="inspector__family-tag"
                  style={{ background: CARD_TYPE_COLOR[entity.family] }}
                >
                  {CARD_TYPE_LABEL[entity.family as CardType]}
                </span>
              </p>
            )}
            {entity.maxHealth > 0 && (
              <p>
                HP: {entity.health}/{entity.maxHealth}
              </p>
            )}
            {entity.attackPower > 0 && <p>Attack: {entity.attackPower}</p>}
            {!entity.hidden && entity.family && FAMILY_COUNTER[entity.family] && (
              <p className="inspector__counter">{FAMILY_COUNTER[entity.family]}</p>
            )}
            {entity.rewardGold > 0 && !entity.hidden && <p>Reward: {entity.rewardGold}g</p>}
          </div>
        );
      }
    }
  }

  if (!card) {
    if (selectedCell || entityKind) {
      return (
        <div className="inspector">
          <button className="inspector__close" onClick={onClose}>
            x
          </button>
          <p className="inspector__empty">Empty cell ({selectedCell?.x}, {selectedCell?.y}).</p>
        </div>
      );
    }
    return null;
  }

  const def = CARD_CATALOG[card.defId];
  if (!def) return null;
  const stats = getTierStats(def, card.tier as CardTier);
  const isMine = card.ownerId === sessionId;

  // Find an evolution partner (identical def & tier in my hand).
  const partner = Object.values(snapshot.cards).find(
    (c) =>
      c.instanceId !== card!.instanceId &&
      c.ownerId === sessionId &&
      c.defId === card!.defId &&
      c.tier === card!.tier,
  );
  const canEvolve = isMine && !!partner && card.tier < CardTier.Grand;
  const canSell = isMine && snapshot.phase === GamePhase.Shopping;

  return (
    <div className="inspector">
      <button className="inspector__close" onClick={onClose}>
        x
      </button>

      <CardDetails defId={card.defId} tier={card.tier as CardTier} currentHealth={card.health} />

      <div className="inspector__actions">
        {canEvolve && (
          <button
            className="inspector__evolve"
            onClick={() => {
              evolveCard(card!.instanceId, partner!.instanceId);
              onClose();
            }}
          >
            Evolve (combine 2)
          </button>
        )}
        {canSell && (
          <button
            className="inspector__sell"
            onClick={() => {
              sellCard(card!.instanceId);
              onClose();
            }}
          >
            Sell {stats.sellValue}g
          </button>
        )}
        {isMine && card.location === "board" && (
          <button
            className="inspector__pickup"
            onClick={() => {
              pickUpCard(card!.instanceId);
              onClose();
            }}
          >
            Pick up
          </button>
        )}
      </div>
    </div>
  );
}
