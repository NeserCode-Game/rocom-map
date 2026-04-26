import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import type { MapLocation } from "./types";
import { API_LOCATION_LIST, REQUEST_HEADERS } from "./constants";
import { logger } from "../../lib/logger";

/**
 * 获取地图标点数据
 * 使用 Tauri HTTP 插件直接请求 API
 * 数据在 Zustand store 中内存缓存，无需文件级缓存
 */
export async function fetchLocations(): Promise<MapLocation[]> {
  logger.info("api", "fetchLocations", "request", { url: API_LOCATION_LIST });

  try {
    logger.info("api", "fetchLocations", "fetching", {});

    const res = await tauriFetch(API_LOCATION_LIST, {
      method: "GET",
      headers: {
        origin: REQUEST_HEADERS.origin,
        referer: REQUEST_HEADERS.referer,
      },
    });

    logger.info("api", "fetchLocations", "response", {
      status: res.status,
      ok: res.ok,
    });

    if (!res.ok) {
      const err = `HTTP ${res.status}`;
      logger.error("api", "fetchLocations", "request", { error: err });
      throw new Error(err);
    }

    const data = await res.json();
    logger.info("api", "fetchLocations", "jsonParsed", { type: typeof data });

    const locations: MapLocation[] = Array.isArray(data)
      ? data
      : (data?.data ?? []);

    logger.info("api", "fetchLocations", "success", {
      total: locations.length,
    });
    return locations;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("api", "fetchLocations", "error", { error: msg });
    throw err;
  }
}
