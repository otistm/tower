/**
 * Board transform. State is {x, y, zx, zy} applied to the board wrapper as one
 * CSS transform: translate(x,y) scale(zx, zy). The board statically fills its
 * pane (non-uniform scale, no user pan/zoom); `z` is kept as a uniform alias so
 * the dev camera panel and legacy callers keep working.
 */
import { BOARD_CELL_PX, CELL } from "./constants";

export class Camera {
  x = 0;
  y = 0;
  zx = 1;
  zy = 1;
  /** When false, the board may be moved off-screen (debug only). */
  clampEnabled = true;

  constructor(
    private minZ = 0.25,
    private maxZ = 3,
  ) {}

  /** Uniform zoom alias (reads X scale; writes both axes). */
  get z(): number {
    return this.zx;
  }
  set z(v: number) {
    this.zx = v;
    this.zy = v;
  }

  get limits() {
    return { minZ: this.minZ, maxZ: this.maxZ };
  }

  setLimits(minZ: number, maxZ: number): void {
    this.minZ = minZ;
    this.maxZ = maxZ;
    this.z = this.clampZ(this.z);
  }

  clampZ(z: number): number {
    return Math.max(this.minZ, Math.min(z, this.maxZ));
  }

  apply(el: HTMLElement): void {
    el.style.transform = `translate(${this.x}px,${this.y}px) scale(${this.zx},${this.zy})`;
  }

  /** Keep the board covering the whole pane so panning never reveals empty space. */
  clamp(vw?: number, vh?: number, bw?: number, bh?: number): void {
    if (!this.clampEnabled) return;
    if (vw == null || vh == null || bw == null || bh == null) return;
    const sw = bw * this.zx;
    const sh = bh * this.zy;
    this.x = sw <= vw ? (vw - sw) / 2 : Math.min(0, Math.max(vw - sw, this.x));
    this.y = sh <= vh ? (vh - sh) / 2 : Math.min(0, Math.max(vh - sh, this.y));
  }

  /** Nudge the camera by screen pixels (debug only). */
  panBy(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
  }

  /** Set uniform zoom directly (clamped to min/max). */
  setZoom(z: number): void {
    this.z = this.clampZ(z);
  }

  /** Zoom in/out toward a screen anchor, keeping that point stationary. */
  zoomStep(factor: number, sx: number, sy: number, vrLeft: number, vrTop: number): void {
    this.zoomAt(sx, sy, this.z * factor, vrLeft, vrTop);
  }

  /**
   * Render grid cells at a fixed on-screen size. The board is grown server-side
   * to cover the viewport (plus a discovery pad), so this anchors the top-left
   * and lets the rest be panned into view.
   */
  fit(vw: number, vh: number, bw: number, bh: number): void {
    const z = BOARD_CELL_PX / CELL;
    this.zx = z;
    this.zy = z;
    const sw = bw * z;
    const sh = bh * z;
    this.x = sw <= vw ? (vw - sw) / 2 : 0;
    this.y = sh <= vh ? (vh - sh) / 2 : 0;
  }

  /** Uniform zoom toward a screen anchor (debug only). */
  zoomAt(sx: number, sy: number, nz: number, vrLeft: number, vrTop: number): void {
    const blx = (sx - vrLeft - this.x) / this.zx;
    const bly = (sy - vrTop - this.y) / this.zy;
    this.z = this.clampZ(nz);
    this.x = sx - vrLeft - blx * this.zx;
    this.y = sy - vrTop - bly * this.zy;
  }

  /** Convert a screen point to board-local (unscaled) coordinates. */
  screenToBoard(sx: number, sy: number, vrLeft: number, vrTop: number) {
    return {
      x: (sx - vrLeft - this.x) / this.zx,
      y: (sy - vrTop - this.y) / this.zy,
    };
  }
}
