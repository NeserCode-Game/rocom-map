import { useMemo, memo, useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { useMapStore } from "../../composables/useMapStore";
import type { ViewportBounds } from "../../composables/useMapStore";
import { CATEGORY_NAMES } from "../../lib/map/constants";
import { pixelToLatLng, latLngToPixel } from "../../lib/map/coords";
import type { MapLocation } from "../../lib/map/types";
import { CheckCheck, Undo2 } from "lucide-react";

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
      className: "",
    });
    iconCache.set(iconUrl, icon);
  }
  return icon;
}

/** 图片 URL 补全协议："//xxx" → "https://xxx"，"http://" → "https://" */
function normalizeImageUrl(url: string): string {
  if (url.startsWith("//")) return "https:" + url;
  if (url.startsWith("http://")) return "https://" + url.slice(7);
  return url;
}

/** 全屏灯箱组件 */
function Lightbox({
  images,
  initialIndex,
  onClose,
}: {
  images: string[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(initialIndex);
  const prev = useCallback(
    () => setIdx((i) => (i - 1 + images.length) % images.length),
    [images.length],
  );
  const next = useCallback(
    () => setIdx((i) => (i + 1) % images.length),
    [images.length],
  );

  /* 键盘快捷键：Esc 关闭、左右箭头切换 */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, prev, next]);

  return createPortal(
    <div className="lightbox-overlay" onClick={onClose}>
      <div className="lightbox-container" onClick={(e) => e.stopPropagation()}>
        <button className="lightbox-close" onClick={onClose} aria-label="关闭">
          ✕
        </button>
        <img
          className="lightbox-img"
          src={normalizeImageUrl(images[idx])}
          alt={`${idx + 1}/${images.length}`}
        />
        {images.length > 1 && (
          <>
            <button className="lightbox-btn lightbox-prev" onClick={prev} aria-label="上一张">
              ‹
            </button>
            <button className="lightbox-btn lightbox-next" onClick={next} aria-label="下一张">
              ›
            </button>
            <span className="lightbox-indicator">
              {idx + 1}/{images.length}
            </span>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** 指示图轮播组件（点击图片可打开灯箱放大） */
function ImageCarousel({ images }: { images: string[] }) {
  const [idx, setIdx] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const prev = useCallback(
    () => setIdx((i) => (i - 1 + images.length) % images.length),
    [images.length],
  );
  const next = useCallback(
    () => setIdx((i) => (i + 1) % images.length),
    [images.length],
  );

  if (images.length === 0) return null;

  return (
    <>
      <div className="popup-carousel" onClick={() => setLightbox(true)}>
        <img
          className="popup-carousel-img"
          src={normalizeImageUrl(images[idx])}
          alt={`${idx + 1}/${images.length}`}
          loading="lazy"
        />
        {images.length > 1 && (
          <>
            <button
              className="popup-carousel-btn popup-carousel-prev"
              onClick={(e) => { e.stopPropagation(); prev(); }}
              aria-label="上一张"
            >
              ‹
            </button>
            <button
              className="popup-carousel-btn popup-carousel-next"
              onClick={(e) => { e.stopPropagation(); next(); }}
              aria-label="下一张"
            >
              ›
            </button>
            <span className="popup-carousel-indicator">
              {idx + 1}/{images.length}
            </span>
          </>
        )}
      </div>
      {lightbox && (
        <Lightbox
          images={images}
          initialIndex={idx}
          onClose={() => setLightbox(false)}
        />
      )}
    </>
  );
}

/** 单个标点组件 — memo 优化，避免父组件重渲染时全部重建 */
const LocationMarker = memo(function LocationMarker({
  loc,
  iconUrl,
  completed,
  isTarget,
}: {
  loc: MapLocation;
  iconUrl: string;
  completed: boolean;
  isTarget: boolean;
}) {
  const baseIcon = useMemo(() => getIconByUrl(iconUrl), [iconUrl]);
  const catName = CATEGORY_NAMES[loc.category_id] ?? "";
  const toggleCompleted = useMapStore((s) => s.toggleCompleted);

  // 目标标点用带动画的图标
  const icon = useMemo(() => {
    if (completed) {
      return L.divIcon({
        className: "",
        html: baseIcon.options.iconUrl ? `<img src="${baseIcon.options.iconUrl}" class="dimmed-marker-icon" />` : "",
        iconSize: [24, 24], iconAnchor: [12, 12], popupAnchor: [0, -14],
      });
    }
    if (isTarget) {
      return L.divIcon({
        className: "",
        html: baseIcon.options.iconUrl
          ? `<div class="target-marker-wrap"><img src="${baseIcon.options.iconUrl}" class="target-marker-icon" /></div>`
          : "",
        iconSize: [32, 32], iconAnchor: [16, 16], popupAnchor: [0, -18],
      });
    }
    return baseIcon;
  }, [completed, isTarget, baseIcon]);

  return (
    <Marker position={[loc.latitude, loc.longitude]} icon={icon} zIndexOffset={isTarget ? 500 : 0}>
      <Popup>
        <div className="popup-content">
          {loc.images && loc.images.length > 0 && (
            <ImageCarousel images={loc.images} />
          )}
          <div className="popup-info">
            <div className="popup-header">
              <span className="popup-title">{loc.title}</span>
              {catName && <span className="popup-category">{catName}</span>}
            </div>
            {loc.description && (
              <p className="popup-description">{loc.description}</p>
            )}
            <div className="popup-actions">
              <button
                className="popup-action-btn"
                onClick={() => toggleCompleted(loc.id)}
                title={completed ? "取消标记" : "标记完成"}
              >
                {completed ? (
                  <Undo2 className="popup-action-icon" />
                ) : (
                  <CheckCheck className="popup-action-icon" />
                )}
                <span className="popup-action-label">{completed ? "恢复" : "完成"}</span>
              </button>
            </div>
          </div>
        </div>
      </Popup>
    </Marker>
  );
});

/** 判断标点是否在视口内 */
function isInViewport(loc: MapLocation, vb: ViewportBounds): boolean {
  return (
    loc.latitude >= vb.minLat &&
    loc.latitude <= vb.maxLat &&
    loc.longitude >= vb.minLng &&
    loc.longitude <= vb.maxLng
  );
}

/**
 * 地图事件监听器：监听 moveend/zoomend，将当前视口边界写入 store。
 * 必须在 Leaflet MapContainer 内部使用（useMap 需要 Leaflet 上下文）。
 */
function MapEventListener() {
  const map = useMap();
  const setViewportBounds = useMapStore((s) => s.setViewportBounds);

  useEffect(() => {
    const updateBounds = () => {
      const bounds = map.getBounds();
      setViewportBounds({
        minLat: bounds.getSouth(),
        maxLat: bounds.getNorth(),
        minLng: bounds.getWest(),
        maxLng: bounds.getEast(),
      });
    };

    map.on("moveend", updateBounds);
    map.on("zoomend", updateBounds);
    // 初始化时立即触发一次
    updateBounds();

    return () => {
      map.off("moveend", updateBounds);
      map.off("zoomend", updateBounds);
    };
  }, [map, setViewportBounds]);

  return null;
}

/** 视口内标点最大数量（超出时随机采样） */
const MAX_VISIBLE = 500;

/** 玩家位置标记 */
const playerIcon = L.divIcon({
  className: "",
  html: '<div class="player-marker-dot"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

function PlayerMarker() {
  const tracked = useMapStore((s) => s.trackedPosition);
  if (!tracked) return null;
  const pos = pixelToLatLng(tracked.x, tracked.y);
  return <Marker position={pos} icon={playerIcon} zIndexOffset={1000} />;
}

/** 核心导出组件 */
export default function MapMarkers() {
  const categoryIndex = useMapStore((s) => s.categoryIndex);
  const visibleCategories = useMapStore((s) => s.visibleCategories);
  const getIconUrl = useMapStore((s) => s.getIconUrl);
  const viewportBounds = useMapStore((s) => s.viewportBounds);
  const completedLocations = useMapStore((s) => s.completedLocations);
  const tracked = useMapStore((s) => s.trackedPosition);

  /** 最近未完成目标 ID */
  const targetId = useMemo(() => {
    if (!tracked) return null;
    const candidates = visibleCategories.size > 0
      ? [...categoryIndex.entries()].flatMap(([cid, locs]) => visibleCategories.has(cid) ? locs : [])
      : [...categoryIndex.values()].flat();
    const uncompleted = candidates.filter((l) => !completedLocations.has(l.id));
    const tx = tracked.x, ty = tracked.y;
    let nearest: number | null = null;
    let nearestDist = Infinity;
    for (const loc of uncompleted) {
      const p = latLngToPixel(loc.latitude, loc.longitude);
      const d = Math.sqrt((p.x - tx) ** 2 + (p.y - ty) ** 2);
      if (d < nearestDist && d > 2) { nearest = loc.id; nearestDist = d; }
    }
    return nearest;
  }, [tracked, categoryIndex, visibleCategories, completedLocations]);

  /** 全部可见分类的标点 */
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

  /**
   * 视口内可见标点：
   * - 先取视口内所有标点
   * - 超出 MAX_VISIBLE 时随机采样（保持空间均匀分布）
   */
  const toRender = useMemo(() => {
    if (!viewportBounds) return filtered;
    const inView = filtered.filter((loc) => isInViewport(loc, viewportBounds));
    if (inView.length <= MAX_VISIBLE) return inView;
    // 随机采样保留均匀分布
    const shuffled = [...inView].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, MAX_VISIBLE);
  }, [filtered, viewportBounds]);

  return (
    <>
      <MapEventListener />
      <PlayerMarker />
      {toRender.map((loc) => (
        <LocationMarker
          key={loc.id}
          loc={loc}
          iconUrl={getIconUrl(loc.category_id)}
          completed={completedLocations.has(loc.id)}
          isTarget={loc.id === targetId}
        />
      ))}
    </>
  );
}
