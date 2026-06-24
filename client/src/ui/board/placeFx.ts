/**
 * Placement & ability "feel" effects. When a card lands on the board it should
 * have weight: it kicks up dust and squashes on impact. Airy cards (a breeze)
 * blow a gust across the grid. These are the tactile rewards that make dropping
 * a card satisfying rather than a silent state change.
 */

const reduce =
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion:reduce)").matches;

let active = 0;
const MAX_ACTIVE = 80;
function add(el: HTMLElement): boolean {
  if (active >= MAX_ACTIVE) return false;
  document.body.appendChild(el);
  active++;
  return true;
}
function done(el: HTMLElement): void {
  el.remove();
  active--;
}

/** Kick up a ring of dust at the base of a card that just landed. */
export function landDust(cx: number, baseY: number, scale = 1): void {
  if (reduce) return;
  const puffs = 7;
  for (let i = 0; i < puffs; i++) {
    const d = document.createElement("div");
    d.className = "land-dust";
    d.style.left = `${cx}px`;
    d.style.top = `${baseY}px`;
    if (!add(d)) break;
    const dir = (i / (puffs - 1)) * 2 - 1; // -1..1 spread sideways
    const dx = dir * (26 + Math.random() * 34) * scale;
    const dy = -(8 + Math.random() * 18) * scale;
    const size = (8 + Math.random() * 12) * scale;
    d.style.width = `${size}px`;
    d.style.height = `${size}px`;
    d.animate(
      [
        { transform: "translate(-50%,-50%) scale(.4)", opacity: 0.6 },
        {
          transform: `translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(1.3)`,
          opacity: 0,
        },
      ],
      { duration: 420 + Math.random() * 220, easing: "cubic-bezier(.2,.7,.3,1)", fill: "forwards" },
    ).addEventListener("finish", () => done(d));
  }
}

/** A quick recoil pulse when a card fires its ability (cooldown payoff). */
export function firePulse(el: HTMLElement | null): void {
  if (!el || reduce) return;
  el.animate(
    [
      { transform: "scale(1)" },
      { transform: "scale(1.09)", offset: 0.3 },
      { transform: "scale(1)" },
    ],
    { duration: 240, easing: "cubic-bezier(.3,1.4,.5,1)" },
  );
}

/** Squash-and-settle the card element itself on impact. */
export function squashLand(el: HTMLElement | null): void {
  if (!el || reduce) return;
  el.animate(
    [
      { transform: "translateY(-14px) scale(1.06, .9)", offset: 0 },
      { transform: "translateY(0) scale(1.08, .86)", offset: 0.35 },
      { transform: "translateY(0) scale(.96, 1.05)", offset: 0.6 },
      { transform: "translateY(0) scale(1,1)", offset: 1 },
    ],
    { duration: 380, easing: "cubic-bezier(.2,1.3,.4,1)" },
  );
}

/** A gust: horizontal wind streaks sweeping across the card's area. */
export function windGust(cx: number, cy: number, scale = 1): void {
  if (reduce) return;
  const streaks = 6;
  for (let i = 0; i < streaks; i++) {
    const s = document.createElement("div");
    s.className = "wind-streak";
    const oy = cy + (Math.random() - 0.5) * 90 * scale;
    s.style.left = `${cx - 70 * scale}px`;
    s.style.top = `${oy}px`;
    s.style.width = `${(40 + Math.random() * 50) * scale}px`;
    if (!add(s)) break;
    const travel = (160 + Math.random() * 120) * scale;
    s.animate(
      [
        { transform: "translate(-60%,-50%) scaleX(.3)", opacity: 0 },
        { transform: "translate(-30%,-50%) scaleX(1)", opacity: 0.85, offset: 0.3 },
        { transform: `translate(calc(-50% + ${travel}px),-50%) scaleX(.4)`, opacity: 0 },
      ],
      { duration: 520 + Math.random() * 240, delay: i * 45, easing: "cubic-bezier(.3,.5,.2,1)", fill: "forwards" },
    ).addEventListener("finish", () => done(s));
  }
}
