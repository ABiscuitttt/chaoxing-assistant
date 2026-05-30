/**
 * lib/bridge.js
 * Kimi WebBridge HTTP API 封装
 *
 * 浏览器插件侧对应: extension/lib/page-api.js（直接 DOM 操作，无需 HTTP）
 */

const API = "http://127.0.0.1:10086/command";
const SESSION = "chaoxing";
const DEFAULT_TIMEOUT = 20000;
const MAX_RETRIES = 3;

/**
 * 带超时的 fetch
 * @param {string} url
 * @param {object} opts
 * @param {number} timeoutMs
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, opts, timeoutMs = DEFAULT_TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 调用 WebBridge daemon（带重试）
 * @param {string} action - 工具名 (evaluate/snapshot/click/navigate/...)
 * @param {object} args - 参数字典
 * @param {string} [session] - 会话名
 * @param {number} [retries] - 最大重试次数
 * @returns {Promise<any>} data 字段
 */
export async function call(action, args = {}, session = SESSION, retries = MAX_RETRIES) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const body = JSON.stringify({ action, args, session });
      const res = await fetchWithTimeout(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

      const json = await res.json();
      if (!json.ok) {
        const err = json.error || {};
        // 会话关闭 → 不重试，直接给出明确提示
        if (err.message && err.message.includes("tab was closed")) {
          throw new Error(`会话已关闭 — 请先在浏览器中打开超星页面，然后重新运行`);
        }
        throw new Error(`[${err.code || "unknown"}] ${err.message || JSON.stringify(err)}`);
      }

      return json.data;
    } catch (e) {
      lastError = e;

      // 不重试的情况
      if (e.name === "AbortError") {
        throw new Error(`请求超时 (${DEFAULT_TIMEOUT / 1000}s) — daemon 可能未响应`);
      }
      if (e.message.includes("会话已关闭") || e.message.includes("fetch failed") && attempt >= retries) {
        throw new Error(`无法连接到 daemon (${API}) — 请确认 kimi-webbridge 正在运行`);
      }

      if (attempt < retries) {
        const wait = attempt * 1000;
        console.warn(`⚠️ [${attempt}/${retries}] ${e.message} — ${wait / 1000}s 后重试`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }

  throw lastError || new Error("未知错误");
}

/**
 * 在浏览器中执行 JavaScript
 * @param {string} code - JS 代码
 * @param {string} [session]
 * @returns {Promise<string>} evaluate 返回的 value
 */
export async function evaluate(code, session = SESSION) {
  const data = await call("evaluate", { code }, session);
  return data.type === "string" ? data.value : JSON.stringify(data.value);
}

/**
 * 检查 daemon 连接状态
 * @returns {Promise<boolean>}
 */
export async function healthCheck() {
  try {
    await call("list_tabs", {}, SESSION, 1);
    return true;
  } catch {
    return false;
  }
}

/** 确保 daemon 连接，否则退出 */
export async function requireHealth() {
  if (!(await healthCheck())) {
    console.error("❌ WebBridge daemon 未连接，请确认浏览器扩展已运行");
    process.exit(1);
  }
}

/**
 * 导航到 URL
 * @param {string} url
 * @param {boolean} [newTab=false]
 */
export async function navigate(url, newTab = false) {
  return call("navigate", { url, newTab }, SESSION);
}

/**
 * 截图
 * @param {object} [opts]
 * @returns {Promise<{path:string, sizeBytes:number}>}
 */
export async function screenshot(opts = {}) {
  return call("screenshot", opts, SESSION);
}

/**
 * 页面快照（无障碍树）
 */
export async function snapshot() {
  return call("snapshot", {}, SESSION);
}

/**
 * 点击元素
 * @param {string} selector - CSS 选择器或 @e ref
 */
export async function click(selector) {
  return call("click", { selector }, SESSION);
}
