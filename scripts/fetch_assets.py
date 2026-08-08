#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Fetch large binary assets (embedding model + ONNX WASM) for 收藏大脑.

These files are intentionally NOT committed to git (see .gitignore).
Run this script ONCE after cloning:

    python scripts/fetch_assets.py

It pulls from China-friendly mirrors:
  - model : https://hf-mirror.com/Xenova/bge-small-zh-v1.5
  - wasm  : https://registry.npmmirror.com/@xenova/transformers
"""

import os
import sys
import time
import tarfile
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

UA = {"User-Agent": "Mozilla/5.0"}


def log(msg):
    print(msg, flush=True)


def get_remote_size(url):
    """Return total bytes via a Range request, or None."""
    try:
        req = urllib.request.Request(url, headers={**UA, "Range": "bytes=0-0"})
        with urllib.request.urlopen(req, timeout=30) as r:
            cr = r.headers.get("Content-Range", "")
            return int(cr.split("/")[-1])
    except Exception as e:  # noqa
        return None


def download_file(url, out_path, resume=True, max_retries=20):
    """Download with resume support. Returns True on success."""
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    total = get_remote_size(url)
    if total is None:
        log(f"  SKIP (cannot determine size): {out_path}")
        return False
    for attempt in range(max_retries):
        start = os.path.getsize(out_path) if (resume and os.path.exists(out_path)) else 0
        if start >= total:
            log(f"  OK (cached) {out_path}  [{total // 1024} KB]")
            return True
        req = urllib.request.Request(url, headers={**UA, "Range": f"bytes={start}-"})
        try:
            with urllib.request.urlopen(req, timeout=120) as r, open(out_path, "ab") as f:
                while True:
                    buf = r.read(1024 * 1024)
                    if not buf:
                        break
                    f.write(buf)
            log(f"  OK {out_path}  [{os.path.getsize(out_path) // 1024} KB]")
            return True
        except Exception as e:  # noqa
            log(f"  retry {attempt + 1}/{max_retries} {out_path}: {e}")
            time.sleep(2)
    log(f"  FAILED {out_path}")
    return False


def fetch_model():
    base = "https://hf-mirror.com/Xenova/bge-small-zh-v1.5/resolve/main"
    files = {
        "config.json": f"{base}/config.json",
        "tokenizer.json": f"{base}/tokenizer.json",
        "tokenizer_config.json": f"{base}/tokenizer_config.json",
        "special_tokens_map.json": f"{base}/special_tokens_map.json",
        "onnx/model_quantized.onnx": f"{base}/onnx/model_quantized.onnx",
    }
    log(">> model files (bge-small-zh-v1.5)")
    for rel, url in files.items():
        download_file(url, os.path.join(ROOT, "models", "bge-small-zh-v1.5", rel))


def fetch_transformers():
    log(">> transformers.js + ONNX WASM (from npm tarball)")
    tgz_url = "https://registry.npmmirror.com/@xenova/transformers/-/transformers-2.17.1.tgz"
    tgz_local = os.path.join(ROOT, ".tmp_transformers.tgz")
    if not download_file(tgz_url, tgz_local, resume=False):
        return
    want = {
        "package/dist/transformers.min.js": "lib/transformers/transformers.js",
        "package/dist/ort-wasm-simd.wasm": "lib/transformers/ort-wasm-simd.wasm",
        "package/dist/ort-wasm-simd-threaded.wasm": "lib/transformers/ort-wasm-simd-threaded.wasm",
    }
    try:
        with tarfile.open(tgz_local) as tf:
            for src, dest in want.items():
                try:
                    member = tf.getmember(src)
                    data = tf.extractfile(member).read()
                    out = os.path.join(ROOT, dest)
                    os.makedirs(os.path.dirname(out), exist_ok=True)
                    with open(out, "wb") as f:
                        f.write(data)
                    log(f"  extracted {dest}  [{len(data) // 1024} KB]")
                except KeyError:
                    log(f"  MISSING in tarball: {src}")
    finally:
        if os.path.exists(tgz_local):
            os.remove(tgz_local)
    log("  done.")


def main():
    log("=" * 60)
    log("收藏大脑 · 拉取大体积资源")
    log("=" * 60)
    fetch_model()
    fetch_transformers()
    log("=" * 60)
    log("完成。现在用任意静态服务器托管本目录即可：")
    log("  python -m http.server 8000")
    log("=" * 60)


if __name__ == "__main__":
    sys.exit(main())
