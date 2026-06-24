import { CARD_CATALOG, CARD_TYPE_LABEL, CardType, GamePhase, getTierStats } from "@tower/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { useGameStore } from "../../network/store";
import {
  CARD_TYPE_COLOR,
  CARD_TYPE_GRADIENT,
  TIER_COLOR,
  cardArtUrl,
  entityArtUrl,
} from "../cardVisuals";
import { Camera } from "./camera";
import { CameraDebug, cameraDebugFromUrl } from "./CameraDebug";
import { flyCoins, onGoldAwarded } from "./coinFx";
import { onAbilityFired, playStrike } from "./strikeFx";
import { floatDamage, onDamage, shakeScreen } from "./dmgFx";
import { firePulse, landDust, squashLand, windGust } from "./placeFx";
import { CELL, STRIDE, cardPx } from "./constants";
import { dragController } from "./dragController";

/** Cards whose identity is an ambient aura, given a persistent on-board effect. */
const AURA_CLASS: Record<string, string> = {
  wind: "aura-wind",
  furnace: "aura-furnace",
  moss: "aura-moss",
  fear_totem: "aura-fear",
};

const ENTITY_COLOR: Record<string, string> = {
  minion: "#b3402f",
  boss: "#7f1d1d",
  obstacle: "#4b463f",
  chest: "#b07d18",
  secret: "#5b21b6",
  terrain: "#7c2d12",
  portal: "#0e7490",
  door: "#8a5a22",
};

const ENTITY_LABEL: Record<string, string> = {
  minion: "foe",
  boss: "BOSS",
  obstacle: "",
  chest: "chest",
  secret: "?",
  terrain: "",
  portal: "portal",
  door: "door",
};

/**
 * Biome palette for the ground. Patches of these tones give the board a sense of
 * place (grass, moss, soil, stone) instead of a uniform void, so even an empty
 * grid reads as a designed level. Atlas: color theory for biomes + grid-hiding.
 */
const TERRAIN = ["#1b2c1d", "#203420", "#172a1a", "#26301c", "#142824", "#2a2a1b", "#1d2a30"];
const PROP_GLYPH = ["•", "·", "✦", "❟", "ᵕ"];

function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Coarse biome patch (3x3 cells) so terrain reads as zones, not noise. */
function terrainColor(x: number, y: number): string {
  const patch = hash2(Math.floor(x / 3), Math.floor(y / 3));
  return TERRAIN[patch % TERRAIN.length];
}

/** Subtle, non-gameplay clutter on a fraction of cells to break grid lines. */
function cellProp(x: number, y: number): string | null {
  const h = hash2(x * 7 + 11, y * 13 + 5);
  if (h % 6 !== 0) return null;
  return PROP_GLYPH[h % PROP_GLYPH.length];
}

/**
 * The full-screen DOM board: a CSS-transform camera (pan/pinch/zoom) over a
 * grid of slots, entities, and full-bleed cards. All mutations are routed to
 * the authoritative Colyseus server via the store; this only renders state and
 * drives the drag controller.
 */
export function Board({
  onInspect,
  onInspectCard,
}: {
  onInspect: () => void;
  onInspectCard: (instanceId: string) => void;
}) {
  const snapshot = useGameStore((s) => s.snapshot);
  const sessionId = useGameStore((s) => s.sessionId);
  const selectedCell = useGameStore((s) => s.selectedCell);

  const viewportRef = useRef<HTMLDivElement>(null);
  const boardwrapRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const sellzoneRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<Camera>(new Camera());
  const [cameraDebugOpen, setCameraDebugOpen] = useState(cameraDebugFromUrl);

  // Toggle camera debug with backtick (`).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "`" || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      setCameraDebugOpen((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Hold the latest inspect callback in a ref so the gesture effect's pointer
  // listeners stay mounted across re-renders (the snapshot streams in often).
  const onInspectRef = useRef(onInspect);
  onInspectRef.current = onInspect;

  const boardW = snapshot?.boardWidth ?? 16;
  const boardH = snapshot?.boardHeight ?? 12;

  // Register the drag controller with live refs + authoritative callbacks.
  useEffect(() => {
    if (!viewportRef.current || !boardwrapRef.current || !previewRef.current || !sellzoneRef.current)
      return;
    return dragController.register({
      viewportEl: viewportRef.current,
      boardwrapEl: boardwrapRef.current,
      previewEl: previewRef.current,
      sellzoneEl: sellzoneRef.current,
      carouselSelector: ".carousel",
      camera: cameraRef.current,
      getSnapshot: () => useGameStore.getState().snapshot,
      isShopping: () => useGameStore.getState().snapshot?.phase === GamePhase.Shopping,
      onPlace: (id, x, y) => useGameStore.getState().placeCard(id, x, y),
      onSell: (id) => useGameStore.getState().sellCard(id),
      onPickup: (id) => useGameStore.getState().pickUpCard(id),
      onTap: (id) => onInspectCard(id),
    });
  }, [onInspectCard]);

  // Camera gestures: 1 pointer pan, 2 pointer pinch, wheel zoom-at-cursor.
  useEffect(() => {
    const viewport = viewportRef.current;
    const boardwrap = boardwrapRef.current;
    if (!viewport || !boardwrap) return;
    const cam = cameraRef.current;
    const apply = () => cam.apply(boardwrap);

    const ptrs = new Map<number, { x: number; y: number }>();
    let gest: { mode: "pan" | "pinch"; ox?: number; oy?: number; cx?: number; cy?: number } | null =
      null;
    let pinch0: { dist: number; z: number; mx: number; my: number } | null = null;
    let downAt: { x: number; y: number } | null = null;
    let moved = false;

    const vr = () => viewport.getBoundingClientRect();
    const pinchInfo = () => {
      const a = [...ptrs.values()];
      const dx = a[1].x - a[0].x;
      const dy = a[1].y - a[0].y;
      return { dist: Math.hypot(dx, dy) || 1, mx: (a[0].x + a[1].x) / 2, my: (a[0].y + a[1].y) / 2 };
    };

    const onDown = (e: PointerEvent) => {
      if (dragController.isDragging) return;
      if ((e.target as HTMLElement).closest(".board-card")) return; // card handles its own drag
      try {
        viewport.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      downAt = { x: e.clientX, y: e.clientY };
      moved = false;
      if (ptrs.size === 1) {
        gest = { mode: "pan", ox: e.clientX, oy: e.clientY, cx: cam.x, cy: cam.y };
        viewport.classList.add("grabbing");
      } else if (ptrs.size === 2) {
        const d = pinchInfo();
        pinch0 = { dist: d.dist, z: cam.z, mx: d.mx, my: d.my };
        gest = { mode: "pinch" };
      }
    };

    const onMove = (e: PointerEvent) => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) moved = true;
      if (gest?.mode === "pan" && ptrs.size === 1) {
        cam.x = (gest.cx ?? 0) + (e.clientX - (gest.ox ?? 0));
        cam.y = (gest.cy ?? 0) + (e.clientY - (gest.oy ?? 0));
        cam.clamp(viewport.clientWidth, viewport.clientHeight, cardPx(boardW), cardPx(boardH));
        apply();
      } else if (gest?.mode === "pinch" && ptrs.size >= 2 && pinch0) {
        const d = pinchInfo();
        const nz = cam.clampZ(pinch0.z * (d.dist / pinch0.dist));
        const r = vr();
        const blx = (pinch0.mx - r.left - cam.x) / cam.z;
        const bly = (pinch0.my - r.top - cam.y) / cam.z;
        cam.z = nz;
        cam.x = d.mx - r.left - blx * nz;
        cam.y = d.my - r.top - bly * nz;
        cam.clamp(viewport.clientWidth, viewport.clientHeight, cardPx(boardW), cardPx(boardH));
        apply();
      }
    };

    const onUp = (e: PointerEvent) => {
      const wasSingle = ptrs.size === 1;
      if (ptrs.has(e.pointerId)) {
        ptrs.delete(e.pointerId);
        try {
          viewport.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }
      // Tap (no pan) -> inspect the cell under the pointer.
      if (wasSingle && !moved && !dragController.isDragging) {
        const snap = useGameStore.getState().snapshot;
        if (snap) {
          const r = vr();
          const b = cam.screenToBoard(e.clientX, e.clientY, r.left, r.top);
          const cx = Math.floor(b.x / STRIDE);
          const cy = Math.floor(b.y / STRIDE);
          if (cx >= 0 && cy >= 0 && cx < snap.boardWidth && cy < snap.boardHeight) {
            useGameStore.getState().selectCell({ x: cx, y: cy });
            onInspectRef.current();
          }
        }
      }
      if (ptrs.size === 1) {
        const p = [...ptrs.values()][0];
        gest = { mode: "pan", ox: p.x, oy: p.y, cx: cam.x, cy: cam.y };
      } else if (ptrs.size === 0) {
        gest = null;
        pinch0 = null;
        viewport.classList.remove("grabbing");
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = vr();
      cam.zoomAt(e.clientX, e.clientY, cam.z * (e.deltaY < 0 ? 1.12 : 1 / 1.12), r.left, r.top);
      cam.clamp(viewport.clientWidth, viewport.clientHeight, cardPx(boardW), cardPx(boardH));
      apply();
    };

    viewport.addEventListener("pointerdown", onDown);
    viewport.addEventListener("pointermove", onMove);
    viewport.addEventListener("pointerup", onUp);
    viewport.addEventListener("pointercancel", onUp);
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      viewport.removeEventListener("pointerdown", onDown);
      viewport.removeEventListener("pointermove", onMove);
      viewport.removeEventListener("pointerup", onUp);
      viewport.removeEventListener("pointercancel", onUp);
      viewport.removeEventListener("wheel", onWheel);
    };
  }, [boardW, boardH]);

  // Fly coins from a defeated enemy's center to the local player's wallet.
  useEffect(() => {
    return onGoldAwarded(({ pos, w, h, gold }) => {
      const viewport = viewportRef.current;
      const target = document.getElementById("hud-gold-self");
      if (!viewport || !target) return;
      const cam = cameraRef.current;
      const vr = viewport.getBoundingClientRect();
      // Board-space center of the entity, then through the camera to the screen.
      const bx = pos.x * STRIDE + cardPx(w) / 2;
      const by = pos.y * STRIDE + cardPx(h) / 2;
      const sx = vr.left + cam.x + bx * cam.z;
      const sy = vr.top + cam.y + by * cam.z;
      flyCoins({ x: sx, y: sy }, target, gold);
    });
  }, []);

  // Attack VFX: elemental bolts (allies) / sword slashes (enemies), plus a
  // recoil pulse on the firing card so abilities coming off cooldown read.
  useEffect(() => {
    return onAbilityFired(({ sourceCellKey, team, targets, ability, family }) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const cam = cameraRef.current;
      const vr = viewport.getBoundingClientRect();
      const toScreen = (cx: number, cy: number) => ({
        x: vr.left + cam.x + (cx * STRIDE + CELL / 2) * cam.z,
        y: vr.top + cam.y + (cy * STRIDE + CELL / 2) * cam.z,
      });
      const [sxRaw, syRaw] = sourceCellKey.split(",").map(Number);

      // Recoil the source card (any ally ability: attack, heal, spawn...).
      if (team !== "enemy") {
        const snap = useGameStore.getState().snapshot;
        const src = snap
          ? Object.values(snap.cards).find(
              (c) => c.location === "board" && c.x === sxRaw && c.y === syRaw,
            )
          : undefined;
        if (src) {
          firePulse(
            boardwrapRef.current?.querySelector<HTMLElement>(`[data-card-id="${src.instanceId}"]`) ??
              null,
          );
        }
      }

      if (ability !== "attack" || targets.length === 0) return;
      const from = toScreen(sxRaw, syRaw);
      const pts = targets.map((t) => toScreen(t.x, t.y));
      playStrike(from, pts, team === "enemy" ? "enemy" : "ally", family);
    });
  }, []);

  // Floating damage numbers + a camera punch on crits / heavy blows.
  useEffect(() => {
    return onDamage(({ pos, amount, crit, reflected }) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const cam = cameraRef.current;
      const vr = viewport.getBoundingClientRect();
      const sx = vr.left + cam.x + (pos.x * STRIDE + CELL / 2) * cam.z;
      const sy = vr.top + cam.y + (pos.y * STRIDE + CELL / 2) * cam.z;
      floatDamage(sx, sy, amount, { crit, reflected });
      if (crit || amount >= 30) shakeScreen(viewport, crit ? 9 : 6);
    });
  }, []);

  // Placement feel: when a card newly appears on the board, kick up dust and
  // squash it on impact. A breeze blows a gust across the grid.
  const placedRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!snapshot) return;
    const onBoard = Object.values(snapshot.cards).filter((c) => c.location === "board");
    const current = new Set(onBoard.map((c) => c.instanceId));

    // First observation just seeds the set (don't dust the whole board at once).
    if (placedRef.current === null) {
      placedRef.current = current;
      return;
    }
    const prev = placedRef.current;
    const viewport = viewportRef.current;
    const cam = cameraRef.current;
    if (viewport) {
      const vr = viewport.getBoundingClientRect();
      for (const c of onBoard) {
        if (prev.has(c.instanceId)) continue;
        const cx = vr.left + cam.x + (c.x * STRIDE + cardPx(c.w) / 2) * cam.z;
        const baseY = vr.top + cam.y + (c.y * STRIDE + cardPx(c.h)) * cam.z;
        landDust(cx, baseY, cam.z);
        squashLand(
          boardwrapRef.current?.querySelector<HTMLElement>(`[data-card-id="${c.instanceId}"]`) ??
            null,
        );
        if (c.defId === "wind") {
          const cyScreen = vr.top + cam.y + (c.y * STRIDE + cardPx(c.h) / 2) * cam.z;
          windGust(cx, cyScreen, cam.z);
        }
      }
    }
    placedRef.current = current;
  }, [snapshot]);

  // Fit the camera whenever the board size changes (new floor, first load).
  useEffect(() => {
    const viewport = viewportRef.current;
    const boardwrap = boardwrapRef.current;
    if (!viewport || !boardwrap) return;
    const cam = cameraRef.current;
    cam.fit(viewport.clientWidth, viewport.clientHeight, cardPx(boardW), cardPx(boardH));
    cam.apply(boardwrap);
  }, [boardW, boardH]);

  const slots = useMemo(() => {
    const cells: { x: number; y: number }[] = [];
    for (let y = 0; y < boardH; y++) {
      for (let x = 0; x < boardW; x++) cells.push({ x, y });
    }
    return cells;
  }, [boardW, boardH]);

  const startCardDrag = (e: React.PointerEvent, instanceId: string, w: number, h: number) => {
    dragController.begin(e, {
      instanceId,
      w,
      h,
      location: "board",
      sourceEl: e.currentTarget as HTMLElement,
      owned: true,
    });
  };

  return (
    <div className="board-viewport" ref={viewportRef}>
      <div className="board-wrap" ref={boardwrapRef}>
        <div
          className="board-surface"
          style={{ width: cardPx(boardW), height: cardPx(boardH) }}
        >
          {slots.map((c) => {
            const isSel = selectedCell && selectedCell.x === c.x && selectedCell.y === c.y;
            const prop = cellProp(c.x, c.y);
            return (
              <div
                key={`s${c.x}-${c.y}`}
                className={`board-slot${isSel ? " sel" : ""}`}
                style={{
                  left: c.x * STRIDE,
                  top: c.y * STRIDE,
                  width: CELL,
                  height: CELL,
                  background: terrainColor(c.x, c.y),
                }}
              >
                {prop && <span className="bs-prop">{prop}</span>}
              </div>
            );
          })}

          {snapshot &&
            Object.values(snapshot.entities).map((e) => {
              const artUrl = e.hidden ? null : entityArtUrl(e.art, e.kind);
              const charge =
                e.attacking && e.cooldownTotalMs > 0
                  ? Math.max(0, Math.min(1, 1 - e.cooldownRemainingMs / e.cooldownTotalMs))
                  : 0;
              const familyColor = !e.hidden && e.family ? CARD_TYPE_COLOR[e.family] : undefined;
              return (
              <div
                key={e.entityId}
                className={`board-entity${e.hidden ? " hidden" : ""}${artUrl ? " board-entity--art" : ""}${e.takingDamage ? " hit" : ""}`}
                style={{
                  left: e.x * STRIDE,
                  top: e.y * STRIDE,
                  width: cardPx(e.w),
                  height: cardPx(e.h),
                  background: artUrl ? undefined : ENTITY_COLOR[e.kind] ?? "#444",
                  backgroundImage: artUrl ? `url("${artUrl}")` : undefined,
                }}
              >
                {familyColor && (
                  <>
                    <span className="be-ring" style={{ borderColor: familyColor }} />
                    <span
                      className="be-family"
                      style={{ background: familyColor }}
                      title={`${CARD_TYPE_LABEL[e.family as CardType]} foe`}
                    >
                      {CARD_TYPE_LABEL[e.family as CardType]}
                    </span>
                  </>
                )}
                {!e.hidden && e.cooldownTotalMs > 0 && (
                  <div className="be-charge" style={{ height: `${charge * 100}%` }} />
                )}
                {!artUrl && (
                  <span className="be-label">{e.hidden ? "?" : ENTITY_LABEL[e.kind] ?? e.kind}</span>
                )}
                {e.maxHealth > 0 && !e.hidden && (
                  <div className="be-hpbar">
                    <div
                      className="be-hpfill"
                      style={{
                        width: `${Math.max(0, (100 * e.health) / e.maxHealth)}%`,
                        background: e.health / e.maxHealth > 0.4 ? "#22c55e" : "#ef4444",
                      }}
                    />
                  </div>
                )}
              </div>
            );
            })}

          {snapshot &&
            Object.values(snapshot.cards)
              .filter((c) => c.location === "board")
              .map((c) => {
                const def = CARD_CATALOG[c.defId];
                const tierStats = def ? getTierStats(def, c.tier as 1 | 2 | 3) : null;
                const name = tierStats?.name ?? c.defId;
                const artUrl = tierStats ? cardArtUrl(tierStats.art) : null;
                const mine = c.ownerId === sessionId;
                const charge =
                  c.attacking && c.cooldownTotalMs > 0
                    ? Math.max(0, Math.min(1, 1 - c.cooldownRemainingMs / c.cooldownTotalMs))
                    : 0;
                const showFooter = c.maxHealth > 0 && (c.attacking || c.takingDamage);
                const auraClass = AURA_CLASS[c.defId] ?? "";
                return (
                  <div
                    key={c.instanceId}
                    data-card-id={c.instanceId}
                    className={`board-card${c.takingDamage ? " hit" : ""}${artUrl ? " board-card--art" : ""}${auraClass ? " " + auraClass : ""}`}
                    style={{
                      left: c.x * STRIDE,
                      top: c.y * STRIDE,
                      width: cardPx(c.w),
                      height: cardPx(c.h),
                      background: artUrl ? undefined : CARD_TYPE_GRADIENT[c.cardType],
                      backgroundImage: artUrl ? `url("${artUrl}")` : undefined,
                      cursor: mine ? "grab" : "default",
                    }}
                    onPointerDown={
                      mine ? (e) => startCardDrag(e, c.instanceId, c.w, c.h) : undefined
                    }
                  >
                    {auraClass && <span className="card-aura" />}
                    {c.defId === "wind" && (
                      <span className="wind-loop" aria-hidden>
                        <i />
                        <i />
                        <i />
                        <i />
                      </span>
                    )}
                    <div className="bc-charge" style={{ height: `${charge * 100}%` }} />
                    <span className="bc-name">{name}</span>
                    <div className="bc-frame" style={{ boxShadow: `inset 0 0 0 3px ${TIER_COLOR[c.tier]}` }} />
                    {showFooter && (
                      <div className="bc-hpbar">
                        <div
                          className="bc-hpfill"
                          style={{
                            width: `${Math.max(0, (100 * c.health) / c.maxHealth)}%`,
                            background: c.health / c.maxHealth > 0.4 ? "#22c55e" : "#ef4444",
                          }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}

          <div className="board-preview" ref={previewRef} style={{ opacity: 0 }} />
        </div>
      </div>

      <div className="sellzone" ref={sellzoneRef}>
        Drop here to sell
      </div>

      <CameraDebug
        open={cameraDebugOpen}
        onClose={() => setCameraDebugOpen(false)}
        camera={cameraRef.current}
        viewportRef={viewportRef}
        boardwrapRef={boardwrapRef}
        boardPxW={cardPx(boardW)}
        boardPxH={cardPx(boardH)}
      />
      {!cameraDebugOpen && (
        <button
          type="button"
          className="camera-debug-toggle"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setCameraDebugOpen(true)}
          title="Camera debug (`)"
        >
          cam
        </button>
      )}
    </div>
  );
}
