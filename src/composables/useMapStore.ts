import { create } from 'zustand';
import type { MapLocation, MarkerGroup } from '../lib/map/types';
import { MARKER_GROUPS } from '../lib/map/constants';
import { logger } from '../lib/logger';

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

  setLocations: (locs: MapLocation[]) => void;
  toggleCategory: (categoryId: number) => void;
  toggleGroup: (key: string) => void;
  showAllGroups: () => void;
  hideAllGroups: () => void;
  isGroupVisible: (key: string) => boolean;
  setOverlay: (state: OverlayState) => void;
}

export const useMapStore = create<MapState>((set, get) => ({
  locations: [],
  groups: [],
  categoryIndex: new Map(),
  visibleCategories: new Set(),
  loading: false,
  error: null,
  overlay: { kind: 'idle' },

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

    logger.info("store", "setLocations", "catCount", { distinctCats: catCountMap.size, catCounts: Object.fromEntries(catCountMap) });

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

    logger.info("store", "setLocations", "groups", {
      groupCount: groups.length,
      groups: groups.map((g) => ({ key: g.key, label: g.label, count: g.count, subCatCount: g.subCategories.length })),
    });

    set({ locations: locs, groups, categoryIndex, visibleCategories: new Set() });
  },

  toggleCategory: (categoryId) => {
    const next = new Set(get().visibleCategories);
    const action = next.has(categoryId) ? 'removed' : 'added';
    if (next.has(categoryId)) next.delete(categoryId);
    else next.add(categoryId);

    // 显示过滤遮罩
    const catName = get().groups
      .flatMap(g => g.subCategories)
      .find(sc => sc.categoryId === categoryId);
    const label = catName ? String(categoryId) : String(categoryId);
    set({
      visibleCategories: next,
      overlay: { kind: 'filtering', message: action === 'added' ? `显示分类 #${label}` : `隐藏分类 #${label}` },
    });

    // 300ms 后自动隐藏遮罩
    setTimeout(() => {
      if (get().overlay.kind === 'filtering') {
        set({ overlay: { kind: 'idle' } });
      }
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

    logger.info("store", "toggleGroup", "update", { key, action, affectedCids: groupCids, total: next.size });
  },

  showAllGroups: () => {
    const allCids = new Set<number>();
    for (const g of get().groups) {
      for (const sc of g.subCategories) allCids.add(sc.categoryId);
    }
    logger.info("store", "showAllGroups", "update", { total: allCids.size });
    set({ visibleCategories: allCids, overlay: { kind: 'filtering', message: '全部分类已显示' } });
    setTimeout(() => {
      if (get().overlay.kind === 'filtering') set({ overlay: { kind: 'idle' } });
    }, 300);
  },

  hideAllGroups: () => {
    logger.info("store", "hideAllGroups", "update", {});
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
}));
