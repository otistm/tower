import { memo, useEffect, useRef } from "react";

interface ChargeBarProps {
  /** Full cooldown duration in ms. */
  totalMs: number;
  /** Remaining cooldown from the latest server snapshot. */
  remainingMs: number;
  /** Whether the unit is actively charging (drives the rAF tween). */
  active: boolean;
  className: string;
  /** "height" for vertical fills (board cards), "width" for horizontal bars. */
  axis?: "height" | "width";
}

/**
 * Cooldown fill bar with client-side interpolation. Server patches arrive ~20×/s
 * which makes a raw bar tick visibly; here we extrapolate from the last snapshot
 * using real elapsed time so the bar glides smoothly between patches and re-syncs
 * whenever a fresh `remainingMs` lands.
 */
function ChargeBarImpl({ totalMs, remainingMs, active, className, axis = "height" }: ChargeBarProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const baseTime = performance.now();
    const baseRemaining = remainingMs;
    let raf = 0;

    const render = (chargePct: number) => {
      el.style[axis] = `${Math.max(0, Math.min(100, chargePct))}%`;
    };

    if (totalMs <= 0) {
      render(0);
      return;
    }

    if (!active) {
      // An idle unit isn't charging, so show an empty bar instead of a frozen
      // partial fill. Without this, minions display their staggered spawn
      // cooldown (randInt) as a stuck mid-way bar during the shopping phase,
      // before the battle tick ever resets it.
      render(0);
      return;
    }

    const tick = () => {
      const elapsed = performance.now() - baseTime;
      const remaining = Math.max(0, baseRemaining - elapsed);
      render(100 * (1 - remaining / totalMs));
      if (remaining > 0) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [totalMs, remainingMs, active, axis]);

  return <div ref={ref} className={className} />;
}

export const ChargeBar = memo(ChargeBarImpl);
