import { useMemo } from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { useMapStore } from '../../composables/useMapStore';
import { getCategoryIconUrl, CATEGORY_NAMES } from '../../lib/map/constants';
import { logger } from '../../lib/logger';
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

/** 单个标点组件 */
function LocationMarker({ loc }: { loc: MapLocation }) {
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
}

export default function MapMarkers() {
  const locations = useMapStore((s) => s.locations);
  const visibleCategories = useMapStore((s) => s.visibleCategories);

  // 按分类过滤
  const filtered = useMemo(
    () => locations.filter((loc) => visibleCategories.has(loc.category_id)),
    [locations, visibleCategories],
  );

  // 限制同时渲染数量，避免卡顿
  const MAX_RENDER = 500;
  const toRender = filtered.slice(0, MAX_RENDER);

  logger.info("MapMarkers", "render", "filter", {
    totalLocations: locations.length,
    visibleCategories: visibleCategories.size,
    filteredCount: filtered.length,
    maxRender: MAX_RENDER,
    renderedCount: toRender.length,
    truncated: filtered.length > MAX_RENDER,
  });

  return (
    <>
      {toRender.map((loc) => (
        <LocationMarker key={loc.id} loc={loc} />
      ))}
    </>
  );
}
