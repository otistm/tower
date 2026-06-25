import { CardTier } from "@tower/shared";
import { useState } from "react";
import { useGameStore } from "../network/store";
import { CardDetails } from "./CardDetails";
import { CardFace } from "./CardFace";
import { RARITY_COLOR } from "./cardVisuals";

interface ShopProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Start-of-floor shop, shown as a centered modal over a blurred board. Only
 * cards in players' collections appear. Readying up starts the battle and locks
 * the shop until the next floor.
 */
export function Shop({ open, onClose }: ShopProps) {
  const snapshot = useGameStore((s) => s.snapshot);
  const sessionId = useGameStore((s) => s.sessionId);
  const buyCard = useGameStore((s) => s.buyCard);
  const rerollShop = useGameStore((s) => s.rerollShop);
  const readyUp = useGameStore((s) => s.readyUp);

  const [selected, setSelected] = useState<number | null>(null);

  if (!open || !snapshot) return null;
  const me = sessionId ? snapshot.players[sessionId] : undefined;
  const gold = me?.gold ?? 0;
  // Each reroll this floor costs 1 more than the last (1, 2, 3, ...).
  const rerollCost = 1 + (snapshot.rerollCount ?? 0);
  const sel = selected != null && selected < snapshot.shop.length ? selected : null;
  const selectedOffer = sel != null ? snapshot.shop[sel] : undefined;

  return (
    <div className="shop-modal">
      <div className="shop">
        <div className="shop__header">
          <div className="shop__title">
            <h2>Shop</h2>
            <span className="shop__floor">Floor {snapshot.floor}</span>
          </div>
          <span className="shop__gold">{gold} gold</span>
          <button className="shop__close" onClick={onClose} title="Close (place your cards)">
            x
          </button>
        </div>

        <div className="shop__body">
          <div className="shop__offers">
            {snapshot.shop.map((offer, i) => {
              const affordable = gold >= offer.cost && !offer.sold;
              return (
                <div
                  key={i}
                  className={`shop__offer ${offer.sold ? "shop__offer--sold" : ""} ${
                    sel === i ? "shop__offer--sel" : ""
                  }`}
                  onClick={() => setSelected(i)}
                >
                  <CardFace defId={offer.defId} tier={1} unit={104} selected={sel === i} />
                  <div className="shop__offer-info">
                    <span className="shop__offer-name">{offer.name}</span>
                    <span
                      className="shop__offer-rarity"
                      style={{ color: RARITY_COLOR[offer.rarity] }}
                    >
                      {offer.rarity}
                    </span>
                  </div>
                  <button
                    className="shop__buy"
                    disabled={!affordable}
                    onClick={(e) => {
                      e.stopPropagation();
                      buyCard(i);
                    }}
                  >
                    {offer.sold ? "Sold" : `Buy ${offer.cost}g`}
                  </button>
                </div>
              );
            })}
          </div>

          <aside className="shop__sidebar">
            {selectedOffer ? (
              <div className="shop__detail">
                <CardDetails defId={selectedOffer.defId} tier={CardTier.Base} />
                <button
                  className="shop__buy shop__detail-buy"
                  disabled={!(gold >= selectedOffer.cost && !selectedOffer.sold)}
                  onClick={() => buyCard(sel!)}
                >
                  {selectedOffer.sold
                    ? "Sold"
                    : `Buy ${selectedOffer.name} - ${selectedOffer.cost}g`}
                </button>
              </div>
            ) : (
              <div className="shop__hint">
                Select a card to see its details.
                <br />
                Close the shop to place your cards.
              </div>
            )}
          </aside>
        </div>

        <div className="shop__actions">
          <button className="shop__reroll" onClick={rerollShop} disabled={gold < rerollCost}>
            Reroll ({rerollCost}g)
          </button>
          <button
            className={`shop__ready ${me?.ready ? "shop__ready--on" : ""}`}
            onClick={() => {
              readyUp();
              onClose();
            }}
          >
            {me?.ready ? "Waiting for others..." : "Ready - Start Battle"}
          </button>
        </div>
      </div>
    </div>
  );
}
