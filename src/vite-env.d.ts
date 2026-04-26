/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API 基础地址 */
  readonly VITE_API_BASE: string;
  /** 地图 ID */
  readonly VITE_API_MAP_ID: string;
  /** 瓦片资源基础 URL */
  readonly VITE_TILE_BASE: string;
  /** 瓦片版本号 */
  readonly VITE_TILE_VERSION: string;
  /** 图标资源基础 URL */
  readonly VITE_ICON_BASE: string;
  /** 请求头 Origin */
  readonly VITE_REQUEST_ORIGIN: string;
  /** 请求头 Referer */
  readonly VITE_REQUEST_REFERER: string;
  /** 瓦片缓存过期时间（毫秒） */
  readonly VITE_CACHE_TILES_TTL_MS: string;
  /** 素材缓存过期时间（毫秒） */
  readonly VITE_CACHE_ASSETS_TTL_MS: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
