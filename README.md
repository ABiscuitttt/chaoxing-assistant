# chaoxing-assistant

超星学习通任务点助手 — CLI + 浏览器插件

## 安装

```bash
cd chaoxing-assistant
npm install
```

**依赖:** Node.js >= 18, Kimi WebBridge 浏览器扩展

## 用法

```bash
node cli.js discover             # 探测当前章节所有任务点
node cli.js chapters             # 列出课程全部章节
node cli.js goto <query>         # 跳转到指定章节
node cli.js complete <jobid>     # 完成任务点（文档/视频）
node cli.js watch <jobid>        # 监控视频进度直到 >=90%
node cli.js download [jobid]     # 下载文档附件
node cli.js status               # 检查 WebBridge 连接
```

## 命令详解

### discover

```
node cli.js discover
```

探测当前章节页面的所有任务点，输出 jobid、类型、文件名、完成状态。

### chapters

```
node cli.js chapters
```

以树形结构列出全部章节及其 nodeId。

### goto

```
node cli.js goto 14.1
node cli.js goto Criteria
```

按编号、nodeId 或标题关键词跳转到目标章节。

### complete

```
node cli.js complete 1779155898745152           # 文档：调 finishJob
node cli.js complete 1779063959316657 -s 2      # 视频：播放 + 监控
node cli.js complete 1779063959316657 --no-watch # 视频：播放但不监控
```

### watch

```
node cli.js watch 1779063959316657               # 默认 >=90%
node cli.js watch 1779063959316657 -t 0.95       # >=95%
```

### download

```
node cli.js download                             # 下载第一个文档
node cli.js download 1779155898745152            # 下载指定 jobid
```

## 项目结构

```
├── cli.js                  # CLI 入口
├── shared/inject/          # 注入脚本（CLI + 插件共用）
│   ├── discover.js
│   ├── chapters.js
│   ├── video-control.js
│   ├── document.js
│   └── task-complete.js
├── lib/                    # CLI 专用
│   ├── bridge.js           #   WebBridge HTTP 封装
│   └── commands/           #   各子命令实现
├── extension/              # 浏览器插件（MV3）
│   ├── content/            #   Content Script
│   └── popup/              #   弹出窗口
├── scripts/                # 构建脚本
│   └── build-extension.js  #   打包 shared/inject → extension
└── docs/superpowers/plans/ # 开发计划
```

## License

Apache-2.0
