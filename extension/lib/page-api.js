/**
 * extension/lib/page-api.js
 *
 * 浏览器插件侧的页面操作 API，对应 CLI 侧的 lib/bridge.js
 *
 * 插件直接通过 content script 访问 DOM，无需 HTTP 中转
 * 与 bridge.js 保持相同的函数签名，使 shared/inject/ 脚本可复用
 */

/**
 * 在页面中执行 JavaScript（模拟 CLI 的 evaluate）
 *
 * 插件场景: content script 可以直接 eval 注入脚本
 * 这与 CLI 通过 WebBridge HTTP → eval 的效果一致
 *
 * @param {string} code - JS 代码
 * @returns {Promise<string>} 执行结果
 */
export async function evaluate(code) {
  // content script 在页面 JS 上下文中执行
  try {
    const result = eval(code);
    return typeof result === "string" ? result : JSON.stringify(result);
  } catch (e) {
    return JSON.stringify({ error: e.message });
  }
}

/**
 * 触发浏览器下载（使用 chrome.downloads API）
 * 对应 CLI 侧通过 WebBridge evaluate 创建 <a> 标签
 *
 * @param {string} url
 * @param {string} filename
 */
export async function download(url, filename) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download(
      { url, filename, saveAs: false },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve({ downloadId });
        }
      }
    );
  });
}

/**
 * 导航到 URL
 * @param {string} url
 */
export function navigate(url) {
  window.location.href = url;
}

/**
 * 读取当前页面 URL
 * @returns {string}
 */
export function currentUrl() {
  return window.location.href;
}

/**
 * 获取当前页面的 cookie
 * @returns {string}
 */
export function cookies() {
  return document.cookie;
}
