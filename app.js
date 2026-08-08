/* 收藏大脑 — 纯前端版
 * 技术栈：CloudBase Web SDK（CDN 匿名登录 + 可选 NoSQL 同步）
 *         + transformers.js（自托管 bge-small-zh-v1.5，离线向量化）
 *         + IndexedDB（本地索引，含 embedding）
 * 设计：IndexedDB 为主存储；云端数据库为可选同步（未开通也能本地用）。
 */
(function () {
  "use strict";

  const CONFIG = {
    env: "n2711-d2ghk2fjge63cf6f5",
    region: "ap-shanghai",
    accessKey:
      "eyJhbGciOiJSUzI1NiIsImtpZCI6IjhhOTRjN2Q4LTc1NDUtNDA5Yy1hMjQwLTE0MDZmY2U3OTQ0ZiJ9.eyJpc3MiOiJodHRwczovL24yNzExLWQyZ2hrMmZqZ2U2M2NmNmY1LmFwLXNoYW5naGFpLnRjYi1hcGkudGVuY2VudGNsb3VkYXBpLmNvbSIsInN1YiI6ImFub24iLCJhdWQiOiJuMjcxMS1kMmdoazJmamdlNjNjZjZmNSIsImV4cCI6NDA4OTc5MTQ1MSwiaWF0IjoxNzg2MTA4MjUxLCJub25jZSI6ImM0TTlHVDZDUS02X1pfSFJjalNOLXciLCJhdF9oYXNoIjoiYzRNOUdUNkNRLTZfWl9IUmNqU04tdyIsIm5hbWUiOiJBbm9ueW1vdXMiLCJzY29wZSI6ImFub255bW91cyIsInByb2plY3RfaWQiOiJuMjcxMS1kMmdoazJmamdlNjNjZjZmNSIsIm1ldGEiOnsicGxhdGZvcm0iOiJQdWJsaXNoYWJsZUtleSJ9LCJyb2xlIjoiYW5vbiIsImlzX2Fub255bW91cyI6dHJ1ZSwiYXBwX21ldGFkYXRhIjp7InByb3ZpZGVyIjoiYW5vbnltb3VzIiwicHJvdmlkZXJzIjpbImFub255bW91cyJdfSwidXNlcl9tZXRhZGF0YSI6eyJuYW1lIjoiQW5vbnltb3VzIn0sInVzZXJfdHlwZSI6IiIsImNsaWVudF90eXBlIjoiY2xpZW50X3VzZXIiLCJpc19zeXN0ZW1fYWRtaW4iOmZhbHNlfQ.LbOWCBtiabT8cFsrJ3o0qgHb6mRnQpgFsrTmZA0qGAZ9Kbj2hSR845c2L6za5tZty5i1skdknNMFig77dD3vbHanUpl33_Ge7VfRbccmPW7dyekxI5rdKpwgQc_2OiLQ3oOVxkQWUfQcPTJR6QfcHUeLt9beeCVnBH1WAwLqEPNUt3IBvuBZRsS7td-YX6rXTfWJWpPRn8LaFVikTq-dueN0_Cg5UU2tzBx_5Gq_aV4hKCBBGng5e7JNgqeiRY3j-NrAyzURPp5HZc4vf0NpISNSQ4BZL55IZjYOyKxXpG9EN3TrER1qKWnRvP4wNKsBHvqkXDfgQOKkGEb3WRJxYg",
  };
  const COLL = "favorites";
  const QUERY_PREFIX = "为这个句子生成表示以用于检索相关文章：";

  // ---- DOM ----
  const $boot = document.getElementById("boot");
  const $bootMsg = document.getElementById("boot-msg");
  const $bootBar = document.getElementById("boot-bar-fill");
  const $search = document.getElementById("search");
  const $filters = document.getElementById("filters");
  const $results = document.getElementById("results");
  const $empty = document.getElementById("empty");
  const $firstrun = document.getElementById("firstrun");
  const $btnAddMine = document.getElementById("btn-add-mine");
  const $btnLoadDemo = document.getElementById("btn-load-demo");
  const $fab = document.getElementById("fab");
  const $btnImport = document.getElementById("btn-import");
  const $fileInput = document.getElementById("file-input");
  const $btnQr = document.getElementById("btn-qr");
  const $qrModal = document.getElementById("qr-modal");
  const $qrList = document.getElementById("qr-list");
  const $qrGenerate = document.getElementById("qr-generate");
  const $qrResult = document.getElementById("qr-result");
  const $qrImg = document.getElementById("qr-img");
  const $qrLink = document.getElementById("qr-link");
  const $qrWarn = document.getElementById("qr-warn");
  const $modal = document.getElementById("modal");
  const $form = document.getElementById("add-form");
  const $fTitle = document.getElementById("f-title");
  const $fNote = document.getElementById("f-note");
  const $autoCat = document.getElementById("auto-cat");
  const $saveBtn = document.getElementById("save-btn");
  const $toast = document.getElementById("toast");

  // ---- state ----
  let extractor = null;
  let items = [];
  let currentFilter = "全部";
  let cloudReady = false;
  let db = null, auth = null;
  let pendingEmb = null;

  // ---- CloudBase ----
  // 等待 module 加载器把 window.cloudbase 注入（带超时，CDN 失败则本地运行）
  function whenCloudbaseReady(timeoutMs) {
    timeoutMs = timeoutMs || 8000;
    if (window.cloudbase) return Promise.resolve(true);
    return new Promise((resolve) => {
      let done = false;
      const onReady = () => { if (done) return; done = true; window.removeEventListener("cloudbase-ready", onReady); resolve(true); };
      window.addEventListener("cloudbase-ready", onReady);
      setTimeout(() => { if (done) return; done = true; window.removeEventListener("cloudbase-ready", onReady); resolve(false); }, timeoutMs);
    });
  }
  // 等待 transformers.js（ESM module）注入 window.transformers
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
  function initCloud() {
    try {
      const app = cloudbase.init({
        env: CONFIG.env, region: CONFIG.region, accessKey: CONFIG.accessKey,
        auth: { detectSessionInUrl: true },
      });
      auth = app.auth();
      db = app.database();
      return true;
    } catch (e) { console.warn("cloudbase init failed", e); return false; }
  }
  async function ensureLogin() {
    try {
      const { data, error } = await auth.getSession();
      if (error) throw error;
      if (!data || !data.session) {
        const r = await auth.signInAnonymously();
        if (r.error) throw r.error;
      }
      cloudReady = true;
    } catch (e) { console.warn("login failed, local-only mode", e); cloudReady = false; }
  }
  async function pushToCloud(doc) {
    if (!cloudReady) return null;
    try {
      const r = await db.collection(COLL).add({
        title: doc.title, author: doc.author, type: doc.type, tags: doc.tags,
        note: doc.note, url: doc.url, bucket: doc.bucket, source: doc.source,
        createdAt: doc.createdAt,
      });
      return (r && r.id) || null;
    } catch (e) { console.warn("push failed", e); return null; }
  }
  async function removeFromCloud(id) {
    if (!cloudReady || !id || id.indexOf("seed_") === 0 || id.indexOf("local_") === 0) return;
    try { await db.collection(COLL).doc(id).remove(); } catch (e) { console.warn("remove cloud failed", e); }
  }

  // ---- transformers.js（自托管离线）----
  async function loadModel() {
    const T = window.transformers;
    if (!T) throw new Error("transformers.js 未加载");
    T.env.allowRemoteModels = false;
    T.env.localModelPath = "/models/";
    // transformers.js v2.17.1 顶层 env 默认没有 wasm 字段，必须先初始化
    T.env.wasm = T.env.wasm || {};
    T.env.wasm.wasmPaths = "/lib/transformers/";
    // 静态托管无 COOP/COEP，禁用多线程 wasm 避免依赖 SharedArrayBuffer
    T.env.wasm.numThreads = 1;
    extractor = await T.pipeline("feature-extraction", "bge-small-zh-v1.5", {
      quantized: true,
      progress_callback: (p) => {
        if (p && p.status === "progress" && p.total) {
          const pct = Math.round((p.loaded / p.total) * 100);
          $bootBar.style.width = pct + "%";
          $bootMsg.textContent = "正在加载语义模型 " + pct + "%";
        }
      },
    });
  }
  async function embed(texts, isQuery) {
    const inputs = texts.map((t) => (isQuery ? QUERY_PREFIX + t : t));
    const out = await extractor(inputs, { pooling: "cls", normalize: true });
    return out.tolist();
  }

  // ---- IndexedDB ----
  const IDB_NAME = "cbrain", IDB_STORE = "favorites";
  function openIDB() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(IDB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(IDB_STORE, { keyPath: "_id" });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function idbAll() {
    const c = await openIDB();
    return new Promise((res, rej) => {
      const tx = c.transaction(IDB_STORE, "readonly");
      const rq = tx.objectStore(IDB_STORE).getAll();
      rq.onsuccess = () => res(rq.result || []);
      rq.onerror = () => rej(rq.error);
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
  async function idbDelete(id) {
    const c = await openIDB();
    return new Promise((res, rej) => {
      const tx = c.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(id);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }

  // ---- 本地种子导入（仅本地，不写云，避免 126 次写请求）----
  async function importSeed() {
    const resp = await fetch("seed_data.json");
    const seed = await resp.json();
    const B = 16;
    for (let i = 0; i < seed.length; i += B) {
      const slice = seed.slice(i, i + B);
      const texts = slice.map((s) => (s.title || "") + (s.note ? " " + s.note : ""));
      const embs = await embed(texts, false);
      for (let j = 0; j < slice.length; j++) {
        const s = slice[j];
        const doc = {
          _id: "seed_" + (i + j),
          title: s.title || "",
          author: s.author || "",
          type: s.type || "其他",
          tags: Array.isArray(s.tags) ? s.tags : [],
          note: s.note || "",
          url: s.url || "",
          bucket: s.bucket || "实用",
          source: s.source || "",
          createdAt: Date.now(),
          localOnly: true,
        };
        doc.embedding = embs[j];
        doc.isDemo = true;
        await idbPut(doc);
      }
      const pct = Math.min(100, Math.round(((i + B) / seed.length) * 100));
      $bootBar.style.width = pct + "%";
      $bootMsg.textContent = "正在建立本地索引 " + pct + "%";
    }
  }

  // ---- 相似度 & 自动分类 ----
  function cosSim(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
  function autoClassify(emb) {
    let best = null, bestScore = -2;
    for (const it of items) {
      if (!it.embedding) continue;
      const sc = cosSim(emb, it.embedding);
      if (sc > bestScore) { bestScore = sc; best = it; }
    }
    if (best) return { bucket: best.bucket, type: best.type, score: bestScore };
    return { bucket: "实用", type: "其他", score: 0 };
  }

  // ---- 渲染 ----
  function buildFilters() {
    const buckets = Array.from(new Set(items.map((i) => i.bucket).filter(Boolean)));
    const list = ["全部", ...buckets];
    $filters.innerHTML = "";
    for (const b of list) {
      const chip = document.createElement("button");
      chip.className = "filter-chip" + (b === currentFilter ? " is-active" : "");
      chip.textContent = b;
      chip.addEventListener("click", () => { currentFilter = b; buildFilters(); render(); });
      $filters.appendChild(chip);
    }
    // 存在示例数据时才显示「清空示例」按钮
    const hasDemo = items.some((i) => i.isDemo);
    if (hasDemo) {
      const clear = document.createElement("button");
      clear.className = "filter-chip clear-demo";
      clear.textContent = "清空示例";
      clear.addEventListener("click", async () => {
        if (!confirm("确定清空全部示例收藏？（你自己的收藏不受影响）")) return;
        const demos = items.filter((i) => i.isDemo);
        for (const d of demos) { await idbDelete(d._id); await removeFromCloud(d._id); }
        items = items.filter((i) => !i.isDemo);
        buildFilters(); render();
        toast("已清空示例收藏");
      });
      $filters.appendChild(clear);
    }
  }
  function paint(ranked) {
    $results.innerHTML = "";
    const real = ranked.filter((r) => !r.skeleton);
    $empty.hidden = real.length > 0;
    for (const r of ranked) {
      const i = r.i;
      const card = document.createElement("div");
      card.className = "card";
      if (r.skeleton) {
        card.innerHTML = '<div class="card-title">搜索中…</div>';
        $results.appendChild(card);
        continue;
      }
      const h = document.createElement("div"); h.className = "card-title"; h.textContent = i.title || "(无标题)";
      card.appendChild(h);
      if (i.note) { const p = document.createElement("p"); p.className = "card-note"; p.textContent = i.note; card.appendChild(p); }
      const meta = document.createElement("div"); meta.className = "card-meta";
      if (i.type) { const t = document.createElement("span"); t.className = "tag"; t.textContent = i.type; meta.appendChild(t); }
      if (i.bucket) { const b = document.createElement("span"); b.className = "bucket"; b.textContent = "· " + i.bucket; meta.appendChild(b); }
      if (i.isDemo) { const d = document.createElement("span"); d.className = "demo-tag"; d.textContent = "示例"; meta.appendChild(d); }
      if (i.author) { const a = document.createElement("span"); a.className = "card-author"; a.textContent = "by " + i.author; meta.appendChild(a); }
      if (r.score != null && r.score < 1) { const s = document.createElement("span"); s.className = "score"; s.textContent = "相似度 " + (r.score * 100).toFixed(0) + "%"; meta.appendChild(s); }
      card.appendChild(meta);
      if (i.url) card.addEventListener("click", () => window.open(i.url, "_blank"));
      const del = document.createElement("button");
      del.textContent = i.isDemo ? "删除示例" : "删除";
      del.style.cssText = "margin-top:10px;font-size:12px;color:#e5484d;background:none;border:none;cursor:pointer;padding:0;";
      del.addEventListener("click", (e) => { e.stopPropagation(); deleteItem(i); });
      card.appendChild(del);
      $results.appendChild(card);
    }
  }
  function render() {
    const q = $search.value.trim();
    if (q) { searchAndRender(q, currentFilter); return; }
    let list = items;
    if (currentFilter !== "全部") list = list.filter((i) => i.bucket === currentFilter);
    // 空列表：未搜索且当前无数据时，展示首次引导（而非误导性的「没有匹配」）
    if (!list.length && currentFilter === "全部") {
      $firstrun.hidden = false;
      $empty.hidden = true;
      $results.innerHTML = "";
      return;
    }
    $firstrun.hidden = true;
    const ranked = list.map((i) => ({ i, score: 1 }));
    ranked.sort((a, b) => (b.i.createdAt || 0) - (a.i.createdAt || 0));
    paint(ranked.slice(0, 100));
  }
  async function searchAndRender(q, filter) {
    paint([{ i: {}, score: 0, skeleton: true }]);
    let emb;
    try { [emb] = await embed([q], true); } catch (e) { paint([]); return; }
    let list = items;
    if (filter !== "全部") list = list.filter((i) => i.bucket === filter);
    const ranked = list.map((i) => ({ i, score: i.embedding ? cosSim(emb, i.embedding) : -2 }));
    ranked.sort((a, b) => b.score - a.score);
    paint(ranked.slice(0, 50));
  }

  // ---- 增删 ----
  async function deleteItem(i) {
    if (!i._id) return;
    await idbDelete(i._id);
    await removeFromCloud(i._id);
    items = items.filter((x) => x._id !== i._id);
    buildFilters(); render();
    toast("已删除");
  }
  let previewTimer;
  async function previewClassify() {
    const title = $fTitle.value.trim();
    if (!title) { $autoCat.textContent = "自动分类：输入标题后自动分析"; pendingEmb = null; return; }
    if (!extractor) { $autoCat.textContent = "自动分类：模型加载中…"; return; }
    try {
      const [emb] = await embed([title + " " + $fNote.value], false);
      pendingEmb = emb;
      const c = autoClassify(emb);
      $autoCat.textContent = "自动分类：" + c.bucket + " / " + c.type;
    } catch (e) { /* ignore */ }
  }
  $form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = $fTitle.value.trim();
    if (!title) return;
    $saveBtn.disabled = true;
    try {
      const note = $fNote.value.trim();
      let emb = pendingEmb;
      if (!emb) [emb] = await embed([title + (note ? " " + note : "")], false);
      const cat = emb ? autoClassify(emb) : { bucket: "实用", type: "其他" };
      const doc = {
        _id: "local_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
        title, note, author: "", type: cat.type, tags: [], url: "", bucket: cat.bucket,
        source: "", createdAt: Date.now(),
      };
      doc.embedding = emb;
      await idbPut(doc);
      const cid = await pushToCloud(doc);
      if (cid) { doc._id = cid; await idbPut(doc); }
      items.push(doc);
      buildFilters(); render();
      closeModal();
      toast(cid ? "已保存并同步到云端" : "已保存（本地）");
    } catch (err) {
      toast("保存失败：" + (err && err.message ? err.message : "未知错误"));
    } finally { $saveBtn.disabled = false; }
  });
  $fTitle.addEventListener("input", () => { clearTimeout(previewTimer); previewTimer = setTimeout(previewClassify, 450); });
  $fNote.addEventListener("input", () => { clearTimeout(previewTimer); previewTimer = setTimeout(previewClassify, 450); });

  // ---- 弹层 & toast ----
  function openModal() {
    if (!extractor) { toast("模型还在加载，请稍候"); return; }
    $modal.hidden = false;
    $fTitle.value = ""; $fNote.value = ""; pendingEmb = null;
    $autoCat.textContent = "自动分类：输入标题后自动分析";
    setTimeout(() => $fTitle.focus(), 50);
  }
  function closeModal() { $modal.hidden = true; }
  $fab.addEventListener("click", openModal);
  $modal.querySelectorAll("[data-close]").forEach((el) => el.addEventListener("click", closeModal));

  // ---- 首次引导按钮 ----
  $btnAddMine.addEventListener("click", () => { $firstrun.hidden = true; openModal(); });
  $btnLoadDemo.addEventListener("click", async () => {
    $btnLoadDemo.disabled = true;
    $btnLoadDemo.textContent = "正在加载示例…";
    try {
      await importSeed();
      const cached = await idbAll();
      items = cached;
      buildFilters();
      render();
      toast("已载入 126 条示例收藏");
    } catch (e) {
      toast("示例加载失败，请重试");
    } finally {
      $btnLoadDemo.disabled = false;
      $btnLoadDemo.textContent = "浏览示例收藏（126 条演示）";
    }
  });

  // ---- 导入 JSON（来自小红书插件或其他导出）----
  $btnImport.addEventListener("click", () => $fileInput.click());
  $fileInput.addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ""; // 允许重复导入同一文件
    if (!file) return;
    if (!extractor) { toast("模型还在加载，请稍候再导入"); return; }
    $btnImport.disabled = true;
    try {
      const text = await file.text();
      let arr = JSON.parse(text);
      if (!Array.isArray(arr)) arr = [arr];
      // 规范化每条：兼容插件导出与手动格式
      const norm = arr.map((s) => ({
        title: (s.title || s.note_title || "").toString().slice(0, 120),
        note: (s.note || s.content || s.desc || "").toString().slice(0, 2000),
        author: (s.author || s.user || "").toString().slice(0, 80),
        url: (s.url || s.link || "").toString().slice(0, 500),
        type: (s.type || "").toString().slice(0, 40),
        bucket: (s.bucket || "").toString().slice(0, 40),
        tags: Array.isArray(s.tags) ? s.tags.slice(0, 20) : [],
        source: s.source || "import",
      })).filter((d) => d.title || d.note);
      if (!norm.length) { toast("未识别到有效收藏"); return; }
      const B = 16;
      let ok = 0;
      for (let i = 0; i < norm.length; i += B) {
        const slice = norm.slice(i, i + B);
        const texts = slice.map((d) => (d.title || "") + (d.note ? " " + d.note : ""));
        const embs = await embed(texts, false);
        for (let j = 0; j < slice.length; j++) {
          const d = slice[j];
          let cat = { bucket: d.bucket || "实用", type: d.type || "其他" };
          if (!d.bucket || !d.type) {
            const c = autoClassify(embs[j]);
            cat = { bucket: d.bucket || c.bucket, type: d.type || c.type };
          }
          const doc = {
            _id: "imp_" + Date.now() + "_" + i + "_" + j + "_" + Math.random().toString(36).slice(2, 6),
            title: d.title, note: d.note, author: d.author, url: d.url,
            type: cat.type, tags: d.tags, bucket: cat.bucket, source: d.source,
            createdAt: Date.now(),
          };
          doc.embedding = embs[j];
          await idbPut(doc);
          const cid = await pushToCloud(doc);
          if (cid) { doc._id = cid; await idbPut(doc); }
          items.push(doc);
          ok++;
        }
        $btnImport.textContent = "导入中 " + Math.min(ok, norm.length) + "/" + norm.length;
      }
      buildFilters(); render();
      toast("已导入 " + ok + " 条收藏");
    } catch (err) {
      toast("导入失败：" + (err && err.message ? err.message : "文件格式错误"));
    } finally {
      $btnImport.disabled = false;
      $btnImport.textContent = "导入 JSON";
    }
  });
  // ---- 扫码导入手机 ----
  function openQrModal() {
    $qrResult.hidden = true; $qrImg.innerHTML = ""; $qrWarn.hidden = true;
    $qrList.innerHTML = "";
    if (!items.length) { toast("还没有收藏可分享"); return; }
    // 最多展示最近 60 条供勾选
    const list = items.slice(0, 60);
    for (const it of list) {
      const row = document.createElement("label");
      row.className = "qr-row";
      const cb = document.createElement("input");
      cb.type = "checkbox"; cb.value = it._id; cb.checked = true;
      const span = document.createElement("span");
      span.textContent = (it.title || "(无标题)").slice(0, 50) + (it.isDemo ? " · 示例" : "");
      row.appendChild(cb); row.appendChild(span);
      $qrList.appendChild(row);
    }
    $qrModal.hidden = false;
  }
  function closeQrModal() { $qrModal.hidden = true; }
  function bytesToB64url(bytes) {
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  $btnQr.addEventListener("click", openQrModal);
  $qrModal.querySelectorAll("[data-qr-close]").forEach((el) => el.addEventListener("click", closeQrModal));
  $qrGenerate.addEventListener("click", () => {
    const ids = Array.from($qrList.querySelectorAll("input:checked")).map((c) => c.value);
    const sel = items.filter((i) => ids.includes(i._id));
    if (!sel.length) { toast("请至少勾选一条"); return; }
    const compact = sel.map((i) => ({
      title: i.title || "", note: i.note || "", author: i.author || "",
      url: i.url || "", type: i.type || "", bucket: i.bucket || "",
      tags: Array.isArray(i.tags) ? i.tags : [],
    }));
    const json = JSON.stringify(compact);
    const gz = pako.gzip(new TextEncoder().encode(json));
    const payload = bytesToB64url(gz);
    const url = location.origin + location.pathname.replace(/[^/]*$/, "") + "recv.html#" + payload;
    $qrLink.href = url; $qrLink.textContent = url.length > 60 ? url.slice(0, 57) + "…" : url;
    // 二维码容量上限（约 2900 字节），超限提示用链接代替
    const QR_MAX = 2200;
    $qrImg.innerHTML = "";
    if (payload.length <= QR_MAX) {
      const typeNumber = 0; // 自动选择版本
      const qr = qrcode(typeNumber, "L");
      qr.addData(payload);
      qr.make();
      $qrImg.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 8 });
      $qrWarn.hidden = true;
    } else {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("width", "180"); svg.setAttribute("height", "180");
      svg.innerHTML = '<rect width="180" height="180" fill="#fff" stroke="#ddd"/><text x="90" y="90" text-anchor="middle" font-size="14" fill="#333">数据过大</text>';
      $qrImg.appendChild(svg);
      $qrWarn.hidden = false;
      $qrWarn.textContent = "所选收藏经压缩后仍超过二维码容量，请改用下方链接（手机点开即可导入）。";
    }
    $qrResult.hidden = false;
    // 复制链接到剪贴板（手机同设备可直接点）
    try { navigator.clipboard && navigator.clipboard.writeText(url); } catch (e) {}
  });

  function toast(msg) {
    $toast.textContent = msg; $toast.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => ($toast.hidden = true), 2200);
  }

  let searchTimer;
  $search.addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(render, 250); });

  // ---- 启动 ----
  async function start() {
    try {
      await whenCloudbaseReady();
      initCloud();
      await ensureLogin();
      $bootMsg.textContent = "正在加载语义模型…";
      await whenTransformersReady();
      await loadModel();
      $bootMsg.textContent = "正在准备本地索引…";
      let cached = await idbAll();
      // 不再自动灌示例数据：新用户打开应是自己的空空间。
      // 示例收藏改为由用户主动点击「浏览示例收藏」加载（标 isDemo）。
      items = cached;
      buildFilters();
      render();
      $boot.style.display = "none";
    } catch (e) {
      console.error(e);
      $bootMsg.textContent = "加载失败：" + (e && e.message ? e.message : "请检查网络");
    }
  }
  start();
})();
