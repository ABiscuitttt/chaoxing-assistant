/**
 * extension/content/inject-loader.js
 *
 * Content Script — 在超星页面自动加载
 *
 * 职责:
 *   1. 从 inject-scripts.js 读取预构建的注入脚本
 *   2. 监听 popup 消息，执行对应操作
 *   3. 返回结果给 popup
 *
 * 构建: 运行 node scripts/build-extension.js 生成 inject-scripts.js
 */

// ========== 加载提示 ==========
(function() {
  var tip = document.createElement("div");
  tip.textContent = "超星助手已加载";
  tip.style.cssText = "position:fixed;top:10px;left:10px;z-index:99998;background:#1a73e8;color:#fff;padding:4px 10px;border-radius:4px;font-size:12px;font-family:system-ui;opacity:0;transition:opacity 0.3s;pointer-events:none;";
  document.body.appendChild(tip);
  requestAnimationFrame(function() { tip.style.opacity = "1"; });
  setTimeout(function() { tip.style.opacity = "0"; setTimeout(function() { tip.remove(); }, 300); }, 2000);
})();

// ========== 注入工具 ==========

function injectRaw(code) {
  const script = document.createElement("script");
  script.textContent = `(${code})();`;
  (document.head || document.documentElement).appendChild(script);
  script.remove();
}

function injectAndGet(code) {
  return new Promise((resolve) => {
    const id = "__cx_" + Math.random().toString(36).slice(2);
    const wrapped = `
(function(){
  var result = (${code})();
  var el = document.createElement("div");
  el.id = "${id}";
  el.textContent = result;
  el.style.display = "none";
  document.body.appendChild(el);
})();
`;
    const script = document.createElement("script");
    script.textContent = wrapped;
    (document.head || document.documentElement).appendChild(script);
    script.remove();

    const check = setInterval(() => {
      const el = document.getElementById(id);
      if (el) {
        clearInterval(check);
        const r = el.textContent;
        el.remove();
        resolve(r);
      }
    }, 50);

    setTimeout(() => {
      clearInterval(check);
      resolve(JSON.stringify({ error: "timeout" }));
    }, 15000);
  });
}

function resolveTemplate(tmpl, params) {
  // 将 ${param} 替换为实际值
  return tmpl.replace(/\$\{(\w+)\}/g, (_, k) => {
    const v = params[k];
    return v !== undefined ? v : "";
  });
}

// ========== 消息处理 ==========

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const { action, args } = msg;
  const S = window.__CX_INJECT;

  if (!S) {
    sendResponse({ error: "inject-scripts.js not loaded" });
    return;
  }

  try {
    switch (action) {
      case "discover":
        injectAndGet(S.DISCOVER_SCRIPT).then((r) => sendResponse(JSON.parse(r)));
        return true;

      case "chapters":
        injectAndGet(S.CHAPTERS_SCRIPT).then((r) => sendResponse(JSON.parse(r)));
        return true;

      case "getDownloadUrl":
        injectAndGet(S.GET_DOWNLOAD_URL).then((r) => sendResponse(JSON.parse(r)));
        return true;

      case "completeDocument":
        injectAndGet(S.COMPLETE_DOCUMENT).then((r) => sendResponse({ result: r }));
        return true;

      case "completeVideo": {
        const speed = args?.speed || 2;
        const code = resolveTemplate(S.COMPLETE_VIDEO.template, { speed });
        injectAndGet(code).then((r) => sendResponse({ result: r }));
        return true;
      }

      case "goto": {
        const nodeId = args?.nodeId;
        if (!nodeId) { sendResponse({ error: "nodeId required" }); return; }
        const code = resolveTemplate(S.GOTO_CHAPTER.template, { nodeId });
        injectAndGet(code).then((r) => sendResponse({ result: r }));
        return true;
      }

      case "play":
        injectAndGet(S.PLAY).then((r) => sendResponse({ result: r }));
        return true;

      case "pause":
        injectAndGet(S.PAUSE).then((r) => sendResponse({ result: r }));
        return true;

      case "getState":
        injectAndGet(S.GET_STATE).then((r) => sendResponse(JSON.parse(r)));
        return true;

      case "setSpeed": {
        const rate = args?.rate || 2;
        const code = resolveTemplate(S.SET_SPEED.template, { rate });
        injectAndGet(code).then((r) => sendResponse({ result: r }));
        return true;
      }

      default:
        sendResponse({ error: `unknown action: ${action}` });
    }
  } catch (e) {
    sendResponse({ error: e.message });
  }
});
