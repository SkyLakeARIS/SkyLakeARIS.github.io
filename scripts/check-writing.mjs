import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import matter from "gray-matter";
import { articleHtml, renderDocumentTree } from "./lib/templates.mjs";
import { CONTENT_DIR, buildDocumentRecord, dateValue, formatDate, sortDocuments } from "./lib/utils.mjs";

const timers = new Map();
let timerId = 0;
let now = "2026-10-05T16:30:00+09:00";
class ClockDate extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
}
class File {
  constructor(path) {
    this.path = path;
    this.basename = path.split("/").at(-1).replace(/\.md$/, "");
    this.extension = "md";
  }
}
class Plugin {
  constructor(app) { this.app = app; this.cleanups = []; this.commands = []; }
  register(cleanup) { this.cleanups.push(cleanup); }
  registerEditorExtension() {}
  registerMarkdownPostProcessor() {}
  registerEvent() {}
  addCommand(command) { this.commands.push(command); }
}
class Vault {
  constructor() { this.files = new Map(); this.events = new Map(); this.writes = 0; }
  on(name, callback) { this.events.set(name, callback); }
  getMarkdownFiles() { return [...this.files.keys()]; }
  async read(file) { return this.files.get(file); }
  async process(file, callback) {
    this.beforeProcess?.(file);
    const current = this.files.get(file);
    const result = callback(current);
    if (result !== current) {
      this.files.set(file, result);
      this.writes += 1;
      this.events.get("modify")?.(file);
    }
    return result;
  }
  edit(file, content) {
    this.files.set(file, content);
    this.events.get("modify")?.(file);
  }
}

const source = await fs.readFile(new URL("../content/.obsidian/plugins/seobkim-frontmatter/main.js", import.meta.url), "utf8");
const sandbox = {
  module: { exports: {} }, Date: ClockDate, console,
  window: {
    setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); }
  },
  require(id) {
    if (id === "obsidian") return { Plugin, TFile: File, FuzzySuggestModal: class {}, Notice: class {} };
    if (id === "@codemirror/state") return { StateField: { define: value => value } };
    if (id === "@codemirror/view") return { EditorView: { decorations: { from() {} } }, Decoration: {} };
    throw new Error("Unexpected dependency: " + id);
  }
};
vm.runInNewContext(source, sandbox);
const vault = new Vault();
const app = { vault, workspace: { onLayoutReady() {} } };
const plugin = new sandbox.module.exports(app);
await plugin.onload();
async function flushTimers() {
  for (let iteration = 0; timers.size; iteration += 1) {
    assert.ok(iteration < 10, "Metadata updates must not loop");
    const [id, callback] = timers.entries().next().value;
    timers.delete(id);
    await callback();
  }
}

const file = new File("프로젝트/ModelViewer/기록.md");
const original = [
  "---", 'title: "기록"', '# 날짜는 유지해야 한다', 'date: "2026-10-01T14:00:00+09:00"',
  "draft: true", "tags:", "  - Vulkan", "---", "", "첫 본문", ""
].join("\n");
vault.files.set(file, original);
await plugin.addMissingFrontmatter();
assert.equal(vault.files.get(file), original, "Initialization must not rewrite existing notes");
assert.equal(vault.writes, 0);

vault.edit(file, original.replace("draft: true", "draft: false"));
await flushTimers();
assert.equal(vault.writes, 0, "Metadata-only changes must not update dates");
const edited = vault.files.get(file).replace("첫 본문", "수정한 본문\n```cpp\nDraw();\n```");
vault.edit(file, edited);
await flushTimers();
const saved = vault.files.get(file);
assert.equal(matter(saved).data.updated, now);
assert.equal(matter(saved).data.date, matter(original).data.date);
assert.equal(matter(saved).content, matter(edited).content, "Automatic metadata must preserve all Markdown and code");
assert.ok(saved.includes("# 날짜는 유지해야 한다"));
assert.ok(saved.includes("tags:\n  - Vulkan"));
assert.equal(vault.writes, 1, "Automatic date update must settle after one write");

now = "2026-10-06T09:15:00+09:00";
vault.edit(file, saved.replace("  - Vulkan", "  - Vulkan\n  - 이주"));
await flushTimers();
assert.equal(vault.writes, 1);
assert.equal(matter(vault.files.get(file)).data.updated, "2026-10-05T16:30:00+09:00");

vault.edit(file, vault.files.get(file).replace("수정한 본문", "또 수정한 본문"));
vault.beforeProcess = target => {
  if (target === file) vault.files.set(file, vault.files.get(file) + "\n동시에 작성한 문장\n");
  vault.beforeProcess = null;
};
await flushTimers();
assert.equal(matter(vault.files.get(file)).data.updated, now);
assert.ok(vault.files.get(file).endsWith("\n동시에 작성한 문장\n"), "Edits made during metadata processing must be preserved");
assert.equal((vault.files.get(file).match(/^updated:/gm) || []).length, 1);

const beforeRename = vault.files.get(file);
const writesBeforeRename = vault.writes;
const oldPath = file.path;
file.path = "프로젝트/ModelViewer/이름 변경.md";
file.basename = "이름 변경";
now = "2026-10-07T10:00:00+09:00";
await plugin.updateGeneratedTitle(file, oldPath);
await flushTimers();
assert.equal(matter(vault.files.get(file)).data.title, "이름 변경");
assert.equal(matter(vault.files.get(file)).data.updated, matter(beforeRename).data.updated, "Renaming must not change revision dates");
assert.equal(matter(vault.files.get(file)).content, matter(beforeRename).content);
assert.equal(vault.writes, writesBeforeRename + 1);
now = "2026-10-06T09:15:00+09:00";

const windowsFile = new File("학습/Windows.md");
const windowsNote = original.replaceAll("\n", "\r\n");
vault.files.set(windowsFile, windowsNote);
await plugin.addFrontmatter(windowsFile);
vault.edit(windowsFile, windowsNote.replace("첫 본문", "Windows 본문"));
await flushTimers();
const windowsSaved = vault.files.get(windowsFile);
assert.equal(windowsSaved.replaceAll("\r\n", "").includes("\n"), false, "CRLF must be preserved");
assert.equal(matter(windowsSaved).data.updated, now);

const newFile = new File("신규.md");
vault.files.set(newFile, "새 본문");
await plugin.addFrontmatter(newFile);
await flushTimers();
assert.equal(matter(vault.files.get(newFile)).data.updated, undefined, "Creation must not be treated as a revision");
assert.equal(matter(vault.files.get(newFile)).content.trim(), "새 본문");

const reloaded = new sandbox.module.exports(app);
await reloaded.onload();
const writesBeforeReload = vault.writes;
await reloaded.addMissingFrontmatter();
await flushTimers();
assert.equal(vault.writes, writesBeforeReload, "Reloading must not stamp all notes");
assert.equal(matter(vault.files.get(file)).data.updated, now);

const document = {
  title: "날짜 표시 확인", description: "문서 설명", date: "2026-10-01T14:00:00+09:00",
  updated: now, url: "/프로젝트/modelviewer/기록/", folderSegments: ["프로젝트", "ModelViewer"],
  sourceRel: "프로젝트/ModelViewer/기록.md", tags: [], headings: [], minutes: 2, html: "<p>본문</p>"
};
const render = item => articleHtml(item, [item], null, null);
const html = render(document);
const dates = html.match(/<div class="article-meta">([\s\S]*?)<\/div>/)[1];
assert.match(dates, /작성 <time datetime="2026-10-01T14:00:00\+09:00">/);
assert.match(dates, /수정 <time datetime="2026-10-06T09:15:00\+09:00">/);
assert.ok(html.indexOf("<h1>") < html.indexOf('class="article-meta"'));
assert.ok(html.indexOf('class="article-meta"') < html.indexOf('class="article-body"'));
for (const updated of [undefined, document.date, "2026-10-01T18:00:00+09:00", "2026-09-30"]) {
  assert.doesNotMatch(render({ ...document, updated }).match(/<div class="article-meta">([\s\S]*?)<\/div>/)[1], /수정/);
}
const koreanDay = render({ ...document, date: "2026-10-01T22:00:00+09:00", updated: "2026-10-01T23:30:00Z" });
assert.match(koreanDay.match(/<div class="article-meta">([\s\S]*?)<\/div>/)[1], /수정/);

const newer = { ...document, title: "나중에 만든 글", date: "2026-10-03T14:00:00+09:00", updated: "", sourceRel: "프로젝트/ModelViewer/나중.md", url: "/나중/" };
assert.deepEqual(sortDocuments([document, newer]).map(item => item.title), [newer.title, document.title]);
const tree = renderDocumentTree([document, newer], "");
assert.ok(tree.indexOf(newer.title) < tree.indexOf(document.title), "Modified dates must not change table of contents order");

function dateFixture(title, date, updated = '"2026-10-02T00:05:00+09:00"') {
  const raw = ["---", "title: " + title, "date: " + date, "updated: " + updated, "---", "본문"].join("\n");
  return buildDocumentRecord(CONTENT_DIR + "/프로젝트/ModelViewer/" + title + ".md", raw, matter);
}
const unquotedDate = dateFixture("따옴표 없는 날짜", "2026-10-01T21:31:17+09:00", "2026-10-02T00:05:00+09:00");
const quotedDate = dateFixture("따옴표 있는 날짜", '"2026-10-01T21:31:17+09:00"');
assert.equal(dateValue(unquotedDate.date), dateValue(quotedDate.date), "YAML date objects must retain the same timestamp as quoted dates");
assert.equal(dateValue(unquotedDate.updated), dateValue(quotedDate.updated), "Revision dates must retain their time too");
assert.equal(formatDate(unquotedDate.updated), formatDate(quotedDate.updated), "Dates near midnight must display the same Korean day");
const previousSecond = dateFixture("직전 글", '"2026-10-01T21:31:16+09:00"');
const nextSecond = dateFixture("직후 글", '"2026-10-01T21:31:18+09:00"');
const orderedDates = sortDocuments([unquotedDate, previousSecond, nextSecond]);
assert.deepEqual(orderedDates.map(item => item.title), [nextSecond.title, unquotedDate.title, previousSecond.title]);
const dateTree = renderDocumentTree(orderedDates, "");
assert.ok(dateTree.indexOf(nextSecond.title) < dateTree.indexOf(unquotedDate.title));
assert.ok(dateTree.indexOf(unquotedDate.title) < dateTree.indexOf(previousSecond.title));
const dateOnly = dateFixture("날짜만 지정", "2026-10-01");
assert.equal(dateValue(dateOnly.date), dateValue("2026-10-01"), "Date-only metadata must preserve its existing timestamp");

plugin.cleanups.forEach(cleanup => cleanup());
reloaded.cleanups.forEach(cleanup => cleanup());
assert.equal(timers.size, 0);
console.log("Checked automatic revision dates, body preservation, metadata-only changes, renames, reloads, date display, and creation-date order.");
