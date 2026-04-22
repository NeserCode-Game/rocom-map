import { fetch } from '@tauri-apps/plugin-http';
import type { MapLocation } from './types';
import { API_LOCATION_LIST } from './constants';

export async function fetchLocations(): Promise<MapLocation[]> {
  const res = await fetch(API_LOCATION_LIST);
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }
  const json = await res.json();
  // API 返回 { data: [...], code: 0 } 或直接数组
  const data = Array.isArray(json) ? json : json?.data ?? [];
  return data as MapLocation[];
}
