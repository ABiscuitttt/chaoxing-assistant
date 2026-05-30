# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

超星学习通任务点助手 — 帮助自动完成超星学习通（chaoxing.com）课程任务点的 CLI 工具 + Chrome 浏览器插件（MV3）。支持视频自动播放/进度监控、文档一键完成、附件下载、章节导航等功能。

## 前置依赖

- Node.js >= 18
- Kimi WebBridge 浏览器扩展（daemon 运行在 `127.0.0.1:10086`），CLI 通过它向浏览器注入 JS

## 命令

```bash
npm install                  # 安装依赖（仅 commander）
node scripts/build-extension.js  # 构建浏览器插件（将 shared/inject → extension/content/inject-scripts.js）
node cli.js <subcommand>     # 运行 CLI（见下方子命令）
```

没有测试套件和 lint 配置。

## 架构

### 双通道设计

CLI 和浏览器插件共享 `shared/inject/` 中的注入脚本，但**执行路径不同**：

| 通道 | 入口 | 脚本注入方式 |
|------|------|------------|
| CLI | `cli.js` → `lib/bridge.js` | HTTP POST → Kimi WebBridge daemon → `evaluate()` 在浏览器中 eval |
| 插件 | `extension/content/inject-loader.js` | Chrome messaging (popup → content script → `injectAndGet()`) |

### 目录职责

```
shared/inject/          # 核心脚本 — 所有注入浏览器的 JS（CLI 和插件共用）
  ├── discover.js       #   扫描当前章节页面的任务点（读取 setting.attachments）
  ├── chapters.js       #   提取左侧目录树 + 跳转章节
  ├── video-control.js  #   视频播放/暂停/调速/取状态
  ├── document.js       #   文档下载 URL 提取 + 触发下载
  └── task-complete.js  #   完成任务点的入口（文档调 unMaskAndFinishJob，视频调播放+监控）

lib/                    # CLI 专用
  ├── bridge.js         #   Kimi WebBridge HTTP 封装（call/evaluate/navigate/snapshot/click）
  └── commands/         #   Commander 子命令实现（每个文件 export 一个 async 函数）

extension/              # 浏览器插件（MV3）
  ├── content/          #   Content Script（自动注入超星页面）
  │   ├── inject-loader.js   #   消息路由 + 脚本注入工具（injectAndGet / injectRaw）
  │   └── inject-scripts.js  #   构建产物 — shared/inject 脚本的 window.__CX_INJECT 版本
  ├── popup/            #   弹出窗口 UI
  ├── lib/page-api.js   #   插件侧等效 API（对应 CLI 的 bridge.js）
  └── background.js     #   Service Worker（仅占位，无逻辑）

scripts/build-extension.js  # 将 shared/inject/*.js 的 export 提取为 window.__CX_INJECT 对象
```

### 注入脚本模式

`shared/inject/` 中的脚本使用两种导出模式：
- **静态模板**: `export const SCRIPT_NAME = \`...IIFE...\`` — 直接注入的 IIFE 字符串
- **参数化工厂**: `export function COMPLETE_VIDEO(speed) { return \`...\${speed}...\` }` — 函数接收参数返回模板字符串，CLI 侧直接在 JS 中调用，插件侧通过 `build-extension.js` 提取 template + params 后在运行时 `resolveTemplate()` 替换

构建脚本 (`build-extension.js`) 通过正则提取这两种模式，生成 `window.__CX_INJECT` 供 content script 使用。修改 `shared/inject/` 后必须重新构建，否则插件使用的是旧脚本。

### 关键数据流

1. **CLI 完成任务点**: `cli.js complete <jobid>` → `lib/commands/complete.js` → `bridge.evaluate(DISCOVER_SCRIPT)` 获取任务点列表 → 按类型执行 `COMPLETE_DOCUMENT` 或 `COMPLETE_VIDEO(speed)` → 视频类自动启动 `watch` 轮询进度
2. **插件探测任务点**: popup 点击 → `chrome.tabs.sendMessage("discover")` → content script 调用 `injectAndGet(S.DISCOVER_SCRIPT)` → 注入页面执行 → 结果返回 popup 显示

### 通信协议

- **WebBridge HTTP API**: `POST http://127.0.0.1:10086/command`，body: `{ action, args, session }`，session 固定为 `"chaoxing"`
- **Chrome Extension Messaging**: popup → `chrome.tabs.sendMessage` → content script listener，通过 `sendResponse` 异步返回

### 超星页面关键 DOM 结构

- 主内容区嵌套在 `#iframe` 内
- 任务点数据在 iframe 的 `window.setting.attachments` 中
- 章节目录在 `#coursetree`（课程首页）或 `.posChapter`（学习页面）
- 视频播放器为 iframe 内嵌的 video.js，选择器: `iframe.ans-insertvideo-online`
- 文档 PDF 查看器: `iframe.insertdoc-online-pdf`，内部还有 `#panView` iframe
