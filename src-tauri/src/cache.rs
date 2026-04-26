use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tokio::fs;
use tokio::io::AsyncWriteExt;

/* ─── 元数据结构 ─── */

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheEntry {
    /// 原始 URL（唯一标识）
    pub url: String,
    /// 缓存文件相对路径（相对于 cache dir）
    pub file: String,
    /// 内容类型
    pub content_type: String,
    /// 缓存写入时间（Unix 毫秒）
    pub cached_at: u64,
    /// TTL（毫秒）
    pub ttl: u64,
    /// 文件大小（字节）
    pub size: u64,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct CacheManifest {
    pub entries: HashMap<String, CacheEntry>,
}

/* ─── 缓存统计 ─── */

#[derive(Debug, Serialize)]
pub struct CacheStats {
    pub total_entries: usize,
    pub total_size: u64,
    pub expired_entries: usize,
    pub cache_dir: String,
}

/* ─── 辅助函数 ─── */

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

/// 将 URL 转换为安全的文件名（保留层级结构）
fn url_to_filepath(url: &str) -> String {
    // 提取 host + path，将 / 替换为 _
    let parsed = url::Url::parse(url).ok();
    let host = parsed.as_ref().and_then(|u| u.host_str()).unwrap_or("unknown");
    let path = parsed
        .as_ref()
        .map(|u| u.path().trim_start_matches('/'))
        .unwrap_or("unknown");

    // 去掉 query string 的特殊字符
    let path = path.split('?').next().unwrap_or(path);
    // 将 / 替换为 _
    let safe_path = path.replace('/', "_");

    format!("{}_{}", host.replace('.', "_"), safe_path)
}

/* ─── Tauri 命令 ─── */

/// 获取缓存目录路径
fn cache_dir(app: &AppHandle) -> PathBuf {
    app.path().app_data_dir()
        .expect("无法获取 app_data_dir")
        .join("cache")
}

/// 获取元数据文件路径
fn manifest_path(app: &AppHandle) -> PathBuf {
    cache_dir(app).join("manifest.json")
}

/// 读取元数据
async fn read_manifest(app: &AppHandle) -> CacheManifest {
    let path = manifest_path(app);
    if !path.exists() {
        return CacheManifest::default();
    }
    match fs::read_to_string(&path).await {
        Ok(text) => serde_json::from_str(&text).unwrap_or_default(),
        Err(_) => CacheManifest::default(),
    }
}

/// 写入元数据
async fn write_manifest(app: &AppHandle, manifest: &CacheManifest) -> Result<(), String> {
    let path = manifest_path(app);
    let dir = path.parent().ok_or("无法获取父目录")?;
    fs::create_dir_all(dir).await.map_err(|e| e.to_string())?;
    let text = serde_json::to_string_pretty(manifest).map_err(|e| e.to_string())?;
    fs::write(&path, text).await.map_err(|e| e.to_string())
}

/// 初始化缓存目录
#[tauri::command]
pub async fn cache_init(app: AppHandle) -> Result<String, String> {
    let dir = cache_dir(&app);
    fs::create_dir_all(&dir).await.map_err(|e| e.to_string())?;
    // 确保 manifest 存在
    let manifest = read_manifest(&app).await;
    write_manifest(&app, &manifest).await?;
    Ok(dir.to_string_lossy().to_string())
}

/// 查询缓存：返回本地文件路径（如果有效）或 null
#[tauri::command]
pub async fn cache_get(app: AppHandle, url: String) -> Result<Option<String>, String> {
    let manifest = read_manifest(&app).await;
    let entry = match manifest.entries.get(&url) {
        Some(e) => e,
        None => return Ok(None),
    };

    // 检查 TTL
    let now = now_ms();
    if now - entry.cached_at > entry.ttl {
        // 过期
        return Ok(None);
    }

    // 检查文件是否存在
    let file_path = cache_dir(&app).join(&entry.file);
    if !file_path.exists() {
        return Ok(None);
    }

    Ok(Some(file_path.to_string_lossy().to_string()))
}

/// 带缓存的网络请求：先查缓存，未命中则下载
#[tauri::command]
pub async fn cache_fetch(
    app: AppHandle,
    url: String,
    ttl: u64,
    headers: Option<HashMap<String, String>>,
) -> Result<String, String> {
    // 先查缓存
    if let Some(local_path) = cache_get(app.clone(), url.clone()).await? {
        return Ok(local_path);
    }

    // 缓存未命中，发起网络请求
    let client = reqwest::Client::new();
    let mut req = client.get(&url);
    if let Some(h) = &headers {
        for (k, v) in h {
            req = req.header(k.as_str(), v.as_str());
        }
    }

    let resp = req
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    let content_type = resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream")
        .to_string();

    let bytes = resp.bytes().await.map_err(|e| format!("读取响应失败: {}", e))?;
    let size = bytes.len() as u64;

    // 写入缓存文件
    let filename = url_to_filepath(&url);
    let cache_root = cache_dir(&app);
    fs::create_dir_all(&cache_root).await.map_err(|e| e.to_string())?;
    let file_path = cache_root.join(&filename);
    let mut f = fs::File::create(&file_path).await.map_err(|e| e.to_string())?;
    f.write_all(&bytes).await.map_err(|e| e.to_string())?;
    f.flush().await.map_err(|e| e.to_string())?;

    // 更新 manifest
    let entry = CacheEntry {
        url: url.clone(),
        file: filename,
        content_type,
        cached_at: now_ms(),
        ttl,
        size,
    };
    let mut manifest = read_manifest(&app).await;
    manifest.entries.insert(url, entry);
    write_manifest(&app, &manifest).await?;

    Ok(file_path.to_string_lossy().to_string())
}

/// 缓存统计
#[tauri::command]
pub async fn cache_stats(app: AppHandle) -> Result<CacheStats, String> {
    let manifest = read_manifest(&app).await;
    let now = now_ms();
    let total_size: u64 = manifest.entries.values().map(|e| e.size).sum();
    let expired = manifest
        .entries
        .values()
        .filter(|e| now - e.cached_at > e.ttl)
        .count();

    Ok(CacheStats {
        total_entries: manifest.entries.len(),
        total_size,
        expired_entries: expired,
        cache_dir: cache_dir(&app).to_string_lossy().to_string(),
    })
}

/// 清除缓存（expired_only=true 只清过期，false 全部清除）
#[tauri::command]
pub async fn cache_clear(app: AppHandle, expired_only: bool) -> Result<CacheStats, String> {
    let mut manifest = read_manifest(&app).await;
    let now = now_ms();
    let cache_root = cache_dir(&app);

    let to_remove: Vec<String> = if expired_only {
        manifest
            .entries
            .iter()
            .filter(|(_, e)| now - e.cached_at > e.ttl)
            .map(|(url, _)| url.clone())
            .collect()
    } else {
        manifest.entries.keys().cloned().collect()
    };

    for url in &to_remove {
        if let Some(entry) = manifest.entries.remove(url) {
            let file_path = cache_root.join(&entry.file);
            let _ = fs::remove_file(&file_path).await;
        }
    }

    write_manifest(&app, &manifest).await?;
    cache_stats(app).await
}

/// 导出缓存元数据为 JSON 字符串
#[tauri::command]
pub async fn cache_export_manifest(app: AppHandle) -> Result<String, String> {
    let manifest = read_manifest(&app).await;
    serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())
}

/// 导入缓存元数据（合并模式）
#[tauri::command]
pub async fn cache_import_manifest(app: AppHandle, json: String) -> Result<CacheStats, String> {
    let imported: CacheManifest =
        serde_json::from_str(&json).map_err(|e| format!("JSON 解析失败: {}", e))?;
    let mut manifest = read_manifest(&app).await;

    // 合并：只添加不存在的条目（不覆盖已有）
    for (url, entry) in imported.entries {
        manifest.entries.entry(url).or_insert(entry);
    }

    write_manifest(&app, &manifest).await?;
    cache_stats(app).await
}

/// 预热缓存：批量下载资源
/// 接收 URL 列表 + TTL，并发下载
#[tauri::command]
pub async fn cache_prefetch(
    app: AppHandle,
    items: Vec<PrefetchItem>,
) -> Result<PrefetchResult, String> {
    let mut success = 0u32;
    let mut failed = 0u32;
    let mut errors: Vec<String> = Vec::new();

    // 并发限制：最多 8 个同时下载
    let sem = std::sync::Arc::new(tokio::sync::Semaphore::new(8));
    let mut handles = Vec::new();

    for item in items.iter() {
        let permit = sem.clone().acquire_owned().await.map_err(|e| e.to_string())?;
        let app = app.clone();
        let item = item.clone();
        handles.push(tokio::spawn(async move {
            let _permit = permit;
            cache_fetch(app, item.url, item.ttl, item.headers).await
        }));
    }

    for (i, handle) in handles.into_iter().enumerate() {
        match handle.await {
            Ok(Ok(_)) => success += 1,
            Ok(Err(e)) => {
                failed += 1;
                if errors.len() < 10 {
                    errors.push(format!("#{}: {}", i, e));
                }
            }
            Err(e) => {
                failed += 1;
                if errors.len() < 10 {
                    errors.push(format!("#{}: task error: {}", i, e));
                }
            }
        }
    }

    Ok(PrefetchResult {
        total: items.len() as u32,
        success,
        failed,
        errors,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrefetchItem {
    pub url: String,
    pub ttl: u64,
    pub headers: Option<HashMap<String, String>>,
}

#[derive(Debug, Serialize)]
pub struct PrefetchResult {
    pub total: u32,
    pub success: u32,
    pub failed: u32,
    pub errors: Vec<String>,
}
