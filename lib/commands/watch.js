/**
 * lib/commands/watch.js
 * 监控视频播放进度，轮询直到完成条件达标
 */

import { evaluate } from "../bridge.js";
import { GET_STATE } from "../../shared/inject/video-control.js";

const POLL_INTERVAL = 5000;
const THRESHOLD = 0.9;
const MAX_WAIT = 600;

export async function watch(jobid, threshold = THRESHOLD) {
  const start = Date.now();
  console.log(`👀 监控视频进度...`);
  console.log(`   目标: ≥${(threshold * 100).toFixed(0)}%  |  轮询: ${POLL_INTERVAL / 1000}s\n`);

  return new Promise((resolve) => {
    const timer = setInterval(async () => {
      try {
        const raw = await evaluate(GET_STATE);
        const state = JSON.parse(raw);

        if (state.error) {
          console.log(`\r⚠️ ${state.error}                    `);
          return;
        }

        const pct = parseFloat(state.progressPct);
        const elapsed = Math.round((Date.now() - start) / 1000);
        const mins = Math.floor(elapsed / 60);
        const secs = elapsed % 60;
        const filled = Math.max(0, Math.round(pct / 5));
        const bar = "█".repeat(filled) + "░".repeat(20 - filled);

        process.stdout.write(
          `\r   [${bar}] ${pct}%  |  ${state.currentTime}s/${state.duration || "?"}s  |  ${state.playbackRate}x  |  已过 ${mins}:${String(secs).padStart(2, "0")}`
        );

        if (pct >= threshold * 100) {
          clearInterval(timer);
          console.log("\n\n✅ 视频已完成！达到 " + pct + "%");
          resolve(state);
        }

        if (elapsed > MAX_WAIT) {
          clearInterval(timer);
          console.log(`\n\n⚠️ 超时 (${MAX_WAIT}s)，当前: ${pct}%`);
          resolve(state);
        }
      } catch (e) {
        // 忽略单次轮询错误
      }
    }, POLL_INTERVAL);
  });
}
