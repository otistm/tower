import { CARD_CATALOG, CARD_TYPE_LABEL, CardType, GamePhase, getTierStats } from "@tower/shared";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useGameStore } from "../../network/store";
import { ChargeBar } from "./ChargeBar";
import { setFxRoot } from "./fxRoot";
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
import { CELL, DISCOVERY_PAD, STRIDE, cardPx } from "./constants";
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
 * Per-biome ground palettes. Patches of these tones give each band a distinct
 * sense of place (verdant greens, foundry embers, frost blues, summit dark)
 * instead of a uniform void, so even an empty grid reads as a designed level.
 */
const BIOME_TERRAIN: Record<string, string[]> = {
  verdant: ["#1b2c1d", "#203420", "#172a1a", "#26301c", "#142824", "#2a2a1b", "#1d2a30"],
  ashen: ["#2a1712", "#331a13", "#241410", "#3a1f15", "#2e1a14", "#3d2417", "#291511"],
  frost: ["#16242e", "#1b2d38", "#142733", "#1f3340", "#13202b", "#22323d", "#182a36"],
  summit: ["#1a1622", "#211a2c", "#161320", "#261d31", "#1d1726", "#2a2036", "#15121d"],
};
const DEFAULT_TERRAIN = BIOME_TERRAIN.verdant;
const PROP_GLYPH = ["•", "·", "✦", "❟", "ᵕ"];

function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Coarse biome patch (3x3 cells) so terrain reads as zones, not noise. */
function terrainColor(x: number, y: number, biome: string): string {
  const palette = BIOME_TERRAIN[biome] ?? DEFAULT_TERRAIN;
  const patch = hash2(Math.floor(x / 3), Math.floor(y / 3));
  return palette[patch % palette.length];
}

/** Subtle, non-gameplay clutter on a fraction of cells to break grid lines. */
function cellProp(x: number, y: number): string | null {
  const h = hash2(x * 7 + 11, y * 13 + 5);
  if (h % 6 !== 0) return null;
  return PROP_GLYPH[h % PROP_GLYPH.length];
}

/**
 * The static terrain grid. This is by far the heaviest part of the board (up to
 * thousands of cells) yet only changes when the board grows or the inspected
 * cell moves — never on the ~20×/s combat patches. Memoizing it on those few
 * primitives keeps React from diffing the whole grid every frame of a fight.
 */
const BoardSlots = memo(function BoardSlots({
  boardW,
  boardH,
  selX,
  selY,
  biome,
}: {
  boardW: number;
  boardH: number;
  selX: number;
  selY: number;
  biome: string;
}) {
  const slots = useMemo(() => {
    const cells: { x: number; y: number }[] = [];
    for (let y = 0; y < boardH; y++) {
      for (let x = 0; x < boardW; x++) cells.push({ x, y });
    }
    return cells;
  }, [boardW, boardH]);

  return (
    <>
      {slots.map((c) => {
        const isSel = c.x === selX && c.y === selY;
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
              background: terrainColor(c.x, c.y, biome),
            }}
          >
            {prop && <span className="bs-prop">{prop}</span>}
          </div>
        );
      })}
    </>
  );
});

/**
 * Highlights the cells the currently-dragged card would attack/affect. Subscribes
 * to the store directly so frequent drag-move updates only re-render this thin
 * overlay, not the whole board.
 */
const AttackPreviewLayer = memo(function AttackPreviewLayer() {
  const cells = useGameStore((s) => s.attackPreview);
  if (cells.length === 0) return null;
  return (
    <>
      {cells.map((c) => (
        <div
          key={`ap${c.x}-${c.y}`}
          className="attack-cell"
          style={{ left: c.x * STRIDE, top: c.y * STRIDE, width: CELL, height: CELL }}
        />
      ))}
    </>
  );
});

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
  const reportViewport = useGameStore((s) => s.reportViewport);

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
      onPreviewCells: (cells) => useGameStore.getState().setAttackPreview(cells),
    });
  }, [onInspectCard]);

  // Pan the board (single-pointer drag) to reach rows/cols that overflow the
  // pane; a press without movement is a tap that inspects the cell. The board
  // fills the pane and there is no zoom.
  useEffect(() => {
    const viewport = viewportRef.current;
    const boardwrap = boardwrapRef.current;
    if (!viewport || !boardwrap) return;
    const cam = cameraRef.current;
    const apply = () => cam.apply(boardwrap);

    let pan: { ox: number; oy: number; cx: number; cy: number; id: number } | null = null;
    let moved = false;

    const onDown = (e: PointerEvent) => {
      if (dragController.isDragging) return;
      if ((e.target as HTMLElement).closest(".board-card")) return; // card handles its own drag
      try {
        viewport.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      pan = { ox: e.clientX, oy: e.clientY, cx: cam.x, cy: cam.y, id: e.pointerId };
      moved = false;
      viewport.classList.add("grabbing");
    };

    const onMove = (e: PointerEvent) => {
      if (!pan || e.pointerId !== pan.id) return;
      if (Math.hypot(e.clientX - pan.ox, e.clientY - pan.oy) > 5) moved = true;
      cam.x = pan.cx + (e.clientX - pan.ox);
      cam.y = pan.cy + (e.clientY - pan.oy);
      cam.clamp(viewport.clientWidth, viewport.clientHeight, cardPx(boardW), cardPx(boardH));
      apply();
    };

    const onUp = (e: PointerEvent) => {
      if (!pan || e.pointerId !== pan.id) return;
      const wasTap = !moved && !dragController.isDragging;
      try {
        viewport.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      pan = null;
      viewport.classList.remove("grabbing");
      if (!wasTap) return;
      const snap = useGameStore.getState().snapshot;
      if (!snap) return;
      const r = viewport.getBoundingClientRect();
      const b = cam.screenToBoard(e.clientX, e.clientY, r.left, r.top);
      const cx = Math.floor(b.x / STRIDE);
      const cy = Math.floor(b.y / STRIDE);
      if (cx >= 0 && cy >= 0 && cx < snap.boardWidth && cy < snap.boardHeight) {
        useGameStore.getState().selectCell({ x: cx, y: cy });
        onInspectRef.current();
      }
    };

    viewport.addEventListener("pointerdown", onDown);
    viewport.addEventListener("pointermove", onMove);
    viewport.addEventListener("pointerup", onUp);
    viewport.addEventListener("pointercancel", onUp);
    return () => {
      viewport.removeEventListener("pointerdown", onDown);
      viewport.removeEventListener("pointermove", onMove);
      viewport.removeEventListener("pointerup", onUp);
      viewport.removeEventListener("pointercancel", onUp);
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
      const sx = vr.left + cam.x + bx * cam.zx;
      const sy = vr.top + cam.y + by * cam.zy;
      flyCoins({ x: sx, y: sy }, target, gold);
    });
  }, []);

  // Attack VFX: elemental bolts (allies) / sword slashes (enemies), plus a
  // recoil pulse on the firing card so abilities coming off cooldown read.
  useEffect(() => {
    return onAbilityFired(({ sourceCellKey, team, targets, ability, family }) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      // Board-local coords: the fx layer is inside the camera transform, so it
      // pans/scales with the board automatically.
      const toScreen = (cx: number, cy: number) => ({
        x: cx * STRIDE + CELL / 2,
        y: cy * STRIDE + CELL / 2,
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
      // Board-local coords (fx layer rides the camera transform).
      const sx = pos.x * STRIDE + CELL / 2;
      const sy = pos.y * STRIDE + CELL / 2;
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
    if (viewport) {
      // Board-local coords; the camera-transformed fx layer scales them to
      // screen, so dust/gusts pan with the board. scale=1 lets the camera scale.
      for (const c of onBoard) {
        if (prev.has(c.instanceId)) continue;
        const cx = c.x * STRIDE + cardPx(c.w) / 2;
        const baseY = c.y * STRIDE + cardPx(c.h);
        landDust(cx, baseY, 1);
        squashLand(
          boardwrapRef.current?.querySelector<HTMLElement>(`[data-card-id="${c.instanceId}"]`) ??
            null,
        );
        if (c.defId === "wind") {
          const cyScreen = c.y * STRIDE + cardPx(c.h) / 2;
          windGust(cx, cyScreen, 1);
        }
      }
    }
    placedRef.current = current;
  }, [snapshot]);

  // Fit the camera when the board or its pane size changes.
  useEffect(() => {
    const viewport = viewportRef.current;
    const boardwrap = boardwrapRef.current;
    if (!viewport || !boardwrap) return;
    const cam = cameraRef.current;
    const fit = () => {
      const vw = viewport.clientWidth;
      const vh = viewport.clientHeight;
      cam.fit(vw, vh, cardPx(boardW), cardPx(boardH));
      cam.apply(boardwrap);
      // Ask the server for enough columns/rows to fill this viewport (plus a
      // discovery pad to pan into). The board grows to the largest client.
      const strideOnScreen = STRIDE * cam.zx;
      const cols = Math.ceil(vw / strideOnScreen) + DISCOVERY_PAD;
      const rows = Math.ceil(vh / strideOnScreen) + DISCOVERY_PAD;
      reportViewport(cols, rows);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(viewport);
    return () => ro.disconnect();
  }, [boardW, boardH, reportViewport]);

  // Register the camera-transformed fx layer so VFX modules append into it.
  const fxRootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setFxRoot(fxRootRef.current);
    return () => setFxRoot(null);
  }, []);

  const startCardDrag = (
    e: React.PointerEvent,
    instanceId: string,
    defId: string,
    tier: number,
    w: number,
    h: number,
  ) => {
    dragController.begin(e, {
      instanceId,
      defId,
      tier,
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
          <BoardSlots
            boardW={boardW}
            boardH={boardH}
            selX={selectedCell?.x ?? -1}
            selY={selectedCell?.y ?? -1}
            biome={snapshot?.biome ?? "verdant"}
          />

          <AttackPreviewLayer />

          {snapshot &&
            Object.values(snapshot.entities).map((e) => {
              const artUrl = e.hidden ? null : entityArtUrl(e.art, e.kind);
              const familyColor = !e.hidden && e.family ? CARD_TYPE_COLOR[e.family] : undefined;
              return (
              <div
                key={e.entityId}
                className={`board-entity${e.hidden ? " hidden" : ""}${artUrl ? " board-entity--art" : ""}${e.takingDamage ? " hit" : ""}${e.invulnerable ? " be-guarded" : ""}${e.bossGuard ? " be-guard" : ""}`}
                style={{
                  left: e.x * STRIDE,
                  top: e.y * STRIDE,
                  width: cardPx(e.w),
                  height: cardPx(e.h),
                  background: artUrl ? undefined : ENTITY_COLOR[e.kind] ?? "#444",
                  backgroundImage: artUrl ? `url("${artUrl}")` : undefined,
                }}
              >
                {e.invulnerable && (
                  <span className="be-shield" title="Defeat the guardians to expose the boss">
                    {"\uD83D\uDEE1"}
                  </span>
                )}
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
                {!e.hidden && e.kind === "minion" && e.rewardGold > 0 && (
                  <span className="be-coin" title={`Bribe with a ring for ${e.rewardGold}g`}>
                    {"\uD83E\uDE99"}
                  </span>
                )}
                {!e.hidden && e.cooldownTotalMs > 0 && (
                  <ChargeBar
                    className="be-charge"
                    totalMs={e.cooldownTotalMs}
                    remainingMs={e.cooldownRemainingMs}
                    active={e.attacking}
                  />
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
                const showFooter = c.maxHealth > 0 && (c.attacking || c.takingDamage);
                const auraClass = AURA_CLASS[c.defId] ?? "";
                return (
                  <div
                    key={c.instanceId}
                    data-card-id={c.instanceId}
                    className={`board-card${c.takingDamage ? " hit" : ""}${artUrl ? " board-card--art" : ""}${auraClass ? " " + auraClass : ""}${c.frozenMs > 0 ? " frozen" : ""}`}
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
                      mine
                        ? (e) => startCardDrag(e, c.instanceId, c.defId, c.tier, c.w, c.h)
                        : undefined
                    }
                  >
                    {auraClass && <span className="card-aura" />}
                    {c.frozenMs > 0 && <span className="frost-overlay" aria-hidden />}
                    {c.defId === "wind" && (
                      <span className="wind-loop" aria-hidden>
                        <i />
                        <i />
                        <i />
                        <i />
                      </span>
                    )}
                    <ChargeBar
                      className="bc-charge"
                      totalMs={c.cooldownTotalMs}
                      remainingMs={c.cooldownRemainingMs}
                      active={c.attacking}
                    />
                    {c.shield > 0 && (
                      <span className="bc-shield" title={`Shielded by walls (${c.shield})`}>
                        {"\uD83D\uDEE1"} {c.shield}
                      </span>
                    )}
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
        {/* VFX ride the camera transform so strikes/numbers/dust pan with the board. */}
        <div className="board-fx" ref={fxRootRef} aria-hidden />
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
