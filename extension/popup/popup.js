/**
 * extension/popup/popup.js
 * 弹窗控制器 — 完成本章 / 完成课程 / 停止。
 */

async function runInPage(code) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "MAIN",
    func: (c) => eval(c),
    args: [code],
  });
  return results[0].result;
}

// popup打开时确保白框存在（仅在不存在时创建，不覆盖已有内容）
runInPage(`(function(){if(document.getElementById("__cx_runner_box"))return;var b=document.createElement("div");b.id="__cx_runner_box";b.style.cssText="position:fixed;top:10px;left:10px;z-index:99999;width:300px;background:#fff;padding:8px 12px;font-family:system-ui,sans-serif;font-size:12px;box-shadow:0 4px 16px rgba(0,0,0,.15)";b.innerHTML='<div style=font-weight:bold;color:#1a73e8;font-size:12px>超星助手</div><div id=__cx_runner_head style=font-size:11px;color:#999></div><div id=__cx_runner_detail style=font-size:11px;color:#666;margin-top:1px></div><div id=__cx_runner_bar style=margin-top:3px;height:3px;background:#e0e0e0;overflow:hidden;display:none><div id=__cx_runner_fill style=height:100%;width:0%;background:#1a73e8;transition:width .3s></div></div>';document.body.appendChild(b)})()`);

function getSpeed() {
  var sel = document.getElementById("speed-select");
  return sel && sel.value ? sel.value : "1";
}

function buildChapterRunner() {
  return SCRIPTS.TASK_RUNNER_TEMPLATE
    .replace("___DISCOVER___", JSON.stringify(SCRIPTS.DISCOVER_SCRIPT))
    .replace("___COMPLETE_DOC___", JSON.stringify(SCRIPTS.COMPLETE_DOCUMENT))
    .replace("___COMPLETE_VIDEO___", JSON.stringify(SCRIPTS.COMPLETE_VIDEO.template))
    .replace("___GET_STATE___", JSON.stringify(SCRIPTS.GET_STATE))
    .replace("___SPEED___", JSON.stringify(getSpeed()));
}

function buildCourseRunner() {
  return SCRIPTS.COURSE_RUNNER_TEMPLATE
    .replace("___DISCOVER___", JSON.stringify(SCRIPTS.DISCOVER_SCRIPT))
    .replace("___COMPLETE_DOC___", JSON.stringify(SCRIPTS.COMPLETE_DOCUMENT))
    .replace("___COMPLETE_VIDEO___", JSON.stringify(SCRIPTS.COMPLETE_VIDEO.template))
    .replace("___GET_STATE___", JSON.stringify(SCRIPTS.GET_STATE))
    .replace("___CHAPTERS___", JSON.stringify(SCRIPTS.CHAPTERS_SCRIPT))
    .replace("___GOTO___", JSON.stringify(SCRIPTS.GOTO_CHAPTER.template))
    .replace("___SPEED___", JSON.stringify(getSpeed()));
}

async function startChapter() { await runInPage(buildChapterRunner()); }
async function startCourse() { await runInPage(buildCourseRunner()); }

async function stopRunner() {
  await runInPage('(function(){var r=window.__CX_COURSE_RUNNER;if(r&&r.aborted!==void 0)r.aborted=true;var c=window.__CX_RUNNER;if(c&&c.abort)c.abort();})()');
}

document.getElementById("btn-auto").addEventListener("click", startChapter);
document.getElementById("btn-course").addEventListener("click", startCourse);
document.getElementById("btn-runner-stop").addEventListener("click", stopRunner);
