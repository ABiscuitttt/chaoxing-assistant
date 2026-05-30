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
