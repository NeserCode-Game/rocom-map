import { useMemo } from 'react';
import { useMapStore } from '../../composables/useMapStore';
import type { ViewportBounds } from '../../composables/useMapStore';
import { MAP_CONFIG } from '../../lib/map/constants';

/** 标点是否在视口内 */
function isInViewport(loc: { latitude: number; longitude: number }, vb: ViewportBounds): boolean {
  return (
    loc.latitude >= vb.minLat &&
    loc.latitude <= vb.maxLat &&
    loc.longitude >= vb.minLng &&
    loc.longitude <= vb.maxLng
  );
}

/** 地图底部状态栏：显示数据统计与版本 */
export default function MapStatusBar() {
  const locations = useMapStore((s) => s.locations);
  const visibleCategories = useMapStore((s) => s.visibleCategories);
  const categoryIndex = useMapStore((s) => s.categoryIndex);
  const loading = useMapStore((s) => s.loading);
  const iconUrlMap = useMapStore((s) => s.iconUrlMap);
  const viewportBounds = useMapStore((s) => s.viewportBounds);

  // 已选分类的总标点数
  let selectedCount = 0;
  for (const cid of visibleCategories) {
    const arr = categoryIndex.get(cid);
    if (arr) selectedCount += arr.length;
  }

  // 视口内可见的已选标点数
  const viewportCount = useMemo(() => {
    if (!viewportBounds || visibleCategories.size === 0) return null;
    let count = 0;
    for (const cid of visibleCategories) {
      const arr = categoryIndex.get(cid);
      if (arr) {
        for (const loc of arr) {
          if (isInViewport(loc, viewportBounds)) count++;
        }
      }
    }
    return count;
  }, [viewportBounds, visibleCategories, categoryIndex]);

  const iconCached = iconUrlMap.size;
  const totalCats = categoryIndex.size;

  return (
    <div className="map-status-bar">
      <span className="map-status-item">
        {loading
          ? '⏳ 加载中…'
          : viewportCount !== null
            ? `📍 视口 ${viewportCount.toLocaleString()} / 已选 ${selectedCount.toLocaleString()}`
            : `📍 ${selectedCount.toLocaleString()} / ${locations.length.toLocaleString()}`}
      </span>
      <span className="map-status-separator">·</span>
      <span className="map-status-item">
        🗂 {visibleCategories.size} 分类
      </span>
      <span className="map-status-separator">·</span>
      <span className="map-status-item">
        🖼 {iconCached}/{totalCats} 缓存
      </span>
      <span className="map-status-spacer" />
      <span className="map-status-item map-status-version">
        {MAP_CONFIG.gameTitle} {MAP_CONFIG.version}
      </span>
    </div>
  );
}
