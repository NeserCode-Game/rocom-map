import { useMemo, useState, useEffect } from 'react';
import { Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useMapStore } from '../../composables/useMapStore';
import { getCategoryIconUrl } from '../../lib/map/constants';
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

/** 视野过滤：只渲染当前视口内的标点 */
function useViewportFilter(locations: MapLocation[]): MapLocation[] {
  const map = useMap();
  const [bounds, setBounds] = useState(map.getBounds());

  useEffect(() => {
    const onMoveEnd = () => setBounds(map.getBounds());
    map.on('moveend', onMoveEnd);
    return () => { map.off('moveend', onMoveEnd); };
  }, [map]);

  return useMemo(() => {
    if (locations.length === 0) return [];
    return locations.filter((loc) => {
      const latlng: L.LatLngExpression = [loc.latitude, loc.longitude];
      return bounds.contains(latlng);
    });
  }, [locations, bounds]);
}

/** 单个标点组件 */
function LocationMarker({ loc }: { loc: MapLocation }) {
  const icon = useMemo(() => getIcon(loc.category_id), [loc.category_id]);

  return (
    <Marker position={[loc.latitude, loc.longitude]} icon={icon}>
      <Popup>
        <div style={{ minWidth: 120 }}>
          <strong>{loc.title}</strong>
          {loc.description && (
            <p style={{ margin: '4px 0', fontSize: 12, opacity: 0.8 }}>
              {loc.description}
            </p>
          )}
        </div>
      </Popup>
    </Marker>
  );
}

export default function MapMarkers() {
  const locations = useMapStore((s) => s.locations);
  const isCategoryVisible = useMapStore((s) => s.isCategoryVisible);
  const visible = useViewportFilter(locations);

  // 按分类过滤
  const filtered = useMemo(
    () => visible.filter((loc) => isCategoryVisible(loc.category_id)),
    [visible, isCategoryVisible],
  );

  // 限制同时渲染数量，避免卡顿
  const MAX_RENDER = 500;
  const toRender = filtered.slice(0, MAX_RENDER);

  return (
    <>
      {toRender.map((loc) => (
        <LocationMarker key={loc.id} loc={loc} />
      ))}
    </>
  );
}
