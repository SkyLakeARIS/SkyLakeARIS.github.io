const { FuzzySuggestModal, Notice, Plugin, TFile } = require("obsidian");
const { StateField } = require("@codemirror/state");
const { Decoration, EditorView } = require("@codemirror/view");

const HIGHLIGHT_PRESETS = [
  { id: "yellow", label: "노랑", purpose: "핵심 결정" },
  { id: "red", label: "빨강", purpose: "주의·문제" },
  { id: "green", label: "초록", purpose: "해결·검증 완료" },
  { id: "blue", label: "파랑", purpose: "개념·정보" },
  { id: "purple", label: "보라", purpose: "대안·설계" },
  { id: "gray", label: "회색", purpose: "보충 설명" }
];
const HIGHLIGHT_IDS = HIGHLIGHT_PRESETS.map(preset => preset.id);
const HIGHLIGHT_ACTIONS = [
  ...HIGHLIGHT_PRESETS,
  { id: "clear", label: "강조 해제", purpose: "본문·코드" }
];
const CODE_HIGHLIGHT_PATTERN = new RegExp(
  "hl-(" + HIGHLIGHT_IDS.join("|") + ")\\s*=\\s*\"([^\"]*)\"",
  "g"
);

class HighlightPaletteModal extends FuzzySuggestModal {
  constructor(app, onChoose) {
    super(app);
    this.onChoose = onChoose;
    this.setPlaceholder("강조 색상 또는 해제를 선택하세요");
  }

  getItems() {
    return HIGHLIGHT_ACTIONS;
  }

  getItemText(item) {
    return item.label + " — " + item.purpose;
  }

  onChooseItem(item) {
    this.onChoose(item);
  }
}

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

function frontmatterParts(content) {
  const raw = String(content ?? "");
  const opening = raw.match(/^\uFEFF?---[ \t]*\r?\n/);
  if (!opening) return null;
  const remaining = raw.slice(opening[0].length);
  const closing = remaining.match(/^(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/m);
  if (!closing) return null;
  return {
    opening: opening[0],
    header: remaining.slice(0, closing.index),
    closing: closing[0],
    body: remaining.slice(closing.index + closing[0].length),
    newline: opening[0].includes("\r\n") ? "\r\n" : "\n"
  };
}

function markdownBody(content) {
  const body = frontmatterParts(content)?.body ?? String(content ?? "").replace(/^\uFEFF/, "");
  return body.replace(/\r\n?/g, "\n").replace(/^\n+|\n+$/g, "");
}

function withUpdatedDate(content, timestamp) {
  const parts = frontmatterParts(content);
  if (!parts) return content;
  const field = "updated: " + JSON.stringify(timestamp) + parts.newline;
  const updatedLine = /^(?:updated|"updated"|'updated')[ \t]*:[^\r\n]*(?:\r?\n|$)/m;
  let header = parts.header;
  if (updatedLine.test(header)) {
    header = header.replace(updatedLine, () => field);
  } else {
    const dateLine = /^date[ \t]*:[^\r\n]*(?:\r?\n|$)/m;
    header = dateLine.test(header)
      ? header.replace(dateLine, line => line + field)
      : header + field;
  }
  return parts.opening + header + parts.closing + parts.body;
}

function parseLineNumbers(value) {
  const lines = new Set();
  for (const part of String(value ?? "").split(",")) {
    const range = part.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!range) continue;
    const start = Math.max(1, Number(range[1]));
    const end = Math.max(start, Number(range[2] || range[1]));
    for (let line = start; line <= end; line += 1) lines.add(line);
  }
  return lines;
}

function formatLineNumbers(lines) {
  const sorted = [...lines].sort((a, b) => a - b);
  const ranges = [];
  for (let index = 0; index < sorted.length; index += 1) {
    const start = sorted[index];
    let end = start;
    while (index + 1 < sorted.length && sorted[index + 1] === end + 1) {
      end = sorted[index + 1];
      index += 1;
    }
    ranges.push(start === end ? String(start) : start + "-" + end);
  }
  return ranges.join(",");
}

function parseCodeHighlights(value) {
  const highlights = new Map(HIGHLIGHT_IDS.map(id => [id, new Set()]));
  for (const match of String(value ?? "").matchAll(CODE_HIGHLIGHT_PATTERN)) {
    highlights.set(match[1], parseLineNumbers(match[2]));
  }
  return highlights;
}

function codeHighlightRanges(value) {
  const ranges = [];
  for (const [color, lines] of parseCodeHighlights(value)) {
    const sorted = [...lines].sort((a, b) => a - b);
    for (let index = 0; index < sorted.length; index += 1) {
      const start = sorted[index];
      let end = start;
      while (index + 1 < sorted.length && sorted[index + 1] === end + 1) {
        end = sorted[index + 1];
        index += 1;
      }
      ranges.push({ color, start, count: end - start + 1 });
    }
  }
  return ranges;
}

function fencedCodeBlocks(lines) {
  const blocks = [];
  let active = null;

  for (let line = 0; line < lines.length; line += 1) {
    const fence = lines[line].match(/^\s*(?:>\s*)*(`{3,}|~{3,})(.*)$/);
    if (!fence) continue;

    if (!active) {
      active = { line, marker: fence[1], header: lines[line] };
      continue;
    }

    if (fence[1][0] !== active.marker[0] || fence[1].length < active.marker.length) continue;
    if (fence[2].trim()) continue;
    blocks.push({ ...active, endLine: line });
    active = null;
  }

  if (active) blocks.push({ ...active, endLine: lines.length });
  return blocks;
}

function editorCodeDecorations(state) {
  const lines = [];
  for (let line = 1; line <= state.doc.lines; line += 1) {
    lines.push(state.doc.line(line).text);
  }

  const decorations = [];
  for (const block of fencedCodeBlocks(lines)) {
    const ranges = codeHighlightRanges(block.header);
    for (let line = block.line + 1; line < block.endLine; line += 1) {
      const codeLine = line - block.line;
      const range = ranges.find(range => codeLine >= range.start && codeLine < range.start + range.count);
      decorations.push(Decoration.line({
        attributes: {
          class: "seobkim-code-line" + (range ? " hl-" + range.color : ""),
          "data-code-line": String(codeLine)
        }
      }).range(state.doc.line(line + 1).from));
    }
  }

  return Decoration.set(decorations, true);
}

const codeHighlightExtension = StateField.define({
  create: editorCodeDecorations,
  update(decorations, transaction) {
    return transaction.docChanged ? editorCodeDecorations(transaction.state) : decorations;
  },
  provide: field => EditorView.decorations.from(field)
});

function findCodeFence(editor) {
  const from = editor.getCursor("from");
  const to = editor.getCursor("to");
  let selectedEndLine = to.line;
  if (to.ch === 0 && selectedEndLine > from.line) selectedEndLine -= 1;

  const lines = [];
  for (let line = 0; line < editor.lineCount(); line += 1) {
    lines.push(editor.getLine(line));
  }
  const block = fencedCodeBlocks(lines).find(block => from.line > block.line && selectedEndLine < block.endLine);
  if (block) {
    return { ...block, from, to, selectedEndLine };
  }
  return null;
}

function updateFenceHighlights(header, color, start, end) {
  const fence = header.match(/^(\s*(?:>\s*)*)(`{3,}|~{3,})(.*)$/);
  if (!fence) return header;

  const info = fence[3].trim();
  const attributeGroup = info.match(/^(.*?)(?:\s*\{([^}]*)\})?\s*$/);
  const languageInfo = (attributeGroup?.[1] || "").trim();
  const rawAttributes = attributeGroup?.[2] || "";
  const highlights = parseCodeHighlights(rawAttributes);

  for (const lines of highlights.values()) {
    for (let line = start; line <= end; line += 1) lines.delete(line);
  }
  if (color) {
    for (let line = start; line <= end; line += 1) highlights.get(color).add(line);
  }

  const customAttributes = rawAttributes
    .replace(CODE_HIGHLIGHT_PATTERN, "")
    .replace(/\s+/g, " ")
    .trim();
  const highlightAttributes = HIGHLIGHT_IDS
    .map(id => {
      const value = formatLineNumbers(highlights.get(id));
      return value ? 'hl-' + id + '=\"' + value + '\"' : "";
    })
    .filter(Boolean);
  const attributes = [customAttributes, ...highlightAttributes].filter(Boolean).join(" ");

  return (
    fence[1] + fence[2] + languageInfo +
    (attributes ? " {" + attributes + "}" : "")
  );
}

function textHighlightEdits(source, from, to) {
  const lines = source.split("\n");
  const lineOffsets = [];
  let offset = 0;
  for (const line of lines) {
    lineOffsets.push(offset);
    offset += line.length + 1;
  }
  const codeBlocks = fencedCodeBlocks(lines).map(block => ({
    from: lineOffsets[block.line],
    to: lineOffsets[block.endLine + 1] ?? source.length
  }));
  const ownMark = new RegExp(
    "^<mark\\s+class=([\"'])hl-(?:" + HIGHLIGHT_IDS.join("|") + ")\\1\\s*>$",
    "i"
  );
  const stack = [];
  const edits = [];

  for (const match of source.matchAll(/<mark\b[^>]*>|<\/mark\s*>/gi)) {
    if (codeBlocks.some(block => match.index >= block.from && match.index < block.to)) continue;
    const end = match.index + match[0].length;
    if (!/^<\//.test(match[0])) {
      stack.push({ from: match.index, to: end, own: ownMark.test(match[0]) });
      continue;
    }

    const opening = stack.pop();
    if (!opening?.own) continue;
    const touched = from === to
      ? from >= opening.from && from < end
      : from < end && to > opening.from;
    if (!touched) continue;
    edits.push({ from: opening.from, to: opening.to }, { from: match.index, to: end });
  }

  return edits.sort((a, b) => b.from - a.from);
}

module.exports = class SeobkimWritingToolsPlugin extends Plugin {
  async onload() {
    this.documentBodies = new Map();
    this.pendingUpdatedDates = new Map();
    this.register(() => {
      for (const timer of this.pendingUpdatedDates.values()) window.clearTimeout(timer);
      this.pendingUpdatedDates.clear();
      this.documentBodies.clear();
    });
    this.registerEditorExtension(codeHighlightExtension);

    this.addCommand({
      id: "highlight-palette",
      name: "강조: 색상 선택·해제",
      hotkeys: [{ modifiers: ["Mod", "Shift"], key: "h" }],
      editorCallback: editor => {
        new HighlightPaletteModal(this.app, preset => {
          this.applyHighlight(editor, preset);
        }).open();
      }
    });

    for (const preset of HIGHLIGHT_PRESETS) {
      this.addCommand({
        id: "highlight-" + preset.id,
        name: "강조: " + preset.label + " — " + preset.purpose,
        editorCallback: editor => this.applyHighlight(editor, preset)
      });
    }

    this.addCommand({
      id: "highlight-clear",
      name: "강조: 해제",
      editorCallback: editor => this.clearHighlight(editor)
    });

    this.registerMarkdownPostProcessor((element, context) => {
      const codeBlocks = element.matches("pre") ? [element] : element.querySelectorAll("pre");
      for (const pre of codeBlocks) {
        const section = context.getSectionInfo(pre);
        const sourceLines = (section?.text || "").split(/\r?\n/);
        const sectionLines = section ? sourceLines.slice(section.lineStart, section.lineEnd + 1) : [];
        const openingFence = (sectionLines.length ? sectionLines : sourceLines)
          .find(line => /^\s*(?:>\s*)*(`{3,}|~{3,})/.test(line));
        if (!openingFence) continue;
        this.decorateCodeBlock(pre, codeHighlightRanges(openingFence));
      }
    });

    this.registerEvent(
      this.app.vault.on("create", file => {
        if (!(file instanceof TFile) || file.extension !== "md") return;
        window.setTimeout(() => void this.addFrontmatter(file), 100);
      })
    );

    this.registerEvent(
      this.app.vault.on("modify", file => {
        if (!(file instanceof TFile) || file.extension !== "md") return;
        this.scheduleUpdatedDate(file);
      })
    );

    this.registerEvent(
      this.app.vault.on("delete", file => {
        window.clearTimeout(this.pendingUpdatedDates.get(file));
        this.pendingUpdatedDates.delete(file);
        this.documentBodies.delete(file);
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

  applyHighlight(editor, preset) {
    if (preset.id === "clear") {
      this.clearHighlight(editor);
      return;
    }

    const codeFence = findCodeFence(editor);
    if (codeFence) {
      const start = codeFence.from.line - codeFence.line;
      const end = codeFence.selectedEndLine - codeFence.line;
      editor.setLine(
        codeFence.line,
        updateFenceHighlights(codeFence.header, preset.id, start, end)
      );
      new Notice(preset.label + " 코드 강조: " + start + (start === end ? "줄" : "-" + end + "줄"));
      return;
    }

    const selected = editor.getSelection();
    const openTag = '<mark class="hl-' + preset.id + '">';
    const closeTag = "</mark>";

    if (selected) {
      const existing = selected.match(/^<mark class="hl-[a-z]+">([\s\S]*)<\/mark>$/);
      const content = existing ? existing[1] : selected;
      editor.replaceSelection(openTag + content + closeTag);
      return;
    }

    const placeholder = "강조할 내용";
    const cursor = editor.getCursor();
    editor.replaceSelection(openTag + placeholder + closeTag);
    editor.setSelection(
      { line: cursor.line, ch: cursor.ch + openTag.length },
      { line: cursor.line, ch: cursor.ch + openTag.length + placeholder.length }
    );
    new Notice("강조할 내용을 입력하세요.");
  }

  clearHighlight(editor) {
    const codeFence = findCodeFence(editor);
    if (codeFence) {
      const start = codeFence.from.line - codeFence.line;
      const end = codeFence.selectedEndLine - codeFence.line;
      const hasHighlight = [...parseCodeHighlights(codeFence.header).values()]
        .some(lines => [...lines].some(line => line >= start && line <= end));
      if (!hasHighlight) {
        new Notice("선택한 코드 줄에 해제할 강조가 없습니다.");
        return;
      }
      const header = updateFenceHighlights(codeFence.header, null, start, end);
      editor.setLine(codeFence.line, header);
      new Notice("코드 강조 해제: " + start + (start === end ? "줄" : "-" + end + "줄"));
      return;
    }

    const source = editor.getValue();
    const edits = textHighlightEdits(
      source,
      editor.posToOffset(editor.getCursor("from")),
      editor.posToOffset(editor.getCursor("to"))
    );
    if (!edits.length) {
      new Notice("강조된 글 안에 커서를 두거나 강조된 글을 선택하세요.");
      return;
    }

    const from = edits.at(-1).from;
    const to = edits[0].to;
    let text = source.slice(from, to);
    for (const edit of edits) {
      text = text.slice(0, edit.from - from) + text.slice(edit.to - from);
    }
    editor.replaceRange(text, editor.offsetToPos(from), editor.offsetToPos(to));
    new Notice("본문 강조를 해제했습니다.");
  }

  decorateCodeBlock(pre, ranges) {
    const code = pre.querySelector("code");
    if (!code) return;

    pre.querySelectorAll(":scope > .code-line-highlight, :scope > .code-line-numbers")
      .forEach(element => element.remove());
    const style = pre.ownerDocument.defaultView.getComputedStyle(pre);
    const codeStyle = pre.ownerDocument.defaultView.getComputedStyle(code);
    const lineHeight = Number.parseFloat(codeStyle.lineHeight) || Number.parseFloat(style.lineHeight) || 24;
    const paddingTop = Number.parseFloat(style.paddingTop) || 0;
    pre.classList.add("seobkim-code-highlight");
    pre.style.setProperty("--code-highlight-line-height", lineHeight + "px");
    pre.style.setProperty("--code-highlight-padding-top", paddingTop + "px");

    const codeWithoutTrailingNewline = code.textContent.replace(/\r?\n$/, "");
    const lineCount = Math.max(1, codeWithoutTrailingNewline.split(/\r?\n/).length);
    const lineNumbers = pre.ownerDocument.createElement("span");
    lineNumbers.className = "code-line-numbers";
    lineNumbers.setAttribute("aria-hidden", "true");
    lineNumbers.textContent = Array.from({ length: lineCount }, (_, line) => line + 1).join("\n");
    pre.prepend(lineNumbers);

    for (const range of ranges) {
      const marker = pre.ownerDocument.createElement("span");
      marker.className = "code-line-highlight hl-" + range.color;
      marker.setAttribute("aria-hidden", "true");
      marker.style.setProperty("--line-start", String(range.start));
      marker.style.setProperty("--line-count", String(range.count));
      pre.prepend(marker);
    }
  }

  async addFrontmatter(file) {
    const rawContent = await this.app.vault.read(file);
    if (!this.documentBodies.has(file)) {
      this.documentBodies.set(file, markdownBody(rawContent));
    }
    if (hasFrontmatter(rawContent)) return;

    const formatted = await this.app.vault.process(file, latest => {
      if (hasFrontmatter(latest)) return latest;
      const content = latest.replace(/^\uFEFF/, "");
      const newline = content.includes("\r\n") ? "\r\n" : "\n";
      return makeFrontmatter(file, newline) + newline + newline + content;
    });
    this.documentBodies.set(file, markdownBody(formatted));
  }

  scheduleUpdatedDate(file) {
    window.clearTimeout(this.pendingUpdatedDates.get(file));
    const timer = window.setTimeout(() => {
      this.pendingUpdatedDates.delete(file);
      return this.updateModifiedDate(file).catch(error => {
        console.error("Seobkim Writing Tools: updated date", error);
        new Notice("문서 수정일을 자동 기록하지 못했습니다.");
      });
    }, 500);
    this.pendingUpdatedDates.set(file, timer);
  }

  async updateModifiedDate(file) {
    const rawContent = await this.app.vault.read(file);
    const body = markdownBody(rawContent);
    const previousBody = this.documentBodies.get(file);
    if (previousBody === undefined) {
      this.documentBodies.set(file, body);
      return;
    }
    if (body === previousBody) return;

    // Read the latest body again atomically so ongoing edits are preserved.
    const updated = await this.app.vault.process(file, latest => {
      if (markdownBody(latest) === this.documentBodies.get(file)) return latest;
      return withUpdatedDate(latest, koreanTimestamp());
    });
    this.documentBodies.set(file, markdownBody(updated));
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

    await this.app.vault.process(file, latest => {
      const parts = frontmatterParts(latest);
      if (!parts || !parts.header.split(/\r?\n/).includes(oldTitleLine)) return latest;
      return parts.opening + parts.header.replace(oldTitleLine, newTitleLine) + parts.closing + parts.body;
    });
  }
};
