import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { logger } from "./logger";

/* ─── 类型定义 ─── */

export interface CacheStats {
  total_entries: number;
  total_size: number;
  expired_entries: number;
  cache_dir: string;
}

export interface PrefetchItem {
  url: string;
  ttl: number;
  headers?: Record<string, string>;
}

export interface PrefetchResult {
  total: number;
  success: number;
  failed: number;
  errors: string[];
}

/* ─── 缓存 API 封装 ─── */

/** 初始化缓存目录 */
export async function cacheInit(): Promise<string> {
  const dir = await invoke<string>("cache_init");
  logger.info("cache", "init", "done", { dir });
  return dir;
}

/** 查询缓存：返回本地文件路径（如果有效）或 null */
export async function cacheGet(url: string): Promise<string | null> {
  return invoke<string | null>("cache_get", { url });
}

/**
 * 带缓存的网络请求
 * 先查缓存，未命中则下载并写入本地
 * 返回本地文件路径
 */
export async function cacheFetch(
  url: string,
  ttl: number,
  headers?: Record<string, string>,
): Promise<string> {
  logger.info("cache", "fetch", "start", { url, ttl });
  const localPath = await invoke<string>("cache_fetch", {
    url,
    ttl,
    headers: headers ?? null,
  });
  logger.info("cache", "fetch", "done", { url, localPath });
  return localPath;
}

/** 获取缓存统计 */
export async function cacheStats(): Promise<CacheStats> {
  return invoke<CacheStats>("cache_stats");
}

/** 清除缓存（expiredOnly=true 只清过期） */
export async function cacheClear(expiredOnly: boolean): Promise<CacheStats> {
  logger.info("cache", "clear", "start", { expiredOnly });
  const stats = await invoke<CacheStats>("cache_clear", { expiredOnly });
  logger.info("cache", "clear", "done", {
    remaining: stats.total_entries,
    size: stats.total_size,
  });
  return stats;
}

/** 导出缓存元数据 JSON */
export async function cacheExportManifest(): Promise<string> {
  return invoke<string>("cache_export_manifest");
}

/** 导入缓存元数据 JSON（合并模式） */
export async function cacheImportManifest(json: string): Promise<CacheStats> {
  return invoke<CacheStats>("cache_import_manifest", { json });
}

/**
 * 批量预热缓存
 * 并发下载多个资源，最多 8 个同时进行
 */
export async function cachePrefetch(
  items: PrefetchItem[],
): Promise<PrefetchResult> {
  logger.info("cache", "prefetch", "start", { count: items.length });
  const result = await invoke<PrefetchResult>("cache_prefetch", { items });
  logger.info("cache", "prefetch", "done", {
    total: result.total,
    success: result.success,
    failed: result.failed,
  });
  return result;
}

/* ─── 工具函数 ─── */

/** 将本地文件路径转为 Tauri webview 可访问的 asset URL */
export function localPathToAssetUrl(localPath: string): string {
  return convertFileSrc(localPath);
}

/** 格式化字节大小 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
