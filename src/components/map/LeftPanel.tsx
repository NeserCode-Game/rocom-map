import { useState, useCallback, useEffect } from "react";
import { ChevronDown, Filter, Compass, Route, Play, Pause, RefreshCw, Eye, Check, X, ArrowDownWideNarrow, ArrowUpWideNarrow, MapPin } from "lucide-react";
import CategoryFilter from "./CategoryFilter";
import TrackPanel from "./TrackPanel";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useMapStore } from "@/composables/useMapStore";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { emit } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useTracker } from "@/composables/useTracker";
import { ConfigPanel } from "./ConfigPanel";
import { latLngToPixel } from "@/lib/map/coords";

const CAPTURE_STORAGE_KEY = "rocom-map:capture-region";
function loadCaptureRegion() { try { const raw = localStorage.getItem(CAPTURE_STORAGE_KEY); if (raw) return JSON.parse(raw); } catch { /* */ } return { rx: 1438, ry: 63, rw: 150, rh: 150 }; }

type Tab = "filter" | "track" | "route";
type LogEntry = { ts: number; text: string; kind: "info" | "warn" | "err" };

export default function LeftPanel() {
  const [open, setOpen] = useState<Tab | null>("filter");
  const [autoCapture, setAutoCapture] = useState(false);
  const [captured, setCaptured] = useState<string | null>(null);
  const [match, setMatch] = useState<{ x: number | null; y: number | null; confidence: number | null; matches: number | null; inliers: number | null; reference_png_b64: string | null; mode: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const addLog = useCallback((text: string, kind: LogEntry["kind"] = "info") => {
    setLogs((prev) => [{ ts: Date.now(), text, kind }, ...prev].slice(0, 50));
  }, []);

  const hwnd = useMapStore((s) => s.captureHwnd);
  const rx = useMapStore((s) => s.captureRx);
  const ry = useMapStore((s) => s.captureRy);
  const rw = useMapStore((s) => s.captureRw);
  const rh = useMapStore((s) => s.captureRh);

  const { captureAndMatch, startAuto, stopAuto } = useTracker(hwnd, rx, ry, rw, rh);

  function toggle(t: Tab) { setOpen(open === t ? null : t); }

  // 同步选择器坐标
  useEffect(() => {
    const sync = () => {
      const s = loadCaptureRegion();
      useMapStore.getState().setCaptureConfig({ rx: s.rx, ry: s.ry, rw: s.rw, rh: s.rh });
    };
    window.addEventListener("focus", sync);
    const p = listen<{ rx: number; ry: number; rw: number; rh: number }>("capture-region", (e) => {
      useMapStore.getState().setCaptureConfig({ rx: e.payload.rx, ry: e.payload.ry, rw: e.payload.rw, rh: e.payload.rh });
    });
    return () => { window.removeEventListener("focus", sync); p.then((fn) => fn()); };
  }, []);

  const toggleAuto = useCallback(() => {
    if (autoCapture) { stopAuto(); setAutoCapture(false); addLog("追踪停止", "info"); return; }
    setAutoCapture(true); addLog("追踪开始", "info");
    startAuto(async () => {
      if (!hwnd) return;
      try {
        const r = await captureAndMatch();
        setCaptured(r.captured);
        if (r.match && r.match.x != null && r.match.x >= 0) {
          setMatch(r.match); setError(null);
          addLog(`${r.match.mode} X=${r.match.x} Y=${r.match.y} conf=${((r.match.confidence ?? 0) * 100).toFixed(0)}%`, "info");
        } else {
          addLog(`${r.match?.mode || "track"}: 无匹配`, "warn");
        }
      } catch (e) { const msg = String(e); setError(msg); addLog(msg, "err"); }
    });
  }, [autoCapture, hwnd, captureAndMatch, startAuto, stopAuto, addLog]);

  const doReset = useCallback(async () => {
    try { await invoke("sift_reset"); setMatch(null); addLog("追踪已重置", "info"); setLogs([]); } catch { /* */ }
  }, [addLog]);

  const doCalibrate = useCallback(async () => {
    if (!captured || !match || match.x == null || match.x < 0) return;
    const calibX = Number(import.meta.env.VITE_CALIBRATION_X) || 1304;
    const calibY = Number(import.meta.env.VITE_CALIBRATION_Y) || 2844;
    const base64 = captured.split(",")[1];
    const bytes = Array.from(atob(base64), (c: string) => c.charCodeAt(0));
    try {
      addLog("颜色校准中…", "info");
      const r = await invoke<Record<string, unknown>>("sift_calibrate_raw", { pngBytes: bytes, calibX, calibY, tolerance: 9999 });
      addLog(`校准完成 (${r.matched_x}, ${r.matched_y})`, "info");
    } catch (e) { const msg = String(e); setError(msg); addLog(msg, "err"); }
  }, [captured, match, addLog]);

  // 每次匹配后推送导航数据到灵动岛
  useEffect(() => {
    if (!match || match.x == null || match.x < 0 || match.y == null) return;
    const tx = match.x, ty = match.y as number;
    const store = useMapStore.getState();
    const locs = store.locations;
    const visibleCats = store.visibleCategories;
    const completed = store.completedLocations;

    const candidates = visibleCats.size > 0
      ? locs.filter((l) => visibleCats.has(l.category_id) && !completed.has(l.id))
      : locs.filter((l) => !completed.has(l.id));

    let nearest: { title: string; x: number; y: number } | null = null;
    let nearestDist = Infinity;
    for (const loc of candidates) {
      const p = latLngToPixel(loc.latitude, loc.longitude);
      const dx = p.x - tx, dy = p.y - ty;
      const d = Math.sqrt(dx*dx + dy*dy);
      if (d < nearestDist && d > 2) { nearest = { title: loc.title, x: p.x, y: p.y }; nearestDist = d; }
    }

    if (nearest) {
      const rad = Math.atan2(nearest.y - ty, nearest.x - tx);
      const angle = Math.round(((rad * 180) / Math.PI + 360 + 90) % 360);
      const dist = Math.round((nearestDist / 4096) * 1400);
      // 目标在参考图 crop(±50px) 中的相对位置
      const dotX = Math.max(5, Math.min(95, Math.round(50 + (nearest.x - tx))));
      const dotY = Math.max(5, Math.min(95, Math.round(50 + (nearest.y - ty))));
      emit("nav-data", { title: nearest.title, angle, dist, refB64: match.reference_png_b64 ?? null, dotX, dotY }).catch(() => {});
    } else {
      emit("nav-data", { title: null, angle: 0, dist: 0, refB64: null, dotX: 50, dotY: 50 }).catch(() => {});
    }
  }, [match]);

  const toggleSelector = useCallback(async () => {
    try { const sel = await WebviewWindow.getByLabel("selector"); if (!sel) return; const v = await sel.isVisible(); if (v) { await sel.hide(); } else { await sel.show(); await sel.setFocus(); } } catch { /* */ }
  }, []);

  const toggleNavIsland = useCallback(async () => {
    try { const win = await WebviewWindow.getByLabel("nav-island"); if (!win) return; const v = await win.isVisible(); if (v) { await win.hide(); } else { await win.show(); } } catch { /* */ }
  }, []);

  return (
    <div className="left-panel">
      <button className="left-panel-tab" onClick={() => toggle("filter")}>
        <Filter className="left-panel-tab-icon" />
        <span className="left-panel-tab-label">分类筛选</span>
        <div className="left-panel-end" onClick={(e) => e.stopPropagation()}>
          <div className="left-panel-actions">
            <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="left-panel-action-btn" onClick={() => { const all = new Set(useMapStore.getState().groups.flatMap((g: { subCategories: { categoryId: number }[] }) => g.subCategories.map((sc: { categoryId: number }) => sc.categoryId))); useMapStore.setState({ visibleCategories: all }); }}><Check className="left-panel-action-icon" /></Button></TooltipTrigger><TooltipContent>全选</TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="left-panel-action-btn" onClick={() => useMapStore.setState({ visibleCategories: new Set() })}><X className="left-panel-action-icon" /></Button></TooltipTrigger><TooltipContent>全不选</TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="left-panel-action-btn" onClick={() => useMapStore.getState().expandAllGroups()}><ArrowDownWideNarrow className="left-panel-action-icon" /></Button></TooltipTrigger><TooltipContent>展开全部</TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="left-panel-action-btn" onClick={() => useMapStore.getState().collapseAllGroups()}><ArrowUpWideNarrow className="left-panel-action-icon" /></Button></TooltipTrigger><TooltipContent>折叠全部</TooltipContent></Tooltip>
            <ConfigPanel />
          </div>
          <ChevronDown className={`left-panel-chevron ${open === "filter" ? "left-panel-chevron-open" : ""}`} />
        </div>
      </button>
      {open === "filter" && <div className="left-panel-body"><CategoryFilter /></div>}

      <Separator />

      <button className="left-panel-tab" onClick={() => toggle("track")}>
        <Compass className="left-panel-tab-icon" />
        <span className="left-panel-tab-label">追踪模式</span>
        <div className="left-panel-end" onClick={(e) => e.stopPropagation()}>
          <div className="left-panel-actions">
            <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="left-panel-action-btn" disabled={!hwnd} onClick={toggleAuto}>{autoCapture ? <Pause className="left-panel-action-icon left-panel-action-icon--pulse" /> : <Play className="left-panel-action-icon" />}</Button></TooltipTrigger><TooltipContent>{autoCapture ? "停止" : "开始"}</TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="left-panel-action-btn" disabled={!hwnd} onClick={doReset}><RefreshCw className="left-panel-action-icon" /></Button></TooltipTrigger><TooltipContent>重置</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="left-panel-action-btn" onClick={toggleSelector}><Eye className="left-panel-action-icon" /></Button></TooltipTrigger><TooltipContent>选区</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="left-panel-action-btn" onClick={toggleNavIsland}><MapPin className="left-panel-action-icon" /></Button></TooltipTrigger><TooltipContent>灵动岛导航</TooltipContent></Tooltip>
        </div>
          <ChevronDown className={`left-panel-chevron ${open === "track" ? "left-panel-chevron-open" : ""}`} />
        </div>
      </button>
      {open === "track" && (
        <div className="left-panel-body">
          <TrackPanel captured={captured} match={match} error={error} logs={logs} rx={rx} ry={ry} rw={rw} rh={rh} onCalibrate={doCalibrate}
            onRegionChange={(field, value) => { const next: Record<string, number> = { rx, ry, rw, rh, [field]: value }; useMapStore.getState().setCaptureConfig({ rx: next.rx, ry: next.ry, rw: next.rw, rh: next.rh }); }} />
        </div>
      )}

      <Separator />

      <button className="left-panel-tab" onClick={() => toggle("route")}>
        <Route className="left-panel-tab-icon" />
        <span className="left-panel-tab-label">路线系统</span>
        <div className="left-panel-end">
          <ChevronDown className={`left-panel-chevron ${open === "route" ? "left-panel-chevron-open" : ""}`} />
        </div>
      </button>
      {open === "route" && <div className="left-panel-body"><span className="left-panel-placeholder">待开发 — JSON 路线</span></div>}
    </div>
  );
}
