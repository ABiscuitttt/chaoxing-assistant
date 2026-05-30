/**
 * scripts/version.js
 *
 * 集中式版本管理 — package.json 为唯一版本源，同步到所有引用位置。
 *
 * 用法:
 *   node scripts/version.js              # 显示当前版本
 *   node scripts/version.js --sync       # 从 package.json 同步版本到所有文件
 *   node scripts/version.js --check      # 检查所有文件版本是否一致（CI 用）
 *   node scripts/version.js patch        # 升 patch 版本并同步
 *   node scripts/version.js minor        # 升 minor 版本并同步
 *   node scripts/version.js major        # 升 major 版本并同步
 *   node scripts/version.js 1.2.3        # 设置指定版本并同步
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");

// ---- 文件路径 ----
const files = {
  pkg: resolve(rootDir, "package.json"),
  cli: resolve(rootDir, "cli.js"),
  manifest: resolve(rootDir, "extension", "manifest.json"),
};

// ---- 读取当前版本源 ----
function readSourceVersion() {
  const pkg = JSON.parse(readFileSync(files.pkg, "utf-8"));
  return pkg.version;
}

// ---- 同步版本到各文件 ----
function syncVersion(version) {
  const results = [];

  // package.json（本身也是同步目标）
  const pkg = JSON.parse(readFileSync(files.pkg, "utf-8"));
  if (pkg.version !== version) {
    pkg.version = version;
    writeFileSync(files.pkg, JSON.stringify(pkg, null, 2) + "\n");
    results.push(`package.json → ${version}`);
  }

  // cli.js: 动态读 package.json，通常无需同步，但保留硬编码回退的兼容
  if (existsSync(files.cli)) {
    let content = readFileSync(files.cli, "utf-8");
    const dynRe = /const VERSION\s*=\s*JSON\.parse\(/;
    const hardRe = /const VERSION\s*=\s*"([\d.]+)"/;
    if (dynRe.test(content)) {
      // 动态读取，无需同步
      results.push(`cli.js: 动态读取 (无需同步)`);
    } else if (hardRe.test(content)) {
      const oldVer = content.match(hardRe)[1];
      if (oldVer !== version) {
        content = content.replace(hardRe, `const VERSION = "${version}"`);
        writeFileSync(files.cli, content);
        results.push(`cli.js → ${version}`);
      }
    } else {
      results.push(`⚠️  cli.js: 未找到 VERSION 常量`);
    }
  }

  // extension/manifest.json
  if (existsSync(files.manifest)) {
    const manifest = JSON.parse(readFileSync(files.manifest, "utf-8"));
    if (manifest.version !== version) {
      manifest.version = version;
      writeFileSync(files.manifest, JSON.stringify(manifest, null, 2) + "\n");
      results.push(`extension/manifest.json → ${version}`);
    }
  }

  return results;
}

// ---- 检查版本一致性 ----
function checkConsistency() {
  const source = readSourceVersion();
  const issues = [];

  // 检查 cli.js
  if (existsSync(files.cli)) {
    const content = readFileSync(files.cli, "utf-8");
    const dynRe = /const VERSION\s*=\s*JSON\.parse\(/;
    const hardRe = /const VERSION\s*=\s*"([\d.]+)"/;
    if (dynRe.test(content)) {
      // 动态读取 package.json，始终一致
    } else if (hardRe.test(content)) {
      const ver = content.match(hardRe)[1];
      if (ver !== source) {
        issues.push(`cli.js: ${ver} (期望 ${source})`);
      }
    } else {
      issues.push("cli.js: 未找到 VERSION 常量");
    }
  }

  // 检查 manifest.json
  if (existsSync(files.manifest)) {
    const manifest = JSON.parse(readFileSync(files.manifest, "utf-8"));
    if (manifest.version !== source) {
      issues.push(`extension/manifest.json: ${manifest.version} (期望 ${source})`);
    }
  }

  return issues;
}

// ---- 版本号增减 ----
function bumpVersion(current, level) {
  const parts = current.split(".").map(Number);
  switch (level) {
    case "major":
      parts[0]++;
      parts[1] = 0;
      parts[2] = 0;
      break;
    case "minor":
      parts[1]++;
      parts[2] = 0;
      break;
    case "patch":
      parts[2]++;
      break;
  }
  return parts.join(".");
}

// ---- 入口 ----
const arg = process.argv[2];
const current = readSourceVersion();

if (!arg) {
  // 显示当前版本
  console.log(`当前版本: ${current}`);
  const issues = checkConsistency();
  if (issues.length > 0) {
    console.log(`\n⚠️  版本不一致:`);
    issues.forEach(i => console.log(`   ${i}`));
    console.log(`\n   运行 node scripts/version.js --sync 来修复`);
  } else {
    console.log(`✅ 所有文件版本一致`);
  }
} else if (arg === "--sync") {
  console.log(`同步版本 ${current} 到所有文件...`);
  const results = syncVersion(current);
  if (results.length === 0) {
    console.log("   (所有文件已是最新)");
  } else {
    results.forEach(r => console.log(`   ✅ ${r}`));
  }
} else if (arg === "--check") {
  const issues = checkConsistency();
  if (issues.length > 0) {
    console.error(`❌ 版本不一致:`);
    issues.forEach(i => console.error(`   ${i}`));
    process.exit(1);
  }
  console.log(`✅ 所有文件版本一致 (${current})`);
} else if (arg === "patch" || arg === "minor" || arg === "major") {
  const newVersion = bumpVersion(current, arg);
  console.log(`${current} → ${newVersion} (${arg})`);
  const results = syncVersion(newVersion);
  results.forEach(r => console.log(`   ✅ ${r}`));
  console.log(`\n🎯 版本已更新: ${newVersion}`);
} else if (/^\d+\.\d+\.\d+/.test(arg)) {
  console.log(`${current} → ${arg}`);
  const results = syncVersion(arg);
  results.forEach(r => console.log(`   ✅ ${r}`));
  console.log(`\n🎯 版本已更新: ${arg}`);
} else {
  console.error(`❌ 未知参数: ${arg}`);
  console.error("   用法: node scripts/version.js [--sync|--check|patch|minor|major|<version>]");
  process.exit(1);
}
