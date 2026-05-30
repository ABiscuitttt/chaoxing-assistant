/**
 * extension/background.js
 *
 * Service Worker — 中转 popup 与 content script 之间的消息
 * 职责极简：仅转发，不包含业务逻辑
 */

// content script 自动在 chaoxing 页面注入（见 manifest.json content_scripts）
// popup 通过 chrome.tabs.sendMessage 直接与 content script 通信
// background 只需存在，无需额外逻辑
