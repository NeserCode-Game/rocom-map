import { useMemo, memo, useState, useCallback } from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { useMapStore } from '../../composables/useMapStore';
import { CATEGORY_NAMES } from '../../lib/map/constants';
import type { MapLocation } from '../../lib/map/types';

/* icon 缓存：同一 categoryId 只创建一个 L.Icon 实例 */
const iconCache = new Map<string, L.Icon>();

function getIconByUrl(iconUrl: string): L.Icon {
  let icon = iconCache.get(iconUrl);
  if (!icon) {
    icon = L.icon({
      iconUrl,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      popupAnchor: [0, -14],
      className: '',
    });
    iconCache.set(iconUrl, icon);
  }
  return icon;
}

/** 图片 URL 补全协议："//xxx" → "https://xxx"，"http://" → "https://" */
function normalizeImageUrl(url: string): string {
  if (url.startsWith('//')) return 'https:' + url;
  if (url.startsWith('http://')) return 'https://' + url.slice(7);
  return url;
}

/** 指示图轮播组件 */
function ImageCarousel({ images }: { images: string[] }) {
  const [idx, setIdx] = useState(0);
  const prev = useCallback(() => setIdx((i) => (i - 1 + images.length) % images.length), [images.length]);
  const next = useCallback(() => setIdx((i) => (i + 1) % images.length), [images.length]);

  if (images.length === 0) return null;

  return (
    <div className="popup-carousel">
      <img
        className="popup-carousel-img"
        src={normalizeImageUrl(images[idx])}
        alt={`${idx + 1}/${images.length}`}
        loading="lazy"
      />
      {images.length > 1 && (
        <>
          <button className="popup-carousel-btn popup-carousel-prev" onClick={prev} aria-label="上一张">‹</button>
          <button className="popup-carousel-btn popup-carousel-next" onClick={next} aria-label="下一张">›</button>
          <span className="popup-carousel-indicator">{idx + 1}/{images.length}</span>
        </>
      )}
    </div>
  );
}

/** 单个标点组件 — memo 优化，避免父组件重渲染时全部重建 */
const LocationMarker = memo(function LocationMarker({ loc, iconUrl }: { loc: MapLocation; iconUrl: string }) {
  const icon = useMemo(() => getIconByUrl(iconUrl), [iconUrl]);
  const catName = CATEGORY_NAMES[loc.category_id] ?? '';

  return (
    <Marker position={[loc.latitude, loc.longitude]} icon={icon}>
      <Popup>
        <div className="popup-content">
          <strong className="popup-title">{loc.title}</strong>
          {catName && (
            <p className="popup-category">{catName}</p>
          )}
          {loc.images && loc.images.length > 0 && (
            <ImageCarousel images={loc.images} />
          )}
          {loc.description && (
            <p className="popup-description">{loc.description}</p>
          )}
          {loc.author && (
            <p className="popup-author">贡献者: {loc.author.nickName}</p>
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
  const getIconUrl = useMapStore((s) => s.getIconUrl);

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
        <LocationMarker
          key={loc.id}
          loc={loc}
          iconUrl={getIconUrl(loc.category_id)}
        />
      ))}
    </>
  );
}
