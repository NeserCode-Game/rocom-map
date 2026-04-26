import L from 'leaflet';
import type { MarkerGroup } from './types';

/* ─── 环境变量（从 .env 读取） ─── */

export const API_BASE = import.meta.env.VITE_API_BASE ?? 'https://terra-api.17173.com';
const API_MAP_ID = Number(import.meta.env.VITE_API_MAP_ID ?? 4010);
const TILE_BASE_URL = import.meta.env.VITE_TILE_BASE ?? 'https://ue.17173cdn.com/a/terra/tiles/rocom';
const TILE_VERSION = import.meta.env.VITE_TILE_VERSION ?? '4010_v3_7f2d9c';
const ICON_BASE_URL = import.meta.env.VITE_ICON_BASE ?? 'https://ue.17173cdn.com/a/terra/icon/rocom';

/** 请求头伪装（用于 API 调用） */
export const REQUEST_HEADERS = {
  origin: import.meta.env.VITE_REQUEST_ORIGIN ?? 'https://map.17173.com',
  referer: import.meta.env.VITE_REQUEST_REFERER ?? 'https://map.17173.com/',
} as const;

/** 缓存 TTL（毫秒） */
export const CACHE_TTL = {
  /** 瓦片缓存过期时间：默认 2h */
  tiles: Number(import.meta.env.VITE_CACHE_TILES_TTL_MS ?? 7200000),
  /** 素材图片缓存过期时间：默认 24h */
  assets: Number(import.meta.env.VITE_CACHE_ASSETS_TTL_MS ?? 86400000),
} as const;

/* ─── 游戏地图配置 ─── */

export const MAP_CONFIG = {
  mapId: API_MAP_ID,
  gameTitle: '洛克王国世界',
  version: 'v3',
  bounds: {
    west: -1.406250, south: 0, east: 0, north: 1.406109,
  },
  zoom: { min: 9, max: 13, initial: 11 },
} as const;

export const TILE_BASE = `${TILE_BASE_URL}/${TILE_VERSION}`;
export const TILE_URL_TEMPLATE = `${TILE_BASE}/{z}/{y}_{x}.png?v1`;
export const API_LOCATION_LIST = `${API_BASE}/app/location/list?mapIds=${API_MAP_ID}`;
export const ICON_BASE = ICON_BASE_URL;

export function getCategoryIconUrl(categoryId: number): string {
  return `${ICON_BASE}/${categoryId}.png`;
}

/** 游戏世界的地理边界（bounds），用于 MapContainer bounds prop */
export const GAME_BOUNDS: L.LatLngBoundsExpression = [
  [MAP_CONFIG.bounds.south, MAP_CONFIG.bounds.west],
  [MAP_CONFIG.bounds.north, MAP_CONFIG.bounds.east],
];

/* ─── 官方分类定义 ─── */

export const MARKER_GROUPS: Omit<MarkerGroup, 'count' | 'subCategories'>[] = [
  {
    key: 'collect',
    label: '收集',
    categoryIds: [17310030047, 17310030035, 17310030001, 17310030031, 17310030032, 17310030033, 17310030034, 17310030036, 17310030004, 17310030002],
  },
  {
    key: 'grass',
    label: '花草',
    categoryIds: [17310030048, 17310030049, 17310030050, 17310030051, 17310030052, 17310030053, 17310030054, 17310030055, 17310030056, 17310030057, 17310030058, 17310030059, 17310030060, 17310030061, 17310030062, 17310030063, 17310030064, 17310030065, 17310030066, 17310030067, 17310030068, 17310030069, 17310030070, 17310030071, 17310030072, 17310030073, 17310030074, 17310030075, 17310030076, 17310030077, 17310030078, 17310030079],
  },
  {
    key: 'fruit',
    label: '果树',
    categoryIds: [17310030080, 17310030081, 17310030082],
  },
  {
    key: 'ore',
    label: '矿石',
    categoryIds: [17310030043, 17310030044, 17310030045, 17310030046],
  },
  {
    key: 'sprite',
    label: '精灵',
    categoryIds: [17310030005, 17310030006, 17310030007, 17310030008, 17310030009, 17310030010, 17310030011, 17310030012, 17310030013, 17310030014, 17310030015, 17310030016, 17310030017, 17310030018, 17310030019, 17310030020, 17310030021, 17310030022, 17310030023, 17310030037],
  },
  {
    key: 'location',
    label: '地点',
    categoryIds: [17310030024, 17310030025, 17310030026, 17310030038, 17310030039, 17310030040, 17310030041, 17310030042],
  },
  {
    key: 'quest',
    label: '任务',
    categoryIds: [17310030027, 17310030028],
  },
  {
    key: 'other',
    label: '其他',
    categoryIds: [17310030029, 17310030030],
  },
];

/** 官方子分类名称映射表 */
export const CATEGORY_NAMES: Record<number, string> = {
  17310030001: '宝箱',
  17310030002: '植物（果树）',
  17310030003: '矿石',
  17310030004: '未分类材料',
  17310030005: '草系',
  17310030006: '萌系',
  17310030007: '火系',
  17310030008: '虫系',
  17310030009: '水系',
  17310030010: '翼系',
  17310030011: '幽系',
  17310030012: '电系',
  17310030013: '光系',
  17310030014: '地系',
  17310030015: '龙系',
  17310030016: '毒系',
  17310030017: '武系',
  17310030018: '恶系',
  17310030019: '幻系',
  17310030020: '冰系',
  17310030021: '普通系',
  17310030022: '机械系',
  17310030023: '未分类精灵',
  17310030024: 'BOSS（精灵首领）',
  17310030025: '副本',
  17310030026: '露天对战',
  17310030027: '支线任务',
  17310030028: '未分类任务',
  17310030029: '挑战小游戏',
  17310030030: '未分类内容',
  17310030031: '精灵的宝藏',
  17310030032: '精灵好感度植物',
  17310030033: '魔法石',
  17310030034: '魔法',
  17310030035: '眠枭之星（蓝）',
  17310030036: '崭新乐章',
  17310030037: '稀有精灵',
  17310030038: '魔力之源（传送点）',
  17310030039: '眠枭庇护所',
  17310030040: '稀兽花种',
  17310030041: '炼金台',
  17310030042: '未分类地点',
  17310030043: '黄石榴石',
  17310030044: '黑晶琉璃',
  17310030045: '紫莲刚玉',
  17310030046: '蓝晶碧玺',
  17310030047: '眠枭之星（黄）',
  17310030048: '幽幽鬼火',
  17310030049: '恶魔雪茄',
  17310030050: '彩玉花',
  17310030051: '大嘴花',
  17310030052: '短木莲',
  17310030053: '藻羽花',
  17310030054: '风卷草',
  17310030055: '凤眼莲',
  17310030056: '海桑花',
  17310030057: '海神花',
  17310030058: '花星角',
  17310030059: '火焰花',
  17310030060: '流星兰',
  17310030061: '幽幽草',
  17310030062: '密黄菌',
  17310030063: '喵喵草',
  17310030064: '喷气菇',
  17310030065: '伞伞菇',
  17310030066: '紫晶菇',
  17310030067: '紫雀花',
  17310030068: '天使草',
  17310030069: '向阳花',
  17310030070: '象牙花',
  17310030071: '星霜花',
  17310030072: '杏黄贝',
  17310030073: '荧光兰',
  17310030074: '雪菇',
  17310030075: '蓝掌',
  17310030076: '蜂窝',
  17310030077: '骨片',
  17310030078: '石耳',
  17310030079: '睡铃',
  17310030080: '可可果',
  17310030081: '魔力果',
  17310030082: '无花果',
};

const _categoryIdToGroupKey = new Map<number, string>();
for (const group of MARKER_GROUPS) {
  for (const cid of group.categoryIds) {
    _categoryIdToGroupKey.set(cid, group.key);
  }
}

export function getGroupKeyByCategoryId(categoryId: number): string | undefined {
  return _categoryIdToGroupKey.get(categoryId);
}
