/**
 * extension/content/inject-loader.js
 * Content Script — 页面加载时创建白框。所有脚本执行由popup通过executeScript注入MAIN world。
 */

(function() {
  if (document.getElementById("__cx_runner_box")) return;
  var box = document.createElement("div");
  box.id = "__cx_runner_box";
  box.innerHTML =
    '<div style="font-weight:bold;margin-bottom:3px;color:#1a73e8;font-size:12px;">超星助手</div>' +
    '<div id="__cx_runner_head" style="font-size:11px;color:#999;">点击插件按钮开始</div>' +
    '<div id="__cx_runner_detail" style="font-size:11px;color:#666;margin-top:1px;"></div>' +
    '<div id="__cx_runner_bar" style="margin-top:3px;height:3px;background:#e0e0e0;overflow:hidden;display:none;">' +
      '<div id="__cx_runner_fill" style="height:100%;width:0%;background:#1a73e8;transition:width 0.3s;"></div></div>';
  box.style.cssText = "position:fixed;top:10px;left:10px;z-index:99999;width:300px;background:#fff;padding:8px 12px;font-family:system-ui,sans-serif;font-size:12px;box-shadow:0 4px 16px rgba(0,0,0,0.15);";
  document.body.appendChild(box);
})();
