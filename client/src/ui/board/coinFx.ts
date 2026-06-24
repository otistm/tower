/**
 * Coin "fly to wallet" VFX, modeled on the reference arena. When an enemy is
 * defeated the server reports where the gold came from; we spawn a handful of
 * coin glyphs at that screen point and animate them into the player's wallet,
 * giving a tactile sense of earning gold.
 */

const reduce =
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion:reduce)").matches;

/** Small pop on the wallet element when coins land. */
function bump(el: HTMLElement): void {
  if (reduce) return;
  el.animate(
    [{ transform: "scale(1)" }, { transform: "scale(1.18)" }, { transform: "scale(1)" }],
    { duration: 240, easing: "cubic-bezier(.3,1.4,.5,1)" },
  );
}

/**
 * Fly `amount`-scaled coins from a screen point into `target`. Coins are fixed
 * DOM elements on the body, animated with the Web Animations API, then removed.
 */
export function flyCoins(from: { x: number; y: number }, target: HTMLElement, amount: number): void {
  if (reduce) {
    bump(target);
    return;
  }
  const tr = target.getBoundingClientRect();
  const ex = tr.left + tr.width / 2;
  const ey = tr.top + tr.height / 2;
  const k = Math.max(3, Math.min(9, amount));

  for (let i = 0; i < k; i++) {
    const coin = document.createElement("div");
    coin.className = "coin-fx";
    coin.textContent = "\uD83E\uDE99"; // coin emoji
    coin.style.fontSize = `${13 + Math.random() * 7}px`;
    const ox = from.x + (Math.random() - 0.5) * 24;
    const oy = from.y + (Math.random() - 0.5) * 20;
    coin.style.left = `${ox}px`;
    coin.style.top = `${oy}px`;
    document.body.appendChild(coin);

    const dx = ex - ox;
    const dy = ey - oy;
    const mx = dx * 0.5 + (Math.random() - 0.5) * 52;
    const my = dy * 0.5 - (42 + Math.random() * 40);
    const anim = coin.animate(
      [
        { transform: "translate(0,0) scale(.4)", opacity: 0 },
        { transform: `translate(${mx}px,${my}px) scale(1)`, opacity: 1, offset: 0.32 },
        { transform: `translate(${dx}px,${dy}px) scale(.5)`, opacity: 1 },
      ],
      {
        duration: 520 + Math.random() * 200,
        delay: i * 55,
        easing: "cubic-bezier(.5,0,.4,1)",
        fill: "forwards",
      },
    );
    anim.onfinish = () => {
      coin.remove();
      bump(target);
    };
  }
}

/* ---- tiny event bus: store emits, Board (with camera) consumes ---- */
export interface GoldAward {
  pos: { x: number; y: number };
  w: number;
  h: number;
  gold: number;
}
type GoldHandler = (award: GoldAward) => void;
const handlers = new Set<GoldHandler>();

export function onGoldAwarded(handler: GoldHandler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

export function emitGoldAwarded(award: GoldAward): void {
  handlers.forEach((h) => h(award));
}
