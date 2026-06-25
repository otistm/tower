/**
 * Floating combat text + screen shake. The server already emits a `Damage` event
 * for every hit; the store forwards it here and the Board converts the cell to a
 * board-local point. Numbers are the language of an autobattler - making them pop
 * (and punching the camera on a crit) turns silent HP drain into a fight you feel.
 * They live in the camera-transformed fx layer so they pan with the board.
 */
import { fxParent } from "./fxRoot";

const reduce =
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion:reduce)").matches;

let active = 0;
const MAX_ACTIVE = 60;

/** A rising damage number. `crit` = anti-type bonus, `reflected` = mirror bounce. */
export function floatDamage(
  x: number,
  y: number,
  amount: number,
  opts: { crit?: boolean; reflected?: boolean } = {},
): void {
  if (active >= MAX_ACTIVE || amount <= 0) return;
  const el = document.createElement("div");
  el.className =
    "dmg-num" + (opts.crit ? " crit" : "") + (opts.reflected ? " reflected" : "");
  el.textContent = opts.crit ? `${amount}!` : `${amount}`;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  fxParent().appendChild(el);
  active++;

  const drift = (Math.random() - 0.5) * 30;
  const rise = opts.crit ? -64 : -44;
  const pop = opts.crit ? 1.35 : 1;
  el.animate(
    [
      { transform: `translate(-50%,-50%) scale(.4)`, opacity: 0 },
      { transform: `translate(calc(-50% + ${drift * 0.4}px),-60%) scale(${pop})`, opacity: 1, offset: 0.25 },
      {
        transform: `translate(calc(-50% + ${drift}px),calc(-50% + ${rise}px)) scale(${pop * 0.9})`,
        opacity: 0,
      },
    ],
    { duration: reduce ? 500 : 900, easing: "cubic-bezier(.2,.8,.3,1)", fill: "forwards" },
  ).addEventListener("finish", () => {
    el.remove();
    active--;
  });
}

/** A short positional camera punch. Intensity scales with the hit's weight. */
let shaking: Animation | null = null;
export function shakeScreen(el: HTMLElement | null, intensity = 6): void {
  if (!el || reduce) return;
  if (shaking) shaking.cancel();
  const i = Math.min(14, intensity);
  shaking = el.animate(
    [
      { transform: "translate(0,0)" },
      { transform: `translate(${i}px,${-i * 0.6}px)` },
      { transform: `translate(${-i * 0.8}px,${i * 0.5}px)` },
      { transform: `translate(${i * 0.5}px,${i * 0.4}px)` },
      { transform: `translate(${-i * 0.3}px,0)` },
      { transform: "translate(0,0)" },
    ],
    { duration: 220, easing: "ease-out" },
  );
  shaking.addEventListener("finish", () => (shaking = null));
}

/* ---- event bus: store emits, Board (with camera) consumes ---- */
export interface DamageVfx {
  pos: { x: number; y: number };
  amount: number;
  reflected?: boolean;
  crit?: boolean;
}
type Handler = (evt: DamageVfx) => void;
const handlers = new Set<Handler>();

export function onDamage(handler: Handler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

export function emitDamage(evt: DamageVfx): void {
  handlers.forEach((h) => h(evt));
}
