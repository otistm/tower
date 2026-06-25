/**
 * Shared parent element for board VFX. The Board mounts a layer *inside* the
 * camera-transformed board space and registers it here; fx modules append into
 * it using board-local coordinates so projectiles, numbers, and dust pan (and
 * would zoom) along with the board instead of sticking to fixed screen points.
 *
 * Anything not registered falls back to document.body (screen space) — e.g.
 * coins that fly to the screen-fixed wallet.
 */
let root: HTMLElement | null = null;

export function setFxRoot(el: HTMLElement | null): void {
  root = el;
}

export function fxParent(): HTMLElement {
  return root ?? document.body;
}
