const { Plugin, TFile } = require("obsidian");

function hasFrontmatter(content) {
  return /^---[ \t]*(?:\r?\n|$)/.test(String(content ?? "").replace(/^\uFEFF/, ""));
}

function titleFromFile(value) {
  return String(value ?? "")
    .replace(/\.[^.]+$/, "")
    .replace(/^\d+[\s._-]*/, "")
    .replace(/[-_]+/g, " ")
    .trim();
}

function koreanTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return (
    values.year + "-" + values.month + "-" + values.day +
    "T" + values.hour + ":" + values.minute + ":" + values.second + "+09:00"
  );
}

function makeFrontmatter(file, newline) {
  return [
    "---",
    "title: " + JSON.stringify(titleFromFile(file.basename)),
    "description: \"\"",
    "date: " + JSON.stringify(koreanTimestamp()),
    "draft: false",
    "tags: []",
    "---"
  ].join(newline);
}

module.exports = class SeobkimFrontmatterPlugin extends Plugin {
  async onload() {
    this.registerEvent(
      this.app.vault.on("create", file => {
        if (!(file instanceof TFile) || file.extension !== "md") return;
        window.setTimeout(() => void this.addFrontmatter(file), 100);
      })
    );

    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (!(file instanceof TFile) || file.extension !== "md") return;
        void this.updateGeneratedTitle(file, oldPath);
      })
    );

    this.app.workspace.onLayoutReady(() => {
      void this.addMissingFrontmatter();
    });
  }

  async addFrontmatter(file) {
    const rawContent = await this.app.vault.read(file);
    if (hasFrontmatter(rawContent)) return;

    const content = rawContent.replace(/^\uFEFF/, "");
    const newline = content.includes("\r\n") ? "\r\n" : "\n";
    await this.app.vault.modify(
      file,
      makeFrontmatter(file, newline) + newline + newline + content
    );
  }

  async addMissingFrontmatter() {
    for (const file of this.app.vault.getMarkdownFiles()) {
      await this.addFrontmatter(file);
    }
  }

  async updateGeneratedTitle(file, oldPath) {
    const rawContent = await this.app.vault.read(file);
    if (!hasFrontmatter(rawContent)) {
      await this.addFrontmatter(file);
      return;
    }

    const oldBasename = oldPath.split("/").at(-1)?.replace(/\.md$/i, "") ?? "";
    const oldTitleLine = "title: " + JSON.stringify(titleFromFile(oldBasename));
    const newTitleLine = "title: " + JSON.stringify(titleFromFile(file.basename));
    if (oldTitleLine === newTitleLine) return;

    const frontmatterEnd = rawContent.indexOf("\n---", 3);
    if (frontmatterEnd < 0) return;
    const header = rawContent.slice(0, frontmatterEnd);
    if (!header.split(/\r?\n/).includes(oldTitleLine)) return;

    const updatedHeader = header.replace(oldTitleLine, newTitleLine);
    await this.app.vault.modify(file, updatedHeader + rawContent.slice(frontmatterEnd));
  }
};
