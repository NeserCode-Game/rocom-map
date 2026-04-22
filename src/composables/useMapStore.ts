import { create } from 'zustand';
import type { MapLocation, CategoryInfo } from '../lib/map/types';
import { getCategoryIconUrl } from '../lib/map/constants';

interface MapState {
  locations: MapLocation[];
  categories: CategoryInfo[];
  visibleCategories: Set<number>;
  loading: boolean;
  error: string | null;

  /* actions */
  setLocations: (locs: MapLocation[]) => void;
  toggleCategory: (id: number) => void;
  showAllCategories: () => void;
  hideAllCategories: () => void;
  isCategoryVisible: (id: number) => boolean;
}

export const useMapStore = create<MapState>((set, get) => ({
  locations: [],
  categories: [],
  visibleCategories: new Set(),
  loading: false,
  error: null,

  setLocations: (locs) => {
    // 从数据中动态提取分类列表
    const catMap = new Map<number, number>();
    for (const loc of locs) {
      catMap.set(loc.category_id, (catMap.get(loc.category_id) ?? 0) + 1);
    }
    const categories: CategoryInfo[] = Array.from(catMap.entries())
      .map(([categoryId, count]) => ({
        categoryId,
        count,
        iconUrl: getCategoryIconUrl(categoryId),
      }))
      .sort((a, b) => a.categoryId - b.categoryId);

    set({ locations: locs, categories });
  },

  toggleCategory: (id) => {
    const next = new Set(get().visibleCategories);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    set({ visibleCategories: next });
  },

  showAllCategories: () => {
    const ids = get().categories.map((c) => c.categoryId);
    set({ visibleCategories: new Set(ids) });
  },

  hideAllCategories: () => {
    set({ visibleCategories: new Set() });
  },

  isCategoryVisible: (id) => get().visibleCategories.has(id),
}));
