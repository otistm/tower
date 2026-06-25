import { GamePhase } from "@tower/shared";
import { useGameStore } from "../network/store";

/** Full-screen overlays for floor-clear, victory, and defeat states. */
export function PhaseOverlay() {
  const snapshot = useGameStore((s) => s.snapshot);
  const disconnect = useGameStore((s) => s.disconnect);
  const restart = useGameStore((s) => s.restart);
  if (!snapshot) return null;

  if (snapshot.phase === GamePhase.FloorCleared) {
    return (
      <div className="overlay overlay--cleared">
        <div className="overlay__card">
          <h1>Floor {snapshot.floor} Cleared!</h1>
          <p>The key is yours. Ascending to the next floor...</p>
        </div>
      </div>
    );
  }

  if (snapshot.phase === GamePhase.Defeat) {
    return (
      <div className="overlay overlay--defeat">
        <div className="overlay__card">
          <h1>The Climb Ends</h1>
          <p>You reached floor {snapshot.floor}. The tower claims another party.</p>
          <div className="overlay__actions">
            <button onClick={restart}>Climb Again</button>
            <button className="overlay__btn-secondary" onClick={disconnect}>
              Return to Lobby
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (snapshot.phase === GamePhase.Victory) {
    return (
      <div className="overlay overlay--victory">
        <div className="overlay__card">
          <h1>Tower Conquered!</h1>
          <p>Against all odds, your party reached the summit.</p>
          <div className="overlay__actions">
            <button onClick={restart}>New Climb</button>
            <button className="overlay__btn-secondary" onClick={disconnect}>
              Return to Lobby
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
