/* 收藏大脑 · 扫码落地页
 * 手机扫码 → 打开 recv.html#<payload> → 解压 → 本地向量化 → 写入 IndexedDB → 跳转主页
 * payload = base64url( gzip( JSON.stringify(收藏数组) ) )
 */
(function () {
  "use strict";
  const QUERY_PREFIX = "为这个句子生成表示以用于检索相关文章：";
  const $msg = document.getElementById("recv-msg");
  const $bar = document.getElementById("recv-bar-fill");
  const $detail = document.getElementById("recv-detail");

  function setMsg(t) { $msg.textContent = t; }

  // ---- transformers 加载（与 app.js 一致）----
  function whenTransformersReady(timeoutMs) {
    timeoutMs = timeoutMs || 60000;
    if (window.transformers) return Promise.resolve(true);
    return new Promise((resolve) => {
      let done = false;
      const onReady = () => { if (done) return; done = true; window.removeEventListener("transformers-ready", onReady); resolve(true); };
      window.addEventListener("transformers-ready", onReady);
      setTimeout(() => { if (done) return; done = true; window.removeEventListener("transformers-ready", onReady); resolve(false); }, timeoutMs);
    });
  }
  async function loadModel() {
    const T = window.transformers;
    if (!T) throw new Error("transformers.js 未加载");
    T.env.allowRemoteModels = false;
    T.env.localModelPath = "/models/";
    T.env.wasm = T.env.wasm || {};
    T.env.wasm.wasmPaths = "/lib/transformers/";
    T.env.wasm.numThreads = 1;
    return await T.pipeline("feature-extraction", "bge-small-zh-v1.5", {
      quantized: true,
      progress_callback: (p) => {
        if (p && p.status === "progress" && p.total) {
          const pct = Math.round((p.loaded / p.total) * 100);
          $bar.style.width = pct + "%";
          setMsg("正在加载语义模型 " + pct + "%");
        }
      },
    });
  }
  async function embed(texts, isQuery) {
    const inputs = texts.map((t) => (isQuery ? QUERY_PREFIX + t : t));
    const out = await extractor(inputs, { pooling: "cls", normalize: true });
    return out.tolist();
  }

  // ---- IndexedDB（与 app.js 同库同表）----
  const IDB_NAME = "cbrain", IDB_STORE = "favorites";
  function openIDB() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(IDB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(IDB_STORE, { keyPath: "_id" });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function idbPut(doc) {
    const c = await openIDB();
    return new Promise((res, rej) => {
      const tx = c.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(doc);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }

  // ---- base64url 解码（兼容中文/二进制）----
  function b64urlToBytes(s) {
    let b = s.replace(/-/g, "+").replace(/_/g, "/");
    while (b.length % 4) b += "=";
    const bin = atob(b);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  // ---- 主流程 ----
  let extractor = null;
  async function run() {
    try {
      const hash = location.hash.replace(/^#/, "");
      if (!hash) { setMsg("链接无效：缺少分享数据"); return; }
      setMsg("正在解压分享数据…");
      const bytes = b64urlToBytes(hash);
      const json = pako.inflate(bytes, { to: "string" });
      const arr = JSON.parse(json);
      if (!Array.isArray(arr) || !arr.length) { setMsg("分享数据为空"); return; }
      $detail.textContent = "收到 " + arr.length + " 条收藏，准备导入";

      setMsg("正在加载语义模型…");
      await whenTransformersReady();
      extractor = await loadModel();

      setMsg("正在本地向量化并写入…");
      const B = 16;
      let ok = 0;
      for (let i = 0; i < arr.length; i += B) {
        const slice = arr.slice(i, i + B);
        const texts = slice.map((d) => (d.title || "") + (d.note ? " " + d.note : ""));
        const embs = await embed(texts, false);
        for (let j = 0; j < slice.length; j++) {
          const d = slice[j];
          const doc = {
            _id: "qr_" + Date.now() + "_" + i + "_" + j + "_" + Math.random().toString(36).slice(2, 6),
            title: (d.title || "").toString().slice(0, 120),
            note: (d.note || "").toString().slice(0, 2000),
            author: (d.author || "").toString().slice(0, 80),
            url: (d.url || "").toString().slice(0, 500),
            type: (d.type || "其他").toString().slice(0, 40),
            tags: Array.isArray(d.tags) ? d.tags.slice(0, 20) : [],
            bucket: (d.bucket || "实用").toString().slice(0, 40),
            image: d.image || null,
            source: "qrcode",
            createdAt: Date.now(),
          };
          doc.embedding = embs[j];
          await idbPut(doc);
          ok++;
        }
        $bar.style.width = Math.min(100, Math.round(((i + B) / arr.length) * 100)) + "%";
        $detail.textContent = "已导入 " + ok + " / " + arr.length;
      }

      setMsg("导入完成，正在打开收藏大脑…");
      setTimeout(() => { location.href = "index.html"; }, 900);
    } catch (e) {
      console.error(e);
      setMsg("导入失败：" + (e && e.message ? e.message : "数据损坏或网络异常"));
      $detail.textContent = "请返回电脑重新生成二维码";
    }
  }
  run();
})();
