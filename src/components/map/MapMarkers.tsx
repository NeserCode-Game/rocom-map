import { useMemo, memo } from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { useMapStore } from '../../composables/useMapStore';
import { getCategoryIconUrl, CATEGORY_NAMES } from '../../lib/map/constants';
import type { MapLocation } from '../../lib/map/types';

/* icon 缓存：同一 categoryId 只创建一个 L.Icon 实例 */
const iconCache = new Map<number, L.Icon>();

function getIcon(categoryId: number): L.Icon {
  let icon = iconCache.get(categoryId);
  if (!icon) {
    icon = L.icon({
      iconUrl: getCategoryIconUrl(categoryId),
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      popupAnchor: [0, -14],
      className: '',
    });
    iconCache.set(categoryId, icon);
  }
  return icon;
}

/** 单个标点组件 — memo 优化，避免父组件重渲染时全部重建 */
const LocationMarker = memo(function LocationMarker({ loc }: { loc: MapLocation }) {
  const icon = useMemo(() => getIcon(loc.category_id), [loc.category_id]);
  const catName = CATEGORY_NAMES[loc.category_id] ?? '';

  return (
    <Marker position={[loc.latitude, loc.longitude]} icon={icon}>
      <Popup>
        <div className="popup-content">
          <strong>{loc.title}</strong>
          {catName && (
            <p className="popup-category">{catName}</p>
          )}
          {loc.description && (
            <p className="popup-description">{loc.description}</p>
          )}
        </div>
      </Popup>
    </Marker>
  );
});

const MAX_RENDER = 500;

export default function MapMarkers() {
  const categoryIndex = useMapStore((s) => s.categoryIndex);
  const visibleCategories = useMapStore((s) => s.visibleCategories);

  // 使用预建索引查找，而非全量 filter
  const filtered = useMemo(() => {
    if (visibleCategories.size === 0) return [];
    const result: MapLocation[] = [];
    for (const cid of visibleCategories) {
      const locs = categoryIndex.get(cid);
      if (locs) {
        for (const loc of locs) result.push(loc);
      }
    }
    return result;
  }, [categoryIndex, visibleCategories]);

  const toRender = filtered.length > MAX_RENDER ? filtered.slice(0, MAX_RENDER) : filtered;

  return (
    <>
      {toRender.map((loc) => (
        <LocationMarker key={loc.id} loc={loc} />
      ))}
    </>
  );
}
