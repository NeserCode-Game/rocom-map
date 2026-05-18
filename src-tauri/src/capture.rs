//! 窗口枚举 & 区域截图 (Windows GDI, windows 0.60)
use image::{ImageBuffer, Rgba};
use serde::Serialize;
use std::mem;
use windows::Win32::Foundation::{HWND, LPARAM, RECT};
use windows::Win32::Graphics::Gdi::*;
use windows::Win32::UI::WindowsAndMessaging::*;

/// 直接 FFI 声明，因为 windows 0.60 crate 未导出 PrintWindow
const PW_RENDERFULLCONTENT: u32 = 0x0000_0002;
#[link(name = "user32")]
extern "system" {
    fn PrintWindow(hwnd: HWND, hdc: HDC, flags: u32) -> i32;
}

#[derive(Debug, Clone, Serialize)] #[serde(rename_all = "camelCase")]
pub struct WindowInfo {
    pub hwnd: usize, pub title: String, pub class_name: String,
    pub rect: WindowRect, pub client_rect: WindowRect, pub is_visible: bool,
}
#[derive(Debug, Clone, Copy, Serialize)] #[serde(rename_all = "camelCase")]
pub struct WindowRect { pub left: i32, pub top: i32, pub right: i32, pub bottom: i32 }

#[tauri::command]
pub fn enumerate_windows() -> Vec<WindowInfo> {
    let mut ws: Vec<WindowInfo> = Vec::new();
    let p = &mut ws as *mut Vec<WindowInfo>;
    unsafe {
        let f: WNDENUMPROC = Some(mem::transmute(ec as *const () as usize));
        let _ = EnumWindows(f, LPARAM(p as isize));
    }
    ws.sort_by(|a, b| a.title.cmp(&b.title));
    ws
}

unsafe extern "system" fn ec(h: HWND, l: LPARAM) -> i32 {
    let ws = &mut *(l.0 as *mut Vec<WindowInfo>);
    if !IsWindowVisible(h).as_bool() || IsIconic(h).as_bool() { return 1; }
    let mut tb = [0u16; 256]; let tl = GetWindowTextW(h, &mut tb);
    if tl == 0 { return 1; }
    let t = String::from_utf16_lossy(&tb[..tl as usize]).trim().to_string();
    if t.is_empty() { return 1; }
    let mut cb = [0u16; 256]; let _ = GetClassNameW(h, &mut cb);
    let cn = String::from_utf16_lossy(&cb[..cb.iter().position(|&c| c==0).unwrap_or(256)]).trim().to_string();
    let mut r = RECT::default(); let _ = GetWindowRect(h, &mut r);
    let mut cr = RECT::default(); let _ = GetClientRect(h, &mut cr);
    if cr.right <= 0 || cr.bottom <= 0 { return 1; }
    ws.push(WindowInfo{ hwnd: h.0 as usize, title: t, class_name: cn,
        rect: WindowRect{ left: r.left, top: r.top, right: r.right, bottom: r.bottom },
        client_rect: WindowRect{ left: 0, top: 0, right: cr.right, bottom: cr.bottom }, is_visible: true });
    1
}

#[tauri::command]
pub fn capture_region(hwnd: usize, x: i32, y: i32, w: i32, h: i32) -> Result<Vec<u8>, String> {
    if w<=0||h<=0 { return Err(format!("bad size {}x{}",w,h)); }
    let (px,st) = unsafe { cap(HWND(hwnd as *mut _), x, y, w, h)? };
    bgra2png(&px,w,h,st)
}

/// 实时截图：先用 PrintWindow（支持 DirectX），多组标志回退。
#[tauri::command]
pub fn capture_window_live(hwnd: usize) -> Result<Vec<u8>, String> {
    let h = HWND(hwnd as *mut _);
    let mut cr = RECT::default();
    unsafe {
        if GetClientRect(h, &mut cr).is_err() || cr.right <= 0 || cr.bottom <= 0 {
            return Err("invalid client rect".into());
        }
        let (w, h2) = (cr.right, cr.bottom);
        let dc = GetDC(Some(h));
        if dc.is_invalid() { return Err("GetDC".into()); }

        // 依次尝试打印标志组合
        let flags: &[u32] = &[
            PW_RENDERFULLCONTENT,     // 0x2 完整内容渲染（Win10 1803+）
            0x0000_0001,              // PW_CLIENTONLY（仅客户区）
            0x0000_0003,              // 两者组合
            0x0000_0000,              // 无标志
        ];
        let mut _last_err = "all PrintWindow attempts failed";
        for &flag in flags {
            let mc = CreateCompatibleDC(Some(dc));
            if mc.is_invalid() { continue; }
            let bm = CreateCompatibleBitmap(dc, w, h2);
            if bm.is_invalid() { let _ = DeleteDC(mc); continue; }
            let old = SelectObject(mc, bm.into());
            let pw = PrintWindow(h, mc, flag);
            SelectObject(mc, old);
            if pw != 0 {
                // PrintWindow 成功，读取像素
                let stride = ((w*32+31)/32)*4;
                let mut px = vec![0u8; (stride*h2) as usize];
                let mut bmi = BITMAPINFO {
                    bmiHeader: BITMAPINFOHEADER {
                        biSize: mem::size_of::<BITMAPINFOHEADER>() as u32,
                        biWidth: w, biHeight: -h2, biPlanes: 1, biBitCount: 32,
                        biCompression: 0, biSizeImage: 0, biXPelsPerMeter: 0,
                        biYPelsPerMeter: 0, biClrUsed: 0, biClrImportant: 0,
                    }, bmiColors: [mem::zeroed()],
                };
                let lines = GetDIBits(mc, bm, 0, h2 as u32, Some(px.as_mut_ptr() as *mut _), &mut bmi, DIB_RGB_COLORS);
                let _ = DeleteObject(bm.into()); let _ = DeleteDC(mc); let _ = ReleaseDC(Some(h), dc);
                if lines as u32 != h2 as u32 { return Err("GetDIBits".into()); }
                return bgra2png(&px, w, h2, stride);
            }
            // 此标志失败，清理后尝试下一个
            let _ = DeleteObject(bm.into());
            let _ = DeleteDC(mc);
            _last_err = "PrintWindow 不支持该窗口或游戏";
        }
        let _ = ReleaseDC(Some(h), dc);
        // PrintWindow 全部失败，回退到 GDI BitBlt 截图
        let (px, st) = cap(h, 0, 0, w, h2)?;
        return bgra2png(&px, w, h2, st);
    }
}

/// 屏幕级截图：从屏幕 DC 截取指定窗口的相对区域（实时，不受 DirectX 影响）
#[tauri::command]
pub fn capture_screen_region(hwnd: usize, rx: i32, ry: i32, rw: i32, rh: i32) -> Result<Vec<u8>, String> {
    if rw <= 0 || rh <= 0 { return Err("invalid size".into()); }
    unsafe {
        let h = HWND(hwnd as *mut _);

        let mut wr = RECT::default();
        if GetWindowRect(h, &mut wr).is_err() {
            return Err("GetWindowRect".into());
        }
        let abs_x = rx;
        let abs_y = ry;

        // 用屏幕 DC 而非窗口 DC（这样能捕获 DirectX 实时画面）
        let dc = GetDC(None);
        if dc.is_invalid() { return Err("GetDC screen".into()); }
        let mc = CreateCompatibleDC(Some(dc));
        let bm = CreateCompatibleBitmap(dc, rw, rh);
        if mc.is_invalid() || bm.is_invalid() {
            if !mc.is_invalid() { let _ = DeleteDC(mc); }
            let _ = ReleaseDC(None, dc);
            return Err("create dc/bmp".into());
        }
        let old = SelectObject(mc, bm.into());
        let ok = BitBlt(mc, 0, 0, rw, rh, Some(dc), abs_x, abs_y, SRCCOPY).is_ok();
        SelectObject(mc, old);
        let _ = ReleaseDC(None, dc);
        if !ok {
            let _ = DeleteObject(bm.into()); let _ = DeleteDC(mc);
            return Err("BitBlt".into());
        }

        let stride = ((rw * 32 + 31) / 32) * 4;
        let mut px = vec![0u8; (stride * rh) as usize];
        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: rw, biHeight: -rh, biPlanes: 1, biBitCount: 32,
                biCompression: 0, biSizeImage: 0, biXPelsPerMeter: 0,
                biYPelsPerMeter: 0, biClrUsed: 0, biClrImportant: 0,
            }, bmiColors: [mem::zeroed()],
        };
        let lines = GetDIBits(mc, bm, 0, rh as u32, Some(px.as_mut_ptr() as *mut _), &mut bmi, DIB_RGB_COLORS);
        let _ = DeleteObject(bm.into()); let _ = DeleteDC(mc);
        if lines as u32 != rh as u32 { return Err("GetDIBits".into()); }
        bgra2png(&px, rw, rh, stride)
    }
}

#[tauri::command]
pub fn capture_window_preview(hwnd: usize) -> Result<Vec<u8>, String> {
    let h = HWND(hwnd as *mut _);
    let mut cr = RECT::default();
    unsafe { if GetClientRect(h, &mut cr).is_err() { return Err("GetClientRect".into()); } }
    let (fw,fh) = (cr.right, cr.bottom);
    if fw<=0||fh<=0 { return Err("no area".into()); }
    let (px,st) = unsafe { cap(h, 0, 0, fw, fh)? };
    let sc = (400.0 / fw as f64).min(1.0);
    let (twi, thi) = ((fw as f64*sc) as u32, (fh as f64*sc) as u32);
    let thumb = near(&px, fw as u32, fh as u32, st, twi, thi);
    bgra2png(&thumb, twi as i32, thi as i32, twi as i32*4)
}

unsafe fn cap(h: HWND, x: i32, y: i32, w: i32, h2: i32) -> Result<(Vec<u8>, i32), String> {
    let dc = GetWindowDC(Some(h));
    if dc.is_invalid() { return Err("dc".into()); }
    let mc = CreateCompatibleDC(Some(dc));
    let bm = CreateCompatibleBitmap(dc, w, h2);
    if mc.is_invalid()||bm.is_invalid() {
        if !mc.is_invalid() { let _ = DeleteDC(mc); }
        let _ = ReleaseDC(Some(h), dc); return Err("cdc/cbm".into());
    }
    let ol = SelectObject(mc, bm.into());
    let ok = BitBlt(mc, 0, 0, w, h2, Some(dc), x, y, SRCCOPY).is_ok();
    SelectObject(mc, ol);
    if !ok { let _ = DeleteObject(bm.into()); let _ = DeleteDC(mc); let _ = ReleaseDC(Some(h), dc); return Err("blt".into()); }
    let stride = ((w*32+31)/32)*4;
    let mut px = vec![0u8; (stride*h2) as usize];
    let mut bmi = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: w, biHeight: -h2, biPlanes: 1, biBitCount: 32,
            biCompression: 0, biSizeImage: 0, biXPelsPerMeter: 0,
            biYPelsPerMeter: 0, biClrUsed: 0, biClrImportant: 0,
        }, bmiColors: [mem::zeroed()],
    };
    let lines = GetDIBits(mc, bm, 0, h2 as u32, Some(px.as_mut_ptr() as *mut _), &mut bmi, DIB_RGB_COLORS);
    let _ = DeleteObject(bm.into()); let _ = DeleteDC(mc); let _ = ReleaseDC(Some(h), dc);
    if lines as u32 != h2 as u32 { return Err("dib".into()); }
    Ok((px, stride))
}

fn bgra2png(px: &[u8], w: i32, h: i32, st: i32) -> Result<Vec<u8>, String> {
    let (uw,uh) = (w as u32, h as u32);
    let mut im: ImageBuffer<Rgba<u8>,Vec<u8>> = ImageBuffer::new(uw,uh);
    for y in 0..uh { for x in 0..uw {
        let si = y as usize*st as usize + x as usize*4;
        im.put_pixel(x,y,Rgba([px[si+2],px[si+1],px[si],px[si+3]]));
    }}
    let mut b = std::io::Cursor::new(Vec::new());
    im.write_to(&mut b, image::ImageFormat::Png).map_err(|e| format!("png:{}",e))?;
    Ok(b.into_inner())
}

fn near(s: &[u8], sw: u32, sh: u32, _st: i32, dw: u32, dh: u32) -> Vec<u8> {
    let sr = sw as usize*4; let mut d = vec![0u8;(dw*dh*4)as usize];
    for dy in 0..dh { for dx in 0..dw {
        let sx = (dx as f64*sw as f64/dw as f64) as u32;
        let sy = (dy as f64*sh as f64/dh as f64) as u32;
        let si = sy as usize*sr + sx as usize*4;
        let di = dy as usize*dw as usize*4 + dx as usize*4;
        d[di..di+4].copy_from_slice(&s[si..si+4]);
    }}
    d
}
