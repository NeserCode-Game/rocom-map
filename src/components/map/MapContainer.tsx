import { useEffect, useRef, useState } from "react";
import { MapContainer as LeafletMapContainer } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import { MAP_CONFIG, GAME_BOUNDS } from "../../lib/map/constants";
import { fetchLocations } from "../../lib/map/api";
import { useMapStore } from "../../composables/useMapStore";
import GameTileLayer from "./GameTileLayer";
import MapMarkers from "./MapMarkers";

/** 数据加载器 */
function DataLoader() {
  const setLocations = useMapStore((s) => s.setLocations);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      useMapStore.setState({ loading: true, error: null });
      try {
        const locs = await fetchLocations();
        if (!cancelled) {
          setLocations(locs);
          useMapStore.setState({ loading: false });
        }
      } catch (err) {
        if (!cancelled) {
          useMapStore.setState({
            loading: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setLocations]);

  return null;
}

/** 加载状态指示器 */
function LoadingIndicator() {
  const loading = useMapStore((s) => s.loading);
  const error = useMapStore((s) => s.error);
  if (!loading && !error) return null;

  return (
    <div className="map-loading-indicator">
      {loading ? "⏳ 加载标点数据..." : `❌ ${error}`}
    </div>
  );
}

/** 主地图容器 */
export default function MapContainer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 500, height: 500 });

  // 用 ResizeObserver 获取容器实际尺寸
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
        bounds={GAME_BOUNDS}
        minZoom={MAP_CONFIG.zoom.min}
        maxZoom={MAP_CONFIG.zoom.max}
        className="map-leaflet"
        zoomControl={true}
      >
        <GameTileLayer />
        <MapMarkers />
        <DataLoader />
      </LeafletMapContainer>
      <LoadingIndicator />
    </div>
  );
}
