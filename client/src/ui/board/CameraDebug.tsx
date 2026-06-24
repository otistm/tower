import { RefObject, useCallback, useEffect, useState } from "react";
import { Camera } from "./camera";

export interface CameraDebugProps {
  open: boolean;
  onClose: () => void;
  camera: Camera;
  viewportRef: RefObject<HTMLElement | null>;
  boardwrapRef: RefObject<HTMLElement | null>;
  boardPxW: number;
  boardPxH: number;
}

/** Dev panel: live camera readout + nudge/fit/zoom/clamp controls. */
export function CameraDebug({
  open,
  onClose,
  camera,
  viewportRef,
  boardwrapRef,
  boardPxW,
  boardPxH,
}: CameraDebugProps) {
  const [x, setX] = useState(camera.x);
  const [y, setY] = useState(camera.y);
  const [z, setZ] = useState(camera.z);
  const [clampOn, setClampOn] = useState(camera.clampEnabled);
  const [minZ, setMinZ] = useState(camera.limits.minZ);
  const [maxZ, setMaxZ] = useState(camera.limits.maxZ);

  const sync = useCallback(() => {
    const viewportEl = viewportRef.current;
    const boardwrapEl = boardwrapRef.current;
    if (!viewportEl || !boardwrapEl) return;
    camera.clamp(viewportEl.clientWidth, viewportEl.clientHeight, boardPxW, boardPxH);
    camera.apply(boardwrapEl);
    setX(Math.round(camera.x * 10) / 10);
    setY(Math.round(camera.y * 10) / 10);
    setZ(Math.round(camera.z * 1000) / 1000);
    setClampOn(camera.clampEnabled);
  }, [camera, viewportRef, boardwrapRef, boardPxW, boardPxH]);

  const fit = useCallback(() => {
    const viewportEl = viewportRef.current;
    const boardwrapEl = boardwrapRef.current;
    if (!viewportEl || !boardwrapEl) return;
    camera.fit(viewportEl.clientWidth, viewportEl.clientHeight, boardPxW, boardPxH);
    sync();
  }, [camera, viewportRef, boardwrapRef, boardPxW, boardPxH, sync]);

  const zoomAtCenter = useCallback(
    (factor: number) => {
      const viewportEl = viewportRef.current;
      if (!viewportEl) return;
      const r = viewportEl.getBoundingClientRect();
      camera.zoomStep(factor, r.left + r.width / 2, r.top + r.height / 2, r.left, r.top);
      sync();
    },
    [camera, viewportRef, sync],
  );

  const pan = useCallback(
    (dx: number, dy: number) => {
      camera.panBy(dx, dy);
      sync();
    },
    [camera, sync],
  );

  // Live readout while the panel is open.
  useEffect(() => {
    if (!open) return;
    let id = 0;
    const tick = () => {
      setX(Math.round(camera.x * 10) / 10);
      setY(Math.round(camera.y * 10) / 10);
      setZ(Math.round(camera.z * 1000) / 1000);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [open, camera]);

  // Keyboard shortcuts (only while panel is open).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case "Escape":
          onClose();
          break;
        case "ArrowLeft":
          e.preventDefault();
          pan(-40, 0);
          break;
        case "ArrowRight":
          e.preventDefault();
          pan(40, 0);
          break;
        case "ArrowUp":
          e.preventDefault();
          pan(0, -40);
          break;
        case "ArrowDown":
          e.preventDefault();
          pan(0, 40);
          break;
        case "+":
        case "=":
          e.preventDefault();
          zoomAtCenter(1.15);
          break;
        case "-":
        case "_":
          e.preventDefault();
          zoomAtCenter(1 / 1.15);
          break;
        case "0":
          e.preventDefault();
          fit();
          break;
        case "c":
          camera.clampEnabled = !camera.clampEnabled;
          setClampOn(camera.clampEnabled);
          sync();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, pan, zoomAtCenter, fit, camera, sync]);

  if (!open) return null;

  const vw = viewportRef.current?.clientWidth ?? 0;
  const vh = viewportRef.current?.clientHeight ?? 0;

  return (
    <div className="camera-debug" onPointerDown={(e) => e.stopPropagation()}>
      <div className="camera-debug__head">
        <strong>Camera Debug</strong>
        <button type="button" className="camera-debug__close" onClick={onClose}>
          ×
        </button>
      </div>

      <dl className="camera-debug__readout">
        <div>
          <dt>x</dt>
          <dd>{x}px</dd>
        </div>
        <div>
          <dt>y</dt>
          <dd>{y}px</dd>
        </div>
        <div>
          <dt>z</dt>
          <dd>{z}</dd>
        </div>
        <div>
          <dt>viewport</dt>
          <dd>
            {vw}×{vh}
          </dd>
        </div>
        <div>
          <dt>board</dt>
          <dd>
            {boardPxW}×{boardPxH}
          </dd>
        </div>
      </dl>

      <div className="camera-debug__row">
        <button type="button" onClick={fit}>
          Fit (0)
        </button>
        <button type="button" onClick={() => zoomAtCenter(1 / 1.15)}>
          −
        </button>
        <button type="button" onClick={() => zoomAtCenter(1.15)}>
          +
        </button>
        <label className="camera-debug__clamp">
          <input
            type="checkbox"
            checked={clampOn}
            onChange={(e) => {
              camera.clampEnabled = e.target.checked;
              setClampOn(e.target.checked);
              sync();
            }}
          />
          Clamp (c)
        </label>
      </div>

      <div className="camera-debug__pan">
        <button type="button" aria-label="Pan up" onClick={() => pan(0, -48)}>
          ↑
        </button>
        <div className="camera-debug__pan-mid">
          <button type="button" aria-label="Pan left" onClick={() => pan(-48, 0)}>
            ←
          </button>
          <button type="button" aria-label="Pan right" onClick={() => pan(48, 0)}>
            →
          </button>
        </div>
        <button type="button" aria-label="Pan down" onClick={() => pan(0, 48)}>
          ↓
        </button>
      </div>

      <label className="camera-debug__field">
        Zoom
        <input
          type="range"
          min={minZ}
          max={maxZ}
          step={0.01}
          value={z}
          onChange={(e) => {
            camera.setZoom(Number(e.target.value));
            sync();
          }}
        />
      </label>

      <div className="camera-debug__limits">
        <label>
          minZ
          <input
            type="number"
            step={0.05}
            value={minZ}
            onChange={(e) => {
              const v = Number(e.target.value);
              setMinZ(v);
              camera.setLimits(v, maxZ);
              sync();
            }}
          />
        </label>
        <label>
          maxZ
          <input
            type="number"
            step={0.05}
            value={maxZ}
            onChange={(e) => {
              const v = Number(e.target.value);
              setMaxZ(v);
              camera.setLimits(minZ, v);
              sync();
            }}
          />
        </label>
      </div>

      <div className="camera-debug__direct">
        <label>
          x
          <input
            type="number"
            step={1}
            value={x}
            onChange={(e) => {
              camera.x = Number(e.target.value);
              sync();
            }}
          />
        </label>
        <label>
          y
          <input
            type="number"
            step={1}
            value={y}
            onChange={(e) => {
              camera.y = Number(e.target.value);
              sync();
            }}
          />
        </label>
        <label>
          z
          <input
            type="number"
            step={0.01}
            value={z}
            onChange={(e) => {
              camera.setZoom(Number(e.target.value));
              sync();
            }}
          />
        </label>
      </div>

      <p className="camera-debug__hint">
        ` toggle · arrows pan · +/- zoom · 0 fit · c clamp · Esc close
      </p>
    </div>
  );
}

/** True when ?cameraDebug=1 is in the URL (auto-open on load). */
export function cameraDebugFromUrl(): boolean {
  if (typeof location === "undefined") return false;
  return new URLSearchParams(location.search).get("cameraDebug") === "1";
}
