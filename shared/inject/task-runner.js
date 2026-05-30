/**
 * shared/inject/task-runner.js
 *
 * 页面端自动完成执行器 — 注入到页面 MAIN world 后独立运行。
 * 不依赖弹窗、不依赖 WebBridge，弹窗关闭后继续工作。
 *
 * 用法:
 *   import { buildRunner } from "./shared/inject/task-runner.js";
 *   const code = buildRunner({ discover, completeDoc, completeVideo, getState });
 *   // CLI:   bridge.evaluate(code)
 *   // 插件:  chrome.scripting.executeScript({ world: "MAIN", func: (c) => eval(c), args: [code] })
 */

export const TASK_RUNNER_TEMPLATE = `
(function() {
  // ========== 防重复：检查 DOM 中是否已有方框 ==========
  var existingBox = document.getElementById("__cx_runner_box");
  if (existingBox) {
    // 已有方框，如果 runner 正在运行则忽略
    if (window.__CX_RUNNER && window.__CX_RUNNER.running) return;
    // 否则移除旧框，重新开始
    existingBox.remove();
  }

  // ========== 嵌入脚本 ==========
  var DISCOVER = ___DISCOVER___;
  var COMPLETE_DOC = ___COMPLETE_DOC___;
  var COMPLETE_VIDEO = ___COMPLETE_VIDEO___;
  var GET_STATE = ___GET_STATE___;

  // ========== 常量 ==========
  var POLL_INTERVAL = 3000;
  var THRESHOLD = 90;

  // ========== UI 创建 ==========
  var box = document.createElement("div");
  box.id = "__cx_runner_box";
  box.innerHTML =
    '<div style="font-weight:bold;margin-bottom:4px;color:#1a73e8;">超星助手</div>' +
    '<div id="__cx_runner_status" style="font-size:11px;color:#333;line-height:1.5;"></div>' +
    '<div id="__cx_runner_bar" style="margin-top:6px;height:6px;background:#e0e0e0;overflow:hidden;">' +
      '<div id="__cx_runner_fill" style="height:100%;width:0%;background:#1a73e8;transition:width 0.3s;"></div>' +
    '</div>' +
    '<div style="margin-top:4px;font-size:10px;color:#999;">可关闭弹窗 · 点击右上角 X 停止</div>';
  box.style.cssText =
    "position:fixed;top:10px;left:10px;z-index:99999;" +
    "width:300px;max-height:400px;overflow-y:auto;" +
    "background:#fff;" +
    "padding:12px 14px;font-family:system-ui,sans-serif;font-size:12px;" +
    "box-shadow:0 4px 16px rgba(0,0,0,0.15);cursor:default;";

  // 关闭按钮
  var closeBtn = document.createElement("span");
  closeBtn.textContent = "✕";
  closeBtn.style.cssText = "position:absolute;top:8px;right:10px;cursor:pointer;color:#999;font-size:14px;line-height:1;";
  closeBtn.title = "停止并关闭";
  closeBtn.addEventListener("click", function() {
    if (runner && runner.abort) runner.abort();
    if (box && box.parentNode) box.remove();
  });
  box.appendChild(closeBtn);

  document.body.appendChild(box);

  var statusEl = document.getElementById("__cx_runner_status");
  var fillEl = document.getElementById("__cx_runner_fill");

  // ========== 工具函数 ==========
  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function updateStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function updateStatusHtml(html) {
    if (statusEl) statusEl.innerHTML = html;
  }

  function updateBar(pct) {
    if (fillEl) fillEl.style.width = Math.min(100, Math.max(0, pct)) + "%";
  }

  function sleep(ms) {
    return new Promise(function(r) { setTimeout(r, ms); });
  }

  // ========== Runner ==========
  var runner = {
    running: false,
    aborted: false,
    status: "idle",
    progress: { completed: 0, total: 0, current: null, overallPct: 0 },

    abort: function() {
      this.aborted = true;
      this.running = false;
      this.status = "aborted";
      if (this._timerId) { clearInterval(this._timerId); this._timerId = null; }
      updateStatus("⚠️ 已停止");
      updateBar(this.progress.overallPct);
      setTimeout(function() {
        if (box && box.parentNode) box.style.opacity = "0.5";
      }, 2000);
    },

    start: async function() {
      if (this.running) return;
      this.running = true;
      this.aborted = false;
      this.status = "discovering";

      try {
        // ---- 1. 探测 ----
        updateStatus("🔍 探测任务点...");
        var raw = eval(DISCOVER);
        var data = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (data.error) { updateStatus("❌ " + data.error); this.running = false; return; }

        var pending = data.taskPoints.filter(function(t) { return !t.isFinished; });
        var total = pending.length;
        if (total === 0) {
          updateStatus("✅ 所有任务点已完成！");
          updateBar(100);
          this.running = false;
          this.status = "done";
          return;
        }

        var docs = pending.filter(function(t) { return t.type === "document"; });
        var videos = pending.filter(function(t) { return t.type === "video"; });
        var others = pending.filter(function(t) { return t.type !== "document" && t.type !== "video"; });

        var completed = 0;
        var self = this;

        function progress(text) {
          var pct = total > 0 ? Math.round((completed / total) * 100) : 0;
          self.progress.completed = completed;
          self.progress.total = total;
          self.progress.overallPct = pct;
          updateBar(pct);
          updateStatusHtml("[" + completed + "/" + total + "] " + pct + "%<br>" + escapeHtml(text));
        }

        // ---- 2. 文档 ----
        if (docs.length > 0) {
          progress("📄 处理 " + docs.length + " 个文档...");
          for (var di = 0; di < docs.length; di++) {
            if (self.aborted) { self.running = false; return; }
            var doc = docs[di];
            progress("📄 完成: " + (doc.title || doc.filename));
            eval(COMPLETE_DOC);
            completed++;
            await sleep(600);
          }
        }

        // ---- 3. 视频 ----
        if (videos.length > 0) {
          for (var vi = 0; vi < videos.length; vi++) {
            if (self.aborted) { self.running = false; return; }
            var v = videos[vi];
            self.status = "video";
            self.progress.current = { index: vi, total: videos.length, title: v.title || v.filename, pct: 0 };

            progress("🎬 [" + (vi + 1) + "/" + videos.length + "] 播放: " + (v.title || v.filename) + " (" + v.videoDuration + "s)");

            // 启动播放
            try { eval(COMPLETE_VIDEO); } catch(e) {}
            await sleep(2000);

            // 轮询
            var startTime = Date.now();
            var maxWait = Math.max(v.videoDuration * 1000 * 1.3, 120000);

            await new Promise(function(resolvePoll) {
              self._timerId = setInterval(function() {
                try {
                  if (self.aborted) { clearInterval(self._timerId); self._timerId = null; resolvePoll(); return; }

                  var rawState = eval(GET_STATE);
                  var state = typeof rawState === "string" ? JSON.parse(rawState) : rawState;

                  if (state.error) {
                    clearInterval(self._timerId); self._timerId = null;
                    completed++;
                    progress("🎬 [" + (vi + 1) + "/" + videos.length + "] ⚠️ " + state.error + "，跳过");
                    resolvePoll();
                    return;
                  }

                  // 被手动暂停 → 自动恢复播放
                  if (state.paused) {
                    try { eval(COMPLETE_VIDEO); } catch(e) {}
                  }

                  var pct = parseFloat(state.progressPct) || 0;
                  var elapsed = Math.round((Date.now() - startTime) / 1000);
                  var mins = Math.floor(elapsed / 60);
                  var secs = elapsed % 60;
                  self.progress.current.pct = pct;

                  progress(
                    "🎬 [" + (vi + 1) + "/" + videos.length + "] " + (v.title || v.filename) + "<br>" +
                    "   进度 " + pct + "%  |  " + state.currentTime + "s/" + (state.duration || "?") + "s  |  " + state.playbackRate + "x  |  " + mins + ":" + (secs < 10 ? "0" : "") + secs
                  );

                  if (pct >= THRESHOLD) {
                    clearInterval(self._timerId); self._timerId = null;
                    completed++;
                    progress("🎬 [" + (vi + 1) + "/" + videos.length + "] ✅ 完成 (" + pct + "%)");
                    resolvePoll();
                    return;
                  }

                  if (elapsed * 1000 > maxWait) {
                    clearInterval(self._timerId); self._timerId = null;
                    completed++;
                    progress("🎬 [" + (vi + 1) + "/" + videos.length + "] ⚠️ 超时 (" + pct + "%)，跳到下一个");
                    resolvePoll();
                    return;
                  }
                } catch (e) {
                  // 忽略单次轮询错误
                }
              }, POLL_INTERVAL);
            });

            await sleep(1000);
          }
        }

        // ---- 4. 其他 ----
        for (var oi = 0; oi < others.length; oi++) {
          if (self.aborted) { self.running = false; return; }
          progress("📦 跳过未知类型: " + others[oi].type);
          completed++;
        }

        // ---- 5. 验证 ----
        updateStatus("🔍 验证完成状态...");
        await sleep(1000);
        try {
          var raw2 = eval(DISCOVER);
          var data2 = typeof raw2 === "string" ? JSON.parse(raw2) : raw2;
          if (data2 && !data2.error) {
            var done = data2.taskPoints.filter(function(t) { return t.isFinished; }).length;
            var tot = data2.taskPoints.length;
            updateBar(100);
            updateStatus("✅ 全部完成！" + done + "/" + tot + " 已确认");
          } else {
            updateBar(100);
            updateStatus("✅ 处理完毕（请手动验证）");
          }
        } catch(e) {
          updateBar(100);
          updateStatus("✅ 处理完毕");
        }

        self.running = false;
        self.status = "done";

      } catch (e) {
        updateStatus("❌ 异常: " + e.message);
        this.running = false;
        this.status = "error";
      }
    }
  };

  // ========== 启动 ==========
  window.__CX_RUNNER = runner;
  runner.start();

  // ========== 通用页面显示（供弹窗其他操作使用）==========
  window.__CX_SHOW = function(html, isError) {
    var b = document.getElementById("__cx_runner_box");
    if (!b) {
      // 创建一个简单通知框
      b = document.createElement("div");
      b.id = "__cx_runner_box";
      b.style.cssText =
        "position:fixed;top:10px;left:10px;z-index:99999;" +
        "max-width:340px;max-height:400px;overflow-y:auto;" +
        "background:#fff;" +
        "padding:12px 14px;font-family:system-ui,sans-serif;font-size:12px;" +
        "box-shadow:0 4px 16px rgba(0,0,0,0.15);";
      document.body.appendChild(b);
    }
    var color = isError ? "#d93025" : "#333";
    b.innerHTML =
      '<div style="font-weight:bold;margin-bottom:6px;color:#1a73e8;">超星助手</div>' +
      '<div style="font-size:11px;color:' + color + ';line-height:1.5;white-space:pre-wrap;word-break:break-all;">' + html + '</div>' +
      '<div style="margin-top:6px;font-size:10px;color:#999;">点击右上角 X 关闭</div>';
    var cb = document.createElement("span");
    cb.textContent = "✕";
    cb.style.cssText = "position:absolute;top:8px;right:10px;cursor:pointer;color:#999;font-size:14px;line-height:1;";
    cb.onclick = function() { b.remove(); };
    b.appendChild(cb);
  };
})();
`;

/**
 * 构建可注入的 runner 脚本
 * @param {object} scripts
 * @param {string} scripts.discover     - DISCOVER_SCRIPT
 * @param {string} scripts.completeDoc  - COMPLETE_DOCUMENT
 * @param {string} scripts.completeVideo - COMPLETE_VIDEO 模板（含 ${rate} 占位符，已替换好）
 * @param {string} scripts.getState     - GET_STATE
 * @returns {string} 可注入的 IIFE 字符串
 */
export function buildRunner({ discover, completeDoc, completeVideo, getState }) {
  const videoCode = completeVideo.replace("${rate}", "2");

  return TASK_RUNNER_TEMPLATE
    .replace("___DISCOVER___", JSON.stringify(discover))
    .replace("___COMPLETE_DOC___", JSON.stringify(completeDoc))
    .replace("___COMPLETE_VIDEO___", JSON.stringify(videoCode))
    .replace("___GET_STATE___", JSON.stringify(getState));
}
