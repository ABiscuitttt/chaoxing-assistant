/**
 * extension/content/inject-loader.js
 * Content Script — 页面加载时创建白框，提供注入工具和消息处理。
 */

// ========== 页面加载：注入白框到 MAIN world ==========

function injectRaw(code) {
  const script = document.createElement("script");
  script.textContent = "(" + code + ")();";
  (document.head || document.documentElement).appendChild(script);
  script.remove();
}

// 注入白框初始化脚本到页面 MAIN world
injectRaw(function() {
  if (document.getElementById("__cx_runner_box")) return;
  var box = document.createElement("div");
  box.id = "__cx_runner_box";
  box.innerHTML =
    '<div style="font-weight:bold;margin-bottom:3px;color:#1a73e8;font-size:12px;">超星助手</div>' +
    '<div id="__cx_runner_head" style="font-size:11px;color:#999;">点击插件按钮开始</div>' +
    '<div id="__cx_runner_detail" style="font-size:11px;color:#666;margin-top:1px;"></div>' +
    '<div id="__cx_runner_bar" style="margin-top:3px;height:3px;background:#e0e0e0;overflow:hidden;display:none;">' +
      '<div id="__cx_runner_fill" style="height:100%;width:0%;background:#1a73e8;transition:width 0.3s;"></div>' +
    '</div>';
  box.style.cssText = "position:fixed;top:10px;left:10px;z-index:99999;width:300px;background:#fff;padding:8px 12px;font-family:system-ui,sans-serif;font-size:12px;box-shadow:0 4px 16px rgba(0,0,0,0.15);";
  document.body.appendChild(box);

  // 通用显示函数
  window.__CX_SHOW = function(html, isError) {
    var h = document.getElementById("__cx_runner_head");
    if (h) h.innerHTML = '<span style="color:' + (isError ? "#d93025" : "#333") + '">' + html + '</span>';
    var d = document.getElementById("__cx_runner_detail");
    if (d) d.textContent = "";
    var b = document.getElementById("__cx_runner_bar");
    if (b) b.style.display = "none";
  };
});

// ========== 注入工具 ==========

function injectAndGet(code) {
  return new Promise((resolve) => {
    const id = "__cx_" + Math.random().toString(36).slice(2);
    const wrapped = `
(function(){
  var result = eval(${JSON.stringify(code)});
  var el = document.createElement("div");
  el.id = "${id}";
  el.textContent = typeof result === "string" ? result : JSON.stringify(result);
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
      if (el) { clearInterval(check); const r = el.textContent; el.remove(); resolve(r); }
    }, 50);
    setTimeout(() => { clearInterval(check); resolve(JSON.stringify({ error: "timeout" })); }, 15000);
  });
}

function resolveTemplate(tmpl, params) {
  return tmpl.replace(/\$\{(\w+)\}/g, (_, k) => params[k] !== undefined ? params[k] : "");
}

// ========== 消息处理 ==========

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const { action, args } = msg;
  const S = window.__CX_INJECT;
  if (!S) { sendResponse({ error: "scripts not loaded" }); return; }

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
      case "completeVideo":
        injectAndGet(resolveTemplate(S.COMPLETE_VIDEO.template, { speed: args?.speed || 2 })).then((r) => sendResponse({ result: r }));
        return true;
      case "goto":
        if (!args?.nodeId) { sendResponse({ error: "nodeId required" }); return; }
        injectAndGet(resolveTemplate(S.GOTO_CHAPTER.template, { nodeId: args.nodeId })).then((r) => sendResponse({ result: r }));
        return true;
      case "getState":
        injectAndGet(S.GET_STATE).then((r) => sendResponse(JSON.parse(r)));
        return true;
      default:
        sendResponse({ error: "unknown action: " + action });
    }
  } catch (e) {
    sendResponse({ error: e.message });
  }
});
