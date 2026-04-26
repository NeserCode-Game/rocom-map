import { fetch } from "@tauri-apps/plugin-http";
import type { MapLocation } from "./types";
import { API_LOCATION_LIST } from "./constants";
import { logger } from "../../lib/logger";

export async function fetchLocations(): Promise<MapLocation[]> {
  logger.info("api", "fetchLocations", "request", { url: API_LOCATION_LIST });

  try {
    logger.info("api", "fetchLocations", "fetching", {});

    const res = await fetch(API_LOCATION_LIST, {
      method: "GET",
      headers: {
        origin: "https://map.17173.com",
        referer: "https://map.17173.com/",
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
