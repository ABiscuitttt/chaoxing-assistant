/**
 * extension/popup/popup.js
 * 弹窗控制器 — 启动/停止页面端自动完成运行器。
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

async function startRunner() { await runInPage(buildRunnerCode()); }

async function stopRunner() {
  await runInPage('(function(){var r=window.__CX_RUNNER;if(r&&r.abort)r.abort();})()');
}

document.getElementById("btn-auto").addEventListener("click", startRunner);
document.getElementById("btn-runner-stop").addEventListener("click", stopRunner);
