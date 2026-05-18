/**
 * SIFT 大地图像素 ↔ Leaflet LatLng 坐标转换
 *
 * 大地图 (big_map_z12.png): 4096×4096 像素
 * Leaflet 游戏边界: [[0, -1.406250], [1.406109, 0]]
 *
 * 映射关系（线性插值）:
 *   x=0    → lng=-1.406250 (西)
 *   x=4096 → lng=0          (东)
 *   y=0    → lat=0          (南)
 *   y=4096 → lat=1.406109   (北)
 */

import type { LatLngExpression } from "leaflet";

const MAP_W = 4096;
const MAP_H = 4096;

const BOUNDS_WEST = -1.40625;
const BOUNDS_EAST = 0;
const BOUNDS_SOUTH = 0;
const BOUNDS_NORTH = 1.406109;

const LNG_RANGE = BOUNDS_EAST - BOUNDS_WEST;  // 1.406250
const LAT_RANGE = BOUNDS_NORTH - BOUNDS_SOUTH; // 1.406109

/** 大地图像素 → Leaflet LatLng（Y 轴反转：图像 y=0 在顶部 = 北 = lat 最大） */
export function pixelToLatLng(x: number, y: number): LatLngExpression {
  const lng = BOUNDS_WEST + (x / MAP_W) * LNG_RANGE;
  const lat = BOUNDS_NORTH - (y / MAP_H) * LAT_RANGE;
  return [lat, lng];
}

/** Leaflet LatLng → 大地图像素 */
export function latLngToPixel(lat: number, lng: number): { x: number; y: number } {
  const x = ((lng - BOUNDS_WEST) / LNG_RANGE) * MAP_W;
  const y = ((BOUNDS_NORTH - lat) / LAT_RANGE) * MAP_H;
  return { x, y };
}

export const COORDS_MAP_SIZE = { w: MAP_W, h: MAP_H };
