"""
双引擎匹配器 — SIFT 全局定位 + LoFTR 局部追踪
参考: https://github.com/Y4n9Ch/RocMapTracer-sift-LoFTR
"""

import sys, json, os, ssl, pickle, base64, cv2, numpy as np
import torch
import kornia as K
from kornia.feature import LoFTR

ssl._create_default_https_context = ssl._create_unverified_context

try:
    import torch_directml
    _dml = torch_directml.device()
    _HAS_DML = True
except Exception:
    _HAS_DML = False


def _get_device():
    if torch.cuda.is_available():
        return torch.device("cuda")
    if _HAS_DML:
        return _dml
    return torch.device("cpu")


class LoftrEngine:
    def __init__(self):
        self.device = _get_device()
        print(f"[LoFTR] device={self.device}", file=sys.stderr, flush=True)
        self.matcher = LoFTR(pretrained="outdoor").to(self.device)
        self.matcher.eval()

    def preprocess(self, img_bgr):
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        h, w = gray.shape
        new_h, new_w = h - (h % 8), w - (w % 8)
        gray = cv2.resize(gray, (new_w, new_h))
        tensor = K.image_to_tensor(gray, False).float() / 255.0
        return tensor.to(self.device)

    def match(self, mini_tensor, local_tensor):
        with torch.no_grad():
            return self.matcher({"image0": mini_tensor, "image1": local_tensor})


# ── SIFT + LoFTR 混合匹配器 ──

class SIFTMatcher:
    CLAHE_CLIP = 3.0
    MATCH_RATIO = 0.9
    MIN_MATCHES = 5
    RANSAC_THRESH = 8.0
    CACHE_FILE = "big_map_features.pkl"

    LOFTR_CONF = 0.6
    LOFTR_MIN_MATCH = 6
    LOFTR_RANSAC = 8.0

    TRACK_RADIUS = 500
    MAX_LOST_FRAMES = 5
    SMOOTH_ALPHA_STILL = 0.08
    SMOOTH_ALPHA_MOVE = 0.40
    MOVE_THRESH = 50
    OUTLIER_THRESH = 500

    def __init__(self):
        self.big_map = None
        self.map_h = self.map_w = 0
        self.kp_big = None
        self.des_big = None
        self.sift = cv2.SIFT_create()
        self.clahe = cv2.createCLAHE(clipLimit=self.CLAHE_CLIP, tileGridSize=(8, 8))

        idx = dict(algorithm=1, trees=5)
        sch = dict(checks=50)
        self.flann = cv2.FlannBasedMatcher(idx, sch)

        self.loftr = None
        self.initialized = False
        self.state = "GLOBAL_SCAN"

        self.last_x = self.last_y = None
        self.lost_frames = 0
        self.low_conf_frames = 0
        self.track_radius = self.TRACK_RADIUS
        self.smoothed_x = self.smoothed_y = None

    # ── 初始化 ──

    def load_map(self, map_path):
        if not os.path.exists(map_path):
            return {"status": "error", "message": f"map not found: {map_path}"}

        self._map_path = map_path
        self.big_map = cv2.imread(map_path)
        if self.big_map is None:
            return {"status": "error", "message": f"failed to load: {map_path}"}

        self.map_h, self.map_w = self.big_map.shape[:2]
        cache_path = os.path.join(os.path.dirname(map_path), self.CACHE_FILE)

        if os.path.exists(cache_path):
            try:
                with open(cache_path, "rb") as f:
                    c = pickle.load(f)
                self.kp_big = []
                for k in c["kp"]:
                    pt = k[0]
                    self.kp_big.append(cv2.KeyPoint(pt[0], pt[1], k[1], k[2], k[3], int(k[4]), int(k[5])))
                self.des_big = c["des"].astype(np.float32)
                print(f"[SIFT] cached {len(self.kp_big)} features", file=sys.stderr, flush=True)
            except Exception:
                os.remove(cache_path)

        if self.kp_big is None or self.des_big is None:
            gray = cv2.cvtColor(self.big_map, cv2.COLOR_BGR2GRAY)
            gray = self.clahe.apply(gray)
            print(f"[SIFT] extracting from {self.map_w}x{self.map_h}...", file=sys.stderr, flush=True)
            self.kp_big, self.des_big = self.sift.detectAndCompute(gray, None)
            self.des_big = self.des_big.astype(np.float32)
            kd = [(kp.pt, kp.size, kp.angle, kp.response, kp.octave, kp.class_id) for kp in self.kp_big]
            with open(cache_path, "wb") as f:
                pickle.dump({"kp": kd, "des": self.des_big}, f)
            print(f"[SIFT] saved {len(self.kp_big)} features", file=sys.stderr, flush=True)

        # LoFTR（首次加载会下载模型 ~50MB，仅一次）
        if self.loftr is None:
            try:
                self.loftr = LoftrEngine()
            except Exception as e:
                print(f"[LoFTR] init failed: {e}, fallback to SIFT-only", file=sys.stderr, flush=True)
                self.loftr = None

        self.initialized = True
        return {"status": "ok", "type": "init", "features": len(self.kp_big),
                "map_w": self.map_w, "map_h": self.map_h}

    # ── 预处理 ──

    def _preprocess(self, img_bgr):
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        return self.clahe.apply(gray)

    # ── SIFT 全局扫描 ──

    def _sift_global(self, mini_gray, mh, mw):
        return self._match_features(mini_gray, mh, mw, self.kp_big, self.des_big, 0, 0, "global")

    # ── 通用 SIFT 特征匹配 ──

    def _match_features(self, mini_gray, mh, mw, big_kp, big_des, offset_x, offset_y, tag=""):
        kp_mini, des_mini = self.sift.detectAndCompute(mini_gray, None)
        if des_mini is None or len(kp_mini) < 2:
            print(f"[{tag}] features: {0 if des_mini is None else len(kp_mini)}", file=sys.stderr, flush=True)
            return None

        des_mini = des_mini.astype(np.float32)
        matches = self.flann.knnMatch(des_mini, big_des, k=2)
        good = [m for pair in matches if len(pair) == 2 and (m := pair[0]).distance < self.MATCH_RATIO * pair[1].distance]
        if len(good) < self.MIN_MATCHES:
            print(f"[{tag}] good: {len(good)}/{len(matches)}", file=sys.stderr, flush=True)
            return None

        src = np.float32([kp_mini[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
        dst = np.float32([big_kp[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)
        M, mask = cv2.findHomography(src, dst, cv2.RANSAC, self.RANSAC_THRESH)
        if M is None:
            print(f"[{tag}] homography fail ({len(good)} matches)", file=sys.stderr, flush=True)
            return None

        c = cv2.perspectiveTransform(np.float32([[[mw / 2, mh / 2]]]), M)
        cx, cy = int(c[0][0][0]) + offset_x, int(c[0][0][1]) + offset_y
        n_inlier = int(mask.sum())
        print(f"[{tag}] ({cx},{cy}) m={len(good)} i={n_inlier}", file=sys.stderr, flush=True)
        return cx, cy, len(good), n_inlier

    # ── LoFTR 局部追踪 ──

    def _loftr_track(self, mini_bgr):
        x1 = max(0, int(self.smoothed_x or self.last_x) - self.track_radius)
        y1 = max(0, int(self.smoothed_y or self.last_y) - self.track_radius)
        x2 = min(self.map_w, int(self.smoothed_x or self.last_x) + self.track_radius)
        y2 = min(self.map_h, int(self.smoothed_y or self.last_y) + self.track_radius)

        local = self.big_map[y1:y2, x1:x2]
        if local.shape[0] < 16 or local.shape[1] < 16:
            return None

        t_mini = self.loftr.preprocess(mini_bgr)
        t_local = self.loftr.preprocess(local)
        corr = self.loftr.match(t_mini, t_local)

        mk0 = corr["keypoints0"].cpu().numpy()
        mk1 = corr["keypoints1"].cpu().numpy()
        conf = corr["confidence"].cpu().numpy()

        valid = conf > self.LOFTR_CONF
        mk0, mk1 = mk0[valid], mk1[valid]

        if len(mk0) < self.LOFTR_MIN_MATCH:
            return None

        M, _ = cv2.findHomography(mk0, mk1, cv2.RANSAC, self.LOFTR_RANSAC)
        if M is None:
            return None

        h, w = mini_bgr.shape[:2]
        c = cv2.perspectiveTransform(np.float32([[[w / 2, h / 2]]]), M)
        cx, cy = int(c[0][0][0]) + x1, int(c[0][0][1]) + y1
        return cx, cy, len(mk0)

    # ── 匹配主入口 ──

    def match(self, image_path, mode="auto"):
        if not self.initialized:
            return {"status": "error", "message": "not initialized"}

        if not os.path.exists(image_path):
            return {"status": "error", "message": f"file not found: {image_path}"}

        minimap = cv2.imread(image_path)
        if minimap is None:
            return {"status": "error", "message": "failed to read minimap"}

        mini_gray = self._preprocess(minimap)
        mh, mw = mini_gray.shape

        # ── 状态机 ──
        if mode == "global" or self.state == "GLOBAL_SCAN":
            r = self._sift_global(mini_gray, mh, mw)
            state = "global"
            if r is not None:
                cx, cy, num_match, num_inlier = r
                found = True
                self.lost_frames = 0
                self.track_radius = self.TRACK_RADIUS
                self.state = "LOCAL_TRACK"
            else:
                self.lost_frames += 1
                return {"status": "ok", "type": "match", "x": -1, "y": -1, "confidence": 0.0,
                        "matches": num_match, "inliers": num_inlier, "mode": state,
                        "message": "sift global failed"}
        else:
            # LoFTR 局部追踪（DML GPU）
            r = self._loftr_track(minimap)
            state = "track"
            if r is not None:
                rx, ry, n = r
                if 0 <= rx < self.map_w and 0 <= ry < self.map_h:
                    if self.smoothed_x is None:
                        self.smoothed_x, self.smoothed_y = float(rx), float(ry)
                    else:
                        d = np.sqrt((rx - self.smoothed_x) ** 2 + (ry - self.smoothed_y) ** 2)
                        if d < self.OUTLIER_THRESH:
                            a = self.SMOOTH_ALPHA_STILL if d < self.MOVE_THRESH else self.SMOOTH_ALPHA_MOVE
                            self.smoothed_x = a * rx + (1 - a) * self.smoothed_x
                            self.smoothed_y = a * ry + (1 - a) * self.smoothed_y
                            found = True
                    if found:
                        self.last_x, self.last_y = int(self.smoothed_x), int(self.smoothed_y)
                        self.lost_frames = 0
                        self.track_radius = self.TRACK_RADIUS
            else:
                self.lost_frames += 1
                if self.lost_frames == 1:
                    self.track_radius += 300

            if not found:
                if self.lost_frames >= self.MAX_LOST_FRAMES:
                    print(f"[track] lost → GLOBAL", file=sys.stderr, flush=True)
                    self.state = "GLOBAL_SCAN"
                    self.lost_frames = 0
                    self.smoothed_x = self.smoothed_y = None
                return {"status": "ok", "type": "match", "x": -1, "y": -1, "confidence": 0.0,
                        "matches": 0, "inliers": 0, "mode": state}

        if not found:
            return {"status": "ok", "type": "match", "x": -1, "y": -1, "confidence": 0.0,
                    "matches": num_match if 'num_match' in dir() else 0,
                    "inliers": num_inlier if 'num_inlier' in dir() else 0,
                    "mode": state}

        # global 模式统一平滑；track 模式 LoFTR 内部已处理
        if state == "global":
            if self.smoothed_x is None:
                self.smoothed_x = float(cx)
                self.smoothed_y = float(cy)
            else:
                dist = np.sqrt((cx - self.smoothed_x) ** 2 + (cy - self.smoothed_y) ** 2)
                if dist < self.OUTLIER_THRESH:
                    a = self.SMOOTH_ALPHA_STILL if dist < self.MOVE_THRESH else self.SMOOTH_ALPHA_MOVE
                    self.smoothed_x = a * cx + (1 - a) * self.smoothed_x
                    self.smoothed_y = a * cy + (1 - a) * self.smoothed_y
            self.last_x = int(self.smoothed_x)
            self.last_y = int(self.smoothed_y)

        ref = self._crop_big_map(self.last_x, self.last_y, 50)
        return {"status": "ok", "type": "match",
                "x": self.last_x, "y": self.last_y,
                "confidence": round(num_inlier / max(num_match, 1), 4) if num_match > 0 else 0.99,
                "matches": num_match, "inliers": num_inlier,
                "mode": state,
                "reference_png_b64": ref}

    def _crop_big_map(self, cx, cy, half):
        x1 = max(0, cx - half)
        y1 = max(0, cy - half)
        x2 = min(self.map_w, cx + half)
        y2 = min(self.map_h, cy + half)
        crop = self.big_map[y1:y2, x1:x2]
        _, buf = cv2.imencode(".png", crop)
        return base64.b64encode(buf).decode("ascii")

    # ── 颜色校准 ──

    def calibrate(self, image_path, calib_x, calib_y, tolerance=None):
        """用截取的小地图作为颜色参考，直方图匹配大地图，消除色差。
        仅在置信度极高且匹配位置接近校准点时生效。
        容差 = tolerance 或 map_size / 1000"""
        if not self.initialized:
            return {"status": "error", "message": "not initialized"}
        if not os.path.exists(image_path):
            return {"status": "error", "message": "reference image not found"}

        if tolerance is None:
            tolerance = float(max(self.map_w, self.map_h)) / 1000.0

        ref = cv2.imread(image_path)
        if ref is None:
            return {"status": "error", "message": "failed to read reference"}

        # SIFT 匹配验证
        mini_gray = self._preprocess(ref)
        mh, mw = mini_gray.shape
        kp_mini, des_mini = self.sift.detectAndCompute(mini_gray, None)
        if des_mini is None or len(kp_mini) < 3:
            return {"status": "error", "message": f"reference has too few features ({len(kp_mini) if kp_mini else 0})"}

        des_mini = des_mini.astype(np.float32)
        matches = self.flann.knnMatch(des_mini, self.des_big, k=2)
        good = [m for pair in matches if len(pair) == 2 and (m := pair[0]).distance < self.MATCH_RATIO * pair[1].distance]

        if len(good) < 5:
            return {"status": "error", "message": f"not enough matches for calibration: {len(good)}"}

        src = np.float32([kp_mini[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
        dst = np.float32([self.kp_big[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)
        M, mask = cv2.findHomography(src, dst, cv2.RANSAC, self.RANSAC_THRESH)
        if M is None:
            return {"status": "error", "message": "calibration homography failed"}

        c = cv2.perspectiveTransform(np.float32([[[mw / 2, mh / 2]]]), M)
        cx, cy = int(c[0][0][0]), int(c[0][0][1])
        inliers = int(mask.sum())
        conf = inliers / len(good)

        dist = np.sqrt((cx - calib_x) ** 2 + (cy - calib_y) ** 2)
        if dist > tolerance:
            return {"status": "error",
                    "message": f"position mismatch: matched ({cx},{cy}) vs calib ({calib_x},{calib_y}), dist={dist:.0f} > {tolerance:.0f}"}

        # ── 直方图匹配：大地图 → 参考图（小地图）的色调 ──
        map_path = getattr(self, '_map_path', None)
        if map_path is None:
            return {"status": "error", "message": "no map path"}

        original = cv2.imread(map_path)
        if original is None:
            return {"status": "error", "message": "failed to reload original map"}

        print(f"[calibrate] matched ({cx},{cy}) conf={conf:.2f}, applying histogram match...", file=sys.stderr, flush=True)
        adjusted = self._histogram_match(original, ref)

        self.big_map = adjusted
        gray = cv2.cvtColor(adjusted, cv2.COLOR_BGR2GRAY)
        gray = self.clahe.apply(gray)
        print(f"[SIFT] re-extracting after calibration...", file=sys.stderr, flush=True)
        self.kp_big, self.des_big = self.sift.detectAndCompute(gray, None)
        self.des_big = self.des_big.astype(np.float32)
        self.state = "GLOBAL_SCAN"
        self.lost_frames = 0
        self.low_conf_frames = 0
        self.smoothed_x = self.smoothed_y = None
        self.last_x = self.last_y = None

        cv2.imwrite("big_map_calibrated.png", adjusted)

        return {"status": "ok", "type": "calibrate",
                "matched_x": cx, "matched_y": cy, "confidence": round(conf, 4),
                "features": len(self.kp_big)}

    @staticmethod
    def _histogram_match(source, reference):
        """逐通道直方图匹配：source 的色调 → reference 的色调"""
        result = source.copy().astype(np.uint8)
        for ch in range(3):
            src_hist, _ = np.histogram(source[:, :, ch].ravel(), 256, [0, 256])
            ref_hist, _ = np.histogram(reference[:, :, ch].ravel(), 256, [0, 256])
            src_cdf = src_hist.cumsum().astype(np.float64)
            ref_cdf = ref_hist.cumsum().astype(np.float64)
            src_cdf = src_cdf / src_cdf[-1]
            ref_cdf = ref_cdf / ref_cdf[-1]
            lut = np.interp(src_cdf, ref_cdf, np.arange(256))
            result[:, :, ch] = lut[source[:, :, ch]].astype(np.uint8)
        return result

    # ── 颜色调整 ── (手动模式保留以备不时之需)
        """调整大地图的 RGB 通道增益/亮度/对比度，重建 SIFT 特征。
        游戏小地图偏黄 → 增加蓝色增益(b_gain>1.0)或降低红色增益(r_gain<1.0)"""
        map_path = getattr(self, '_map_path', None)
        if map_path is None:
            return {"status": "error", "message": "no map loaded"}

        # 重新读取原始大地图
        original = cv2.imread(map_path)
        if original is None:
            return {"status": "error", "message": "failed to reload map"}

        # 通道增益
        b, g, r = cv2.split(original.astype(np.float32))
        b *= b_gain
        g *= g_gain
        r *= r_gain
        adjusted = cv2.merge([b, g, r])

        # 亮度 + 对比度
        adjusted = contrast * adjusted + brightness
        adjusted = np.clip(adjusted, 0, 255).astype(np.uint8)

        self.big_map = adjusted
        self.map_h, self.map_w = adjusted.shape[:2]

        gray = cv2.cvtColor(adjusted, cv2.COLOR_BGR2GRAY)
        gray = self.clahe.apply(gray)
        print(f"[SIFT] re-extracting with color adjust r={r_gain:.2f} g={g_gain:.2f} b={b_gain:.2f}...", file=sys.stderr, flush=True)
        self.kp_big, self.des_big = self.sift.detectAndCompute(gray, None)
        self.des_big = self.des_big.astype(np.float32)
        self.state = "GLOBAL_SCAN"
        self.lost_frames = 0
        self.low_conf_frames = 0
        self.smoothed_x = self.smoothed_y = None
        self.last_x = self.last_y = None

        # 保存调整后的大地图供参考预览
        cv2.imwrite("big_map_adjusted.png", adjusted)

        return {"status": "ok", "type": "recolor", "features": len(self.kp_big)}


# ── main ──

def main():
    m = SIFTMatcher()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError as e:
            print(json.dumps({"status": "error", "message": f"invalid json: {e}"}), flush=True)
            continue

        cmd = req.get("cmd")
        try:
            if cmd == "init":
                r = m.load_map(req.get("map_path", ""))
            elif cmd == "match":
                r = m.match(req.get("image_path", ""), req.get("mode", "auto"))
            elif cmd == "calibrate":
                r = m.calibrate(
                    image_path=req.get("image_path", ""),
                    calib_x=req.get("calib_x", 0),
                    calib_y=req.get("calib_y", 0),
                    tolerance=req.get("tolerance", 50),
                )
            elif cmd == "recolor":
                r = m.recolor(
                    r_gain=req.get("r", 1.0),
                    g_gain=req.get("g", 1.0),
                    b_gain=req.get("b", 1.0),
                    brightness=req.get("brightness", 0),
                    contrast=req.get("contrast", 1.0),
                )
            elif cmd == "reset":
                m.state = "GLOBAL_SCAN"
                m.last_x = m.last_y = None
                m.lost_frames = 0
                m.low_conf_frames = 0
                m.smoothed_x = m.smoothed_y = None
                r = {"status": "ok", "type": "reset"}
            elif cmd == "ping":
                r = {"status": "ok", "type": "ping"}
            elif cmd == "quit":
                break
            else:
                r = {"status": "error", "message": f"unknown cmd: {cmd}"}
        except Exception as exc:
            import traceback
            r = {"status": "error", "message": f"exception: {exc}", "traceback": traceback.format_exc()}

        try:
            print(json.dumps(r), flush=True)
        except Exception:
            print(json.dumps({"status": "error", "message": "failed to serialize response"}), flush=True)


if __name__ == "__main__":
    main()
