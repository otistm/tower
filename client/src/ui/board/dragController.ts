import {
  AbilityKind,
  CARD_CATALOG,
  CardTier,
  getTierStats,
  rangeCells,
} from "@tower/shared";
import { GameSnapshot } from "../../network/types";
import { Camera } from "./camera";
import { STRIDE, cardPx } from "./constants";
import { canPlace } from "./grid";

/** Abilities whose reach is worth previewing while dragging, best first. */
const PREVIEW_ABILITY_PRIORITY = [
  AbilityKind.Attack,
  AbilityKind.Heal,
  AbilityKind.Debuff,
  AbilityKind.Buff,
  AbilityKind.Shield,
];

/** Cells a card would attack/affect from a candidate placement (for the hover hint). */
function previewCellsFor(
  defId: string,
  tier: number,
  col: number,
  row: number,
  w: number,
  h: number,
  boardW: number,
  boardH: number,
): { x: number; y: number }[] {
  const def = CARD_CATALOG[defId];
  if (!def) return [];
  const abilities = getTierStats(def, tier as CardTier).abilities;
  let ability = null as (typeof abilities)[number] | null;
  for (const kind of PREVIEW_ABILITY_PRIORITY) {
    const found = abilities.find((a) => a.kind === kind);
    if (found) {
      ability = found;
      break;
    }
  }
  if (!ability) return [];
  return rangeCells({ x: col, y: row, w, h }, ability.shape, ability.range ?? 1, boardW, boardH);
}

/** Slack (board px) around the board edges that still counts as "over the board". */
const CELL_PAD = 90;

export interface DragInfo {
  instanceId: string;
  defId: string;
  tier: number;
  w: number;
  h: number;
  /** "hand" | "board" - where the drag started. */
  location: string;
  /** Source DOM element to clone and hide while dragging. */
  sourceEl: HTMLElement;
  /** Owned by the local player (only owned cards can be sold/picked up). */
  owned: boolean;
}

interface Registration {
  viewportEl: HTMLElement;
  boardwrapEl: HTMLElement;
  previewEl: HTMLElement;
  sellzoneEl: HTMLElement;
  carouselSelector: string;
  camera: Camera;
  getSnapshot: () => GameSnapshot | null;
  isShopping: () => boolean;
  onPlace: (instanceId: string, x: number, y: number) => void;
  onSell: (instanceId: string) => void;
  onPickup: (instanceId: string) => void;
  /** A click/tap (no real drag): show the card's info instead of moving it. */
  onTap: (instanceId: string) => void;
  /** Report the cells the dragged card would attack/affect (drag-time hint). */
  onPreviewCells: (cells: { x: number; y: number }[]) => void;
}

interface ActiveDrag extends DragInfo {
  clone: HTMLElement;
  /** Grab offset within the card, in board px (unscaled). */
  gx: number;
  gy: number;
  cloneW: number;
  cloneH: number;
  startX: number;
  startY: number;
  /** True once the pointer has moved past the drag threshold. */
  moved: boolean;
  /** True once the drag visuals (clone, lift, sell zone) have been revealed. */
  activated: boolean;
  col: number;
  row: number;
  valid: boolean;
  overSell: boolean;
}

/** Pointer travel (px) before a press becomes a drag rather than a tap. */
const DRAG_THRESHOLD = 8;

/**
 * One drag controller for every draggable card (hand or board). Creates a
 * pointer-following clone, snaps a placement preview to the grid through the
 * camera transform, supports a sell zone, and resolves the drop into the
 * appropriate authoritative Colyseus action.
 */
class DragController {
  private reg: Registration | null = null;
  private drag: ActiveDrag | null = null;

  register(reg: Registration): () => void {
    this.reg = reg;
    return () => {
      if (this.reg === reg) this.reg = null;
    };
  }

  get isDragging(): boolean {
    return this.drag !== null;
  }

  begin(e: React.PointerEvent | PointerEvent, info: DragInfo): void {
    const reg = this.reg;
    if (!reg || this.drag) return;
    if ((e as PointerEvent).button != null && (e as PointerEvent).button !== 0) return;
    e.preventDefault();

    const rect = info.sourceEl.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    const fy = (e.clientY - rect.top) / rect.height;

    const { zx, zy } = reg.camera;
    const cloneW = cardPx(info.w) * zx;
    const cloneH = cardPx(info.h) * zy;

    const clone = info.sourceEl.cloneNode(true) as HTMLElement;
    clone.className = "drag-clone";
    clone.style.width = `${cloneW}px`;
    clone.style.height = `${cloneH}px`;
    // Hidden until the press becomes a real drag, so a tap never flashes a clone.
    clone.style.opacity = "0";
    document.body.appendChild(clone);

    this.drag = {
      ...info,
      clone,
      gx: fx * cardPx(info.w),
      gy: fy * cardPx(info.h),
      cloneW,
      cloneH,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      activated: false,
      col: -1,
      row: -1,
      valid: false,
      overSell: false,
    };

    this.move(e as PointerEvent);
    window.addEventListener("pointermove", this.move);
    window.addEventListener("pointerup", this.end);
    window.addEventListener("pointercancel", this.end);
  }

  private inRect(x: number, y: number, r: DOMRect): boolean {
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  private move = (e: PointerEvent): void => {
    const d = this.drag;
    const reg = this.reg;
    if (!d || !reg) return;
    const snapshot = reg.getSnapshot();
    if (!snapshot) return;

    const { zx, zy } = reg.camera;
    if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > DRAG_THRESHOLD) d.moved = true;

    // Until it's a real drag, keep everything hidden: a tap shows info, not a move.
    if (!d.moved) {
      reg.previewEl.style.opacity = "0";
      return;
    }

    // First frame of an actual drag: reveal the clone, lift the source, arm sell.
    if (!d.activated) {
      d.activated = true;
      d.clone.style.opacity = "1";
      d.sourceEl.classList.add("lifted");
      if (d.owned && reg.isShopping()) reg.sellzoneEl.classList.add("show");
    }

    // Keep the grabbed point under the pointer at the current scale.
    d.clone.style.left = `${e.clientX - d.gx * zx}px`;
    d.clone.style.top = `${e.clientY - d.gy * zy}px`;
    d.clone.style.width = `${cardPx(d.w) * zx}px`;
    d.clone.style.height = `${cardPx(d.h) * zy}px`;

    // Sell zone hover (owned cards, during shopping only).
    if (d.owned && reg.isShopping()) {
      d.overSell = this.inRect(e.clientX, e.clientY, reg.sellzoneEl.getBoundingClientRect());
      reg.sellzoneEl.classList.toggle("hot", d.overSell);
    } else {
      d.overSell = false;
    }

    // Map pointer into board-local space through the camera.
    const vr = reg.viewportEl.getBoundingClientRect();
    const b = reg.camera.screenToBoard(e.clientX, e.clientY, vr.left, vr.top);
    let col = Math.round((b.x - d.gx) / STRIDE);
    let row = Math.round((b.y - d.gy) / STRIDE);
    col = Math.max(0, Math.min(col, snapshot.boardWidth - d.w));
    row = Math.max(0, Math.min(row, snapshot.boardHeight - d.h));

    const bw = cardPx(snapshot.boardWidth);
    const bh = cardPx(snapshot.boardHeight);
    const within =
      !d.overSell && b.x > -CELL_PAD && b.x < bw + CELL_PAD && b.y > -CELL_PAD && b.y < bh + CELL_PAD;

    d.col = col;
    d.row = row;
    const ignore = d.location === "board" ? d.instanceId : undefined;
    d.valid = within && canPlace(snapshot, col, row, d.w, d.h, ignore);

    const preview = reg.previewEl;
    if (!within) {
      preview.style.opacity = "0";
      reg.onPreviewCells([]);
      return;
    }
    preview.style.opacity = "1";
    preview.style.width = `${cardPx(d.w)}px`;
    preview.style.height = `${cardPx(d.h)}px`;
    preview.style.transform = `translate(${col * STRIDE}px,${row * STRIDE}px)`;
    preview.className = d.valid ? "board-preview ok" : "board-preview bad";

    reg.onPreviewCells(
      previewCellsFor(d.defId, d.tier, col, row, d.w, d.h, snapshot.boardWidth, snapshot.boardHeight),
    );
  };

  private end = (e: PointerEvent): void => {
    const d = this.drag;
    const reg = this.reg;
    this.cleanup();
    if (!d || !reg) return;

    // A press without a real drag is a tap: show the card's info, never place it.
    if (!d.moved) {
      d.clone.remove();
      reg.onTap(d.instanceId);
      this.drag = null;
      return;
    }

    const overCarousel = this.overElement(e.clientX, e.clientY, reg.carouselSelector);

    if (d.overSell && d.owned && reg.isShopping()) {
      reg.onSell(d.instanceId);
      d.clone.remove();
    } else if (d.valid) {
      reg.onPlace(d.instanceId, d.col, d.row);
      d.clone.remove();
    } else if (overCarousel && d.location === "board") {
      reg.onPickup(d.instanceId);
      d.clone.remove();
    } else {
      this.homeFade(d);
    }

    this.drag = null;
  };

  private overElement(x: number, y: number, selector: string): boolean {
    const el = document.querySelector(selector);
    if (!el) return false;
    return this.inRect(x, y, el.getBoundingClientRect());
  }

  private homeFade(d: ActiveDrag): void {
    const home = d.sourceEl.getBoundingClientRect();
    const clone = d.clone;
    clone.style.transition = "left .2s, top .2s, transform .2s, opacity .2s";
    clone.style.left = `${home.left + home.width / 2 - d.cloneW / 2}px`;
    clone.style.top = `${home.top + home.height / 2 - d.cloneH / 2}px`;
    clone.style.transform = "scale(.4)";
    clone.style.opacity = "0";
    window.setTimeout(() => {
      clone.remove();
      d.sourceEl.classList.remove("lifted");
    }, 200);
  }

  private cleanup(): void {
    const reg = this.reg;
    if (reg) {
      reg.previewEl.style.opacity = "0";
      reg.sellzoneEl.classList.remove("show", "hot");
      reg.onPreviewCells([]);
    }
    if (this.drag) this.drag.sourceEl.classList.remove("lifted");
    window.removeEventListener("pointermove", this.move);
    window.removeEventListener("pointerup", this.end);
    window.removeEventListener("pointercancel", this.end);
  }
}

export const dragController = new DragController();
