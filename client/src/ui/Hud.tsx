import { GamePhase } from "@tower/shared";
import { useGameStore } from "../network/store";

function formatTime(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const WEATHER_ICON: Record<string, string> = {
  clear: "Clear",
  rain: "Rain",
  storm: "Storm",
  snow: "Snow",
  fog: "Fog",
  heat: "Heat",
};

const BIOME_LABEL: Record<string, string> = {
  verdant: "Verdant Wilds",
  ashen: "Ashen Foundry",
  frost: "Frostspire",
  summit: "The Summit",
};

interface HudProps {
  shopLocked: boolean;
  onOpenShop: () => void;
}

/** Top status bar: floor, weather, battle timer, key, shop button, and players. */
export function Hud({ shopLocked, onOpenShop }: HudProps) {
  const snapshot = useGameStore((s) => s.snapshot);
  const sessionId = useGameStore((s) => s.sessionId);
  if (!snapshot) return null;

  const players = Object.values(snapshot.players);

  return (
    <div className="hud">
      <div className="hud__left">
        <div className="hud__floor">
          Floor {snapshot.floor}
          {snapshot.maxFloor ? ` / ${snapshot.maxFloor}` : ""}
        </div>
        <div className="hud__biome">{BIOME_LABEL[snapshot.biome] ?? snapshot.biome}</div>
        <div className="hud__weather">{WEATHER_ICON[snapshot.weather] ?? snapshot.weather}</div>
        <div className={`hud__key ${snapshot.keyAcquired ? "hud__key--has" : ""}`}>
          {snapshot.keyAcquired ? "Key acquired" : "Find the key"}
        </div>
      </div>

      <div className="hud__center">
        {snapshot.phase === GamePhase.Battle && (
          <div className="hud__timer">{formatTime(snapshot.timeRemainingMs)}</div>
        )}
        {snapshot.phase === GamePhase.Battle && snapshot.killStreak > 1 && (
          <div className="hud__combo">Combo x{snapshot.killStreak}</div>
        )}
        <button
          className="hud__shopbtn"
          disabled={shopLocked}
          onClick={onOpenShop}
          title={shopLocked ? "Shop locked until the next floor" : "Open the shop"}
        >
          {shopLocked ? "Shop Locked" : "Open Shop"}
        </button>
      </div>

      <div className="hud__right">
        {players.map((p) => (
          <div key={p.id} className="hud__player" style={{ borderColor: p.color }}>
            <span className="hud__player-name" style={{ color: p.color }}>
              {p.name}
              {p.id === sessionId ? " (you)" : ""}
            </span>
            <span className="hud__gold" id={p.id === sessionId ? "hud-gold-self" : undefined}>
              {p.gold}g
            </span>
            {!p.connected && <span className="hud__offline">offline</span>}
            {p.ready && <span className="hud__ready">ready</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
