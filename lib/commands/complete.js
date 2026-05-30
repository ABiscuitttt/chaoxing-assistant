/**
 * lib/commands/complete.js
 * complete 命令：完成任务点
 */

import { evaluate, requireHealth } from "../bridge.js";
import { DISCOVER_SCRIPT } from "../../shared/inject/discover.js";
import { COMPLETE_DOCUMENT, COMPLETE_VIDEO } from "../../shared/inject/task-complete.js";

export async function complete(jobid, opts = {}) {
  await requireHealth();
  console.log(`🎯 目标 jobid: ${jobid}\n`);

  // 1. 探测当前任务点
  const raw = await evaluate(DISCOVER_SCRIPT);
  const data = JSON.parse(raw);
  if (data.error) { console.error("❌", data.error); return; }

  const tp = data.taskPoints.find(t => t.jobid === jobid);
  if (!tp) {
    console.error(`❌ 未找到 jobid=${jobid}`);
    console.log("可用 jobid:");
    data.taskPoints.forEach(t => console.log(`  ${t.jobid}  ${t.type}  ${t.title}`));
    return;
  }

  console.log(`   类型: ${tp.type}  |  标题: ${tp.title}`);
  console.log(`   状态: ${tp.isFinished ? "已完成" : "未完成"}`);

  if (tp.isFinished) {
    console.log("✅ 已完成，无需操作");
    return;
  }

  // 2. 按类型执行
  if (tp.type === "document") {
    console.log("\n→ 调用 unMaskAndFinishJob() ...");
    const result = await evaluate(COMPLETE_DOCUMENT);
    console.log(`   结果: ${result}`);

    // 验证
    const raw2 = await evaluate(DISCOVER_SCRIPT);
    const data2 = JSON.parse(raw2);
    const tp2 = data2.taskPoints.find(t => t.jobid === jobid);
    console.log(tp2 && tp2.isFinished ? "✅ 已标记为完成" : "⚠️ 状态未变化");
  } else if (tp.type === "video") {
    const speed = opts.speed || 2;
    console.log(`\n→ 自动播放 (${speed}x) ...`);
    const result = await evaluate(COMPLETE_VIDEO(speed));
    console.log(`   结果: ${result}`);
    if (opts.noWatch) {
      console.log(`💡 视频正在播放，需等待达到完成条件（通常 ≥90%）`);
      console.log(`   可使用 node cli.js watch ${jobid} 监控进度`);
    } else {
      console.log(`💡 启动进度监控...`);
      const { watch: watchCmd } = await import("./watch.js");
      await watchCmd(jobid);
    }
  } else {
    console.log(`⚠️ 未知类型 "${tp.type}"`);
  }
}
