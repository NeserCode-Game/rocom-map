import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { MapContainer as LeafletMapContainer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import { MAP_CONFIG, GAME_BOUNDS } from "../../lib/map/constants";
import type { MapLocation } from "../../lib/map/types";
import { fetchLocations } from "../../lib/map/api";
import { useMapStore } from "../../composables/useMapStore";
import { pixelToLatLng } from "../../lib/map/coords";
import { logger } from "../../lib/logger";

import GameTileLayer from "./GameTileLayer";
import MapMarkers from "./MapMarkers";
import MapOverlay from "./MapOverlay";
import MapStatusBar from "./MapStatusBar";

const PROFILES_KEY = "rocom-map:profiles";
const LAST_PROFILE_KEY = "rocom-map:last-profile";

/** 从 localStorage 恢复上次使用的档案分类，首次使用时全选 */
function restoreProfile(locations: MapLocation[]) {
  const lastProfile = localStorage.getItem(LAST_PROFILE_KEY);
  if (lastProfile) {
    try {
      const profiles = JSON.parse(localStorage.getItem(PROFILES_KEY) ?? "[]");
      const prof = profiles.find((p: { name: string }) => p.name === lastProfile);
      if (prof) {
        const validCids = new Set(locations.map((l) => l.category_id));
        const restored = new Set<number>(prof.visibleCategories.filter((c: number) => validCids.has(c)));
        logger.info("DataLoader", "restoreProfile", "restored", {
          profile: lastProfile,
          total: restored.size,
        });
        return restored;
      }
    } catch (e) {
      logger.warn("DataLoader", "restoreProfile", "parseError", { error: String(e) });
    }
  }
  // 首次使用：全选所有分类
  const allCids = new Set(locations.map((l) => l.category_id));
  logger.info("DataLoader", "restoreProfile", "selectAll", { count: allCids.size });
  return allCids;
}

/** 玩家定位按钮 — 左下角，点击聚焦追踪点 */
function LocateButton() {
  const map = useMap();
  const tracked = useMapStore((s) => s.trackedPosition);
  const [active, setActive] = useState(false);

  const fly = useCallback(() => {
    if (!tracked) return;
    const pos = pixelToLatLng(tracked.x, tracked.y);
    map.flyTo(pos, MAP_CONFIG.zoom.max, { duration: 0.6 });
    setActive(true);
    setTimeout(() => setActive(false), 1200);
  }, [map, tracked]);

  if (!tracked) return null;

  return (
    <div className="map-locate">
      <button className={`map-locate-btn ${active ? "map-locate-btn--active" : ""}`} onClick={fly} title="定位到玩家">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>
      </button>
    </div>
  );
}

/** 数据加载器 */
function DataLoader() {
  const setLocations = useMapStore((s) => s.setLocations);
  const prefetchIcons = useMapStore((s) => s.prefetchIcons);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      useMapStore.setState({ loading: true, error: null, overlay: { kind: 'loading', message: '正在加载标点数据…' } });
      logger.info("MapContainer", "DataLoader", "fetch", { started: true });
      try {
        const locs = await fetchLocations();
        if (!cancelled) {
          setLocations(locs);
          // 只在没有档案恢复时才全选
          if (useMapStore.getState().visibleCategories.size === 0) {
            const restored = restoreProfile(locs);
            useMapStore.setState({ visibleCategories: restored });
          }
          useMapStore.setState({ loading: false, overlay: { kind: 'idle' } });
          logger.info("MapContainer", "DataLoader", "fetch", { count: locs.length, success: true });

          // 提取所有分类 ID，异步预下载图标到本地缓存
          const catIds = [...new Set(locs.map(l => l.category_id))];
          prefetchIcons(catIds).catch((e) => {
            logger.warn("MapContainer", "DataLoader", "prefetchIcons", { error: String(e) });
          });
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          useMapStore.setState({ loading: false, error: msg, overlay: { kind: 'idle' } });
          logger.error("MapContainer", "DataLoader", "fetch", { error: msg });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setLocations, prefetchIcons]);

  return null;
}

/**
 * 动态计算 minZoom：确保地图像素尺寸 ≥ 容器尺寸。
 */
function calcMinZoom(containerSize: number): number {
  const { min, max } = MAP_CONFIG.zoom;
  const { west, east, south, north } = MAP_CONFIG.bounds;
  const spanLng = east - west;
  const spanLat = north - south;
  const span = Math.max(spanLng, spanLat);
  const n = Math.log2((containerSize * 360) / (span * 256));
  const neededZoom = Math.ceil(n);
  return Math.max(min, Math.min(max, neededZoom));
}

// 游戏地图中心点 [lat, lng]
const MAP_CENTER: [number, number] = [
  (MAP_CONFIG.bounds.south + MAP_CONFIG.bounds.north) / 2,
  (MAP_CONFIG.bounds.west + MAP_CONFIG.bounds.east) / 2,
];

/** 主地图容器 */
export default function MapContainer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 500, height: 500 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        setDimensions({ width: Math.round(width), height: Math.round(height) });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const minZoom = useMemo(
    () => calcMinZoom(Math.max(dimensions.width, dimensions.height)),
    [dimensions.width, dimensions.height]
  );

  return (
    <div
      ref={containerRef}
      className="map-container"
      style={
        {
          "--map-width": `${dimensions.width}px`,
          "--map-height": `${dimensions.height}px`,
        } as React.CSSProperties
      }
    >
      <LeafletMapContainer
        center={MAP_CENTER}
        zoom={MAP_CONFIG.zoom.initial}
        minZoom={minZoom}
        maxZoom={MAP_CONFIG.zoom.max}
        maxBounds={GAME_BOUNDS}
        maxBoundsViscosity={1.0}
        className="map-leaflet"
        attributionControl={false}
        zoomControl={true}
      >
        <GameTileLayer />
        <MapMarkers />
        <LocateButton />
        <DataLoader />
      </LeafletMapContainer>
      <MapOverlay />
      <MapStatusBar />
    </div>
  );
}
