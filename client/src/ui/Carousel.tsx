import { useEffect, useState } from "react";
import { useGameStore } from "../network/store";
import { CELL, cardPx } from "./board/constants";
import { HandCard } from "./HandCard";

/**
 * On-screen size (px) of one board cell at the board's fit-to-view zoom. The
 * hand renders cards at this unit so a card in hand matches its size on the
 * board. Mirrors Camera.fit() so the two stay in lockstep.
 */
function fitCellPx(boardW: number, boardH: number, vw: number, vh: number): number {
  const bw = cardPx(boardW);
  const bh = cardPx(boardH);
  const z = Math.max(0.25, Math.min(vw / bw, vh / bh, 1) * 0.98);
  return CELL * z;
}

/**
 * The player's hand: a horizontally scrollable carousel pinned to the bottom.
 * Cards sit at their board size; drag left/right to see more.
 */
export function Carousel() {
  const snapshot = useGameStore((s) => s.snapshot);
  const sessionId = useGameStore((s) => s.sessionId);

  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  if (!snapshot || !sessionId) return null;

  const hand = Object.values(snapshot.cards).filter(
    (c) => c.ownerId === sessionId && c.location === "hand",
  );

  const unit = fitCellPx(snapshot.boardWidth, snapshot.boardHeight, vp.w, vp.h);

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
