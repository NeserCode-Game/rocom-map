import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useMapStore } from "@/composables/useMapStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCw, Target, Pencil, Check, X } from "lucide-react";

interface WindowInfo {
  hwnd: number;
  title: string;
  rect: { left: number; top: number; right: number; bottom: number };
}
interface MatchResult {
  x: number | null;
  y: number | null;
  confidence: number | null;
  matches: number | null;
  inliers: number | null;
  reference_png_b64: string | null;
  mode: string | null;
}
type LogEntry = { ts: number; text: string; kind: "info" | "warn" | "err" };

export default function TrackPanel({
  captured,
  match,
  error,
  logs,
  rx,
  ry,
  rw,
  rh,
  onCalibrate,
  onRegionChange,
}: {
  captured: string | null;
  match: MatchResult | null;
  error: string | null;
  logs: LogEntry[];
  rx: number;
  ry: number;
  rw: number;
  rh: number;
  onCalibrate: () => void;
  onRegionChange: (field: string, value: number) => void;
}) {
  const tracked = useMapStore((s) => s.trackedPosition);
  const hwnd = useMapStore((s) => s.captureHwnd);
  const setCaptureConfig = useMapStore((s) => s.setCaptureConfig);
  const [windows, setWindows] = useState<WindowInfo[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [editRx, setEditRx] = useState(rx);
  const [editRy, setEditRy] = useState(ry);
  const [editRw, setEditRw] = useState(rw);
  const [editRh, setEditRh] = useState(rh);

  useEffect(() => {
    invoke<WindowInfo[]>("enumerate_windows")
      .then(setWindows)
      .catch(() => {});
  }, []);

  return (
    <div className="track-panel">
      <ScrollArea className="track-scroll">
        <div className="track-info">
          {tracked && (
            <div className="track-pos">
              <span className="track-stat-label tracking-normal normal-case font-medium">
                跟踪中
              </span>
              <span className="track-dim-text">
                ({tracked.x}, {tracked.y})
              </span>
            </div>
          )}
          {match?.mode && (
            <Badge variant="outline" className="track-badge">
              {match.mode}
            </Badge>
          )}
        </div>

        {match && match.x != null && match.x >= 0 && (
          <div className="track-data">
            <div className="track-data-row">
              <span className="track-data-label">X</span>
              <span className="track-stat-val">{match.x}</span>
              <span className="track-data-label ml-2">Y</span>
              <span className="track-stat-val">{match.y}</span>
            </div>
            <div className="track-data-row">
              <span className="track-data-label">Conf</span>
              <span className="track-stat-val">
                {match.confidence
                  ? `${(match.confidence * 100).toFixed(0)}%`
                  : "—"}
              </span>
              <span className="track-data-label ml-2">Match</span>
              <span className="track-stat-val">{match.matches ?? "—"}</span>
            </div>
          </div>
        )}

        {error && <p className="track-error">{error}</p>}

        <Button
          size="sm"
          variant="outline"
          className="track-btn-calibrate"
          disabled={!captured || !match || match.x == null || match.x < 0}
          onClick={onCalibrate}
        >
          <Target className="track-icon-sm" />
          颜色校准
        </Button>

        {captured && match?.reference_png_b64 && (
          <div className="track-compare">
            <div className="track-compare-col">
              <span className="track-compare-label">截取</span>
              <img className="track-compare-img" src={captured} alt="" />
            </div>
            <div className="track-compare-col">
              <span className="track-compare-label">参考</span>
              <img
                className="track-compare-img"
                src={`data:image/png;base64,${match.reference_png_b64}`}
                alt=""
              />
            </div>
          </div>
        )}

        <div className="track-settings">
          <div className="track-settings-row">
            <Button
              size="icon"
              variant="ghost"
              className="track-btn-icon-sm"
              onClick={() =>
                invoke<WindowInfo[]>("enumerate_windows")
                  .then(setWindows)
                  .catch(() => {})
              }
            >
              <RefreshCw className="track-icon-sm" />
            </Button>
            <Select
              value={hwnd ? String(hwnd) : ""}
              onValueChange={(v) => {
                const h = Number(v);
                const wi = windows.find((w) => w.hwnd === h);
                setCaptureConfig({
                  hwnd: h,
                  windowLeft: wi?.rect.left,
                  windowTop: wi?.rect.top,
                });
              }}
            >
              <SelectTrigger className="track-select">
                <SelectValue placeholder="选窗口" />
              </SelectTrigger>
              <SelectContent>
                {windows.map((w) => (
                  <SelectItem key={w.hwnd} value={String(w.hwnd)}>
                    {w.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="track-settings-row position">
            <span className="track-coord-text">
              {rx},{ry} {rw}&#215;{rh}
            </span>
            <Popover open={editOpen} onOpenChange={(o) => { if (o) { setEditRx(rx); setEditRy(ry); setEditRw(rw); setEditRh(rh); } setEditOpen(o); }}>
              <PopoverTrigger asChild>
                <Button size="icon" variant="ghost" className="track-btn-icon-sm"><Pencil className="track-icon-sm" /></Button>
              </PopoverTrigger>
              <PopoverContent side="right" align="start" className="track-popover-edit">
                <div className="track-popover-body">
                  {(["rx","ry","rw","rh"] as const).map((f) => (
                    <label key={f} className="track-field">
                      <span className="track-field-label">{f==="rx"?"X":f==="ry"?"Y":f==="rw"?"W":"H"}</span>
                      <input className="track-field-input" type="number" value={f==="rx"?editRx:f==="ry"?editRy:f==="rw"?editRw:editRh} onChange={(e) => f==="rx"?setEditRx(+e.target.value):f==="ry"?setEditRy(+e.target.value):f==="rw"?setEditRw(+e.target.value):setEditRh(+e.target.value)} />
                    </label>
                  ))}
                  <div className="track-popover-actions">
                    <Button size="sm" variant="ghost" className="track-popover-cancel" onClick={() => setEditOpen(false)}><X className="track-icon-sm"/>取消</Button>
                    <Button size="sm" variant="outline" className="track-popover-ok" onClick={() => { onRegionChange("rx",editRx); onRegionChange("ry",editRy); onRegionChange("rw",editRw); onRegionChange("rh",editRh); setEditOpen(false); }}><Check className="track-icon-sm"/>确认</Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="track-log">
          <span className="track-stat-label">日志</span>
          {logs.length === 0 ? (
            <span className="track-empty">—</span>
          ) : (
            logs.map((l, i) => (
              <button
                key={`${l.ts}-${i}`}
                className="track-log-item"
                onClick={() => navigator.clipboard.writeText(l.text)}
              >
                <span
                  className={`track-log-dot ${l.kind === "err" ? "track-log-dot-err" : l.kind === "warn" ? "track-log-dot-warn" : "track-log-dot-info"}`}
                />
                <span className="track-log-text">{l.text}</span>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
