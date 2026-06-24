/**
 * Free pan + zoom camera for the DOM board. State is a single {x, y, z} applied
 * to the board wrapper as one CSS transform: translate(x,y) scale(z).
 * Mirrors the reference implementation's camera math.
 */
export class Camera {
  x = 0;
  y = 0;
  z = 1;
  /** When false, pan/zoom can move the board off-screen (debug only). */
  clampEnabled = true;

  constructor(
    private minZ = 0.25,
    private maxZ = 3,
  ) {}

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
    el.style.transform = `translate(${this.x}px,${this.y}px) scale(${this.z})`;
  }

  /** Keep at least a margin of the board on-screen. bw/bh are unscaled board px. */
  clamp(vw: number, vh: number, bw: number, bh: number): void {
    if (!this.clampEnabled) return;
    const sw = bw * this.z;
    const sh = bh * this.z;
    const m = Math.min(160, sw * 0.5, sh * 0.5);
    this.x = Math.min(vw - m, Math.max(m - sw, this.x));
    this.y = Math.min(vh - m, Math.max(m - sh, this.y));
  }

  /** Nudge the camera by screen pixels. */
  panBy(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
  }

  /** Set zoom directly (clamped to min/max). */
  setZoom(z: number): void {
    this.z = this.clampZ(z);
  }

  /** Zoom in/out toward a screen anchor, keeping that point stationary. */
  zoomStep(
    factor: number,
    sx: number,
    sy: number,
    vrLeft: number,
    vrTop: number,
  ): void {
    this.zoomAt(sx, sy, this.z * factor, vrLeft, vrTop);
  }

  /** Frame the whole board within the viewport. */
  fit(vw: number, vh: number, bw: number, bh: number): void {
    this.z = Math.max(this.minZ, Math.min(vw / bw, vh / bh, 1) * 0.98);
    this.x = (vw - bw * this.z) / 2;
    this.y = Math.max(8, (vh - bh * this.z) * 0.35);
  }

  /** Zoom toward a screen anchor (sx, sy), keeping that point stationary. */
  zoomAt(sx: number, sy: number, nz: number, vrLeft: number, vrTop: number): void {
    const blx = (sx - vrLeft - this.x) / this.z;
    const bly = (sy - vrTop - this.y) / this.z;
    this.z = this.clampZ(nz);
    this.x = sx - vrLeft - blx * this.z;
    this.y = sy - vrTop - bly * this.z;
  }

  /** Convert a screen point to board-local (unscaled) coordinates. */
  screenToBoard(sx: number, sy: number, vrLeft: number, vrTop: number) {
    return {
      x: (sx - vrLeft - this.x) / this.z,
      y: (sy - vrTop - this.y) / this.z,
    };
  }
}
