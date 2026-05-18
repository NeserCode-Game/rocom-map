import { useState, useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import { emit } from "@tauri-apps/api/event";

const STORAGE_KEY = "rocom-map:capture-region";
const PREV_KEY = "rocom-map:capture-region-prev";
const SCROLL_STEP = 4;

function loadSaved(): { rx: number; ry: number; rw: number; rh: number } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { rx: 1718, ry: 43, rw: 170, rh: 170 };
}

function savePos(rx: number, ry: number, rw: number, rh: number) {
  const prev = localStorage.getItem(STORAGE_KEY);
  if (prev) localStorage.setItem(PREV_KEY, prev);
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ rx, ry, rw, rh }));
  // 跨窗口通知
  emit("capture-region", { rx, ry, rw, rh }).catch(() => {});
}

export default function Selector() {
  const [size, setSize] = useState(170);
  const [posLabel, setPosLabel] = useState<string>("");
  const win = useRef(getCurrentWindow());
  const mousedown = useRef({ x: 0, y: 0, drag: false });
  const clickCount = useRef(0);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const posPoll = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    document.documentElement.classList.add("selector-window");
    return () => document.documentElement.classList.remove("selector-window");
  }, []);

  useEffect(() => {
    const saved = loadSaved();
    setSize(saved.rw);
    win.current.setSize(new PhysicalSize(saved.rw, saved.rh));
    win.current.setPosition(new PhysicalPosition(saved.rx, saved.ry));
    updateLabel();
  }, []);

  /** 按下：记录位置，暂不开始拖拽 */
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    mousedown.current = { x: e.clientX, y: e.clientY, drag: false };
  };

  /** 移动超阈值 → 原生拖拽，期间轮询位置 */
  const onMouseMove = (e: React.MouseEvent) => {
    if (e.buttons !== 1) return;
    if (mousedown.current.drag) return;
    const dx = e.clientX - mousedown.current.x;
    const dy = e.clientY - mousedown.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      mousedown.current.drag = true;
      clickCount.current = 0;
      // 轮询位置直到拖拽结束
      posPoll.current = setInterval(updateLabel, 80);
      win.current.startDragging().finally(() => {
        if (posPoll.current) { clearInterval(posPoll.current); posPoll.current = null; }
        persist();
      });
    }
  };

  /** 松开：未拖拽则为点击，累积计数检测双击 */
  const onMouseUp = () => {
    if (mousedown.current.drag) return;
    clickCount.current++;
    if (clickCount.current === 1) {
      clickTimer.current = setTimeout(() => { clickCount.current = 0; }, 350);
    } else if (clickCount.current >= 2) {
      if (clickTimer.current) { clearTimeout(clickTimer.current); clickTimer.current = null; }
      clickCount.current = 0;
      persist();
      win.current.hide();
    }
  };

  /** 滚轮缩放 */
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -SCROLL_STEP : SCROLL_STEP;
    setSize((s) => {
      const ns = Math.max(80, Math.min(400, s + delta));
      win.current.setSize(new PhysicalSize(ns, ns)).then(() => persist(ns));
      updateLabel();
      return ns;
    });
  };

  /** Enter / Esc */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") { persist(); win.current.hide(); }
      if (e.key === "Escape") win.current.hide();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [size]);

  async function updateLabel() {
    try {
      const pos = await win.current.innerPosition();
      const sz = await win.current.innerSize();
      setPosLabel(`${pos.x},${pos.y}  ${sz.width}×${sz.height}`);
    } catch { /* ignore */ }
  }

  async function persist(sz?: number) {
    try {
      const pos = await win.current.innerPosition();
      const s = sz ?? size;
      savePos(pos.x, pos.y, s, s);
      updateLabel();
    } catch { /* ignore */ }
  }

  return (
    <div
      className="selector-root"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onWheel={onWheel}
    >
      <div className="selector-crosshair-x" />
      <div className="selector-crosshair-y" />
      <span className="selector-size">{posLabel || `${size}×${size}`}</span>
      <span className="selector-hint">拖拽 | 滚轮 | 双击确认 | Esc</span>
    </div>
  );
}
