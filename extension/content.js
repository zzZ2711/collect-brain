/* 收藏大脑 - 小红书收藏导出 content script
 * 策略：
 *  1）拦截 edith.xiaohongshu.com 的 XHR/fetch 响应，从「已收藏」列表接口里提取笔记；
 *  2）若接口拦截失败（签名/结构变化），用 DOM 兜底抓取当前页面可见的笔记卡片；
 *  3）数据累积在 window.__cbrain_notes 里，popup 可随时读取并导出。
 */
(function () {
  "use strict";

  const COLLECT_PATH = "/api/sns/web/v1/collect/note/page";
  const NOTES = "notes";
  const seen = new Set();
  window.__cbrain_notes = window.__cbrain_notes || [];

  function pushNote(n) {
    if (!n || !n.note_id) return;
    if (seen.has(n.note_id)) return;
    seen.add(n.note_id);
    window.__cbrain_notes.push({
      note_id: n.note_id,
      title: n.display_title || n.title || "",
      note: n.desc || n.content || "",
      author: (n.user && (n.user.nickname || n.user.name)) || "",
      url: "https://www.xiaohongshu.com/explore/" + n.note_id,
      cover: (n.cover && (n.cover.url_default || n.cover.url)) || "",
      source: "xiaohongshu",
    });
  }

  function extractFromObject(obj) {
    if (!obj || typeof obj !== "object") return;
    // 列表接口常见结构：data.notes = [{note_id, display_title, user, ...}]
    if (Array.isArray(obj.notes)) {
      obj.notes.forEach((it) => {
        // 有的接口把字段包在 note_card 里
        pushNote(it.note_card ? Object.assign({}, it.note_card, { note_id: it.note_id }) : it);
      });
    }
    if (Array.isArray(obj.cards)) {
      obj.cards.forEach((it) => pushNote(it));
    }
    // 递归扫描（防止嵌套）
    for (const k in obj) {
      const v = obj[k];
      if (v && typeof v === "object" && k !== "note_card") {
        if (Array.isArray(v) && v.length && v[0] && v[0].note_id) extractFromObject({ notes: v });
      }
    }
  }

  function handleText(text) {
    if (!text || text.length < 50) return;
    if (text.indexOf("note_id") === -1 && text.indexOf("display_title") === -1) return;
    try {
      const json = JSON.parse(text);
      extractFromObject(json.data || json);
    } catch (e) { /* 不是 JSON，忽略 */ }
  }

  // ---- 拦截 fetch ----
  const realFetch = window.fetch;
  window.fetch = function (input, init) {
    return realFetch.apply(this, arguments).then((resp) => {
      const url = (typeof input === "string" ? input : input && input.url) || "";
      if (url.indexOf(COLLECT_PATH) !== -1 || url.indexOf("xiaohongshu.com/api") !== -1) {
        resp.clone().text().then(handleText).catch(() => {});
      }
      return resp;
    });
  };

  // ---- 拦截 XHR ----
  const realOpen = XMLHttpRequest.prototype.open;
  const realSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__cb_url = url;
    return realOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    this.addEventListener("load", () => {
      const u = this.__cb_url || "";
      if (u.indexOf(COLLECT_PATH) !== -1 || u.indexOf("xiaohongshu.com/api") !== -1) {
        try { handleText(this.responseText); } catch (e) {}
      }
    });
    return realSend.apply(this, arguments);
  };

  // ---- DOM 兜底：抓取当前页面可见笔记卡片 ----
  function collectFromDom() {
    const cards = document.querySelectorAll("section.note-item, a.cover, div[data-id]");
    cards.forEach((el) => {
      const a = el.tagName === "A" ? el : el.querySelector("a[href*='/explore/']");
      if (!a) return;
      const href = a.getAttribute("href") || "";
      const m = href.match(/\/explore\/([0-9a-zA-Z]+)/);
      if (!m) return;
      const noteId = m[1];
      const titleEl = el.querySelector(".title, .content, span");
      const authorEl = el.querySelector(".author-wrapper .name, .name");
      const img = el.querySelector("img");
      pushNote({
        note_id: noteId,
        display_title: titleEl ? titleEl.textContent.trim() : "",
        user: { nickname: authorEl ? authorEl.textContent.trim() : "" },
        cover: img ? img.src : "",
      });
    });
  }

  window.__cbrain_collectFromDom = collectFromDom;

  // 进入页面后，自动滚动几次以触发「无限滚动」加载更多（用户也可手动滚）
  let scrollCount = 0;
  const autoScroll = setInterval(() => {
    if (scrollCount >= 12) { clearInterval(autoScroll); return; }
    if (location.href.indexOf("/collect") !== -1 || location.href.indexOf("collection") !== -1) {
      window.scrollTo(0, document.body.scrollHeight);
      scrollCount++;
      setTimeout(collectFromDom, 800);
    }
  }, 2500);

  // 暴露给 popup 的消息接口
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === "GET_COUNT") {
      sendResponse({ count: window.__cbrain_notes.length });
    } else if (msg && msg.type === "COLLECT_DOM") {
      collectFromDom();
      sendResponse({ count: window.__cbrain_notes.length });
    } else if (msg && msg.type === "GET_NOTES") {
      sendResponse({ notes: window.__cbrain_notes });
    }
    return true;
  });
})();
