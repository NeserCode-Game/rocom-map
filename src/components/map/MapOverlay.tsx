import { useMapStore } from '../../composables/useMapStore';

/**
 * 地图玻璃遮罩层
 * - loading：初始数据加载时显示
 * - filtering：分类切换操作时短暂显示
 */
export default function MapOverlay() {
  const overlay = useMapStore((s) => s.overlay);

  if (overlay.kind === 'idle') return null;

  const isFiltering = overlay.kind === 'filtering';
  const isLoading = overlay.kind === 'loading';

  return (
    <div
      className={`map-overlay ${isFiltering ? 'map-overlay--filtering' : ''} ${isLoading ? 'map-overlay--loading' : ''}`}
    >
      <div className="map-overlay-content">
        {isLoading && (
          <div className="map-overlay-spinner" />
        )}
        <span className="map-overlay-text">{overlay.message}</span>
      </div>
    </div>
  );
}
