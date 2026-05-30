#!/usr/bin/env node

import { Command } from "commander";
import { discover } from "./lib/commands/discover.js";
import { chapters } from "./lib/commands/chapters.js";
import { complete } from "./lib/commands/complete.js";
import { download } from "./lib/commands/download.js";
import { healthCheck, evaluate } from "./lib/bridge.js";
import { buildRunner } from "./shared/inject/task-runner.js";
import { DISCOVER_SCRIPT } from "./shared/inject/discover.js";
import { COMPLETE_DOCUMENT, COMPLETE_VIDEO } from "./shared/inject/task-complete.js";
import { GET_STATE } from "./shared/inject/video-control.js";

const VERSION = "1.0.0";
const program = new Command();

program
  .name("chaoxing")
  .version(VERSION)
  .description("超星学习通任务点助手");

program
  .command("discover")
  .description("探测当前章节所有任务点")
  .action(discover);

program
  .command("chapters")
  .description("列出课程全部章节")
  .action(chapters);

program
  .command("complete")
  .description("完成指定任务点（文档调 finishJob，视频自动播放+监控）")
  .argument("<jobid>", "任务点 jobid")
  .option("-s, --speed <speed>", "视频倍速", "2")
  .option("--no-watch", "不启动进度监控")
  .action(async (jobid, opts) => {
    await complete(jobid, {
      speed: parseFloat(opts.speed) || 2,
      noWatch: opts.noWatch,
    });
  });

program
  .command("watch")
  .description("监控视频播放进度直到 ≥90%")
  .argument("<jobid>", "任务点 jobid")
  .option("-t, --threshold <pct>", "完成阈值", "0.9")
  .action(async (jobid, opts) => {
    const threshold = parseFloat(opts.threshold) || 0.9;
    const { watch: watchCmd } = await import("./lib/commands/watch.js");
    await watchCmd(jobid, threshold);
  });

program
  .command("goto")
  .description("跳转到指定章节（编号/ID/关键词）")
  .argument("<query>", "章节编号、nodeId 或标题关键词")
  .action(async (query) => {
    const { goto: gotoCmd } = await import("./lib/commands/goto.js");
    await gotoCmd(query);
  });

program
  .command("download")
  .description("下载文档附件（不传则下载第一个）")
  .argument("[jobid]", "任务点 jobid")
  .action(async (jobid) => {
    await download(jobid || null);
  });

program
  .command("status")
  .description("检查 WebBridge 连接状态")
  .action(async () => {
    console.log(await healthCheck() ? "running" : "not running");
  });

program
  .command("auto")
  .description("注入自动完成运行器到页面（独立运行，CLI 可退出）")
  .option("--fast", "自动使用视频支持的最大倍速")
  .action(async (opts) => {
    const ok = await healthCheck();
    if (!ok) {
      console.error("❌ WebBridge daemon 未连接，请确认浏览器扩展已运行");
      process.exit(1);
    }
    console.log("🚀 注入自动完成运行器...");
    const code = buildRunner({
      discover: DISCOVER_SCRIPT,
      completeDoc: COMPLETE_DOCUMENT,
      completeVideo: COMPLETE_VIDEO("${rate}"),
      getState: GET_STATE,
      speed: opts.fast ? "auto" : "1",
    });
    const result = await evaluate(code);
    console.log("✅ 运行器已注入，查看页面左上角面板");
    console.log("   CLI 可以退出，运行器在页面内独立工作");
    console.log(`   初始状态: ${result}`);
  });

program.parse();
