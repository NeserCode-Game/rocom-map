import { create } from 'zustand';
import type { MapLocation, MarkerGroup } from '../lib/map/types';
import { MARKER_GROUPS, getCategoryIconUrl, CACHE_TTL } from '../lib/map/constants';
import { cacheFetch } from '../lib/cache';
import { logger } from '../lib/logger';

/** 视口边界 */
export interface ViewportBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/** 遮罩层操作状态 */
export type OverlayState =
  | { kind: 'idle' }
  | { kind: 'loading'; message: string }
  | { kind: 'filtering'; message: string };

interface MapState {
  locations: MapLocation[];
  groups: MarkerGroup[];
  /** categoryId → MapLocation[] 索引，setLocations 时预建 */
  categoryIndex: Map<number, MapLocation[]>;
  visibleCategories: Set<number>;
  loading: boolean;
  error: string | null;
  /** 遮罩层状态 */
  overlay: OverlayState;
  /** categoryId → 图标 URL（直接远程地址，cacheFetch 仅做后台预热） */
  iconUrlMap: Map<number, string>;
  /** 当前视口边界（由 MapMarkers 监听地图事件写入） */
  viewportBounds: ViewportBounds | null;
  /** 折叠的分组 key 集合（空 = 全部展开） */
  collapsedGroups: Set<string>;

  setLocations: (locs: MapLocation[]) => void;

  /** 清除图标缓存，避免复用失效的 URL */
  clearIconUrlMap: () => void;
  /** 批量预下载分类图标到本地缓存 */
  prefetchIcons: (categoryIds: number[]) => Promise<void>;
  /** 获取分类图标 URL（优先缓存，否则降级到远程） */
  getIconUrl: (categoryId: number) => string;
  toggleCategory: (categoryId: number) => void;
  toggleGroup: (key: string) => void;
  showAllGroups: () => void;
  hideAllGroups: () => void;
  isGroupVisible: (key: string) => boolean;
  setOverlay: (state: OverlayState) => void;
  /** 更新当前视口边界 */
  setViewportBounds: (bounds: ViewportBounds) => void;
  /** 切换分组折叠状态 */
  toggleGroupCollapse: (key: string) => void;
  /** 展开所有分组 */
  expandAllGroups: () => void;
  /** 折叠所有分组 */
  collapseAllGroups: () => void;
}

export const useMapStore = create<MapState>((set, get) => ({
  locations: [],
  groups: [],
  categoryIndex: new Map(),
  visibleCategories: new Set(),
  loading: false,
  error: null,
  overlay: { kind: 'idle' },
  iconUrlMap: new Map(),
  viewportBounds: null,
  collapsedGroups: new Set(),

  setLocations: (locs) => {
    logger.info("store", "setLocations", "entry", { locCount: locs.length });

    const catCountMap = new Map<number, number>();
    const categoryIndex = new Map<number, MapLocation[]>();

    for (const loc of locs) {
      catCountMap.set(loc.category_id, (catCountMap.get(loc.category_id) ?? 0) + 1);
      let arr = categoryIndex.get(loc.category_id);
      if (!arr) {
        arr = [];
        categoryIndex.set(loc.category_id, arr);
      }
      arr.push(loc);
    }

    logger.info("store", "setLocations", "catCount", { distinctCats: catCountMap.size });

    const groups: MarkerGroup[] = MARKER_GROUPS.map((def) => {
      const subCategories = def.categoryIds
        .filter((cid) => (catCountMap.get(cid) ?? 0) > 0)
        .map((cid) => ({
          categoryId: cid,
          name: cid.toString(),
          count: catCountMap.get(cid) ?? 0,
        }));

      return {
        ...def,
        count: subCategories.reduce((sum, sc) => sum + sc.count, 0),
        subCategories,
      };
    }).filter((g) => g.count > 0);

    set({ locations: locs, groups, categoryIndex, visibleCategories: new Set() });
  },

  clearIconUrlMap: () => {
    logger.info("store", "clearIconUrlMap", "call", {});
    set({ iconUrlMap: new Map() });
  },

  prefetchIcons: async (categoryIds: number[]) => {
    logger.info("store", "prefetchIcons", "start", { count: categoryIds.length });
    const newMap = new Map<number, string>();
    let miss = 0;

    const tasks = categoryIds.map(async (cid) => {
      try {
        const remoteUrl = getCategoryIconUrl(cid);
        // 预下载到本地缓存（图层缓存为未来离线扩展，URL 始终用远程地址）
        await cacheFetch(remoteUrl, CACHE_TTL.assets);
        newMap.set(cid, remoteUrl);
        miss++;
      } catch (e) {
        logger.warn("store", "prefetchIcons", "fail", { cid, error: String(e) });
        newMap.set(cid, getCategoryIconUrl(cid));
      }
    });

    await Promise.all(tasks);
    set({ iconUrlMap: newMap });
    logger.info("store", "prefetchIcons", "done", { miss, total: newMap.size });
  },

  getIconUrl: (categoryId: number) => {
    return get().iconUrlMap.get(categoryId) ?? getCategoryIconUrl(categoryId);
  },

  toggleCategory: (categoryId) => {
    const next = new Set(get().visibleCategories);
    const action = next.has(categoryId) ? 'removed' : 'added';
    if (next.has(categoryId)) next.delete(categoryId);
    else next.add(categoryId);

    set({
      visibleCategories: next,
      overlay: { kind: 'filtering', message: action === 'added' ? `显示分类 #${categoryId}` : `隐藏分类 #${categoryId}` },
    });

    setTimeout(() => {
      if (get().overlay.kind === 'filtering') set({ overlay: { kind: 'idle' } });
    }, 300);

    logger.info("store", "toggleCategory", "update", { categoryId, action, total: next.size });
  },

  toggleGroup: (key) => {
    if (key === "__all__") {
      logger.info("store", "toggleGroup", "clearAll", {});
      set({ visibleCategories: new Set(), overlay: { kind: 'filtering', message: '清空已选分类' } });
      setTimeout(() => {
        if (get().overlay.kind === 'filtering') set({ overlay: { kind: 'idle' } });
      }, 300);
      return;
    }

    const groups = get().groups;
    const visible = get().visibleCategories;
    const group = groups.find((g) => g.key === key);
    if (!group) return;

    const groupCids = group.subCategories.map((sc) => sc.categoryId);
    const allVisible = groupCids.every((cid) => visible.has(cid));

    const next = new Set(visible);
    const action = allVisible ? 'deselected' : 'selected';
    if (allVisible) {
      for (const cid of groupCids) next.delete(cid);
    } else {
      for (const cid of groupCids) next.add(cid);
    }

    set({
      visibleCategories: next,
      overlay: { kind: 'filtering', message: action === 'selected' ? `选择分组: ${group.label}` : `取消分组: ${group.label}` },
    });
    setTimeout(() => {
      if (get().overlay.kind === 'filtering') set({ overlay: { kind: 'idle' } });
    }, 300);
  },

  showAllGroups: () => {
    const allCids = new Set<number>();
    for (const g of get().groups) {
      for (const sc of g.subCategories) allCids.add(sc.categoryId);
    }
    set({ visibleCategories: allCids, overlay: { kind: 'filtering', message: '全部分类已显示' } });
    setTimeout(() => {
      if (get().overlay.kind === 'filtering') set({ overlay: { kind: 'idle' } });
    }, 300);
  },

  hideAllGroups: () => {
    set({ visibleCategories: new Set(), overlay: { kind: 'filtering', message: '已清空分类' } });
    setTimeout(() => {
      if (get().overlay.kind === 'filtering') set({ overlay: { kind: 'idle' } });
    }, 300);
  },

  isGroupVisible: (key) => {
    const group = get().groups.find((g) => g.key === key);
    if (!group) return false;
    return group.subCategories.some((sc) => get().visibleCategories.has(sc.categoryId));
  },

  setOverlay: (state) => {
    set({ overlay: state });
  },

  setViewportBounds: (bounds) => {
    set({ viewportBounds: bounds });
  },

  toggleGroupCollapse: (key) => {
    const next = new Set(get().collapsedGroups);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    set({ collapsedGroups: next });
  },

  expandAllGroups: () => {
    set({ collapsedGroups: new Set() });
  },

  collapseAllGroups: () => {
    const allKeys = new Set(get().groups.map((g) => g.key));
    set({ collapsedGroups: allKeys });
  },
}));
