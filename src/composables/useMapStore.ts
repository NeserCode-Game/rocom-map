import { create } from 'zustand';
import type { MapLocation, MarkerGroup } from '../lib/map/types';
import { MARKER_GROUPS } from '../lib/map/constants';
import { logger } from '../lib/logger';

interface MapState {
  locations: MapLocation[];
  groups: MarkerGroup[];
  visibleCategories: Set<number>;
  loading: boolean;
  error: string | null;

  setLocations: (locs: MapLocation[]) => void;
  toggleCategory: (categoryId: number) => void;
  toggleGroup: (key: string) => void;
  showAllGroups: () => void;
  hideAllGroups: () => void;
  isGroupVisible: (key: string) => boolean;
}

export const useMapStore = create<MapState>((set, get) => ({
  locations: [],
  groups: [],
  visibleCategories: new Set(),
  loading: false,
  error: null,

  setLocations: (locs) => {
    logger.info("store", "setLocations", "entry", { locCount: locs.length });

    const catCountMap = new Map<number, number>();
    for (const loc of locs) {
      catCountMap.set(loc.category_id, (catCountMap.get(loc.category_id) ?? 0) + 1);
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

    const allCids = new Set<number>();
    for (const g of groups) {
      for (const sc of g.subCategories) allCids.add(sc.categoryId);
    }

    logger.info("store", "setLocations", "visibleCategories", { allCids: allCids.size, initializedAs: "empty" });

    set({ locations: locs, groups, visibleCategories: new Set() });
  },

  toggleCategory: (categoryId) => {
    const next = new Set(get().visibleCategories);
    if (next.has(categoryId)) next.delete(categoryId);
    else next.add(categoryId);
    logger.info("store", "toggleCategory", "update", { categoryId, action: next.has(categoryId) ? "added" : "removed", total: next.size });
    set({ visibleCategories: next });
  },

  toggleGroup: (key) => {
    // __all__ 特殊处理：清空所有已选
    if (key === "__all__") {
      logger.info("store", "toggleGroup", "clearAll", {});
      set({ visibleCategories: new Set() });
      return;
    }

    const groups = get().groups;
    const visible = get().visibleCategories;
    const group = groups.find((g) => g.key === key);
    if (!group) return;

    const groupCids = group.subCategories.map((sc) => sc.categoryId);
    const allVisible = groupCids.every((cid) => visible.has(cid));

    const next = new Set(visible);
    if (allVisible) {
      for (const cid of groupCids) next.delete(cid);
    } else {
      for (const cid of groupCids) next.add(cid);
    }
    logger.info("store", "toggleGroup", "update", { key, action: allVisible ? "deselected" : "selected", affectedCids: groupCids, total: next.size });
    set({ visibleCategories: next });
  },

  showAllGroups: () => {
    const allCids = new Set<number>();
    for (const g of get().groups) {
      for (const sc of g.subCategories) allCids.add(sc.categoryId);
    }
    logger.info("store", "showAllGroups", "update", { total: allCids.size });
    set({ visibleCategories: allCids });
  },

  hideAllGroups: () => {
    logger.info("store", "hideAllGroups", "update", {});
    set({ visibleCategories: new Set() });
  },

  isGroupVisible: (key) => {
    const group = get().groups.find((g) => g.key === key);
    if (!group) return false;
    return group.subCategories.some((sc) => get().visibleCategories.has(sc.categoryId));
  },
}));
