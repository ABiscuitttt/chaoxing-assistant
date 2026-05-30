/**
 * lib/commands/chapters.js
 * chapters 命令：列出所有章节
 */

import { evaluate, requireHealth } from "../bridge.js";
import { CHAPTERS_SCRIPT } from "../../shared/inject/chapters.js";

export async function chapters() {
  await requireHealth();
  console.log("📖 提取章节列表...\n");
  const raw = await evaluate(CHAPTERS_SCRIPT);
  const data = JSON.parse(raw);

  if (data.error) {
    console.error("❌", data.error);
    return data;
  }

  console.log(`共 ${data.total} 个节点（${data.leaves} 个叶子章节）\n`);

  // 按缩进输出树形结构
  for (const ch of data.chapters) {
    const indent = "  ".repeat(ch.depth);
    const icon = ch.isLeaf ? "📄" : "📁";
    const status = ch.isLeaf ? (ch.unfinished > 0 ? ` [${ch.unfinished}]` : " ✅") : "";
    console.log(`${indent}${icon} ${ch.number} ${ch.title}${status}  [${ch.id}]`);
  }

  return data;
}
