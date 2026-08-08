/* 收藏大脑 - 小红书导出 popup 逻辑 */
(function () {
  "use strict";

  const $cnt = document.getElementById("cnt");
  const $collect = document.getElementById("collect");
  const $export = document.getElementById("export");

  function refreshCount() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab || !tab.id) return;
      chrome.tabs.sendMessage(tab.id, { type: "GET_COUNT" }, (res) => {
        if (res && res.count != null) $cnt.textContent = res.count;
      });
    });
  }

  $collect.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab || !tab.id) return;
      chrome.tabs.sendMessage(tab.id, { type: "COLLECT_DOM" }, (res) => {
        if (res && res.count != null) {
          $cnt.textContent = res.count;
          $export.disabled = res.count === 0;
        }
      });
    });
  });

  $export.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab || !tab.id) return;
      chrome.tabs.sendMessage(tab.id, { type: "GET_NOTES" }, (res) => {
        const notes = (res && res.notes) || [];
        if (!notes.length) { alert("还没有抓到收藏，请先在小红书「收藏」页滚动加载，或点「再抓一次」。"); return; }
        const blob = new Blob([JSON.stringify(notes, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const ts = new Date().toISOString().slice(0, 10);
        chrome.downloads.download({
          url: url,
          filename: "xiaohongshu-collect-" + ts + ".json",
          saveAs: true,
        }, () => {
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          // 引导用户去收藏大脑导入
          chrome.tabs.create({ url: "https://collect-brain-n2711-d2ghk2fjge63cf6f5.webapps.tcloudbase.com" });
        });
      });
    });
  });

  refreshCount();
  setInterval(refreshCount, 1500);
})();
