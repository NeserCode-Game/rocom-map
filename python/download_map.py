"""
下载并拼接洛克王国世界地图瓦片，生成 big_map.png

瓦片坐标范围（EPSG:3857，已验证 at zoom 11）：
  x: 1016..1023 (8 columns)
  y: 1016..1023 (8 rows)
  共 64 张 256x256 瓦片

使用方法：
  python python/download_map.py              # zoom 11 (16384x16384)
  python python/download_map.py --zoom 10     # zoom 10 (8192x8192)
"""

import argparse
import concurrent.futures
import io
import os
import sys
import urllib.request

TILE_BASE = "https://ue.17173cdn.com/a/terra/tiles/rocom/4010_v3_7f2d9c"
TILE_SIZE = 256

# Verified tile extent at zoom 11
TILE_X_MIN, TILE_X_MAX = 1016, 1023
TILE_Y_MIN, TILE_Y_MAX = 1016, 1023
ZOOM = 11

OUTPUT = "big_map.png"


def download_tile(z: int, x: int, y: int, out_dir: str) -> bytes | None:
    url = f"{TILE_BASE}/{z}/{y}_{x}.png?v1"
    try:
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0",
                "Referer": "https://map.17173.com/",
                "Origin": "https://map.17173.com",
            },
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status == 200:
                data = resp.read()
                # Save individual tile for inspection
                fname = f"{out_dir}/{z}_{x}_{y}.png"
                with open(fname, "wb") as f:
                    f.write(data)
                return data
    except Exception as e:
        print(f"  [WARN] tile ({x},{y})@{z}: {e}", file=sys.stderr)
    return None


def main():
    global TILE_X_MIN, TILE_X_MAX, TILE_Y_MIN, TILE_Y_MAX, ZOOM

    parser = argparse.ArgumentParser()
    parser.add_argument("--zoom", type=int, default=11, help="zoom level")
    parser.add_argument("--output", default="big_map.png", help="output PNG path")
    args = parser.parse_args()

    ZOOM = args.zoom
    OUTPUT = args.output

    if ZOOM < 11:
        shift = 11 - ZOOM
        TILE_X_MIN = TILE_X_MIN >> shift
        TILE_X_MAX = (TILE_X_MAX + 1 >> shift) - 1
        TILE_Y_MIN = TILE_Y_MIN >> shift
        TILE_Y_MAX = (TILE_Y_MAX + 1 >> shift) - 1
    elif ZOOM > 11:
        shift = ZOOM - 11
        TILE_X_MIN <<= shift
        TILE_X_MAX = ((TILE_X_MAX + 1) << shift) - 1
        TILE_Y_MIN <<= shift
        TILE_Y_MAX = ((TILE_Y_MAX + 1) << shift) - 1

    tiles_dir = f"tiles_z{ZOOM}"
    os.makedirs(tiles_dir, exist_ok=True)

    cols = int(TILE_X_MAX - TILE_X_MIN + 1)
    rows = int(TILE_Y_MAX - TILE_Y_MIN + 1)
    img_w = cols * TILE_SIZE
    img_h = rows * TILE_SIZE

    print(f"Downloading {cols}x{rows} = {cols*rows} tiles at zoom {ZOOM}")
    print(f"  Output: {img_w}x{img_h} px -> {OUTPUT}")
    print(f"  Tile range: x={TILE_X_MIN}..{TILE_X_MAX}, y={TILE_Y_MIN}..{TILE_Y_MAX}")

    # Download all tiles with progress
    results = {}

    with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
        fut_to_xy = {}
        for ty in range(TILE_Y_MIN, TILE_Y_MAX + 1):
            for tx in range(TILE_X_MIN, TILE_X_MAX + 1):
                fut = pool.submit(download_tile, ZOOM, tx, ty, tiles_dir)
                fut_to_xy[fut] = (tx, ty)

        done = 0
        total = cols * rows
        for fut in concurrent.futures.as_completed(fut_to_xy):
            tx, ty = fut_to_xy[fut]
            data = fut.result()
            if data is not None:
                results[(tx, ty)] = data
            done += 1
            if done % 10 == 0 or done == total:
                print(f"  Progress: {done}/{total}", flush=True)

    print(f"  Downloaded {len(results)}/{total} tiles successfully")

    if len(results) < total * 0.5:
        print("ERROR: too many missing tiles", file=sys.stderr)
        sys.exit(1)

    # Stitch tiles into big map
    import numpy as np
    from PIL import Image

    big = Image.new("RGB", (img_w, img_h))

    for ty in range(TILE_Y_MIN, TILE_Y_MAX + 1):
        for tx in range(TILE_X_MIN, TILE_X_MAX + 1):
            data = results.get((tx, ty))
            if data is None:
                continue
            img = Image.open(io.BytesIO(data)).convert("RGB")
            px = (tx - TILE_X_MIN) * TILE_SIZE
            py = (ty - TILE_Y_MIN) * TILE_SIZE
            big.paste(img, (px, py))

    big.save(OUTPUT)
    print(f"Saved {OUTPUT} ({img_w}x{img_h})")

    # Also save a smaller version for SIFT matching (if too large)
    if img_w > 4096:
        small = big.resize((4096, int(img_h * 4096 / img_w)), Image.LANCZOS)
        small_name = f"big_map_z{ZOOM}_sm.png"
        small.save(small_name)
        print(f"Saved {small_name} ({small.width}x{small.height})")


if __name__ == "__main__":
    main()
