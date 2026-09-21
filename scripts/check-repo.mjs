import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const skippedDirectories = new Set([".git", ".local", "node_modules", "dist"]);
const skippedFiles = new Set([
  "content/.obsidian/workspace.json",
  "content/.obsidian/workspace-mobile.json"
]);
const textExtensions = new Set([
  ".cmd", ".css", ".example", ".html", ".js", ".json", ".md", ".mjs",
  ".npmrc", ".ps1", ".svg", ".txt", ".yaml", ".yml"
]);
const forbiddenLocalPatterns = [
  new RegExp(["C:", "[\\\\/]", "Users", "[\\\\/]"].join(""), "i"),
  new RegExp(["codex", "-runtimes"].join(""), "i"),
  new RegExp(["codex", "-primary-runtime"].join(""), "i")
];

function normalize(value) {
  return value.split(path.sep).join("/");
}

async function walk(directory) {
  const output = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && skippedDirectories.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    const relative = normalize(path.relative(root, fullPath));
    if (skippedFiles.has(relative)) continue;
    if (entry.isDirectory()) output.push(...await walk(fullPath));
    if (entry.isFile()) output.push(fullPath);
  }
  return output;
}

async function read(relativePath) {
  return fs.readFile(path.join(root, relativePath), "utf8");
}

const packageManifest = JSON.parse(await read("package.json"));
const nodeVersion = (await read(".node-version")).trim();
const workflow = await read(".github/workflows/deploy.yml");
const gitignore = await read(".gitignore");
const siteCommand = await read("site.cmd");
const setupScript = await read("scripts/setup-tools.ps1");

if (packageManifest.packageManager !== "pnpm@11.19.0") failures.push("packageManager 버전이 고정값과 다릅니다.");
if (packageManifest.engines?.node !== ">=22.13.0 <23") failures.push("Node.js 엔진 범위가 pnpm 11 요구사항과 다릅니다.");
if (packageManifest.engines?.pnpm !== "11.19.0") failures.push("pnpm 엔진 버전이 고정되지 않았습니다.");
if (nodeVersion !== "22.22.1") failures.push(".node-version이 검증된 Node.js 버전과 다릅니다.");
if (!workflow.includes("uses: actions/checkout@v7")) failures.push("GitHub Actions가 검증된 checkout 버전을 사용하지 않습니다.");
if (!workflow.includes("uses: pnpm/setup@v2")) failures.push("GitHub Actions가 검증된 pnpm/setup 버전을 사용하지 않습니다.");
if (!workflow.includes("version: 11.19.0")) failures.push("GitHub Actions의 pnpm 버전이 일치하지 않습니다.");
if (!workflow.includes("runtime: node@22.22.1")) failures.push("GitHub Actions의 Node.js 버전이 일치하지 않습니다.");
if (!workflow.includes("uses: actions/configure-pages@v5")) failures.push("Pages 설정 액션 버전이 검증값과 다릅니다.");
if (!workflow.includes("uses: actions/upload-pages-artifact@v5") || !workflow.includes("include-hidden-files: true")) failures.push("Pages 업로드가 .nojekyll을 포함하도록 설정되지 않았습니다.");
if (!workflow.includes("uses: actions/deploy-pages@v5")) failures.push("Pages 배포 액션 버전이 검증값과 다릅니다.");
if (!workflow.includes("pnpm install --frozen-lockfile")) failures.push("GitHub Actions가 잠금 파일 고정 설치를 사용하지 않습니다.");
if (!siteCommand.includes("scripts\\setup-tools.ps1")) failures.push("site.cmd가 로컬 도구 부트스트랩을 호출하지 않습니다.");
if (!siteCommand.includes(".local\\pnpm.cmd")) failures.push("site.cmd does not use pnpm from .local.");
if (!setupScript.includes("https://nodejs.org/dist/")) failures.push("Node.js 공식 배포 주소가 부트스트랩에 없습니다.");

for (const requiredIgnore of [
  "node_modules/",
  ".local/",
  "dist/",
  ".env",
  "content/.obsidian/workspace.json"
]) {
  if (!gitignore.includes(requiredIgnore)) failures.push(".gitignore 누락: " + requiredIgnore);
}

const files = await walk(root);
for (const filePath of files) {
  const relative = normalize(path.relative(root, filePath));
  const extension = path.extname(filePath).toLowerCase();
  const basename = path.basename(filePath);
  const isText = textExtensions.has(extension) || basename.startsWith(".") || basename === "site.cmd";
  if (!isText) continue;

  const content = await fs.readFile(filePath, "utf8");
  if (forbiddenLocalPatterns.some(pattern => pattern.test(content))) {
    failures.push(relative + ": 현재 PC 또는 Codex 절대 경로가 포함되어 있습니다.");
  }

  if (extension === ".json") {
    try {
      JSON.parse(content);
    } catch (error) {
      failures.push(relative + ": JSON 구문 오류: " + error.message);
    }
  }
}

if (failures.length) {
  console.error("Repository check failed:");
  for (const failure of failures) console.error("- " + failure);
  process.exit(1);
}

console.log("Checked repository portability, pinned tool versions, ignored outputs, JSON files, and local path leaks.");