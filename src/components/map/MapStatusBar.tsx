import { useMapStore } from '../../composables/useMapStore';
import { MAP_CONFIG } from '../../lib/map/constants';

/** 地图底部状态栏：显示数据统计与版本 */
export default function MapStatusBar() {
  const locations = useMapStore((s) => s.locations);
  const visibleCategories = useMapStore((s) => s.visibleCategories);
  const categoryIndex = useMapStore((s) => s.categoryIndex);
  const loading = useMapStore((s) => s.loading);
  const iconUrlMap = useMapStore((s) => s.iconUrlMap);

  // 计算可见标点数
  let visibleCount = 0;
  for (const cid of visibleCategories) {
    const arr = categoryIndex.get(cid);
    if (arr) visibleCount += arr.length;
  }

  const iconCached = iconUrlMap.size;
  const totalCats = categoryIndex.size;

  return (
    <div className="map-status-bar">
      <span className="map-status-item">
        {loading ? '⏳ 加载中…' : `📍 ${visibleCount.toLocaleString()} / ${locations.length.toLocaleString()}`}
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
