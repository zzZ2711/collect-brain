#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Fetch large binary assets (embedding model + 图像分类模型 + ONNX WASM) for 收藏大脑.

These files are intentionally NOT committed to git (see .gitignore).
Run this script ONCE after cloning, with a HuggingFace token (HF 现在下载强制要 token):

    export HF_TOKEN=hf_xxx          # 你的免费 read token
    python scripts/fetch_assets.py

It pulls from:
  - model : https://huggingface.co/Xenova/bge-small-zh-v1.5   (中文 embedding)
  - image : https://huggingface.co/Xenova/vit-base-patch16-224 (端侧截图识别)
  - wasm  : https://registry.npmmirror.com/@xenova/transformers (ONNX WASM)

若走代理，请同时设置：
    export HTTP_PROXY=http://127.0.0.1:26001
    export HTTPS_PROXY=http://127.0.0.1:26001
（脚本会自动读取这两个环境变量；urllib 也会读取它们。）
"""

import os
import sys
import time
import tarfile
import urllib.request
import urllib.error
from pathlib import Path

# 本机托管 Python 在导入 tarfile/urllib 后 os.path 会被解绑/自引用，
# 因此本脚本一律用 pathlib 处理路径，绝不依赖 os.path。
ROOT = Path(__file__).resolve().parent.parent

UA = {"User-Agent": "Mozilla/5.0"}


def log(msg):
    print(msg, flush=True)


def _headers(extra=None):
    h = dict(UA)
    if extra:
        h.update(extra)
    tok = os.environ.get("HF_TOKEN")
    if tok:
        h["Authorization"] = "Bearer " + tok
    return h


def get_remote_size(url, headers=None):
    """Return total bytes via a Range request, or None."""
    try:
        req = urllib.request.Request(url, headers={**(headers or UA), "Range": "bytes=0-0"})
        with urllib.request.urlopen(req, timeout=30) as r:
            cr = r.headers.get("Content-Range", "")
            return int(cr.split("/")[-1])
    except Exception:  # noqa
        return None


def download_file(url, out_path, headers=None, resume=True, max_retries=20, sleep=1.5):
    """Download with resume support. Returns True on success."""
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    total = get_remote_size(url, headers)
    if total is None:
        log(f"  SKIP (无法获取大小/不可达): {out_path}")
        return False
    start = out_path.stat().st_size if (resume and out_path.exists()) else 0
    for attempt in range(max_retries):
        if start >= total:
            log(f"  OK (已缓存) {out_path}  [{total // 1024} KB]")
            return True
        req = urllib.request.Request(url, headers={**(headers or UA), "Range": f"bytes={start}-"})
        try:
            with urllib.request.urlopen(req, timeout=120) as r, open(out_path, "ab") as f:
                while True:
                    buf = r.read(1024 * 1024)
                    if not buf:
                        break
                    f.write(buf)
            log(f"  OK {out_path}  [{out_path.stat().st_size // 1024} KB]")
            return True
        except Exception as e:  # noqa
            log(f"  retry {attempt + 1}/{max_retries} {out_path}: {e}")
            time.sleep(sleep)
    log(f"  FAILED {out_path}")
    return False


def fetch_hf_file(repo_id, rel_path, out_path, try_mirror=True):
    """Try huggingface.co (with token) first, then hf-mirror (no token)."""
    hf_url = f"https://huggingface.co/{repo_id}/resolve/main/{rel_path}"
    if download_file(hf_url, out_path, headers=_headers()):
        return True
    if try_mirror:
        mirror_url = f"https://hf-mirror.com/{repo_id}/resolve/main/{rel_path}"
        if download_file(mirror_url, out_path, headers=_headers({}), max_retries=3, sleep=1):
            return True
    return False


def fetch_model():
    repo = "Xenova/bge-small-zh-v1.5"
    files = [
        "config.json",
        "tokenizer.json",
        "tokenizer_config.json",
        "special_tokens_map.json",
        "onnx/model_quantized.onnx",
    ]
    log(">> 文本 embedding 模型 (bge-small-zh-v1.5)")
    for rel in files:
        fetch_hf_file(repo, rel, ROOT / "models" / "bge-small-zh-v1.5" / rel)


def fetch_image_model():
    repo = "Xenova/vit-base-patch16-224"
    files = [
        "config.json",
        "preprocessor_config.json",
        "onnx/model_quantized.onnx",
    ]
    log(">> 图像分类模型 (vit-base-patch16-224, 端侧截图识别)")
    for rel in files:
        fetch_hf_file(repo, rel, ROOT / "models" / "vit-base-patch16-224" / rel)


def fetch_transformers():
    log(">> transformers.js + ONNX WASM (from npm tarball)")
    tgz_url = "https://registry.npmmirror.com/@xenova/transformers/-/transformers-2.17.1.tgz"
    tgz_local = ROOT / ".tmp_transformers.tgz"
    if not download_file(tgz_url, tgz_local, resume=False, headers=_headers({})):
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
                    out = ROOT / dest
                    out.parent.mkdir(parents=True, exist_ok=True)
                    with open(out, "wb") as f:
                        f.write(data)
                    log(f"  extracted {dest}  [{len(data) // 1024} KB]")
                except KeyError:
                    log(f"  MISSING in tarball: {src}")
    finally:
        if tgz_local.exists():
            tgz_local.unlink()
    log("  done.")


def main():
    # 命令行参数：可选过滤要拉取的资源，省时省流量
    #   python scripts/fetch_assets.py image    只拉图像分类模型
    #   python scripts/fetch_assets.py bge      只拉文本 embedding 模型
    #   python scripts/fetch_assets.py wasm     只拉 transformers.js + ONNX WASM
    #   不带参数：全部拉取
    want = set(sys.argv[1:]) if len(sys.argv) > 1 else {"all"}
    log("=" * 60)
    log("收藏大脑 · 拉取大体积资源")
    log("=" * 60)
    if not os.environ.get("HF_TOKEN"):
        log("⚠️ 未检测到 HF_TOKEN 环境变量。")
        log("   HuggingFace 现在下载强制要求 token，请先创建免费 read token：")
        log("   https://huggingface.co/settings/tokens  → New token (read) → 复制")
        log("   然后执行： export HF_TOKEN=hf_xxxx  再运行本脚本。")
        log("   （仅用于本次下载，无需上传到任何地方）")
    if "all" in want or "bge" in want:
        fetch_model()
    if "all" in want or "image" in want:
        fetch_image_model()
    if "all" in want or "wasm" in want:
        fetch_transformers()
    log("=" * 60)
    log("完成。现在用任意静态服务器托管本目录即可：")
    log("  python -m http.server 8000")
    log("=" * 60)


if __name__ == "__main__":
    sys.exit(main())
