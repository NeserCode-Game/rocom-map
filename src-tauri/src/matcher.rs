//! 图像模板匹配 - 归一化互相关 (NCC)
//!
//! 参考 MAAFramework 图像识别思路：截图→预处理→特征匹配→定位。
//! 纯 Rust 实现，使用 image crate。

use image::{GenericImageView, GrayImage, Luma};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchResult {
    pub x: u32,
    pub y: u32,
    pub confidence: f64,
}

/// NCC 模板匹配。`confidence_threshold` 低于此值返回 None（推荐 0.6）。
#[tauri::command]
pub fn match_position(
    template_png: Vec<u8>,
    source_png: Vec<u8>,
    confidence_threshold: Option<f64>,
) -> Result<Option<MatchResult>, String> {
    let threshold = confidence_threshold.unwrap_or(0.6);

    let template = image::load_from_memory(&template_png)
        .map_err(|e| format!("template decode: {}", e))?;
    let source = image::load_from_memory(&source_png)
        .map_err(|e| format!("source decode: {}", e))?;

    let (tw, th) = template.dimensions();
    let (sw, sh) = source.dimensions();
    if tw > sw || th > sh {
        return Err(format!("template {}x{} > source {}x{}", tw, th, sw, sh));
    }

    let t_gray = template.to_luma8();
    let s_gray = source.to_luma8();
    let result = ncc_match(&t_gray, &s_gray);

    if result.confidence < threshold { Ok(None) } else { Ok(Some(result)) }
}

/// 预处理：灰度化 + 直方图均衡化，返回 PNG
#[tauri::command]
pub fn preprocess_png(png_data: Vec<u8>) -> Result<Vec<u8>, String> {
    let img = image::load_from_memory(&png_data)
        .map_err(|e| format!("decode: {}", e))?;
    let gray = img.to_luma8();
    let eq = equalize_histogram(&gray);
    let mut buf = std::io::Cursor::new(Vec::new());
    eq.write_to(&mut buf, image::ImageFormat::Png)
        .map_err(|e| format!("encode: {}", e))?;
    Ok(buf.into_inner())
}

/* ─── NCC 核心 ─── */

fn ncc_match(template: &GrayImage, source: &GrayImage) -> MatchResult {
    let (tw, th) = template.dimensions();
    let (sw, sh) = source.dimensions();

    let t_mean = mean_of(template);
    let t_norm: Vec<f64> = template.pixels().map(|p| p.0[0] as f64 - t_mean).collect();
    let t_norm_sq_sum: f64 = t_norm.iter().map(|&v| v * v).sum();
    let t_denom = t_norm_sq_sum.sqrt();
    if t_denom < 1e-10 { return MatchResult { x: 0, y: 0, confidence: 0.0 }; }

    let integral = build_integral(source);

    let mut best_x = 0u32;
    let mut best_y = 0u32;
    let mut best_ncc = -1.0f64;

    let max_y = sh.saturating_sub(th);
    let max_x = sw.saturating_sub(tw);
    let step = 2u32;

    // 粗搜索（步长 2）
    for y in (0..=max_y).step_by(step as usize) {
        for x in (0..=max_x).step_by(step as usize) {
            let ncc = compute_ncc(source, &t_norm, t_mean, t_denom, &integral, x, y, tw, th, sw);
            if ncc > best_ncc { best_ncc = ncc; best_x = x; best_y = y; }
        }
    }

    // 精细搜索（±2px）
    let fine_range = 2i32;
    for dy in -fine_range..=fine_range {
        for dx in -fine_range..=fine_range {
            let fx = (best_x as i32 + dx).max(0).min(max_x as i32) as u32;
            let fy = (best_y as i32 + dy).max(0).min(max_y as i32) as u32;
            let ncc = compute_ncc(source, &t_norm, t_mean, t_denom, &integral, fx, fy, tw, th, sw);
            if ncc > best_ncc { best_ncc = ncc; best_x = fx; best_y = fy; }
        }
    }

    MatchResult { x: best_x, y: best_y, confidence: best_ncc.max(0.0) }
}

fn compute_ncc(
    source: &GrayImage, t_norm: &[f64], t_mean: f64, t_denom: f64,
    integral: &IntegralImage, sx: u32, sy: u32, tw: u32, th: u32, sw: u32,
) -> f64 {
    let t_area = (tw * th) as f64;
    let s_numer = source_region_ncc_numer(source, t_norm, t_mean, sx, sy, tw, th);
    let s_region_sum = integral_sum(integral, sx, sy, tw, th, sw);
    let s_mean = s_region_sum / t_area;
    let s_norm_sq = source_region_norm_sq(source, s_mean, sx, sy, tw, th);
    let s_denom = s_norm_sq.sqrt();
    if s_denom < 1e-10 { return -1.0; }
    s_numer / (t_denom * s_denom)
}

fn source_region_ncc_numer(source: &GrayImage, t_norm: &[f64], t_mean: f64, sx: u32, sy: u32, tw: u32, th: u32) -> f64 {
    let mut sum = 0.0;
    for ty in 0..th {
        for tx in 0..tw {
            let sp = source.get_pixel(sx + tx, sy + ty).0[0] as f64;
            sum += t_norm[ty as usize * tw as usize + tx as usize] * (sp - t_mean);
        }
    }
    sum
}

fn source_region_norm_sq(source: &GrayImage, mean: f64, sx: u32, sy: u32, tw: u32, th: u32) -> f64 {
    let mut sum = 0.0;
    for ty in 0..th {
        for tx in 0..tw {
            let v = source.get_pixel(sx + tx, sy + ty).0[0] as f64 - mean;
            sum += v * v;
        }
    }
    sum
}

fn mean_of(img: &GrayImage) -> f64 {
    let (w, h) = img.dimensions();
    let sum: u64 = img.pixels().map(|p| p.0[0] as u64).sum();
    sum as f64 / (w * h) as f64
}

struct IntegralImage { data: Vec<u64>, width: u32 }

fn build_integral(img: &GrayImage) -> IntegralImage {
    let (w, h) = img.dimensions();
    let mut data = vec![0u64; (w * h) as usize];
    for y in 0..h {
        let mut row_sum = 0u64;
        for x in 0..w {
            row_sum += img.get_pixel(x, y).0[0] as u64;
            let above = if y > 0 { data[(y - 1) as usize * w as usize + x as usize] } else { 0 };
            data[y as usize * w as usize + x as usize] = above + row_sum;
        }
    }
    IntegralImage { data, width: w }
}

fn integral_sum(ii: &IntegralImage, x: u32, y: u32, tw: u32, th: u32, _sw: u32) -> f64 {
    let x2 = (x + tw - 1).min(ii.width - 1);
    let y2 = y + th - 1;
    let idx = |rx: u32, ry: u32| ry as usize * ii.width as usize + rx as usize;
    let a = if x > 0 && y > 0 { ii.data[idx(x - 1, y - 1)] } else { 0 };
    let b = if y > 0 { ii.data[idx(x2, y - 1)] } else { 0 };
    let c = if x > 0 { ii.data[idx(x - 1, y2)] } else { 0 };
    let d = ii.data[idx(x2, y2)];
    (d + a - b - c) as f64
}

fn equalize_histogram(img: &GrayImage) -> GrayImage {
    let (w, h) = img.dimensions();
    let total = (w * h) as f64;
    let mut hist = [0u32; 256];
    for p in img.pixels() { hist[p.0[0] as usize] += 1; }
    let mut cdf = [0u8; 256];
    let mut accum = 0u32;
    let scale = 255.0 / total;
    for i in 0..256 { accum += hist[i]; cdf[i] = (accum as f64 * scale).round().min(255.0) as u8; }
    let mut out = GrayImage::new(w, h);
    for (x, y, p) in img.enumerate_pixels() {
        out.put_pixel(x, y, Luma([cdf[p.0[0] as usize]]));
    }
    out
}
