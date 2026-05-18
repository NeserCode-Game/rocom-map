// src/lib/navigator/types.ts

/** 窗口信息 (Rust enumerate_windows) */
export interface WindowInfo {
  hwnd: number;
  title: string;
  className: string;
  rect: { left: number; top: number; right: number; bottom: number };
  clientRect: { left: number; top: number; right: number; bottom: number };
  isVisible: boolean;
}

/** 小地图区域 (相对窗口客户区) */
export interface MiniMapRegion {
  hwnd: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

/** NCC 匹配结果 (Rust match_position) */
export interface MatchResult {
  x: number;
  y: number;
  confidence: number;
}

/** 玩家位置 (经纬度) */
export interface PlayerPosition {
  lat: number;
  lng: number;
}
