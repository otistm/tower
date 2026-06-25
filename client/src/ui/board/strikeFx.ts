/**
 * Attack VFX. The server emits an `AbilityFired` event whenever a card or enemy
 * lands a hit; the store forwards it here and the Board (which owns the camera)
 * converts board cells to screen points and calls `playStrike`.
 *
 * Nova's juice pass: strikes now speak the game's elemental language. A dragon's
 * bolt trails fire and bursts into embers; a tiger's pounce flicks green; a
 * lawnmower throws steel sparks. Enemies swing swords - their hits land as a
 * slashing arc, not a dot - so a goblin reads as a goblin.
 *
 * Coordinates are board-local: glyphs are appended into the camera-transformed
 * fx layer so they pan (and scale) with the board instead of sticking to the
 * screen.
 */
import { fxParent } from "./fxRoot";

const reduce =
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion:reduce)").matches;

/** Per-family palette: projectile core + impact spark color. */
interface Palette {
  core: string;
  spark: string;
  /** Extra sparks flung on impact (embers, leaves, shards). */
  shards: number;
}

const FAMILY_FX: Record<string, Palette> = {
  boom: { core: "#ffe08a", spark: "#ff7a1a", shards: 6 },
  living: { core: "#bbf7d0", spark: "#22c55e", shards: 4 },
  stuff: { core: "#e2e8f0", spark: "#94a3b8", shards: 5 },
  built: { core: "#fef08a", spark: "#eab308", shards: 5 },
  thinking: { core: "#ddd6fe", spark: "#8b5cf6", shards: 4 },
};
const ALLY: Palette = { core: "#ffd56b", spark: "#ffb020", shards: 4 };
const ENEMY: Palette = { core: "#ff8a8a", spark: "#ff4d4d", shards: 4 };

function paletteFor(team: "ally" | "enemy", family?: string): Palette {
  if (team === "enemy") return family && FAMILY_FX[family] ? blend(ENEMY, FAMILY_FX[family]) : ENEMY;
  return family && FAMILY_FX[family] ? FAMILY_FX[family] : ALLY;
}

/** Lightly bias an enemy strike toward its element while staying hostile-red. */
function blend(base: Palette, fam: Palette): Palette {
  return { core: base.core, spark: fam.spark, shards: base.shards };
}

/** Cap concurrent glyphs so a busy board can't spawn unbounded DOM nodes. */
let active = 0;
const MAX_ACTIVE = 120;

function add(el: HTMLElement): boolean {
  if (active >= MAX_ACTIVE) return false;
  fxParent().appendChild(el);
  active++;
  return true;
}
function done(el: HTMLElement): void {
  el.remove();
  active--;
}

/** Central impact flash + a scatter of elemental shards. */
function impact(x: number, y: number, pal: Palette): void {
  const flash = document.createElement("div");
  flash.className = "strike-spark";
  flash.style.left = `${x}px`;
  flash.style.top = `${y}px`;
  flash.style.color = pal.spark;
  if (add(flash)) {
    flash
      .animate(
        [
          { transform: "translate(-50%,-50%) scale(.3)", opacity: 0.95 },
          { transform: "translate(-50%,-50%) scale(1.6)", opacity: 0 },
        ],
        { duration: 280, easing: "cubic-bezier(.3,.7,.4,1)", fill: "forwards" },
      )
      .addEventListener("finish", () => done(flash));
  }
  if (reduce) return;
  // Elemental shards fly outward from the point of impact.
  for (let i = 0; i < pal.shards; i++) {
    const s = document.createElement("div");
    s.className = "strike-shard";
    s.style.left = `${x}px`;
    s.style.top = `${y}px`;
    s.style.background = i % 2 ? pal.spark : pal.core;
    if (!add(s)) break;
    const ang = (Math.PI * 2 * i) / pal.shards + Math.random() * 0.6;
    const dist = 14 + Math.random() * 22;
    s.animate(
      [
        { transform: "translate(-50%,-50%) scale(1)", opacity: 1 },
        {
          transform: `translate(calc(-50% + ${Math.cos(ang) * dist}px),calc(-50% + ${
            Math.sin(ang) * dist
          }px)) scale(.2)`,
          opacity: 0,
        },
      ],
      { duration: 320 + Math.random() * 180, easing: "cubic-bezier(.2,.6,.3,1)", fill: "forwards" },
    ).addEventListener("finish", () => done(s));
  }
}

/** A goblin's sword: a quick slashing arc across the struck card. */
function slash(x: number, y: number, pal: Palette): void {
  const el = document.createElement("div");
  el.className = "strike-slash";
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.setProperty("--slash", pal.spark);
  const rot = -35 + Math.random() * 70;
  if (!add(el)) return;
  el.animate(
    [
      { transform: `translate(-50%,-50%) rotate(${rot}deg) scaleX(0)`, opacity: 0 },
      { transform: `translate(-50%,-50%) rotate(${rot}deg) scaleX(1)`, opacity: 1, offset: 0.4 },
      { transform: `translate(-50%,-50%) rotate(${rot}deg) scaleX(1.1)`, opacity: 0 },
    ],
    { duration: 240, easing: "cubic-bezier(.2,.8,.3,1)", fill: "forwards" },
  ).addEventListener("finish", () => done(el));
}

/**
 * Fly a projectile from `from` to each target screen point, then burst.
 * Enemies swing swords (slash arcs); allies throw elemental bolts.
 */
export function playStrike(
  from: { x: number; y: number },
  targets: Array<{ x: number; y: number }>,
  team: "ally" | "enemy",
  family?: string,
): void {
  const pal = paletteFor(team, family);

  if (team === "enemy") {
    for (const t of targets) {
      slash(t.x, t.y, pal);
      impact(t.x, t.y, pal);
    }
    return;
  }

  if (reduce) {
    for (const t of targets) impact(t.x, t.y, pal);
    return;
  }

  for (const t of targets) {
    const dot = document.createElement("div");
    dot.className = "strike-dot";
    dot.style.left = `${from.x}px`;
    dot.style.top = `${from.y}px`;
    dot.style.background = pal.core;
    dot.style.boxShadow = `0 0 10px 2px ${pal.spark}`;
    if (!add(dot)) break;
    const dx = t.x - from.x;
    const dy = t.y - from.y;
    dot.animate(
      [
        { transform: "translate(-50%,-50%) scale(.7)", opacity: 0.2 },
        { transform: "translate(-50%,-50%) scale(1)", opacity: 1, offset: 0.2 },
        { transform: `translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(.8)`, opacity: 1 },
      ],
      { duration: 200, easing: "cubic-bezier(.4,.1,.7,1)", fill: "forwards" },
    ).addEventListener("finish", () => {
      done(dot);
      impact(t.x, t.y, pal);
    });
  }
}

/* ---- event bus: store emits, Board (with camera) consumes ---- */
export interface AbilityFiredVfx {
  sourceCellKey: string;
  ability: string;
  team?: "ally" | "enemy";
  family?: string;
  targets: Array<{ x: number; y: number }>;
}
type Handler = (evt: AbilityFiredVfx) => void;
const handlers = new Set<Handler>();

export function onAbilityFired(handler: Handler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

export function emitAbilityFired(evt: AbilityFiredVfx): void {
  handlers.forEach((h) => h(evt));
}
