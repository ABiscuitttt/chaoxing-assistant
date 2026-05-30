/**
 * lib/commands/download.js
 * download 命令：下载文档附件
 */

import { evaluate, requireHealth } from "../bridge.js";
import { DISCOVER_SCRIPT } from "../../shared/inject/discover.js";
import { GET_DOWNLOAD_URL, TRIGGER_DOWNLOAD } from "../../shared/inject/document.js";

export async function download(jobid) {
  await requireHealth();
  // 1. 探测找任务点
  const raw = await evaluate(DISCOVER_SCRIPT);
  const data = JSON.parse(raw);
  if (data.error) { console.error("❌", data.error); return; }

  const tp = jobid
    ? data.taskPoints.find(t => t.jobid === jobid)
    : data.taskPoints.find(t => t.type === "document");

  if (!tp) {
    console.error(jobid ? `❌ 未找到 jobid=${jobid}` : "❌ 当前页面无文档任务点");
    return;
  }

  console.log(`📄 文档: ${tp.title || tp.filename}`);
  console.log(`   jobid: ${tp.jobid}\n`);

  // 2. 提取下载 URL
  console.log("→ 提取下载链接...");
  const rawUrl = await evaluate(GET_DOWNLOAD_URL);
  const urlData = JSON.parse(rawUrl);

  if (urlData.error || !urlData.downloadUrl) {
    console.error("❌ 无法获取下载链接:", urlData.error || "未找到");
    return;
  }

  console.log(`   URL: ${urlData.downloadUrl.slice(0, 80)}...`);
  if (urlData.filename) console.log(`   文件名: ${urlData.filename}`);

  // 3. 触发浏览器下载
  const filename = urlData.filename || tp.filename || "document.pdf";
  console.log(`\n→ 触发浏览器下载: ${filename}`);
  const result = await evaluate(TRIGGER_DOWNLOAD(urlData.downloadUrl, filename));
  console.log(`   ${result}`);

  console.log(`\n💡 文件将保存到浏览器默认下载目录`);
}
