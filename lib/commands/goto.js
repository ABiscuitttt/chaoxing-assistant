/**
 * lib/commands/goto.js
 * 跳转到指定章节
 */

import { evaluate, healthCheck } from "../bridge.js";
import { CHAPTERS_SCRIPT, GOTO_CHAPTER } from "../../shared/inject/chapters.js";

export async function goto(query) {
  const ok = await healthCheck();
  if (!ok) { console.error("❌ WebBridge daemon 未连接"); process.exit(1); }

  // 1. 获取章节列表
  const raw = await evaluate(CHAPTERS_SCRIPT);
  const data = JSON.parse(raw);
  if (data.error) { console.error("❌", data.error); return; }

  // 2. 匹配章节
  let target;
  const leaves = data.chapters.filter((c) => c.isLeaf);
  const all = data.chapters;

  if (/^\d+$/.test(query)) {
    // 按索引
    const idx = parseInt(query) - 1;
    target = leaves[idx] || all.find((c) => c.id === query) || all.find((c) => c.number === query);
  } else if (/^\d+(\.\d+)+$/.test(query)) {
    // 按编号 (e.g. "14.1" 或 "3.2.1")
    target = leaves.find((c) => c.number === query) || all.find((c) => c.number === query);
  } else if (/^\d+$/.test(query.replace(/^cur/, ""))) {
    // 按 nodeId (e.g. "1173162102" 或 "cur1173162102")
    const id = query.replace(/^cur/, "");
    target = all.find((c) => c.id === id);
  } else {
    // 按标题关键词
    target = leaves.find((c) => c.title.includes(query)) || all.find((c) => c.title.includes(query));
  }

  if (!target) {
    console.error(`❌ 未找到匹配 "${query}" 的章节`);
    console.log(`   可用章节数: ${leaves.length}`);
    console.log("   前 10 个:");
    leaves.slice(0, 10).forEach((c) => console.log(`     ${c.number}  ${c.title.slice(0, 50)}`));
    return;
  }

  if (!target.id) {
    console.error(`❌ "${target.number} ${target.title}" 无 nodeId，无法导航`);
    return;
  }

  console.log(`→ ${target.number} ${target.title}`);
  console.log(`  nodeId: ${target.id}`);
  const result = await evaluate(GOTO_CHAPTER(target.id));
  console.log(`  ${result}`);

  if (result.includes("not found")) {
    console.log("💡 章节列表已加载但 DOM 中未找到该节点，可能需要先回到课程首页");
  } else {
    console.log("⏳ 等待页面加载...");
    await new Promise((r) => setTimeout(r, 3000));
    console.log("✅ 导航完成");
  }
}
