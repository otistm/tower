import { GamePhase } from "@tower/shared";
import { useGameStore } from "../network/store";

/** Full-screen overlays for floor-clear, victory, and defeat states. */
export function PhaseOverlay() {
  const snapshot = useGameStore((s) => s.snapshot);
  const disconnect = useGameStore((s) => s.disconnect);
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
          <button onClick={disconnect}>Return to Lobby</button>
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
          <button onClick={disconnect}>New Climb</button>
        </div>
      </div>
    );
  }

  return null;
}
