import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import site from "../src/config/site.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const failures = [];

async function walk(directory) {
  const output = [];
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await walk(fullPath));
    if (entry.isFile()) output.push(fullPath);
  }
  return output;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function localTarget(value) {
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  const clean = decodeURIComponent(value.split("#")[0].split("?")[0]);
  if (!clean || clean === "/") return path.join(dist, "index.html");
  const target = path.join(dist, clean.replace(/^\/+/, ""));
  if (path.extname(target)) return target;
  return path.join(target, "index.html");
}

const files = await walk(dist);
if (!(await exists(path.join(dist, ".nojekyll")))) failures.push("dist/.nojekyll이 없습니다.");
const htmlFiles = files.filter(filePath => path.extname(filePath).toLowerCase() === ".html");

for (const filePath of htmlFiles) {
  const html = await fs.readFile(filePath, "utf8");
  const attributePattern = /(?:href|src)="([^"]+)"/g;
  let match;

  while ((match = attributePattern.exec(html))) {
    const target = localTarget(match[1]);
    if (target && !(await exists(target))) {
      failures.push(path.relative(dist, filePath) + " -> " + match[1]);
    }
  }

  const relativeHtml = path.relative(dist, filePath);
  if (!html.includes('<html lang="ko">')) failures.push(relativeHtml + ": HTML 언어 설정이 없습니다.");
  if (!/<title>[^<]+<\/title>/.test(html)) failures.push(relativeHtml + ": title이 없습니다.");
  if (!/<meta name="description" content="[^"]+">/.test(html)) failures.push(relativeHtml + ": description 메타데이터가 없습니다.");
  if (!html.includes('<meta name="viewport" content="width=device-width, initial-scale=1">')) {
    failures.push(relativeHtml + ": viewport 메타데이터가 없습니다.");
  }

  const canonical = html.match(/<link rel="canonical" href="([^"]+)">/)?.[1] || "";
  if (!canonical.startsWith(site.siteUrl + "/")) {
    failures.push(relativeHtml + ": canonical URL이 사이트 주소와 일치하지 않습니다.");
  }
  if (!html.includes('<meta property="og:url" content="' + canonical + '">')) {
    failures.push(relativeHtml + ": Open Graph URL이 canonical과 일치하지 않습니다.");
  }

  const beaconMatches = html.match(/static\.cloudflareinsights\.com\/beacon\.min\.js/g) || [];
  if (beaconMatches.length !== 1) {
    failures.push(relativeHtml + ": Cloudflare Web Analytics Beacon이 정확히 한 번 포함되지 않았습니다.");
  }
  if (!html.includes(site.cloudflareWebAnalyticsToken)) {
    failures.push(relativeHtml + ": Cloudflare Web Analytics 토큰이 사이트 설정과 일치하지 않습니다.");
  }
}

const resumeHtml = await fs.readFile(path.join(dist, "seobkim", "index.html"), "utf8");
if (!resumeHtml.includes('name="robots" content="noindex,follow"')) {
  failures.push("seobkim/index.html: noindex가 없습니다.");
}

if (await exists(path.join(dist, "__admin"))) {
  failures.push("관리자 화면이 공개 빌드에 포함됐습니다.");
}

const manifest = JSON.parse(await fs.readFile(path.join(dist, "assets", "content-manifest.json"), "utf8"));
if (manifest.includeDrafts) failures.push("공개 manifest에 초안 모드가 활성화되어 있습니다.");
if (manifest.documents.some(document => document.draft)) failures.push("공개 manifest에 초안 문서가 있습니다.");

const robots = await fs.readFile(path.join(dist, "robots.txt"), "utf8");
const expectedSitemapLine = "Sitemap: " + site.siteUrl + "/sitemap.xml";
if (!robots.includes("User-agent: *") || !robots.includes("Allow: /") || !robots.includes(expectedSitemapLine)) {
  failures.push("robots.txt 내용이 사이트 설정과 일치하지 않습니다.");
}

const sitemap = await fs.readFile(path.join(dist, "sitemap.xml"), "utf8");
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
const expectedSitemapUrls = [
  site.siteUrl + "/",
  site.siteUrl + "/docs/",
  ...manifest.documents.map(document => site.siteUrl + document.url)
];
for (const expectedUrl of expectedSitemapUrls) {
  if (!sitemapUrls.includes(expectedUrl)) failures.push("sitemap.xml 누락: " + expectedUrl);
}
for (const sitemapUrl of sitemapUrls) {
  let parsedUrl;
  try {
    parsedUrl = new URL(sitemapUrl);
  } catch {
    failures.push("sitemap.xml의 URL 형식이 잘못됐습니다: " + sitemapUrl);
    continue;
  }
  if (parsedUrl.origin !== new URL(site.siteUrl).origin) {
    failures.push("sitemap.xml에 다른 사이트 주소가 있습니다: " + sitemapUrl);
    continue;
  }
  const target = localTarget(parsedUrl.pathname);
  if (target && !(await exists(target))) failures.push("sitemap.xml 경로가 생성되지 않았습니다: " + sitemapUrl);
}
if (sitemapUrls.length !== expectedSitemapUrls.length) {
  failures.push("sitemap.xml URL 수가 공개 페이지 수와 일치하지 않습니다.");
}

const report = JSON.parse(await fs.readFile(path.join(dist, "assets", "build-report.json"), "utf8"));
for (const warning of report.warnings || []) {
  failures.push("빌드 경고: " + warning);
}

if (failures.length) {
  console.error("Site check failed:");
  for (const failure of failures) console.error("- " + failure);
  process.exit(1);
}

console.log(
  "Checked " + htmlFiles.length + " HTML files, internal assets, resume metadata, Cloudflare Analytics, draft exclusion, and admin isolation."
);