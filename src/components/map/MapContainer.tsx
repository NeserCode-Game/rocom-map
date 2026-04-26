import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer as LeafletMapContainer } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import { MAP_CONFIG, GAME_BOUNDS } from "../../lib/map/constants";
import { fetchLocations } from "../../lib/map/api";
import { useMapStore } from "../../composables/useMapStore";
import { logger } from "../../lib/logger";
import GameTileLayer from "./GameTileLayer";
import MapMarkers from "./MapMarkers";
import MapOverlay from "./MapOverlay";

/** 数据加载器 */
function DataLoader() {
  const setLocations = useMapStore((s) => s.setLocations);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      useMapStore.setState({ loading: true, error: null, overlay: { kind: 'loading', message: '正在加载标点数据…' } });
      logger.info("MapContainer", "DataLoader", "fetch", { started: true });
      try {
        const locs = await fetchLocations();
        if (!cancelled) {
          setLocations(locs);
          useMapStore.setState({ loading: false, overlay: { kind: 'idle' } });
          logger.info("MapContainer", "DataLoader", "fetch", { count: locs.length, success: true });
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
  }, [setLocations]);

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
        <DataLoader />
      </LeafletMapContainer>
      <MapOverlay />
    </div>
  );
}
