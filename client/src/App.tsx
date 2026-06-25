import { useCallback, useEffect, useRef, useState } from "react";
import { GamePhase } from "@tower/shared";
import { useGameStore } from "./network/store";
import { Board } from "./ui/board/Board";
import { Carousel } from "./ui/Carousel";
import { Hud } from "./ui/Hud";
import { Inspector } from "./ui/Inspector";
import { PhaseOverlay } from "./ui/PhaseOverlay";
import { Shop } from "./ui/Shop";
import { Toasts } from "./ui/Toasts";

export default function App() {
  const status = useGameStore((s) => s.status);
  const error = useGameStore((s) => s.error);
  const connect = useGameStore((s) => s.connect);
  const selectCell = useGameStore((s) => s.selectCell);
  const snapshot = useGameStore((s) => s.snapshot);
  const sessionId = useGameStore((s) => s.sessionId);

  const [name, setName] = useState("");
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);

  // Tapping a card (hand or board) shows its info; placement is drag-only.
  const inspectCard = useCallback((id: string) => {
    setSelectedCardId(id);
    setInspectorOpen(true);
  }, []);

  // A board-cell tap clears any chosen hand card, then opens the inspector.
  const inspectCell = useCallback(() => {
    setSelectedCardId(null);
    setInspectorOpen(true);
  }, []);

  const phase = snapshot?.phase;
  const me = sessionId && snapshot ? snapshot.players[sessionId] : undefined;
  const myReady = !!me?.ready;
  // The shop button is locked once you've readied up, until the next floor.
  const shopLocked = phase !== GamePhase.Shopping || myReady;

  // Auto-open the shop in the center of the screen when a floor's shopping phase
  // begins; auto-close it once the battle starts.
  const prevPhase = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (phase === GamePhase.Shopping && prevPhase.current !== GamePhase.Shopping) {
      setShopOpen(true);
    }
    if (phase !== GamePhase.Shopping) setShopOpen(false);
    prevPhase.current = phase;
  }, [phase]);

  if (status !== "connected") {
    return (
      <div className="lobby">
        <div className="lobby__card">
          <h1>TOWER</h1>
          <p className="lobby__tag">A co-op card autobattler. Climb together. Trade. Survive.</p>
          <input
            className="lobby__input"
            placeholder="Your climber name"
            value={name}
            maxLength={16}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && connect(name || "Climber")}
          />
          <button
            className="lobby__btn"
            disabled={status === "connecting"}
            onClick={() => connect(name || "Climber")}
          >
            {status === "connecting" ? "Connecting..." : "Enter the Tower"}
          </button>
          {error && <p className="lobby__error">{error}</p>}
        </div>
      </div>
    );
  }

  const shopVisible = shopOpen && phase === GamePhase.Shopping;

  return (
    <div className="app">
      <header className="app__header">
        <Hud shopLocked={shopLocked} onOpenShop={() => setShopOpen(true)} />
      </header>

      <div className="app__board-pane">
        <Board onInspect={inspectCell} onInspectCard={inspectCard} />

        <div className="ui-overlay">
          <Toasts />
        </div>
      </div>

      <div className="app__hand-pane">
        <Carousel />
      </div>

      {/* Full-screen modals live at the app root so they stack above BOTH the
          board pane and the hand pane (each of which is its own stacking
          context). Nesting them in the board pane hid their lower edge — e.g.
          the shop's Ready button — behind the hand pane. */}
      {shopVisible && <div className="board-blur" onClick={() => setShopOpen(false)} />}
      <Shop open={shopVisible} onClose={() => setShopOpen(false)} />

      {inspectorOpen && (
        <Inspector
          selectedCardId={selectedCardId}
          onClose={() => {
            setInspectorOpen(false);
            setSelectedCardId(null);
            selectCell(null);
          }}
        />
      )}

      <PhaseOverlay />
    </div>
  );
}
