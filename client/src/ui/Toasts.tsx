import { useGameStore } from "../network/store";

/** Transient bottom-corner notifications (logs, discoveries, floor clears). */
export function Toasts() {
  const toasts = useGameStore((s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.level}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
