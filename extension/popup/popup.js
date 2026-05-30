/**
 * extension/popup/popup.js
 * 弹窗控制面板 — 触发操作和查看进度。结果展示在页面左上角方框。
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

function safeParse(raw) {
  try { return typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return raw; }
}

/** 在页面方框中显示消息。runner 运行时只更新标题行，不覆盖进度 UI。 */
async function showInPageBox(text, isError) {
  var html = String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
  await runInPage('if(window.__CX_SHOW)window.__CX_SHOW(' + JSON.stringify(html) + ',' + !!isError + ')');
}

// ========== 构建 Runner ==========

function buildRunnerCode() {
  var sel = document.getElementById("speed-select");
  var speed = sel && sel.value ? sel.value : "1";
  return SCRIPTS.TASK_RUNNER_TEMPLATE
    .replace("___DISCOVER___", JSON.stringify(SCRIPTS.DISCOVER_SCRIPT))
    .replace("___COMPLETE_DOC___", JSON.stringify(SCRIPTS.COMPLETE_DOCUMENT))
    .replace("___COMPLETE_VIDEO___", JSON.stringify(SCRIPTS.COMPLETE_VIDEO.template))
    .replace("___GET_STATE___", JSON.stringify(SCRIPTS.GET_STATE))
    .replace("___SPEED___", JSON.stringify(speed));
}

// ========== 操作函数 ==========

async function autoCompleteAll() { await runInPage(buildRunnerCode()); }

async function checkRunnerStatus() {
  var data = safeParse(await runInPage(
    '(function(){var r=window.__CX_RUNNER;if(!r)return JSON.stringify({error:"未启动"});return JSON.stringify({running:r.running,status:r.status,progress:r.progress});})()'
  ));
  if (data.error) { await showInPageBox(data.error, true); return; }
  var p = data.progress || {};
  var statusMap = { idle:"空闲", discovering:"探测中", video:"处理视频中", done:"已完成", aborted:"已停止", error:"异常" };
  var lines = [
    "状态: " + (statusMap[data.status] || data.status),
    "进度: " + (p.completed || 0) + "/" + (p.total || "?") + "  (" + (p.overallPct || 0) + "%)"
  ];
  if (p.current && p.current.title) lines.push("当前: " + p.current.title + "  " + (p.current.pct || 0) + "% [" + (p.current.index + 1) + "/" + p.current.total + "]");
  lines.push("");
  lines.push(data.running ? "运行中" : data.status === "done" ? "已完成" : "未运行");
  await showInPageBox(lines.join("\n"));
}

async function stopRunner() {
  await runInPage('(function(){var r=window.__CX_RUNNER;if(r&&r.abort)r.abort();})()');
  await showInPageBox("已停止");
}

async function discover() {
  var data = safeParse(await runInPage(SCRIPTS.DISCOVER_SCRIPT));
  if (data.error) { await showInPageBox(data.error, true); return; }
  var lines = [];
  lines.push("课程: " + (data.courseName || "未知"));
  lines.push("章节: " + (data.chapterTitle || "未知"));
  lines.push("任务点: " + data.taskPoints.length + " 个");
  lines.push("");
  for (var i = 0; i < data.taskPoints.length; i++) {
    var tp = data.taskPoints[i];
    var icon = tp.isFinished ? "[OK]" : "[  ]";
    var type = tp.type === "video" ? "视频" : tp.type === "document" ? "文档" : tp.type;
    lines.push(icon + " " + type + "  jobid:" + tp.jobid + "  " + (tp.title || tp.filename));
    if (tp.type === "video") lines.push("     时长:" + tp.videoDuration + "s  快进:" + (tp.canDoubleSpeed ? "可" : "禁"));
    if (tp.type === "document") lines.push("     页数:" + tp.pageCount);
  }
  var done = data.taskPoints.filter(function(t) { return t.isFinished; }).length;
  lines.push("");
  lines.push(done + "/" + data.taskPoints.length + " 已完成, " + (data.taskPoints.length - done) + " 待完成");
  await showInPageBox(lines.join("\n"));
}

async function chapters() {
  var data = safeParse(await runInPage(SCRIPTS.CHAPTERS_SCRIPT));
  if (data.error) { await showInPageBox(data.error, true); return; }
  var lines = ["共 " + data.total + " 个节点 (" + data.leaves + " 个章节)", ""];
  for (var i = 0; i < data.chapters.length; i++) {
    var ch = data.chapters[i];
    lines.push("  ".repeat(ch.depth) + (ch.isLeaf ? "-" : "+") + " " + ch.number + " " + ch.title + "  [" + ch.id + "]");
  }
  await showInPageBox(lines.join("\n"));
}

async function downloadAttachment() {
  var urlData = safeParse(await runInPage(SCRIPTS.GET_DOWNLOAD_URL));
  if (!urlData || urlData.error) { await showInPageBox(urlData ? urlData.error : "未知错误", true); return; }
  if (!urlData.downloadUrl) { await showInPageBox("未找到下载链接", true); return; }
  var filename = urlData.filename || "document.pdf";
  await new Promise(function(resolve, reject) {
    chrome.downloads.download({ url: urlData.downloadUrl, filename: filename, saveAs: false }, function(id) {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(id);
    });
  });
  await showInPageBox("下载已开始\n" + filename);
}

async function watchProgress() {
  var state = safeParse(await runInPage(SCRIPTS.GET_STATE));
  if (state.error) { await showInPageBox(state.error, true); return; }
  await showInPageBox("播放: " + (state.paused ? "暂停" : "播放中") + "\n进度: " + state.progressPct + "%\n时间: " + state.currentTime + "s/" + state.duration + "s\n倍速: " + state.playbackRate + "x");
}

// ========== 按钮绑定 ==========

document.getElementById("btn-auto").addEventListener("click", autoCompleteAll);
document.getElementById("btn-runner-status").addEventListener("click", checkRunnerStatus);
document.getElementById("btn-runner-stop").addEventListener("click", stopRunner);
document.getElementById("btn-discover").addEventListener("click", discover);
document.getElementById("btn-chapters").addEventListener("click", chapters);
document.getElementById("btn-download").addEventListener("click", downloadAttachment);
document.getElementById("btn-watch").addEventListener("click", watchProgress);
