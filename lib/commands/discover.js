/**
 * lib/commands/discover.js
 * discover 命令：探测任务点
 */

import { evaluate, requireHealth } from "../bridge.js";
import { DISCOVER_SCRIPT } from "../../shared/inject/discover.js";

export async function discover() {
  await requireHealth();
  console.log("🔍 探测当前章节任务点...\n");
  const raw = await evaluate(DISCOVER_SCRIPT);
  const data = JSON.parse(raw);

  if (data.error) {
    console.error("❌", data.error);
    return data;
  }

  console.log(`📚 课程: ${data.courseName || "未知"}`);
  console.log(`📖 章节: ${data.chapterTitle || "未知"}`);
  console.log(`📋 任务点: ${data.taskPoints.length} 个\n`);

  for (const tp of data.taskPoints) {
    const icon = tp.isFinished ? "✅" : "⬜";
    const typeLabel =
      tp.type === "video" ? "🎬 视频" :
      tp.type === "document" ? "📄 文档" :
      `📦 ${tp.type}`;

    console.log(`── 任务点 ${tp.index + 1} ${icon} ${typeLabel} ──`);
    console.log(`   jobid    : ${tp.jobid}`);
    console.log(`   标题     : ${tp.title || tp.filename}`);
    console.log(`   模块     : ${tp.module}`);

    if (tp.type === "video") {
      const mins = Math.floor(tp.videoDuration / 60);
      const secs = tp.videoDuration % 60;
      console.log(`   时长     : ${mins}分${secs}秒 (${tp.videoDuration}s)`);
      console.log(`   快进     : ${tp.canFastForward ? "允许" : "禁止"}`);
      console.log(`   倍速     : ${tp.canDoubleSpeed ? "允许" : "禁止"}`);
      console.log(`   大小     : ${tp.sizeHuman}`);
      if (tp.completionCondition) console.log(`   完成条件 : ${tp.completionCondition}`);
    }

    if (tp.type === "document") {
      console.log(`   页数     : ${tp.pageCount}`);
      console.log(`   大小     : ${tp.sizeHuman}`);
      console.log(`   jtoken   : ${tp.jtoken}`);
      if (tp.completionCondition) console.log(`   状态提示 : ${tp.completionCondition}`);
    }

    if (tp.iconClass) console.log(`   UI状态   : ${tp.iconClass}`);
    console.log("");
  }

  const done = data.taskPoints.filter(t => t.isFinished).length;
  const total = data.taskPoints.length;
  console.log(`📊 汇总: ${done}/${total} 已完成，${total - done} 待完成`);

  if (data.raw && data.raw.defaults) {
    console.log(`\n⚙ 上报间隔: ${data.raw.defaults.reportTimeInterval}s | 用户: ${data.raw.defaults.userid}`);
  }

  return data;
}
