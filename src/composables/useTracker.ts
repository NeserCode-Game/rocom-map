import { useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { useMapStore } from "./useMapStore";

function pngToDataUrl(arr: number[]): string {
  const bytes = new Uint8Array(arr);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    const end = Math.min(i + 8192, bytes.length);
    for (let j = i; j < end; j++) bin += String.fromCharCode(bytes[j]);
  }
  return `data:image/png;base64,${btoa(bin)}`;
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

export interface TrackState {
  busy: boolean;
  autoCapture: boolean;
  capturedDataUrl: string | null;
  match: MatchResult | null;
  error: string | null;
}

export function useTracker(hwnd: number, rx: number, ry: number, rw: number, rh: number) {
  const autoTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const captureAndMatch = useCallback(async (): Promise<{ captured: string | null; match: MatchResult | null }> => {
    if (!hwnd) return { captured: null, match: null };
    const png = await invoke<number[]>("capture_screen_region", { hwnd, rx, ry, rw, rh });
    const dataUrl = pngToDataUrl(png);
    const base64 = dataUrl.split(",")[1];
    const binStr = atob(base64);
    const bytes = Array.from(binStr, (c: string) => c.charCodeAt(0));
    const result = await invoke<MatchResult>("sift_match_raw", { pngBytes: bytes });
    const setTP = useMapStore.getState().setTrackedPosition;
    if (result.x != null && result.x >= 0 && result.y != null && result.y >= 0) {
      setTP({ x: result.x, y: result.y, confidence: result.confidence ?? 0, timestamp: Date.now() });
      // 推送给灵动岛窗口
      emit("tracked-position", { x: result.x, y: result.y, confidence: result.confidence ?? 0 }).catch(() => {});
    }
    return { captured: dataUrl, match: result };
  }, [hwnd, rx, ry, rw, rh]);

  const startAuto = useCallback((fn: () => void) => {
    fn();
    autoTimer.current = setInterval(fn, 1000);
  }, []);

  const stopAuto = useCallback(() => {
    if (autoTimer.current) { clearInterval(autoTimer.current); autoTimer.current = null; }
  }, []);

  return { captureAndMatch, startAuto, stopAuto };
}
