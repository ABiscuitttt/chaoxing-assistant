/**
 * scripts/release.js
 *
 * 一键发布：检查 → 更新版本 → 构建 → 打包 zip → 提交 & 打 tag
 *
 * 用法:
 *   node scripts/release.js              # 使用当前 package.json 版本发布
 *   node scripts/release.js 1.2.0        # 指定版本号发布
 *   node scripts/release.js patch        # 升 patch 版本并发布 (1.0.0→1.0.1)
 *   node scripts/release.js minor        # 升 minor 版本并发布 (1.0.0→1.1.0)
 *   node scripts/release.js major        # 升 major 版本并发布 (1.0.0→2.0.0)
 *   node scripts/release.js --dry-run    # 试运行：构建+打包，不提交不推送
 *
 * 快捷方式:
 *   npm run release                      # = node scripts/release.js
 *   npm run release:patch                # = node scripts/release.js patch
 *   npm run release:minor                # = node scripts/release.js minor
 *   npm run release:major                # = node scripts/release.js major
 */

import { execSync } from "child_process";
import { readFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");

function run(cmd, opts = {}) {
  console.log(`  → ${cmd}`);
  return execSync(cmd, { cwd: rootDir, stdio: "inherit", ...opts });
}

function runSilent(cmd, opts = {}) {
  return execSync(cmd, { cwd: rootDir, encoding: "utf-8", ...opts }).trim();
}

function step(title) {
  console.log(`\n${"=".repeat(50)}`);
  console.log(`  ${title}`);
  console.log(`${"=".repeat(50)}`);
}

// ---- 读取当前版本 ----
function getCurrentVersion() {
  const pkg = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf-8"));
  return pkg.version;
}

// ---- 解析参数 ----
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const versionArg = args.find(a => a !== "--dry-run");
const isBump = versionArg === "patch" || versionArg === "minor" || versionArg === "major";

// ---- Step 1: 检查工作区 ----
step("1/5 检查工作区");
try {
  const status = runSilent("git status --porcelain");
  if (status.trim()) {
    console.log("⚠️  工作区有未提交的更改:");
    console.log(status);
    if (!dryRun) {
      console.log("   请先提交更改再发布，或使用 --dry-run 跳过检查");
      process.exit(1);
    }
  } else {
    console.log("  ✅ 工作区干净");
  }
} catch {
  console.log("  ⚠️  无法检查 git 状态，跳过");
}

// ---- Step 2: 更新版本号 ----
step("2/5 更新版本号");

if (versionArg && !isBump && /^\d+\.\d+\.\d+/.test(versionArg)) {
  // 指定版本号
  run(`node scripts/version.js ${versionArg}`);
} else if (isBump) {
  // 升版本
  run(`node scripts/version.js ${versionArg}`);
} else {
  // 仅同步（确保所有文件一致）
  runSilent(`node scripts/version.js --sync`);
}

const version = getCurrentVersion();
console.log(`\n  📦 发布版本: v${version}${dryRun ? " (dry-run)" : ""}`);

// ---- Step 3: 构建 ----
step("3/5 构建插件");
run("node scripts/build-extension.js");

// ---- Step 4: 打包 ----
step("4/5 打包 zip");

const releaseDir = resolve(rootDir, "release");
if (!existsSync(releaseDir)) {
  mkdirSync(releaseDir);
}

const zipName = `chaoxing-assistant-v${version}.zip`;
const zipPath = resolve(releaseDir, zipName);

if (process.platform === "win32") {
  try {
    execSync(
      `Compress-Archive -Path "${resolve(rootDir, "extension")}\\*" -DestinationPath "${zipPath}" -Force`,
      { shell: "powershell.exe", stdio: "inherit" }
    );
  } catch {
    run(`tar -a -cf "${zipPath}" -C extension .`);
  }
} else {
  run(`cd extension && zip -r "${zipPath}" . && cd ..`);
}

console.log(`  ✅ ${zipName}`);

// ---- Step 5: 提交 & 打 tag ----
if (!dryRun) {
  step("5/5 提交 & 打 tag");

  run("git add package.json extension/manifest.json cli.js");
  run(`git commit -m "chore: release v${version}"`);
  run(`git tag v${version}`);
  run("git push origin master");
  run(`git push origin v${version}`);

  console.log(`\n${"=".repeat(50)}`);
  console.log(`  🎉 发布完成! v${version}`);
  console.log(`  📎 release/${zipName}`);
  console.log(`${"=".repeat(50)}`);
} else {
  step("5/5 跳过提交 (dry-run)");

  console.log(`\n${"=".repeat(50)}`);
  console.log(`  🔍 Dry-run 完成`);
  console.log(`  📎 ${zipPath}`);
  console.log(`\n  正式发布运行: node scripts/release.js ${version}`);
  console.log(`${"=".repeat(50)}`);
}
