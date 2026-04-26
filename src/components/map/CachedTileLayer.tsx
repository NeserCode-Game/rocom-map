import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { TILE_URL_TEMPLATE, CACHE_TTL } from '../../lib/map/constants';
import { cacheFetch, localPathToAssetUrl } from '../../lib/cache';
import { logger } from '../../lib/logger';

/**
 * 带本地缓存的瓦片图层
 * 
 * 策略：拦截 Leaflet 的瓦片加载，先查本地缓存，
 * 命中则使用 asset URL，未命中则下载到本地后更新 img.src。
 * 
 * 注意：不直接修改 Leaflet 的 URL 模板（因为 Tauri asset 协议
 * 对瓦片这种高频请求不适合），而是用 TileLayer 的事件钩子
 * 在每个瓦片加载时异步替换为本地路径。
 */
export default function CachedTileLayer() {
  const map = useMap();
  const layerRef = useRef<L.TileLayer | null>(null);

  useEffect(() => {
    const layer = L.tileLayer(TILE_URL_TEMPLATE, {
      maxZoom: 13,
      minZoom: 9,
      tileSize: 256,
      noWrap: true,
    });

    // 拦截瓦片加载：每个瓦片先尝试走缓存
    layer.on('tileloadstart', (e: L.TileEvent) => {
      const tile = e.tile as HTMLImageElement;
      const originalSrc = tile.src;
      if (!originalSrc || originalSrc.startsWith('https://asset.localhost')) return;

      // 异步替换为本地缓存 URL
      cacheFetch(originalSrc, CACHE_TTL.tiles)
        .then((localPath) => {
          const assetUrl = localPathToAssetUrl(localPath);
          // 仅当 tile 还没被 Leaflet 替换时才更新
          if (tile.src === originalSrc || tile.src.includes(originalSrc)) {
            tile.src = assetUrl;
          }
        })
        .catch((err) => {
          // 缓存失败不影响显示，保留远程 URL
          logger.warn('CachedTileLayer', 'cacheFetch', 'fail', {
            url: originalSrc,
            error: String(err),
          });
        });
    });

    layer.addTo(map);
    layerRef.current = layer;

    return () => {
      layer.remove();
    };
  }, [map]);

  return null;
}
