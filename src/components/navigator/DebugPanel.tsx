import { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RefreshCw, Crosshair, Play, Monitor, Map, Satellite, Pause, SkipForward, Eye, ClipboardCopy, Target, Navigation } from "lucide-react";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useMapStore } from "@/composables/useMapStore";
import type { WindowInfo } from "@/lib/navigator/types";

interface SiftMatchResult { x: number | null; y: number | null; confidence: number | null; matches: number | null; inliers: number | null; reference_png_b64: string | null; mode: string | null; }

function pngToDataUrl(arr: number[]): string { const bytes = new Uint8Array(arr); let bin = ""; for (let i = 0; i < bytes.length; i += 8192) { const end = Math.min(i + 8192, bytes.length); for (let j = i; j < end; j++) bin += String.fromCharCode(bytes[j]); } return `data:image/png;base64,${btoa(bin)}`; }

const CAPTURE_STORAGE_KEY = "rocom-map:capture-region";
function loadCaptureRegion() { try { const raw = localStorage.getItem(CAPTURE_STORAGE_KEY); if (raw) return JSON.parse(raw); } catch { /* */ } return { rx: 1438, ry: 63, rw: 150, rh: 150 }; }
function saveCaptureRegion(rx: number, ry: number, rw: number, rh: number) { const prev = localStorage.getItem(CAPTURE_STORAGE_KEY); if (prev) localStorage.setItem(CAPTURE_STORAGE_KEY + ":prev", prev); localStorage.setItem(CAPTURE_STORAGE_KEY, JSON.stringify({ rx, ry, rw, rh })); }

export default function DebugPanel() {
  const [windows, setWindows] = useState<WindowInfo[]>([]);
  const [hwnd, setHwnd] = useState(0);
  const saved = loadCaptureRegion();
  const [rx, setRx] = useState(saved.rx); const [ry, setRy] = useState(saved.ry);
  const [rw, setRw] = useState(saved.rw); const [rh, setRh] = useState(saved.rh);
  const [captured, setCaptured] = useState<string | null>(null);
  const [match, setMatch] = useState<SiftMatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [siftStatus, setSiftStatus] = useState("未启动");
  const [autoCapture, setAutoCapture] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [calibStatus, setCalibStatus] = useState("");
  const autoTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const calibStable = useRef(0); const calibTriggered = useRef(false);
  const inited = useRef(false);
  const locations = useMapStore((s) => s.locations);
  const setCaptureConfig = useMapStore((s) => s.setCaptureConfig);
  const calibX = Number(import.meta.env.VITE_CALIBRATION_X) || 1304;
  const calibY = Number(import.meta.env.VITE_CALIBRATION_Y) || 2844;
  const calibTol = Number(import.meta.env.VITE_CALIBRATION_TOLERANCE) || 50;

  useEffect(() => { const wi = windows.find((w) => w.hwnd === hwnd); setCaptureConfig({ hwnd, rx, ry, rw, rh, windowLeft: wi?.rect.left ?? 0, windowTop: wi?.rect.top ?? 0 }); }, [hwnd, rx, ry, rw, rh, windows, setCaptureConfig]);

  const enumerate = useCallback(async () => { try { setError(null); setWindows(await invoke<WindowInfo[]>("enumerate_windows")); } catch (e) { setError(String(e)); } }, []);
  const doSiftStart = useCallback(async () => { try { setSiftStatus("正在启动 SIFT..."); setError(null); await invoke("sift_start"); setSiftStatus("SIFT 就绪"); } catch (e) { setError(`SIFT 启动失败: ${e}`); setSiftStatus("启动失败"); } }, []);

  const captureAndMatch = useCallback(async () => {
    if (!hwnd) return;
    const wi = windows.find((w) => w.hwnd === hwnd);
    const relX = wi ? rx - wi.rect.left : rx; const relY = wi ? ry - wi.rect.top : ry;
    try { setBusy(true); setError(null);
      const png = await invoke<number[]>("capture_screen_region", { hwnd, rx: relX, ry: relY, rw, rh });
      const dataUrl = pngToDataUrl(png); setCaptured(dataUrl);
      const base64 = dataUrl.split(",")[1]; const binStr = atob(base64);
      const bytes = Array.from(binStr, (c: string) => c.charCodeAt(0));
      const result = await invoke<SiftMatchResult>("sift_match_raw", { pngBytes: bytes }); setMatch(result);
      const setTP = useMapStore.getState().setTrackedPosition;
      if (result.x != null && result.x >= 0 && result.y != null && result.y >= 0) setTP({ x: result.x, y: result.y, confidence: result.confidence ?? 0, timestamp: Date.now() });
    } catch (e) { setError(String(e)); } finally { setBusy(false); }
  }, [hwnd, rx, ry, rw, rh, windows]);

  useEffect(() => { if (!autoCapture) { if (autoTimer.current) { clearInterval(autoTimer.current); autoTimer.current = null; } return; }     captureAndMatch(); autoTimer.current = setInterval(captureAndMatch, 1000); return () => { if (autoTimer.current) { clearInterval(autoTimer.current); autoTimer.current = null; } }; }, [autoCapture, captureAndMatch]);

  const onRegionChange = useCallback((field: string, value: number) => { const next = { rx, ry, rw, rh, [field]: value }; setRx(next.rx); setRy(next.ry); setRw(next.rw); setRh(next.rh); saveCaptureRegion(next.rx, next.ry, next.rw, next.rh); }, [rx, ry, rw, rh]);

  const toggleSelector = useCallback(async () => { try { const sel = await WebviewWindow.getByLabel("selector"); if (!sel) return; const v = await sel.isVisible(); if (v) { await sel.hide(); } else { await sel.show(); await sel.setFocus(); } } catch { /* */ } }, []);
  const toggleNavIsland = useCallback(async () => { try { const win = await WebviewWindow.getByLabel("nav-island"); if (!win) return; const v = await win.isVisible(); if (v) { await win.hide(); } else { await win.show(); } } catch { /* */ } }, []);

  // 同步选择器坐标：读取 localStorage
  useEffect(() => {
    const sync = () => {
      const s = loadCaptureRegion();
      setRx(s.rx); setRy(s.ry); setRw(s.rw); setRh(s.rh);
    };
    // 窗口获焦时（选择器关闭后）立即同步
    window.addEventListener("focus", sync);
    // 事件监听作为补充
    const p = listen<{ rx: number; ry: number; rw: number; rh: number }>("capture-region", (e) => {
      setRx(e.payload.rx); setRy(e.payload.ry); setRw(e.payload.rw); setRh(e.payload.rh);
      saveCaptureRegion(e.payload.rx, e.payload.ry, e.payload.rw, e.payload.rh);
    });
    return () => { window.removeEventListener("focus", sync); p.then((fn) => fn()); };
  }, []);

  const startCalibration = useCallback(() => { setCalibrating(true); calibStable.current = 0; calibTriggered.current = false; setCalibStatus("等待位置稳定…"); setAutoCapture(true); }, []);
  useEffect(() => { if (!calibrating || !match || !captured || calibTriggered.current) return; if (match.x == null || match.x < 0 || match.y == null || match.y < 0) { calibStable.current = 0; return; } const dx = match.x - calibX; const dy = match.y - calibY; const dist = Math.sqrt(dx*dx+dy*dy); const tol = calibTol > 0 ? calibTol : Math.max(4096,4096)/1000; if (dist > tol) { calibStable.current = 0; setCalibStatus(`距校准点 ${dist.toFixed(0)}px`); return; } calibStable.current++; setCalibStatus(`稳定中 ${calibStable.current}/6`); if (calibStable.current < 6) return;
    calibTriggered.current = true; setCalibStatus("正在颜色校准…"); setBusy(true);
    const base64 = captured.split(",")[1]; const bytes = Array.from(atob(base64), (c: string) => c.charCodeAt(0));
    Promise.resolve().then(async () => { try { const r = await invoke<Record<string,unknown>>("sift_calibrate_raw",{pngBytes:bytes,calibX,calibY,tolerance:9999}); setCalibStatus(`校准完成！(${r.matched_x},${r.matched_y})`); } catch(e) { setCalibStatus(`校准失败: ${e}`); calibTriggered.current = false; } finally { setBusy(false); setCalibrating(false); setAutoCapture(false); } });
  }, [calibrating, match, captured, calibX, calibY, calibTol]);

  const handleResetTracking = useCallback(async () => { try { await invoke("sift_reset"); setMatch(null); } catch { /* */ } }, []);

  useEffect(() => { if (!inited.current) { inited.current = true; enumerate(); doSiftStart(); } }, [enumerate, doSiftStart]);

  return (
    <div className="dp-root">
      <section className="dp-section">
        <div className="dp-head">
          <span className="dp-label"><Satellite className="dp-label-icon" />SIFT 匹配引擎</span>
          <Badge variant={siftStatus.includes("就绪") ? "default" : "outline"}>{siftStatus}</Badge>
        </div>
        {siftStatus === "启动失败" && <div className="dp-error">{error ?? "SIFT 启动失败"}<Button size="sm" variant="ghost" className="dp-btn-retry" onClick={() => { setError(null); doSiftStart(); }}>重试</Button></div>}
      </section>
      <Separator className="dp-sep" />

      <section className="dp-section">
        <div className="dp-head">
          <span className="dp-label"><Monitor className="dp-label-icon" />游戏窗口</span>
          <Button size="icon" variant="ghost" className="dp-btn" onClick={enumerate} disabled={busy}><RefreshCw className="dp-btn-icon-xs" /></Button>
        </div>
        <div className="dp-select-row">
          <Select value={hwnd ? String(hwnd) : ""} onValueChange={(v) => setHwnd(Number(v))}>
            <SelectTrigger className="dp-select"><SelectValue placeholder="选择窗口…" /></SelectTrigger>
            <SelectContent>{windows.map((w) => (<SelectItem key={w.hwnd} value={String(w.hwnd)}>{w.title}<span className="dp-select-sz">({w.rect.right-w.rect.left}&#215;{w.rect.bottom-w.rect.top})</span></SelectItem>))}</SelectContent>
          </Select>
          <Badge variant="outline" className="dp-badge">{windows.length}个</Badge>
        </div>
      </section>
      <Separator className="dp-sep" />

      <section className="dp-section">
        <div className="dp-head">
          <span className="dp-label"><Crosshair className="dp-label-icon" />小地图截取区域</span>
          <div className="flex gap-1">
            <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="dp-btn" onClick={captureAndMatch} disabled={busy||!hwnd||autoCapture}><SkipForward className="dp-toolbar-btn-icon-sm" /></Button></TooltipTrigger><TooltipContent>手动截取</TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild><Button size="icon" variant={autoCapture?"default":"ghost"} className="dp-btn" onClick={() => setAutoCapture(!autoCapture)} disabled={!hwnd}>{autoCapture?<Pause className="dp-toolbar-btn-icon-sm"/>:<Play className="dp-toolbar-btn-icon-sm"/>}</Button></TooltipTrigger><TooltipContent>{autoCapture?"停止":"实时识别"}</TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="dp-btn" onClick={toggleSelector}><Eye className="dp-toolbar-btn-icon-sm" /></Button></TooltipTrigger><TooltipContent>小地图选区器</TooltipContent></Tooltip>
          </div>
        </div>
        <div className="dp-body">
          <div className="dp-fields">
            {(["rx","ry","rw","rh"] as const).map((f) => (
              <Tooltip key={f}><TooltipTrigger asChild><label className="dp-field">
                <span className="dp-field-label">{f==="rx"?"X":f==="ry"?"Y":f==="rw"?"W":"H"}</span>
                <input className="dp-input" type="number" value={f==="rx"?rx:f==="ry"?ry:f==="rw"?rw:rh} onChange={(e) => onRegionChange(f, +e.target.value)} />
              </label></TooltipTrigger><TooltipContent side="bottom">{f==="rx"?"屏幕 X":f==="ry"?"屏幕 Y":f==="rw"?"宽度":"高度"}</TooltipContent></Tooltip>
            ))}
          </div>
        </div>
      </section>
      <Separator className="dp-sep" />

      <section className="dp-section">
        <div className="dp-head">
          <span className="dp-label"><Map className="dp-label-icon" />SIFT 匹配结果</span>
          <div className="flex gap-1">
            <Badge variant="secondary" className="dp-badge">{locations.length} 标点</Badge>
            {autoCapture && <Badge className="dp-badge animate-pulse">● 实时</Badge>}
            {match?.mode && <Badge variant="outline" className="dp-badge">{match.mode}</Badge>}
            <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="dp-btn-sm" onClick={toggleNavIsland}><Navigation className="dp-btn-icon-sm" /></Button></TooltipTrigger><TooltipContent>灵动岛</TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="dp-btn-sm" onClick={handleResetTracking}><RefreshCw className="dp-btn-icon-sm" /></Button></TooltipTrigger><TooltipContent>重置</TooltipContent></Tooltip>
          </div>
        </div>
        <div className="dp-body">
          {match ? (
            <div className="dp-result">
              <div className="dp-result-item"><span className="dp-result-label">X</span><span className="dp-result-val">{match.x!=null&&match.x>=0?match.x:"—"}</span></div>
              <div className="dp-result-item"><span className="dp-result-label">Y</span><span className="dp-result-val">{match.y!=null&&match.y>=0?match.y:"—"}</span></div>
              <div className="dp-result-item"><span className="dp-result-label">Conf</span><span className="dp-result-val">{match.confidence!==null?`${(match.confidence*100).toFixed(1)}%`:"—"}</span></div>
              <div className="dp-result-item"><span className="dp-result-label">Match</span><span className="dp-result-val">{match.matches??"—"}</span></div>
              <div className="dp-result-item"><span className="dp-result-label">Inlier</span><span className="dp-result-val">{match.inliers??"—"}</span></div>
              <div className="dp-result-item dp-result-item--copy">
                <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="size-6" onClick={()=>navigator.clipboard.writeText(`X=${match.x??"?"} Y=${match.y??"?"} Conf=${match.confidence!==null?(match.confidence*100).toFixed(1)+"%":"?"} Match=${match.matches??"?"} Inlier=${match.inliers??"?"}`)}><ClipboardCopy className="dp-btn-icon-sm"/></Button></TooltipTrigger><TooltipContent>复制</TooltipContent></Tooltip>
              </div>
              {captured && match.reference_png_b64 && (
                <div className="dp-compare">
                  <div className="dp-compare-col"><span className="dp-compare-label">截取</span><img className="dp-compare-img" src={captured} alt="截取"/></div>
                  <div className="dp-compare-col"><span className="dp-compare-label">参考</span><img className="dp-compare-img" src={`data:image/png;base64,${match.reference_png_b64}`} alt="参考"/></div>
                </div>
              )}
              <div className="dp-recolor">
                {!calibrating ? (
                  <Button size="sm" variant="outline" className="h-6 text-[10px] w-full gap-1" onClick={startCalibration}><Target className="dp-btn-icon-sm"/>开始颜色校准</Button>
                ) : (
                  <div className="dp-recolor-head"><Target className="dp-btn-icon-sm"/><span className="text-[10px] text-muted-foreground">{calibStatus}</span></div>
                )}
              </div>
            </div>
          ) : (
            <p className="dp-empty">点击手动截取或启动实时识别</p>
          )}
        </div>
      </section>
      {error && !siftStatus.includes("失败") && (
        <div className="dp-error">
          <span className="flex-1 break-all">{error}</span>
          <Button size="icon" variant="ghost" className="size-5 shrink-0 ml-1" onClick={()=>navigator.clipboard.writeText(error)}><ClipboardCopy className="dp-btn-icon-sm"/></Button>
        </div>
      )}
    </div>
  );
}
