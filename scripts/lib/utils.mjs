import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import site from "../../src/config/site.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const CONTENT_DIR = path.join(ROOT, "content");
export const DIST_DIR = path.join(ROOT, "dist");
export const PUBLIC_DIR = path.join(ROOT, "public");
export const STYLE_FILE = path.join(ROOT, "src", "styles", "site.css");
export const SCRIPT_FILE = path.join(ROOT, "src", "scripts", "site.js");
export const PINNED_FILE = path.join(ROOT, "src", "data", "pinned-repos.json");
export const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif"]);

export function normalizePath(value) {
  return value.split(path.sep).join("/");
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function stripMarkdown(value) {
  return String(value ?? "")
    .replace(/^---[\s\S]*?---/m, "")
    .replace(/!\[\[[^\]]+\]\]/g, "")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, "$2")
    .replace(/\x60\x60\x60[\s\S]*?\x60\x60\x60/g, "")
    .replace(/~~~[\s\S]*?~~~/g, "")
    .replace(/[#>*_~\x60[\]()!-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function slugify(value) {
  const cleaned = String(value ?? "")
    .normalize("NFKC")
    .replace(/^\d+[\s._-]*/, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "document";
}

export function headingSlug(value) {
  return slugify(value);
}

export function titleFromFile(value) {
  return String(value)
    .replace(/\.[^.]+$/, "")
    .replace(/^\d+[\s._-]*/, "")
    .replace(/[-_]+/g, " ")
    .trim();
}


export function sectionTitle(value) {
  return site.sectionTitles[value] || titleFromFile(value);
}

export function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(site.locale, {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function dateValue(value) {
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

export function normalizeDateValue(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

export function readingMinutes(value) {
  const plain = stripMarkdown(value);
  const latinWords = (plain.match(/[A-Za-z0-9_]+/g) || []).length;
  const koreanChars = (plain.match(/[가-힣]/g) || []).length;
  return Math.max(1, Math.ceil((latinWords + koreanChars / 2.2) / 220));
}

export function descriptionFromBody(value) {
  const blocks = String(value).split(/\r?\n\r?\n/);
  for (const block of blocks) {
    const plain = stripMarkdown(block);
    if (plain && !block.trim().startsWith("#")) return plain.slice(0, 150);
  }
  return site.siteDescription;
}

export async function walkFiles(directory) {
  const output = [];
  let entries = [];
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return output;
  }

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith(".")) {
      output.push(...await walkFiles(fullPath));
    }
    if (entry.isFile() && !entry.name.startsWith(".")) output.push(fullPath);
  }
  return output;
}

export async function ensureDirectory(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

export async function writeText(filePath, content) {
  await ensureDirectory(filePath);
  await fs.writeFile(filePath, content, "utf8");
}

export async function copyDirectory(source, destination) {
  try {
    const entries = await fs.readdir(source, { withFileTypes: true });
    await fs.mkdir(destination, { recursive: true });
    for (const entry of entries) {
      const sourcePath = path.join(source, entry.name);
      const destinationPath = path.join(destination, entry.name);
      if (entry.isDirectory()) await copyDirectory(sourcePath, destinationPath);
      if (entry.isFile()) {
        await ensureDirectory(destinationPath);
        await fs.copyFile(sourcePath, destinationPath);
      }
    }
  } catch {
    return;
  }
}

export function outputPathForUrl(urlPath) {
  if (urlPath === "/") return path.join(DIST_DIR, "index.html");
  const clean = urlPath.replace(/^\/+|\/+$/g, "");
  return path.join(DIST_DIR, clean, "index.html");
}

export async function writePage(urlPath, html) {
  await writeText(outputPathForUrl(urlPath), html);
}

export function buildDocumentRecord(filePath, rawContent, matter) {
  const parsed = matter(rawContent);
  const relativePath = normalizePath(path.relative(CONTENT_DIR, filePath));
  const parsedPath = path.parse(relativePath);
  const folderSegments = normalizePath(parsedPath.dir)
    .split("/")
    .filter(Boolean)
    .filter(part => !part.startsWith("_"));
  const fileSegment = titleFromFile(parsedPath.name);
  const routeSegments = [...folderSegments.map(slugify), slugify(parsed.data.slug || fileSegment)];
  if (routeSegments.at(-1) === "index") routeSegments.pop();

  const title = parsed.data.title || fileSegment;
  const tags = Array.isArray(parsed.data.tags)
    ? parsed.data.tags.map(String)
    : parsed.data.tags
      ? [String(parsed.data.tags)]
      : [];

  return {
    title,
    description: parsed.data.description || descriptionFromBody(parsed.content),
    date: normalizeDateValue(parsed.data.date),
    updated: normalizeDateValue(parsed.data.updated),
    draft: parsed.data.draft === true,
    hidden: parsed.data.hidden === true,
    tags,
    body: parsed.content,
    minutes: readingMinutes(parsed.content),
    sourceAbs: filePath,
    sourceRel: relativePath,
    basename: parsedPath.name,
    folderSegments,
    category: folderSegments.map(sectionTitle).join(" / "),
    url: "/" + routeSegments.join("/") + "/",
    headings: [],
    html: ""
  };
}

export function sortDocuments(documents) {
  return [...documents].sort((a, b) => {
    const folderCompare = a.folderSegments.join("/").localeCompare(b.folderSegments.join("/"), site.locale);
    if (folderCompare !== 0) return folderCompare;
    const publishedCompare = dateValue(b.date) - dateValue(a.date);
    if (publishedCompare !== 0) return publishedCompare;
    return b.sourceRel.localeCompare(a.sourceRel, site.locale, { numeric: true });
  });
}

export function buildLookup(documents) {
  const lookup = new Map();
  for (const document of documents) {
    const keys = [
      document.title,
      document.basename,
      titleFromFile(document.basename),
      document.sourceRel.replace(/\.md$/i, "")
    ];
    for (const key of keys) {
      lookup.set(slugify(key), document);
      lookup.set(String(key).toLowerCase(), document);
    }
  }
  return lookup;
}