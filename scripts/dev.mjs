import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import chokidar from "chokidar";
import { buildSite } from "./build.mjs";
import { getCloudflareAnalytics, loadLocalEnvironment } from "./lib/cloudflare-analytics.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST_DIR = path.join(ROOT, "dist");
const ADMIN_DIR = path.join(ROOT, "admin");
const PORT = Number(process.env.PORT || 8000);
const HOST = "127.0.0.1";
const eventClients = new Set();
const execFileAsync = promisify(execFile);
const MEDIA_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif"]);

await loadLocalEnvironment(ROOT);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

function safePath(root, requestPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(requestPath);
  } catch {
    return null;
  }

  const rootPath = path.resolve(root);
  const relative = decoded.replace(/^\/+/, "");
  const resolved = path.resolve(rootPath, relative);
  const relativeToRoot = path.relative(rootPath, resolved);
  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) return null;
  return resolved;
}

async function resolveFile(root, requestPath) {
  let filePath = safePath(root, requestPath);
  if (!filePath) return null;

  try {
    const stats = await fs.stat(filePath);
    if (stats.isDirectory()) filePath = path.join(filePath, "index.html");
  } catch {
    if (!path.extname(filePath)) filePath = path.join(filePath, "index.html");
  }

  try {
    const stats = await fs.stat(filePath);
    return stats.isFile() ? filePath : null;
  } catch {
    return null;
  }
}

async function sendFile(response, filePath, statusCode = 200) {
  const extension = path.extname(filePath).toLowerCase();
  const content = await fs.readFile(filePath);
  response.writeHead(statusCode, {
    "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
    "Cache-Control": "no-store"
  });
  response.end(content);
}

async function collectMediaFiles(directory = path.join(ROOT, "content")) {
  const media = [];
  let entries = [];
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return media;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      media.push(...await collectMediaFiles(filePath));
      continue;
    }
    if (!entry.isFile() || !MEDIA_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    const stats = await fs.stat(filePath);
    media.push({
      path: path.relative(path.join(ROOT, "content"), filePath).split(path.sep).join("/"),
      bytes: stats.size
    });
  }

  return media.sort((a, b) => a.path.localeCompare(b.path, "ko-KR"));
}

async function readGitStatus() {
  try {
    const result = await execFileAsync(
      "git",
      ["status", "--short", "--untracked-files=all"],
      { cwd: ROOT, windowsHide: true, maxBuffer: 1024 * 1024 }
    );
    const files = result.stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .map(line => ({
        status: line.slice(0, 2).trim() || "?",
        path: line.slice(3)
      }));
    return { available: true, clean: files.length === 0, files };
  } catch {
    return { available: false, clean: false, files: [] };
  }
}

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(value));
}

async function sendAdminAnalytics(response, requestUrl) {
  const requestedDays = Number(requestUrl.searchParams.get("days") || 30);
  const days = [7, 30, 90].includes(requestedDays) ? requestedDays : 30;
  const force = requestUrl.searchParams.get("refresh") === "1";
  const analytics = await getCloudflareAnalytics({ days, force });
  sendJson(response, analytics.status === "error" ? 502 : 200, analytics);
}
async function sendAdminStatus(response) {
  try {
    const [manifestRaw, reportRaw, media, git] = await Promise.all([
      fs.readFile(path.join(DIST_DIR, "assets", "content-manifest.json"), "utf8"),
      fs.readFile(path.join(DIST_DIR, "assets", "build-report.json"), "utf8"),
      collectMediaFiles(),
      readGitStatus()
    ]);

    response.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    });
    response.end(JSON.stringify({
      manifest: JSON.parse(manifestRaw),
      report: JSON.parse(reportRaw),
      media,
      git,
      server: {
        host: HOST,
        port: PORT,
        localOnly: true
      }
    }));
  } catch (error) {
    response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: error.message }));
  }
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url || "/", "http://" + HOST);

  if (requestUrl.pathname === "/__events") {
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    });
    response.write("retry: 1000\n\n");
    eventClients.add(response);
    request.on("close", () => eventClients.delete(response));
    return;
  }

  if (requestUrl.pathname === "/__admin/api/analytics") {
    await sendAdminAnalytics(response, requestUrl);
    return;
  }

  if (requestUrl.pathname === "/__admin/api/status") {
    await sendAdminStatus(response);
    return;
  }

  if (requestUrl.pathname.startsWith("/__admin")) {
    const adminPath = requestUrl.pathname.replace(/^\/__admin\/?/, "/");
    const filePath = await resolveFile(ADMIN_DIR, adminPath || "/");
    if (filePath) {
      await sendFile(response, filePath);
      return;
    }
  }

  const filePath = await resolveFile(DIST_DIR, requestUrl.pathname);
  if (filePath) {
    await sendFile(response, filePath);
    return;
  }

  const notFound = path.join(DIST_DIR, "404.html");
  try {
    await sendFile(response, notFound, 404);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

function broadcastReload() {
  for (const client of eventClients) client.write("data: reload\n\n");
}

let buildTimer;
let building = false;
let pending = false;

async function rebuild(reason) {
  if (building) {
    pending = true;
    return;
  }

  building = true;
  try {
    const result = await buildSite({ includeDrafts: true });
    console.log(
      "[" + new Date().toLocaleTimeString("ko-KR") + "] " +
      "Rebuilt " + result.manifest.counts.visible + " documents after " + reason + "."
    );
    for (const filePath of result.report.frontmatterAdded) {
      console.log("Added frontmatter: " + filePath);
    }
    for (const warning of result.report.warnings) console.warn("Warning: " + warning);
    broadcastReload();
  } catch (error) {
    console.error("Build failed:", error);
  } finally {
    building = false;
    if (pending) {
      pending = false;
      await rebuild("pending changes");
    }
  }
}

await rebuild("startup");

const watcher = chokidar.watch([
  path.join(ROOT, "content"),
  path.join(ROOT, "src"),
  path.join(ROOT, "public"),
  path.join(ROOT, "admin")
], {
  ignoreInitial: true,
  ignored: watchedPath => {
    const segments = path.relative(ROOT, watchedPath).split(path.sep);
    return segments.includes(".obsidian") || segments.includes(".trash");
  },
  awaitWriteFinish: {
    stabilityThreshold: 180,
    pollInterval: 50
  }
});

watcher.on("all", (eventName, changedPath) => {
  clearTimeout(buildTimer);
  buildTimer = setTimeout(() => {
    if (changedPath.startsWith(ADMIN_DIR)) {
      broadcastReload();
      return;
    }
    rebuild(eventName + " " + path.relative(ROOT, changedPath));
  }, 120);
});

server.listen(PORT, HOST, () => {
  console.log("Public preview: http://" + HOST + ":" + PORT + "/");
  console.log("Local admin:   http://" + HOST + ":" + PORT + "/__admin/");
});

async function shutdown() {
  await watcher.close();
  for (const client of eventClients) client.end();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);