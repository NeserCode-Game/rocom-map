import { useEffect, useRef, useState } from 'react';
import { MapContainer as LeafletMapContainer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import { MAP_CONFIG, MAX_BOUNDS } from '../../lib/map/constants';
import { fetchLocations } from '../../lib/map/api';
import { useMapStore } from '../../composables/useMapStore';
import GameTileLayer from './GameTileLayer';
import MapMarkers from './MapMarkers';
import CategoryFilter from './CategoryFilter';

/** 数据加载器 */
function DataLoader() {
  const setLocations = useMapStore((s) => s.setLocations);
  useMapStore((s) => s.loading);
  useMapStore((s) => s.error);

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
    return () => { cancelled = true; };
  }, [setLocations]);

  return null;
}

/** 加载状态指示器 */
function LoadingIndicator() {
  const loading = useMapStore((s) => s.loading);
  const error = useMapStore((s) => s.error);
  if (!loading && !error) return null;

  return (
    <div style={{
      position: 'absolute',
      bottom: 10,
      left: 10,
      zIndex: 1000,
      background: 'rgba(255,255,255,0.9)',
      padding: '6px 12px',
      borderRadius: 6,
      fontSize: 13,
      boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
    }}>
      {loading ? '⏳ 加载标点数据...' : `❌ ${error}`}
    </div>
  );
}

/** 主地图容器 */
export default function MapContainer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

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
      style={{ width: '100%', height: '100%', position: 'relative' }}
    >
      <LeafletMapContainer
        center={MAP_CONFIG.center}
        zoom={MAP_CONFIG.zoom.initial}
        minZoom={MAP_CONFIG.zoom.min}
        maxZoom={MAP_CONFIG.zoom.max}
        maxBounds={MAX_BOUNDS}
        maxBoundsViscosity={1.0}
        style={{ width: dimensions.width, height: dimensions.height }}
        zoomControl={true}
      >
        <GameTileLayer />
        <MapMarkers />
        <DataLoader />
      </LeafletMapContainer>
      <CategoryFilter />
      <LoadingIndicator />
    </div>
  );
}
