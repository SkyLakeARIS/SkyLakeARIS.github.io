import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import matter from "gray-matter";
import site from "../src/config/site.mjs";
import {
  CONTENT_DIR,
  DIST_DIR,
  IMAGE_EXTENSIONS,
  PINNED_FILE,
  PUBLIC_DIR,
  SCRIPT_FILE,
  STYLE_FILE,
  buildDocumentRecord,
  buildLookup,
  copyDirectory,
  ensureDirectory,
  escapeHtml,
  normalizePath,
  sortDocuments,
  walkFiles,
  writePage,
  writeText
} from "./lib/utils.mjs";
import { createMarkdownRenderer, preprocessObsidian } from "./lib/markdown.mjs";
import { addFrontmatter } from "./lib/frontmatter.mjs";
import { articleHtml, docsIndexHtml, homeHtml, notFoundHtml } from "./lib/templates.mjs";

async function copyContentAssets(allFiles, warnings) {
  const assetByAbs = new Map();
  const assetByBase = new Map();

  for (const filePath of allFiles) {
    const extension = path.extname(filePath).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(extension)) continue;

    const relative = normalizePath(path.relative(CONTENT_DIR, filePath));
    const parts = relative.split("/").filter(part => part !== "_assets");
    const outputRelative = normalizePath(path.join("assets", "media", ...parts));
    const outputPath = path.join(DIST_DIR, outputRelative);
    const url = "/" + outputRelative;

    await ensureDirectory(outputPath);
    await fs.copyFile(filePath, outputPath);
    assetByAbs.set(path.resolve(filePath), url);

    const baseKey = path.basename(filePath).toLowerCase();
    if (assetByBase.has(baseKey)) {
      warnings.push("같은 이름의 이미지가 두 개 있습니다: " + path.basename(filePath));
    } else {
      assetByBase.set(baseKey, url);
    }
  }

  return { assetByAbs, assetByBase };
}

async function buildSearchIndex(documents) {
  const searchIndex = documents.map(document => ({
    title: document.title,
    description: document.description,
    url: document.url,
    category: document.category,
    tags: document.tags
  }));

  await writeText(
    path.join(DIST_DIR, "assets", "search-index.json"),
    JSON.stringify(searchIndex, null, 2)
  );
}

async function buildSitemap(documents) {
  const urls = [
    site.siteUrl + "/",
    site.siteUrl + "/docs/",
    ...documents.filter(document => !document.draft).map(document => site.siteUrl + document.url)
  ];

  const xml = (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
      urls.map(url => "<url><loc>" + escapeHtml(url) + "</loc></url>").join("") +
    "</urlset>"
  );

  await writeText(path.join(DIST_DIR, "sitemap.xml"), xml);
  await writeText(
    path.join(DIST_DIR, "robots.txt"),
    "User-agent: *\nAllow: /\nSitemap: " + site.siteUrl + "/sitemap.xml\n"
  );
}

function createManifest(allDocuments, visibleDocuments, includeDrafts) {
  return {
    generatedAt: new Date().toISOString(),
    includeDrafts,
    site: {
      title: site.siteTitle,
      url: site.siteUrl,
      resumePath: "/" + site.resumePath + "/"
    },
    counts: {
      total: allDocuments.length,
      visible: visibleDocuments.length,
      published: allDocuments.filter(document => !document.draft).length,
      drafts: allDocuments.filter(document => document.draft).length
    },
    documents: visibleDocuments.map(document => ({
      title: document.title,
      description: document.description,
      url: document.url,
      category: document.category,
      date: document.date,
      updated: document.updated,
      draft: document.draft,
      tags: document.tags,
      source: document.sourceRel,
      minutes: document.minutes
    }))
  };
}

export async function buildSite(options = {}) {
  const includeDrafts = options.includeDrafts ?? process.argv.includes("--drafts");
  const analyticsEnabled = options.analyticsEnabled ?? !includeDrafts;
  const startedAt = Date.now();
  const warnings = [];
  const frontmatterAdded = [];

  await fs.rm(DIST_DIR, { recursive: true, force: true });
  await fs.mkdir(DIST_DIR, { recursive: true });

  const allFiles = await walkFiles(CONTENT_DIR);
  const markdownFiles = allFiles.filter(filePath => path.extname(filePath).toLowerCase() === ".md");
  const allDocuments = [];

  for (const filePath of markdownFiles) {
    let raw = await fs.readFile(filePath, "utf8");
    const formatted = addFrontmatter(filePath, raw);
    if (formatted.changed) {
      raw = formatted.content;
      await fs.writeFile(filePath, raw, "utf8");
      frontmatterAdded.push(normalizePath(path.relative(CONTENT_DIR, filePath)));
    }
    const document = buildDocumentRecord(filePath, raw, matter);
    if (!document.hidden) allDocuments.push(document);
  }

  const sortedAll = sortDocuments(allDocuments);
  const visibleDocuments = sortedAll.filter(document => includeDrafts || !document.draft);
  const seenUrls = new Set();

  for (const document of visibleDocuments) {
    if (seenUrls.has(document.url)) throw new Error("중복 문서 URL: " + document.url);
    seenUrls.add(document.url);
  }

  const { assetByAbs, assetByBase } = await copyContentAssets(allFiles, warnings);
  const lookup = buildLookup(visibleDocuments);
  const markdown = createMarkdownRenderer(assetByAbs, warnings);

  for (const document of visibleDocuments) {
    const body = preprocessObsidian(document.body, document, lookup, assetByBase, warnings);
    const environment = { headings: [], currentDocument: document };
    document.html = markdown.render(body, environment);
    document.headings = environment.headings;
  }

  await copyDirectory(PUBLIC_DIR, DIST_DIR);
  await writeText(path.join(DIST_DIR, "assets", "site.css"), await fs.readFile(STYLE_FILE, "utf8"));
  await writeText(path.join(DIST_DIR, "assets", "site.js"), await fs.readFile(SCRIPT_FILE, "utf8"));
  await writeText(path.join(DIST_DIR, ".nojekyll"), "");

  const pinnedRepositories = JSON.parse(await fs.readFile(PINNED_FILE, "utf8"));

  await writePage("/", homeHtml(visibleDocuments, pinnedRepositories, false, analyticsEnabled));
  await writePage("/" + site.resumePath + "/", homeHtml(visibleDocuments, pinnedRepositories, true, analyticsEnabled));
  await writePage("/docs/", docsIndexHtml(visibleDocuments, analyticsEnabled));

  for (let index = 0; index < visibleDocuments.length; index += 1) {
    const document = visibleDocuments[index];
    const previous = visibleDocuments[index - 1] || null;
    const next = visibleDocuments[index + 1] || null;
    await writePage(document.url, articleHtml(document, visibleDocuments, previous, next, analyticsEnabled));
  }

  await writeText(path.join(DIST_DIR, "404.html"), notFoundHtml(analyticsEnabled));
  await buildSearchIndex(visibleDocuments);
  await buildSitemap(visibleDocuments);

  const manifest = createManifest(sortedAll, visibleDocuments, includeDrafts);
  const report = {
    generatedAt: manifest.generatedAt,
    durationMs: Date.now() - startedAt,
    frontmatterAdded,
    warnings
  };

  await writeText(
    path.join(DIST_DIR, "assets", "content-manifest.json"),
    JSON.stringify(manifest, null, 2)
  );
  await writeText(
    path.join(DIST_DIR, "assets", "build-report.json"),
    JSON.stringify(report, null, 2)
  );

  return { manifest, report, outputDirectory: DIST_DIR };
}

const invokedDirectly = process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  buildSite()
    .then(result => {
      const counts = result.manifest.counts;
      console.log(
        "Built " + counts.visible + " pages from " + counts.total +
        " documents in " + result.report.durationMs + "ms."
      );
      for (const filePath of result.report.frontmatterAdded) {
        console.log("Added frontmatter: " + filePath);
      }
      for (const warning of result.report.warnings) console.warn("Warning: " + warning);
    })
    .catch(error => {
      console.error(error);
      process.exitCode = 1;
    });
}