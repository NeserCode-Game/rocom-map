use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize, Deserialize)]
pub struct SiftMatchResult {
    pub x: Option<i32>,
    pub y: Option<i32>,
    pub confidence: Option<f64>,
    pub matches: Option<i32>,
    pub inliers: Option<i32>,
    pub reference_png_b64: Option<String>,
}

pub struct SiftMatcher {
    stdin: Mutex<ChildStdin>,
    stdout: Mutex<BufReader<ChildStdout>>,
    _process: Mutex<Child>,
}

impl SiftMatcher {
    pub fn start(script_path: &str, map_path: &str) -> Result<Self, String> {
        let mut child = Command::new("python")
            .arg(script_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .map_err(|e| format!("启动 Python 失败: {}", e))?;

        let stdin = child.stdin.take().ok_or("无法获取 stdin")?;
        let stdout = child.stdout.take().ok_or("无法获取 stdout")?;

        let matcher = SiftMatcher {
            stdin: Mutex::new(stdin),
            stdout: Mutex::new(BufReader::new(stdout)),
            _process: Mutex::new(child),
        };

        let req = serde_json::json!({"cmd": "init", "map_path": map_path});
        matcher.send(&req.to_string())?;
        let resp = matcher.recv()?;
        let v: serde_json::Value =
            serde_json::from_str(&resp).map_err(|e| format!("init JSON: {} (got: {})", e, resp))?;
        if v["status"] != "ok" {
            return Err(v["message"].as_str().unwrap_or("init failed").to_string());
        }
        Ok(matcher)
    }

    pub fn match_image(&self, image_path: &str) -> Result<SiftMatchResult, String> {
        let req = serde_json::json!({"cmd": "match", "image_path": image_path});
        self.send(&req.to_string())?;
        let resp = self.recv()?;
        let v: serde_json::Value =
            serde_json::from_str(&resp).map_err(|e| format!("match JSON: {} (got: {})", e, resp))?;
        if v["status"] != "ok" {
            return Err(v["message"].as_str().unwrap_or("match failed").to_string());
        }
        Ok(SiftMatchResult {
            x: v["x"].as_i64().map(|n| n as i32),
            y: v["y"].as_i64().map(|n| n as i32),
            confidence: v["confidence"].as_f64(),
            matches: v["matches"].as_i64().map(|n| n as i32),
            inliers: v["inliers"].as_i64().map(|n| n as i32),
            reference_png_b64: v["reference_png_b64"].as_str().map(|s| s.to_string()),
        })
    }

    pub fn send(&self, data: &str) -> Result<(), String> {
        let mut stdin = self.stdin.lock().map_err(|e| e.to_string())?;
        writeln!(stdin, "{}", data).map_err(|e| format!("write stdin: {}", e))?;
        stdin.flush().map_err(|e| format!("flush stdin: {}", e))?;
        Ok(())
    }

    fn recv(&self) -> Result<String, String> {
        let mut stdout = self.stdout.lock().map_err(|e| e.to_string())?;
        let mut line = String::new();
        let n = stdout.read_line(&mut line).map_err(|e| format!("read stdout: {}", e))?;
        if n == 0 {
            return Err("Python process exited".to_string());
        }
        let trimmed = line.trim().to_string();
        if trimmed.is_empty() {
            return Err("Python returned empty line".to_string());
        }
        Ok(trimmed)
    }
}

// ── helpers ──

fn resolve_script_path(app: &AppHandle) -> Result<String, String> {
    let resource_dir = app.path().resource_dir().map_err(|e| format!("resource dir: {}", e))?;
    let bundled = resource_dir.join("python").join("sift_matcher.py");
    if bundled.exists() {
        return Ok(bundled.to_string_lossy().to_string());
    }
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let dev = manifest_dir.join("..").join("python").join("sift_matcher.py");
    if dev.exists() {
        return Ok(dev.canonicalize().map_err(|e| e.to_string())?.to_string_lossy().to_string());
    }
    if let Ok(cwd) = std::env::current_dir() {
        for prefix in &[cwd.as_path(), cwd.parent().unwrap_or(cwd.as_path())] {
            let p = prefix.join("python").join("sift_matcher.py");
            if p.exists() {
                return Ok(p.to_string_lossy().to_string());
            }
        }
    }
    Err(format!("sift_matcher.py not found (bundled: {}, dev: {})", bundled.display(), dev.display()))
}

fn find_big_map(app: &AppHandle) -> Result<String, String> {
    let names = ["big_map_z12.png", "big_map_z11.png", "big_map.png", "big_map_z10.png"];
    let mut search_dirs: Vec<std::path::PathBuf> = vec![];
    if let Ok(d) = app.path().resource_dir() {
        search_dirs.push(d);
    }
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    search_dirs.push(manifest_dir.join(".."));
    if let Ok(cwd) = std::env::current_dir() {
        search_dirs.push(cwd.clone());
        if let Some(parent) = cwd.parent() {
            search_dirs.push(parent.to_path_buf());
        }
    }
    for dir in &search_dirs {
        for name in &names {
            let p = dir.join(name);
            if p.exists() {
                return Ok(p.to_string_lossy().to_string());
            }
        }
    }
    Err("big_map not found".to_string())
}

async fn sift_start_inner(app: &AppHandle) -> Result<(), String> {
    let state: tauri::State<'_, SiftState> = app.state();
    let mut guard = state.matcher.lock().map_err(|e| e.to_string())?;
    if guard.is_some() { return Ok(()); }
    let script_path = resolve_script_path(app)?;
    let map_path = find_big_map(app)?;
    let matcher = SiftMatcher::start(&script_path, &map_path)?;
    *guard = Some(matcher);
    Ok(())
}

fn sift_stop_inner(app: &AppHandle) {
    let state: tauri::State<'_, SiftState> = app.state();
    let guard = state.matcher.lock();
    if let Ok(mut guard) = guard {
        if let Some(matcher) = guard.take() {
            matcher.send("{\"cmd\": \"quit\"}").ok();
        }
    }
}

async fn do_sift_match_inner(app: &AppHandle, path: &str) -> Result<SiftMatchResult, String> {
    let state: tauri::State<'_, SiftState> = app.state();
    let guard = state.matcher.lock().map_err(|e| e.to_string())?;
    let matcher = guard.as_ref().ok_or("SIFT matcher not started")?;
    matcher.match_image(path)
}

// ── commands ──

#[tauri::command]
pub async fn sift_start(app: AppHandle) -> Result<String, String> {
    sift_start_inner(&app).await?;
    Ok("started".to_string())
}

#[tauri::command]
pub async fn sift_stop(app: AppHandle) -> Result<(), String> {
    sift_stop_inner(&app);
    Ok(())
}

#[tauri::command]
pub async fn sift_reset(app: AppHandle) -> Result<(), String> {
    let state: tauri::State<'_, SiftState> = app.state();
    let guard = state.matcher.lock().map_err(|e| e.to_string())?;
    let matcher = guard.as_ref().ok_or("SIFT matcher not started")?;
    matcher.send("{\"cmd\": \"reset\"}")?;
    let _ = matcher.recv();
    Ok(())
}

#[tauri::command]
pub async fn sift_calibrate(app: AppHandle, image_path: String, calib_x: i32, calib_y: i32, tolerance: i32) -> Result<serde_json::Value, String> {
    do_calibrate(&app, &image_path, calib_x, calib_y, tolerance).await
}

#[tauri::command]
pub async fn sift_calibrate_raw(app: AppHandle, png_bytes: Vec<u8>, calib_x: i32, calib_y: i32, tolerance: i32) -> Result<serde_json::Value, String> {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    let tmp = std::env::temp_dir().join(format!("rocom_calib_{}.png", ts));
    std::fs::write(&tmp, &png_bytes).map_err(|e| format!("write temp: {}", e))?;
    let result = do_calibrate(&app, &tmp.to_string_lossy(), calib_x, calib_y, tolerance).await;
    let _ = std::fs::remove_file(&tmp);
    result
}

async fn do_calibrate(app: &AppHandle, image_path: &str, calib_x: i32, calib_y: i32, tolerance: i32) -> Result<serde_json::Value, String> {
    let state: tauri::State<'_, SiftState> = app.state();
    let guard = state.matcher.lock().map_err(|e| e.to_string())?;
    let matcher = guard.as_ref().ok_or("SIFT matcher not started")?;
    let req = serde_json::json!({
        "cmd": "calibrate", "image_path": image_path,
        "calib_x": calib_x, "calib_y": calib_y, "tolerance": tolerance,
    });
    matcher.send(&req.to_string())?;
    let resp = matcher.recv()?;
    let v: serde_json::Value = serde_json::from_str(&resp).map_err(|e| format!("JSON: {}", e))?;
    if v["status"] != "ok" {
        return Err(v["message"].as_str().unwrap_or("calibrate failed").to_string());
    }
    Ok(v)
}

#[tauri::command]
pub async fn sift_recolor(app: AppHandle, r: f64, g: f64, b: f64, brightness: f64, contrast: f64) -> Result<(), String> {
    let state: tauri::State<'_, SiftState> = app.state();
    let guard = state.matcher.lock().map_err(|e| e.to_string())?;
    let matcher = guard.as_ref().ok_or("SIFT matcher not started")?;
    let req = serde_json::json!({
        "cmd": "recolor", "r": r, "g": g, "b": b, "brightness": brightness, "contrast": contrast,
    });
    matcher.send(&req.to_string())?;
    let resp = matcher.recv()?;
    let v: serde_json::Value = serde_json::from_str(&resp).map_err(|e| format!("JSON: {}", e))?;
    if v["status"] != "ok" {
        return Err(v["message"].as_str().unwrap_or("recolor failed").to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn sift_match(app: AppHandle, image_path: String) -> Result<SiftMatchResult, String> {
    do_sift_match_inner(&app, &image_path).await
}

#[tauri::command]
pub async fn sift_match_raw(app: AppHandle, png_bytes: Vec<u8>) -> Result<SiftMatchResult, String> {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    let tmp = std::env::temp_dir().join(format!("rocom_sift_{}.png", ts));
    std::fs::write(&tmp, &png_bytes).map_err(|e| format!("write temp: {}", e))?;
    let result = match do_sift_match_inner(&app, &tmp.to_string_lossy()).await {
        Ok(r) => Ok(r),
        Err(_) => {
            sift_stop_inner(&app);
            sift_start_inner(&app).await?;
            do_sift_match_inner(&app, &tmp.to_string_lossy()).await
                .map_err(|e2| format!("SIFT restart failed: {}", e2))
        }
    };
    let _ = std::fs::remove_file(&tmp);
    result
}

// ── State ──

pub struct SiftState {
    pub matcher: Mutex<Option<SiftMatcher>>,
}
