import L from 'leaflet';

/* ─── 游戏地图配置 ─── */
const MAP_ID = 4010;
const TILE_VERSION = '4010_v3_7f2d9c';
export const MAP_CONFIG = {
  mapId: MAP_ID,
  gameTitle: '洛克王国世界',
  version: 'v3',

  /*
   * 坐标范围（WGS84 经纬度，单位：度）
   * [west, south, east, north] = [-1.4°, 0°, 0°, 1.4°]
   * 官方 MapLibre GL 的 raster source bounds 格式
   */
  bounds: {
    west: -1.4,
    south: 0,
    east: 0,
    north: 1.4,
  },

  /* Leaflet center = [lat, lng] */
  center: [0.7, -0.7] as [number, number],

  zoom: {
    min: 9,
    max: 13,
    initial: 11,
  },
} as const;

/* ─── 瓦片 / API / 图标 URL ─── */
export const TILE_BASE = `https://ue.17173cdn.com/a/terra/tiles/rocom/${TILE_VERSION}`;

/*
 * ⚠️ 官方 URL 格式是 {z}/{y}_{x}.png（y 在前，x 在后，下划线分隔）
 * Leaflet 的 {y} = 行号（南北），{x} = 列号（东西），与 MapLibre 一致
 */
export const TILE_URL_TEMPLATE = `${TILE_BASE}/{z}/{y}_{x}.png?v1`;

export const API_BASE = 'https://terra-api.17173.com';
export const API_LOCATION_LIST = `${API_BASE}/app/location/list?mapIds=${MAP_ID}`;

export const ICON_BASE = `https://ue.17173cdn.com/a/terra/icon/rocom`;

export function getCategoryIconUrl(categoryId: number): string {
  return `${ICON_BASE}/${categoryId}.png`;
}

/* Leaflet maxBounds = [[south, west], [north, east]] */
export const MAX_BOUNDS: L.LatLngBoundsExpression = [
  [MAP_CONFIG.bounds.south, MAP_CONFIG.bounds.west],
  [MAP_CONFIG.bounds.north, MAP_CONFIG.bounds.east],
];
