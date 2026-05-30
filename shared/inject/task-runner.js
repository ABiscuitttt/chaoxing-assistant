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

  var DISCOVER = ___DISCOVER___;
  var COMPLETE_DOC = ___COMPLETE_DOC___;
  var COMPLETE_VIDEO = ___COMPLETE_VIDEO___;
  var GET_STATE = ___GET_STATE___;
  var SPEED_MODE = ___SPEED___;

  var POLL_MS = 500;
  var VERIFY_MS = 1500;

  // ========== 工具函数 ==========
  function parseResult(raw) { return typeof raw === "string" ? JSON.parse(raw) : raw; }
  function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

  // ========== 统一方框创建 ==========
  function ensureBox(inner) {
    var b = document.getElementById("__cx_runner_box");
    if (!b) {
      b = document.createElement("div");
      b.id = "__cx_runner_box";
      b.style.cssText = "position:fixed;top:10px;left:10px;z-index:99999;width:300px;background:#fff;padding:8px 12px;font-family:system-ui,sans-serif;font-size:12px;box-shadow:0 4px 16px rgba(0,0,0,0.15);";
      document.body.appendChild(b);
    }
    b.innerHTML =
      '<span id="__cx_runner_close" style="position:absolute;top:4px;right:8px;cursor:pointer;color:#aaa;font-size:13px;line-height:1;">x</span>' +
      inner;
    document.getElementById("__cx_runner_close").addEventListener("click", function() {
      if (window.__CX_RUNNER && window.__CX_RUNNER.abort) window.__CX_RUNNER.abort();
      if (b.parentNode) b.remove();
    });
    return b;
  }

  // ========== UI 组件引用 ==========
  var headEl, detailEl, fillEl;

  function setHead(t) { if (headEl) headEl.textContent = t; }
  function setDetail(t) { if (detailEl) detailEl.textContent = t || ""; }
  function setBar(pct) { if (fillEl) fillEl.style.width = Math.min(100, Math.max(0, pct)) + "%"; }

  // ========== 进度更新（提升到 start 外部） ==========
  var _completed, _total, _self;
  function progress(head, detail, videoPct) {
    var frac = videoPct != null ? videoPct / 100 : 0;
    var overall = _total > 0 ? Math.round(((_completed + frac) / _total) * 100) : 0;
    _self.progress.completed = _completed;
    _self.progress.total = _total;
    _self.progress.overallPct = overall;
    setBar(overall);
    setHead("[" + _completed + "/" + _total + "] " + overall + "%  " + head);
    setDetail(detail || "");
  }

  // ========== Runner ==========
  var runner = {
    running: false, aborted: false, status: "idle",
    progress: { completed: 0, total: 0, current: null, overallPct: 0 },

    abort: function() {
      this.aborted = true;
      this.running = false;
      this.status = "aborted";
      setHead("已停止");
      setDetail("");
      setBar(this.progress.overallPct);
    },

    start: async function() {
      if (this.running) return;
      this.running = true;
      this.aborted = false;
      this.status = "discovering";

      // ---- 创建 UI ----
      ensureBox(
        '<div style="font-weight:bold;margin-bottom:3px;color:#1a73e8;font-size:12px;">超星助手</div>' +
        '<div id="__cx_runner_head" style="font-size:11px;color:#333;"></div>' +
        '<div id="__cx_runner_detail" style="font-size:11px;color:#666;margin-top:2px;"></div>' +
        '<div id="__cx_runner_bar" style="margin-top:4px;height:3px;background:#e0e0e0;overflow:hidden;">' +
          '<div id="__cx_runner_fill" style="height:100%;width:0%;background:#1a73e8;transition:width 0.3s;"></div>' +
        '</div>'
      );
      headEl = document.getElementById("__cx_runner_head");
      detailEl = document.getElementById("__cx_runner_detail");
      fillEl = document.getElementById("__cx_runner_fill");

      _self = this;

      try {
        // ---- 1. 探测 ----
        setHead("正在探测任务点...");
        setDetail("");
        var data = parseResult(eval(DISCOVER));
        if (data.error) {
          setHead("需手动完成");
          setDetail(data.error);
          setBar(0);
          this.running = false;
          this.status = "manual";
          return;
        }

        var pending = data.taskPoints.filter(function(t) { return !t.isFinished; });
        _total = pending.length;
        _completed = 0;

        if (_total === 0) {
          setHead("所有任务点已完成");
          setBar(100);
          this.running = false;
          this.status = "done";
          return;
        }

        var docs = pending.filter(function(t) { return t.type === "document"; });
        var videos = pending.filter(function(t) { return t.type === "video"; });
        var others = pending.filter(function(t) { return t.type !== "document" && t.type !== "video"; });

        // ---- 2. 文档 ----
        for (var di = 0; di < docs.length; di++) {
          if (this.aborted) { this.running = false; return; }
          var doc = docs[di];
          progress("文档", doc.title || doc.filename);
          eval(COMPLETE_DOC);
          _completed++;
          await sleep(600);
        }

        // ---- 3. 视频 ----
        for (var vi = 0; vi < videos.length; vi++) {
          if (this.aborted) { this.running = false; return; }
          var v = videos[vi];
          this.status = "video";
          this.progress.current = { index: vi, total: videos.length, title: v.title || v.filename, pct: 0 };

          // 倍速：auto 模式每个视频用各自最大，否则固定
          var vSpeed = SPEED_MODE === "auto" ? (v.canDoubleSpeed ? 2 : 1) : (parseFloat(SPEED_MODE) || 1);
          var vScript = COMPLETE_VIDEO.replace("\${rate}", vSpeed);

          progress("视频 " + (vi + 1) + "/" + videos.length + "  " + vSpeed + "x",
                   (v.title || v.filename) + " (" + v.videoDuration + "s)");

          try { eval(vScript); } catch(e) { progress("视频 " + (vi + 1) + "/" + videos.length + " 启动失败", e.message); }
          await sleep(1000);

          // 阶段 1: 等视频播完
          var startTime = Date.now();
          var maxWait = Math.max(v.videoDuration * 1000 * 1.5, 180000);
          var pollCount = 0;

          while (true) {
            if (this.aborted) { this.running = false; return; }

            var state = parseResult(eval(GET_STATE));
            if (state.error) break;

            var pct = parseFloat(state.progressPct) || 0;
            var elapsed = Math.round((Date.now() - startTime) / 1000);
            var mins = Math.floor(elapsed / 60);
            var secs = elapsed % 60;
            this.progress.current.pct = pct;

            progress("视频 " + (vi + 1) + "/" + videos.length + "  " + pct + "%",
                     state.currentTime + "s/" + (state.duration || "?") + "s  |  " + state.playbackRate + "x  |  " + mins + ":" + (secs < 10 ? "0" : "") + secs,
                     pct);

            if (state.ended || pct >= 100) break;
            if (Date.now() - startTime > maxWait) { progress("视频 " + (vi + 1) + "/" + videos.length + " 超时跳过", ""); break; }

            // 每 3 秒检查一次任务点是否已被平台标记完成
            pollCount++;
            if (pollCount % 6 === 0) {
              var checkData = parseResult(eval(DISCOVER));
              var checkTp = checkData.taskPoints ? checkData.taskPoints.find(function(t) { return t.jobid === v.jobid; }) : null;
              if (checkTp && checkTp.isFinished) { progress("视频 " + (vi + 1) + "/" + videos.length + " 已标记完成", ""); break; }
            }

            await sleep(POLL_MS);
          }

          // 阶段 2: 等平台确认
          if (!this.aborted) {
            var vStart = Date.now();
            while (Date.now() - vStart < 30000) {
              if (this.aborted) { this.running = false; return; }
              progress("视频 " + (vi + 1) + "/" + videos.length + " 等待确认", "验证任务点状态...");

              var vData = parseResult(eval(DISCOVER));
              var tp = vData.taskPoints ? vData.taskPoints.find(function(t) { return t.jobid === v.jobid; }) : null;
              if (tp && tp.isFinished) { _completed++; progress("视频 " + (vi + 1) + "/" + videos.length + " 已确认完成", ""); break; }

              await sleep(VERIFY_MS);
            }
            if ((Date.now() - vStart) >= 30000) {
              _completed++;
              progress("视频 " + (vi + 1) + "/" + videos.length + " 确认超时，跳过", "");
            }
          }
        }

        // ---- 4. 其他 ----
        for (var oi = 0; oi < others.length; oi++) {
          if (this.aborted) { this.running = false; return; }
          progress("未知类型: " + others[oi].type, "");
          _completed++;
        }

        // ---- 5. 完成 ----
        setBar(100);
        setHead("全部完成 " + _completed + "/" + _total);
        setDetail("");
        this.running = false;
        this.status = "done";

      } catch (e) {
        setHead("异常: " + e.message);
        setDetail("");
        this.running = false;
        this.status = "error";
      }
    }
  };

  // ========== 通用页面显示（不影响 runner 进度 UI） ==========
  window.__CX_SHOW = function(html, isError) {
    var b = document.getElementById("__cx_runner_box");
    // runner 正在运行 → 只更新 head 行，不覆盖整个方框
    if (window.__CX_RUNNER && window.__CX_RUNNER.running) {
      var h = document.getElementById("__cx_runner_head");
      if (h) h.textContent = html.replace(/<[^>]*>/g, "").slice(0, 100);
      return;
    }
    // runner 未运行 → 创建/重用方框显示完整内容
    ensureBox(
      '<div style="font-weight:bold;margin-bottom:3px;color:#1a73e8;font-size:12px;">超星助手</div>' +
      '<div style="font-size:11px;color:' + (isError ? "#d93025" : "#333") + ';line-height:1.5;white-space:pre-wrap;word-break:break-all;">' + html + '</div>'
    );
    // 此时关闭按钮应只移除方框，不中止 runner
    var cb = document.getElementById("__cx_runner_close");
    if (cb) cb.onclick = function() { var bx = document.getElementById("__cx_runner_box"); if (bx) bx.remove(); };
  };

  window.__CX_RUNNER = runner;
  runner.start();
})();
`;

// ========== 课程级运行器 ==========

export const COURSE_RUNNER_TEMPLATE = `
(function() {
  if (window.__CX_COURSE_RUNNER && window.__CX_COURSE_RUNNER.running) return;

  var DISCOVER = ___DISCOVER___;
  var COMPLETE_DOC = ___COMPLETE_DOC___;
  var COMPLETE_VIDEO = ___COMPLETE_VIDEO___;
  var GET_STATE = ___GET_STATE___;
  var CHAPTERS = ___CHAPTERS___;
  var GOTO = ___GOTO___;
  var SPEED_MODE = ___SPEED___;

  function parseResult(r) { return typeof r === "string" ? JSON.parse(r) : r; }
  function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

  // ========== UI ==========
  var box = document.getElementById("__cx_runner_box");
  if (box) box.remove();
  box = document.createElement("div");
  box.id = "__cx_runner_box";
  box.style.cssText = "position:fixed;top:10px;left:10px;z-index:99999;width:320px;background:#fff;padding:10px 12px;font-family:system-ui,sans-serif;font-size:12px;box-shadow:0 4px 16px rgba(0,0,0,0.15);";
  document.body.appendChild(box);

  function render(title, ch, chTotal, chDone, taskHead, taskDetail, barPct) {
    box.innerHTML =
      '<span id="__cx_runner_close" style="position:absolute;top:4px;right:8px;cursor:pointer;color:#aaa;font-size:13px;">x</span>' +
      '<div style="font-weight:bold;margin-bottom:3px;color:#1a73e8;">' + title + '</div>' +
      '<div style="font-size:10px;color:#999;margin-bottom:2px;">章节 ' + chDone + '/' + chTotal + (ch ? '  ' + ch.number + ' ' + ch.title.slice(0,30) : '') + '</div>' +
      '<div style="font-size:11px;color:#333;">' + (taskHead || "") + '</div>' +
      '<div style="font-size:11px;color:#666;margin-top:1px;">' + (taskDetail || "") + '</div>' +
      '<div style="margin-top:4px;height:3px;background:#e0e0e0;overflow:hidden;">' +
        '<div style="height:100%;width:' + (barPct||0) + '%;background:#1a73e8;transition:width 0.3s;"></div>' +
      '</div>';
    document.getElementById("__cx_runner_close").addEventListener("click", function() {
      if (window.__CX_COURSE_RUNNER) window.__CX_COURSE_RUNNER.aborted = true;
      if (box.parentNode) box.remove();
    });
  }
  render("超星助手 - 课程自动完成", null, 0, 0, "正在加载...", "", 0);

  // ========== 章节级任务处理 ==========
  async function processChapter() {
    return new Promise(async function(resolve) {
      // 等待 iframe 加载
      await sleep(3000);

      var data = parseResult(eval(DISCOVER));
      if (data.error) { resolve({ ok: false, error: data.error }); return; }

      var pending = data.taskPoints.filter(function(t) { return !t.isFinished; });
      if (pending.length === 0) { resolve({ ok: true }); return; }

      var _completed = 0, _total = pending.length;

      var docs = pending.filter(function(t) { return t.type === "document"; });
      var videos = pending.filter(function(t) { return t.type === "video"; });
      var others = pending.filter(function(t) { return t.type !== "document" && t.type !== "video"; });

      // 文档
      for (var di = 0; di < docs.length; di++) {
        if (window.__CX_COURSE_RUNNER && window.__CX_COURSE_RUNNER.aborted) { resolve({ abort: true }); return; }
        eval(COMPLETE_DOC);
        _completed++;
        render("超星助手 - 课程自动完成", window.__CX_COURSE_RUNNER._ch, window.__CX_COURSE_RUNNER._chTotal, window.__CX_COURSE_RUNNER._chDone, "[任务 " + _completed + "/" + _total + "] 文档完成", docs[di].title || docs[di].filename, Math.round((_completed/_total)*100));
        await sleep(500);
      }

      // 视频
      for (var vi = 0; vi < videos.length; vi++) {
        if (window.__CX_COURSE_RUNNER && window.__CX_COURSE_RUNNER.aborted) { resolve({ abort: true }); return; }
        var v = videos[vi];
        var vSpeed = SPEED_MODE === "auto" ? (v.canDoubleSpeed ? 2 : 1) : (parseFloat(SPEED_MODE) || 1);
        var vScript = COMPLETE_VIDEO.replace("\${rate}", vSpeed);
        try { eval(vScript); } catch(e) {}
        await sleep(1000);

        var startTime = Date.now();
        var maxWait = Math.max(v.videoDuration * 1000 * 1.5, 180000);
        var pollCount = 0;

        while (true) {
          if (window.__CX_COURSE_RUNNER && window.__CX_COURSE_RUNNER.aborted) { resolve({ abort: true }); return; }
          var state = parseResult(eval(GET_STATE));
          if (state.error) break;
          var pct = parseFloat(state.progressPct) || 0;
          var elapsed = Math.round((Date.now() - startTime) / 1000);
          var mins = Math.floor(elapsed / 60), secs = elapsed % 60;

          render("超星助手 - 课程自动完成", window.__CX_COURSE_RUNNER._ch, window.__CX_COURSE_RUNNER._chTotal, window.__CX_COURSE_RUNNER._chDone, "[任务 " + (_completed+1) + "/" + _total + "] 视频 " + pct + "%", state.currentTime + "s/" + (state.duration||"?") + "s  |  " + state.playbackRate + "x  |  " + mins + ":" + (secs<10?"0":"")+secs, Math.round(((_completed + pct/100)/_total)*100));

          if (state.ended || pct >= 100) break;
          if (Date.now() - startTime > maxWait) break;

          pollCount++;
          if (pollCount % 6 === 0) {
            var cd = parseResult(eval(DISCOVER));
            var ct = cd.taskPoints ? cd.taskPoints.find(function(t){return t.jobid===v.jobid;}) : null;
            if (ct && ct.isFinished) break;
          }
          await sleep(500);
        }

        // 等确认
        var vStart = Date.now();
        while (Date.now() - vStart < 30000) {
          if (window.__CX_COURSE_RUNNER && window.__CX_COURSE_RUNNER.aborted) { resolve({ abort: true }); return; }
          var vrf = parseResult(eval(DISCOVER));
          var tp = vrf.taskPoints ? vrf.taskPoints.find(function(t){return t.jobid===v.jobid;}) : null;
          if (tp && tp.isFinished) break;
          await sleep(1500);
        }
        _completed++;
      }

      for (var oi = 0; oi < others.length; oi++) { _completed++; }

      render("超星助手 - 课程自动完成", window.__CX_COURSE_RUNNER._ch, window.__CX_COURSE_RUNNER._chTotal, window.__CX_COURSE_RUNNER._chDone, "本章完成 " + _completed + "/" + _total, "", 100);
      resolve({ ok: true });
    });
  }

  // ========== 主流程 ==========
  async function main() {
    var chData = parseResult(eval(CHAPTERS));
    if (chData.error) { render("超星助手 - 课程自动完成", null, 0, 0, "错误: " + chData.error, "", 0); return; }

    var pending = chData.chapters.filter(function(c){ return c.isLeaf && c.unfinished > 0; });
    pending.sort(function(a,b){
      var an = a.number.split(".").map(Number), bn = b.number.split(".").map(Number);
      for (var i = 0; i < Math.max(an.length,bn.length); i++) {
        if ((an[i]||0) !== (bn[i]||0)) return (an[i]||0)-(bn[i]||0);
      }
      return 0;
    });

    if (pending.length === 0) { render("超星助手 - 课程自动完成", null, 0, 0, "全部章节已完成！", "", 100); return; }

    var chTotal = pending.length, chDone = 0, skippedCount = 0;
    window.__CX_COURSE_RUNNER = { running: true, aborted: false, _chTotal: chTotal, _chDone: chDone };

    for (var ci = 0; ci < pending.length; ci++) {
      if (window.__CX_COURSE_RUNNER.aborted) break;
      var ch = pending[ci];
      window.__CX_COURSE_RUNNER._ch = ch;
      window.__CX_COURSE_RUNNER._chDone = chDone;

      render("超星助手 - 课程自动完成", ch, chTotal, chDone + 1, "跳转中...", "", 0);

      // 点击章节
      var gotoCode = GOTO.replace("\${nodeId}", ch.id);
      eval(gotoCode);
      await sleep(5000);

      var result = await processChapter();
      if (result.abort) break;
      if (result.ok) chDone++;
      else skippedCount++;

      await sleep(1000);
    }

    var msg = "课程完成 " + chDone + "/" + chTotal;
    if (skippedCount > 0) msg += " (" + skippedCount + " 个需手动完成)";
    render("超星助手 - 课程自动完成", null, chTotal, chDone, msg, "", 100);
    window.__CX_COURSE_RUNNER.running = false;
  }

  main();
})();
`;

export function buildCourseRunner({ discover, completeDoc, completeVideo, getState, chapters, gotoChapter, speed }) {
  return COURSE_RUNNER_TEMPLATE
    .replace("___DISCOVER___", JSON.stringify(discover))
    .replace("___COMPLETE_DOC___", JSON.stringify(completeDoc))
    .replace("___COMPLETE_VIDEO___", JSON.stringify(completeVideo))
    .replace("___GET_STATE___", JSON.stringify(getState))
    .replace("___CHAPTERS___", JSON.stringify(chapters))
    .replace("___GOTO___", JSON.stringify(gotoChapter))
    .replace("___SPEED___", speed === "auto" ? '"auto"' : JSON.stringify(speed || "1"));
}

export function buildRunner({ discover, completeDoc, completeVideo, getState, speed }) {
  return TASK_RUNNER_TEMPLATE
    .replace("___DISCOVER___", JSON.stringify(discover))
    .replace("___COMPLETE_DOC___", JSON.stringify(completeDoc))
    .replace("___COMPLETE_VIDEO___", JSON.stringify(completeVideo))
    .replace("___GET_STATE___", JSON.stringify(getState))
    .replace("___SPEED___", speed === "auto" ? '"auto"' : JSON.stringify(speed || "1"));
}
