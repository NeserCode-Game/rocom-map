mod cache;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
