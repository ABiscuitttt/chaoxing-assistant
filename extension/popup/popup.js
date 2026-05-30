/**
 * extension/popup/popup.js
 *
 * 弹窗控制面板 — 只负责触发操作和查看进度。
 * 所有结果显示在页面左上角的浮动方框中，弹窗本身不展示结果。
 */

// ========== 核心工具 ==========

async function runInPage(code) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error("无法获取当前标签页");
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "MAIN",
    func: (c) => eval(c),
    args: [code],
  });
  return results[0].result;
}

/** 在页面方框中显示消息（先注入 runner 模板初始化 __CX_SHOW，再调用） */
async function showInPageBox(text, isError) {
  const html = String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
  // 先确保 __CX_SHOW 存在（注入 runner 模板会初始化它）
  // 如果 runner 不在运行，__CX_SHOW 可能来自之前的注入
  await runInPage(`
    (function(){
      if (window.__CX_SHOW) {
        window.__CX_SHOW(${JSON.stringify(html)}, ${isError});
        return "ok";
      }
      // 回退：创建简单框
      var b = document.getElementById("__cx_runner_box");
      if (!b) {
        b = document.createElement("div");
        b.id = "__cx_runner_box";
        b.style.cssText = "position:fixed;top:10px;left:10px;z-index:99999;max-width:340px;max-height:400px;overflow-y:auto;background:#fff;border:1px solid #ddd;padding:12px 14px;font-family:system-ui,sans-serif;font-size:12px;box-shadow:0 4px 16px rgba(0,0,0,0.15);";
        document.body.appendChild(b);
      }
      b.innerHTML = '<div style="font-weight:bold;margin-bottom:6px;color:#1a73e8;">超星助手</div><div style="font-size:11px;color:#333;line-height:1.5;white-space:pre-wrap;word-break:break-all;">' + ${JSON.stringify(html)} + '</div><div style="margin-top:6px;font-size:10px;color:#999;">点击右上角 X 关闭</div>';
      var cb = document.createElement("span");
      cb.textContent = "✕";
      cb.style.cssText = "position:absolute;top:8px;right:10px;cursor:pointer;color:#999;font-size:14px;line-height:1;";
      cb.onclick = function() { b.remove(); };
      b.appendChild(cb);
      window.__CX_SHOW = function(h, err) {
        b.innerHTML = '<div style="font-weight:bold;margin-bottom:6px;color:#1a73e8;">超星助手</div><div style="font-size:11px;color:' + (err?'#d93025':'#333') + ';line-height:1.5;white-space:pre-wrap;word-break:break-all;">' + h + '</div><div style="margin-top:6px;font-size:10px;color:#999;">点击右上角 X 关闭</div>';
        var cb2 = document.createElement("span");
        cb2.textContent = "✕";
        cb2.style.cssText = "position:absolute;top:8px;right:10px;cursor:pointer;color:#999;font-size:14px;line-height:1;";
        cb2.onclick = function() { b.remove(); };
        b.appendChild(cb2);
      };
      return "created";
    })();
  `);
}

// ========== 构建 Runner 脚本 ==========

function buildRunnerCode() {
  const completeVideo = SCRIPTS.COMPLETE_VIDEO.template.replace("${rate}", "2");
  return SCRIPTS.TASK_RUNNER_TEMPLATE
    .replace("___DISCOVER___", JSON.stringify(SCRIPTS.DISCOVER_SCRIPT))
    .replace("___COMPLETE_DOC___", JSON.stringify(SCRIPTS.COMPLETE_DOCUMENT))
    .replace("___COMPLETE_VIDEO___", JSON.stringify(completeVideo))
    .replace("___GET_STATE___", JSON.stringify(SCRIPTS.GET_STATE));
}

// ========== 操作函数 ==========

async function autoCompleteAll() {
  const code = buildRunnerCode();
  await runInPage(code);
  // 结果由 runner 自己在方框中更新，弹窗不需要做任何事
}

async function checkRunnerStatus() {
  const raw = await runInPage(`
    (function(){
      var r = window.__CX_RUNNER;
      if (!r) return JSON.stringify({error:"未启动"});
      return JSON.stringify({
        running: r.running,
        status: r.status,
        progress: r.progress,
      });
    })();
  `);
  let data;
  try { data = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { data = raw; return; }
  if (data.error) { await showInPageBox(data.error, true); return; }

  const p = data.progress || {};
  const statusMap = {
    idle: "空闲", discovering: "探测中", video: "处理视频中",
    done: "已完成", aborted: "已停止", error: "异常",
  };
  const lines = [];
  lines.push(`状态: ${statusMap[data.status] || data.status}`);
  lines.push(`进度: ${p.completed || 0}/${p.total || "?"}  (${p.overallPct || 0}%)`);
  if (p.current && p.current.title) {
    lines.push(`当前: 🎬 ${p.current.title}`);
    lines.push(`      视频进度 ${p.current.pct || 0}%  [${p.current.index + 1}/${p.current.total}]`);
  }
  lines.push("");
  lines.push(data.running ? "🟢 运行中" : data.status === "done" ? "✅ 已完成" : "⚪ 未运行");
  await showInPageBox(lines.join("\n"));
}

async function stopRunner() {
  await runInPage(`
    (function(){
      var r = window.__CX_RUNNER;
      if (r && r.abort) { r.abort(); return "stopped"; }
      return "not running";
    })();
  `);
  await showInPageBox("⏹ 已停止");
}

async function discover() {
  const raw = await runInPage(SCRIPTS.DISCOVER_SCRIPT);
  let data;
  try { data = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { data = raw; }
  if (data.error) { await showInPageBox(data.error, true); return; }

  const lines = [];
  lines.push(`📚 课程: ${data.courseName || "未知"}`);
  lines.push(`📖 章节: ${data.chapterTitle || "未知"}`);
  lines.push(`📋 任务点: ${data.taskPoints.length} 个`);
  lines.push("");

  for (const tp of data.taskPoints) {
    const icon = tp.isFinished ? "✅" : "⬜";
    const typeLabel =
      tp.type === "video" ? "🎬 视频" :
      tp.type === "document" ? "📄 文档" : `📦 ${tp.type}`;
    lines.push(`── ${icon} ${typeLabel} ──`);
    lines.push(`   jobid : ${tp.jobid}`);
    lines.push(`   标题  : ${tp.title || tp.filename}`);
    if (tp.type === "video") {
      const m = Math.floor(tp.videoDuration / 60);
      const s = tp.videoDuration % 60;
      lines.push(`   时长  : ${m}分${s}秒  |  ${tp.canDoubleSpeed ? "可倍速" : "禁止倍速"}`);
    }
    if (tp.type === "document") {
      lines.push(`   页数  : ${tp.pageCount}  |  jtoken: ${tp.jtoken}`);
    }
    lines.push("");
  }

  const done = data.taskPoints.filter((t) => t.isFinished).length;
  const total = data.taskPoints.length;
  lines.push(`📊 ${done}/${total} 已完成，${total - done} 待完成`);
  await showInPageBox(lines.join("\n"));
}

async function chapters() {
  const raw = await runInPage(SCRIPTS.CHAPTERS_SCRIPT);
  let data;
  try { data = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { data = raw; }
  if (data.error) { await showInPageBox(data.error, true); return; }

  const lines = [];
  lines.push(`共 ${data.total} 个节点（${data.leaves} 个叶子章节）`);
  lines.push("");
  for (const ch of data.chapters) {
    const indent = "  ".repeat(ch.depth);
    const icon = ch.isLeaf ? "📄" : "📁";
    lines.push(`${indent}${icon} ${ch.number} ${ch.title}  [${ch.id}]`);
  }
  await showInPageBox(lines.join("\n"));
}

async function downloadAttachment() {
  const rawUrl = await runInPage(SCRIPTS.GET_DOWNLOAD_URL);
  let urlData;
  try { urlData = typeof rawUrl === "string" ? JSON.parse(rawUrl) : rawUrl; } catch { urlData = rawUrl; }
  if (!urlData || urlData.error) { await showInPageBox(urlData?.error || "未知错误", true); return; }
  if (!urlData.downloadUrl) { await showInPageBox("未找到下载链接", true); return; }

  const filename = urlData.filename || "document.pdf";
  await new Promise((resolve, reject) => {
    chrome.downloads.download(
      { url: urlData.downloadUrl, filename, saveAs: false },
      (id) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(id);
      }
    );
  });
  await showInPageBox(`📥 下载已开始\n文件名: ${filename}`);
}

async function watchProgress() {
  const raw = await runInPage(SCRIPTS.GET_STATE);
  let state;
  try { state = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { state = raw; }
  const lines = [];
  if (state.error) {
    lines.push(`⚠️ ${state.error}`);
  } else {
    lines.push(`播放状态: ${state.paused ? "暂停" : "播放中"}`);
    lines.push(`进度: ${state.progressPct}%`);
    lines.push(`时间: ${state.currentTime}s / ${state.duration}s`);
    lines.push(`倍速: ${state.playbackRate}x`);
  }
  await showInPageBox(lines.join("\n"));
}

// ========== 按钮绑定 ==========

document.getElementById("btn-auto").addEventListener("click", () => {
  autoCompleteAll();
});

document.getElementById("btn-runner-status").addEventListener("click", () => {
  checkRunnerStatus();
});

document.getElementById("btn-runner-stop").addEventListener("click", () => {
  stopRunner();
});

document.getElementById("btn-discover").addEventListener("click", () => {
  discover();
});

document.getElementById("btn-chapters").addEventListener("click", () => {
  chapters();
});

document.getElementById("btn-download").addEventListener("click", () => {
  downloadAttachment();
});

document.getElementById("btn-watch").addEventListener("click", () => {
  watchProgress();
});
