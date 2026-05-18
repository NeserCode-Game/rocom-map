mod cache;
mod capture;
mod matcher;
mod sift;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(sift::SiftState {
            matcher: std::sync::Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            cache::cache_init,
            cache::cache_get,
            cache::cache_fetch,
            cache::cache_stats,
            cache::cache_clear,
            cache::cache_export_manifest,
            cache::cache_import_manifest,
            cache::cache_prefetch,
            capture::enumerate_windows,
            capture::capture_window_live,
            capture::capture_screen_region,
            capture::capture_region,
            capture::capture_window_preview,
            matcher::match_position,
            matcher::preprocess_png,
            sift::sift_start,
            sift::sift_match,
            sift::sift_match_raw,
            sift::sift_reset,
            sift::sift_recolor,
            sift::sift_calibrate,
            sift::sift_calibrate_raw,
            sift::sift_stop,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
