/**
 * shared/inject/task-runner.js
 * 页面端自动完成执行器 — 注入到页面 MAIN world 后独立运行。
 * 不依赖弹窗，弹窗关闭后继续工作。
 */

export const TASK_RUNNER_TEMPLATE = `
(function() {
  // ========== 防重复 ==========
  var existingBox = document.getElementById("__cx_runner_box");
  if (existingBox) {
    if (window.__CX_RUNNER && window.__CX_RUNNER.running) return;
    existingBox.remove();
  }

  // ========== 嵌入脚本 ==========
  var DISCOVER = ___DISCOVER___;
  var COMPLETE_DOC = ___COMPLETE_DOC___;
  var COMPLETE_VIDEO = ___COMPLETE_VIDEO___;
  var GET_STATE = ___GET_STATE___;
  var SPEED_MODE = ___SPEED___;

  var POLL_INTERVAL = 500;

  // ========== UI ==========
  var box = document.createElement("div");
  box.id = "__cx_runner_box";
  box.innerHTML =
    '<div style="font-weight:bold;margin-bottom:3px;color:#1a73e8;font-size:12px;">超星助手</div>' +
    '<div id="__cx_runner_head" style="font-size:11px;color:#333;"></div>' +
    '<div id="__cx_runner_detail" style="font-size:11px;color:#666;margin-top:2px;"></div>' +
    '<div id="__cx_runner_bar" style="margin-top:4px;height:3px;background:#e0e0e0;overflow:hidden;">' +
      '<div id="__cx_runner_fill" style="height:100%;width:0%;background:#1a73e8;transition:width 0.3s;"></div>' +
    '</div>';
  box.style.cssText =
    "position:fixed;top:10px;left:10px;z-index:99999;width:300px;" +
    "background:#fff;padding:8px 12px;" +
    "font-family:system-ui,sans-serif;font-size:12px;" +
    "box-shadow:0 4px 16px rgba(0,0,0,0.15);";

  var closeBtn = document.createElement("span");
  closeBtn.textContent = "x";
  closeBtn.style.cssText = "position:absolute;top:4px;right:8px;cursor:pointer;color:#aaa;font-size:13px;line-height:1;";
  closeBtn.title = "停止";
  closeBtn.addEventListener("click", function() {
    if (runner && runner.abort) runner.abort();
    if (box && box.parentNode) box.remove();
  });
  box.appendChild(closeBtn);
  document.body.appendChild(box);

  var headEl = document.getElementById("__cx_runner_head");
  var detailEl = document.getElementById("__cx_runner_detail");
  var fillEl = document.getElementById("__cx_runner_fill");

  function setHead(text) { if (headEl) headEl.textContent = text; }
  function setDetail(text) { if (detailEl) detailEl.textContent = text || ""; }
  function setBar(pct) { if (fillEl) fillEl.style.width = Math.min(100, Math.max(0, pct)) + "%"; }
  function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

  // ========== Runner ==========
  var runner = {
    running: false, aborted: false, status: "idle",
    progress: { completed: 0, total: 0, current: null, overallPct: 0 },

    abort: function() {
      this.aborted = true;
      this.running = false;
      this.status = "aborted";
      if (this._timerId) { clearInterval(this._timerId); this._timerId = null; }
      setHead("已停止");
      setDetail("");
      setBar(this.progress.overallPct);
    },

    start: async function() {
      if (this.running) return;
      this.running = true;
      this.aborted = false;
      this.status = "discovering";

      try {
        setHead("正在探测任务点...");
        setDetail("");

        var raw = eval(DISCOVER);
        var data = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (data.error) { setHead("错误: " + data.error); this.running = false; return; }

        var pending = data.taskPoints.filter(function(t) { return !t.isFinished; });
        var total = pending.length;
        if (total === 0) {
          setHead("所有任务点已完成");
          setDetail("");
          setBar(100);
          this.running = false;
          this.status = "done";
          return;
        }

        // ---- 自动检测倍速 ----
        var useSpeed = 1;
        if (SPEED_MODE === "auto") {
          var allCanDouble = true;
          for (var si = 0; si < pending.length; si++) {
            if (pending[si].type === "video" && !pending[si].canDoubleSpeed) {
              allCanDouble = false;
              break;
            }
          }
          useSpeed = allCanDouble ? 2 : 1;
        } else {
          useSpeed = parseFloat(SPEED_MODE) || 1;
        }
        // 用检测到的倍速重建视频脚本
        COMPLETE_VIDEO = COMPLETE_VIDEO.replace(/playbackRate=\d+(\.\d+)?/, "playbackRate=" + useSpeed);

        var docs = pending.filter(function(t) { return t.type === "document"; });
        var videos = pending.filter(function(t) { return t.type === "video"; });
        var others = pending.filter(function(t) { return t.type !== "document" && t.type !== "video"; });

        var completed = 0;
        var self = this;

        function progress(head, detail, videoPct) {
          var frac = videoPct != null ? videoPct / 100 : 0;
          var overall = total > 0 ? Math.round(((completed + frac) / total) * 100) : 0;
          self.progress.completed = completed;
          self.progress.total = total;
          self.progress.overallPct = overall;
          setBar(overall);
          setHead("[" + completed + "/" + total + "] " + overall + "%  " + head);
          setDetail(detail || "");
        }

        // ---- 文档 ----
        if (docs.length > 0) {
          for (var di = 0; di < docs.length; di++) {
            if (self.aborted) { self.running = false; return; }
            var doc = docs[di];
            progress("文档", doc.title || doc.filename);
            eval(COMPLETE_DOC);
            completed++;
            await sleep(600);
          }
        }

        // ---- 视频 ----
        if (videos.length > 0) {
          for (var vi = 0; vi < videos.length; vi++) {
            if (self.aborted) { self.running = false; return; }
            var v = videos[vi];
            self.status = "video";
            self.progress.current = { index: vi, total: videos.length, title: v.title || v.filename, pct: 0 };

            progress("视频 " + (vi + 1) + "/" + videos.length, (v.title || v.filename) + " (" + v.videoDuration + "s)");

            try { eval(COMPLETE_VIDEO); } catch(e) {}
            await sleep(2000);

            var startTime = Date.now();
            var maxWait = Math.max(v.videoDuration * 1000 * 1.5, 180000);

            // 阶段 1: 等视频播完
            await new Promise(function(resolvePoll) {
              self._timerId = setInterval(function() {
                try {
                  if (self.aborted) { clearInterval(self._timerId); self._timerId = null; resolvePoll(); return; }

                  var rawState = eval(GET_STATE);
                  var state = typeof rawState === "string" ? JSON.parse(rawState) : rawState;

                  if (state.error) {
                    clearInterval(self._timerId); self._timerId = null;
                    resolvePoll();
                    return;
                  }

                  var pct = parseFloat(state.progressPct) || 0;
                  var elapsed = Math.round((Date.now() - startTime) / 1000);
                  var mins = Math.floor(elapsed / 60);
                  var secs = elapsed % 60;
                  self.progress.current.pct = pct;

                  progress(
                    "视频 " + (vi + 1) + "/" + videos.length + "  " + pct + "%",
                    state.currentTime + "s/" + (state.duration || "?") + "s  |  " + state.playbackRate + "x  |  " + mins + ":" + (secs < 10 ? "0" : "") + secs,
                    pct
                  );

                  // 视频播放结束（ended 或 100%）
                  if (state.ended || pct >= 100) {
                    clearInterval(self._timerId); self._timerId = null;
                    resolvePoll();
                    return;
                  }

                  if (elapsed * 1000 > maxWait) {
                    clearInterval(self._timerId); self._timerId = null;
                    resolvePoll();
                    return;
                  }
                } catch (e) {}
              }, POLL_INTERVAL);
            });

            // 阶段 2: 等平台确认任务点完成
            if (!self.aborted) {
              var verifyStart = Date.now();
              var verifyTimeout = 30000; // 最多等 30 秒
              var jobid = v.jobid;

              while (true) {
                if (self.aborted) break;
                progress("视频 " + (vi + 1) + "/" + videos.length + " 等待确认", "验证任务点状态...");

                try {
                  var vrfRaw = eval(DISCOVER);
                  var vrfData = typeof vrfRaw === "string" ? JSON.parse(vrfRaw) : vrfRaw;
                  var tp = vrfData.taskPoints ? vrfData.taskPoints.find(function(t) { return t.jobid === jobid; }) : null;

                  if (tp && tp.isFinished) {
                    completed++;
                    progress("视频 " + (vi + 1) + "/" + videos.length + " 已确认完成", "");
                    break;
                  }
                } catch(e) {}

                if (Date.now() - verifyStart > verifyTimeout) {
                  completed++;
                  progress("视频 " + (vi + 1) + "/" + videos.length + " 确认超时，跳过", "");
                  break;
                }

                await sleep(1500);
              }
            }
          }
        }

        // ---- 其他 ----
        for (var oi = 0; oi < others.length; oi++) {
          if (self.aborted) { self.running = false; return; }
          progress("未知类型: " + others[oi].type, "");
          completed++;
        }

        // ---- 验证 ----
        setHead("正在验证...");
        setDetail("");
        await sleep(1000);
        try {
          var raw2 = eval(DISCOVER);
          var data2 = typeof raw2 === "string" ? JSON.parse(raw2) : raw2;
          if (data2 && !data2.error) {
            var done = data2.taskPoints.filter(function(t) { return t.isFinished; }).length;
            setBar(100);
            setHead("全部完成 " + done + "/" + (data2.taskPoints.length || "?"));
            setDetail("");
          } else {
            setBar(100);
            setHead("处理完毕");
            setDetail("");
          }
        } catch(e) {
          setBar(100);
          setHead("处理完毕");
          setDetail("");
        }

        self.running = false;
        self.status = "done";

      } catch (e) {
        setHead("异常: " + e.message);
        setDetail("");
        this.running = false;
        this.status = "error";
      }
    }
  };

  window.__CX_RUNNER = runner;
  runner.start();

  // ========== 通用显示 ==========
  window.__CX_SHOW = function(html, isError) {
    var b = document.getElementById("__cx_runner_box");
    if (!b) {
      b = document.createElement("div");
      b.id = "__cx_runner_box";
      b.style.cssText =
        "position:fixed;top:10px;left:10px;z-index:99999;max-width:340px;" +
        "background:#fff;padding:8px 12px;font-family:system-ui,sans-serif;font-size:12px;" +
        "box-shadow:0 4px 16px rgba(0,0,0,0.15);";
      document.body.appendChild(b);
    }
    b.innerHTML =
      '<div style="font-weight:bold;margin-bottom:3px;color:#1a73e8;font-size:12px;">超星助手</div>' +
      '<div style="font-size:11px;color:' + (isError ? "#d93025" : "#333") + ';line-height:1.5;white-space:pre-wrap;word-break:break-all;">' + html + '</div>';
    var cb = document.createElement("span");
    cb.textContent = "x";
    cb.style.cssText = "position:absolute;top:4px;right:8px;cursor:pointer;color:#aaa;font-size:13px;";
    cb.onclick = function() { b.remove(); };
    b.appendChild(cb);
  };
})();
`;

export function buildRunner({ discover, completeDoc, completeVideo, getState, speed }) {
  const spd = speed || "auto";
  const videoCode = completeVideo.replace("${rate}", spd === "auto" ? "2" : spd);
  return TASK_RUNNER_TEMPLATE
    .replace("___DISCOVER___", JSON.stringify(discover))
    .replace("___COMPLETE_DOC___", JSON.stringify(completeDoc))
    .replace("___COMPLETE_VIDEO___", JSON.stringify(videoCode))
    .replace("___GET_STATE___", JSON.stringify(getState))
    .replace("___SPEED___", JSON.stringify(spd));
}
