import path from "node:path";
import MarkdownIt from "markdown-it";
import taskLists from "markdown-it-task-lists";
import hljs from "highlight.js";
import {
  escapeHtml,
  headingSlug,
  slugify,
  stripMarkdown,
  titleFromFile
} from "./utils.mjs";

const LANGUAGE_LABELS = {
  cpp: "C++",
  c: "C",
  hlsl: "HLSL",
  glsl: "GLSL",
  js: "JavaScript",
  javascript: "JavaScript",
  json: "JSON",
  bash: "Shell",
  powershell: "PowerShell",
  text: "Text"
};
const HIGHLIGHT_IDS = ["yellow", "red", "green", "blue", "purple", "gray"];
const CODE_HIGHLIGHT_PATTERN = new RegExp(
  "hl-(" + HIGHLIGHT_IDS.join("|") + ")\\s*=\\s*\"([^\"]*)\"",
  "g"
);

const BLOCK_ID_PATTERN = /(?:^|\s)\^([\p{Letter}\p{Number}_-]+)\s*$/u;

function assetUrl(rawPath) {
  return rawPath.split("/").map(segment => (
    encodeURIComponent(segment).replace(/[!'()*]/g, character => (
      "%" + character.charCodeAt(0).toString(16).toUpperCase()
    ))
  )).join("/");
}

function blockId(value) {
  return String(value ?? "")
    .replace(/^\^/, "")
    .trim()
    .replace(/[^\p{Letter}\p{Number}_-]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function codeHighlightRanges(info) {
  const ranges = [];
  for (const match of String(info ?? "").matchAll(CODE_HIGHLIGHT_PATTERN)) {
    for (const part of match[2].split(",")) {
      const range = part.trim().match(/^(\d+)(?:-(\d+))?$/);
      if (!range) continue;
      const start = Math.max(1, Number(range[1]));
      const end = Math.max(start, Number(range[2] || range[1]));
      ranges.push({ color: match[1], start, count: end - start + 1 });
    }
  }
  return ranges;
}

function removeBlockMarker(inline, match) {
  inline.content = inline.content.slice(0, match.index).trimEnd();

  for (let index = (inline.children?.length || 0) - 1; index >= 0; index -= 1) {
    const child = inline.children[index];
    if (child.type !== "text") continue;
    const updated = child.content.replace(BLOCK_ID_PATTERN, "").trimEnd();
    if (updated === child.content) continue;
    child.content = updated;
    break;
  }
}

export function preprocessObsidian(body, document, documentLookup, assetByBase, warnings, unresolvedLinks = warnings) {
  let output = String(body);

  output = output.replace(/!\[\[([^\]]+)\]\]/g, (match, inside) => {
    const parts = inside.split("|");
    const target = parts[0].trim();
    const caption = (parts[1] || titleFromFile(target)).trim();
    const asset = assetByBase.get(path.basename(target).toLowerCase());
    if (!asset) {
      warnings.push(document.sourceRel + ": 이미지를 찾지 못했습니다: " + target);
      return match;
    }
    return "![" + caption + "](" + assetUrl(asset) + ")";
  });

  output = output.replace(/\[\[([^\]]+)\]\]/g, (match, inside) => {
    const aliasParts = inside.split("|");
    const targetWithHeading = aliasParts[0].trim();
    const targetParts = targetWithHeading.split("#");
    const target = targetParts[0].trim();
    const heading = targetParts.slice(1).join("#").trim();
    const isBlockLink = heading.startsWith("^");
    const label = (
      aliasParts[1] ||
      (isBlockLink ? titleFromFile(target) || "문단" : heading || titleFromFile(target))
    ).trim();
    const linkedDocument = target
      ? documentLookup.get(slugify(target)) || documentLookup.get(target.toLowerCase())
      : document;

    if (!linkedDocument) {
      unresolvedLinks.push(document.sourceRel + ": 문서 링크를 찾지 못했습니다: " + target);
      return label;
    }

    const hash = heading
      ? "#" + (isBlockLink ? blockId(heading) : headingSlug(heading))
      : "";
    return "[" + label + "](" + linkedDocument.url + hash + ")";
  });

  return output;
}

export function createMarkdownRenderer(assetByAbs, warnings) {
  const markdown = new MarkdownIt({
    html: true,
    linkify: true,
    // Preserve Enter inside paragraphs, matching the writing workflow in Obsidian.
    breaks: true,
    typographer: false
  }).use(taskLists, { enabled: true, label: true, labelAfter: true });

  markdown.core.ruler.push("seobkim-block-ids", state => {
    const seen = new Set();

    for (let index = 0; index < state.tokens.length; index += 1) {
      const inline = state.tokens[index];
      if (inline.type !== "inline") continue;

      const match = inline.content.match(BLOCK_ID_PATTERN);
      if (!match) continue;

      const id = blockId(match[1]);
      const opening = state.tokens[index - 1];
      if (!id || !opening?.type.endsWith("_open")) continue;

      removeBlockMarker(inline, match);

      if (seen.has(id)) {
        const source = state.env.currentDocument?.sourceRel || "문서";
        warnings.push(source + ": 중복 블록 ID가 있습니다: " + id);
        continue;
      }

      seen.add(id);
      opening.attrSet("id", id);
      opening.attrJoin("class", "block-target");
    }
  });

  markdown.core.ruler.push("seobkim-headings", state => {
    const counts = new Map();
    state.env.headings = [];

    for (let index = 0; index < state.tokens.length; index += 1) {
      const token = state.tokens[index];
      if (token.type !== "heading_open") continue;

      const inline = state.tokens[index + 1];
      const level = Number(token.tag.slice(1));
      const text = stripMarkdown(inline?.content || "section");
      const base = headingSlug(text);
      const count = counts.get(base) || 0;
      counts.set(base, count + 1);
      const id = count === 0 ? base : base + "-" + (count + 1);
      token.attrSet("id", id);

      if (level >= 2 && level <= 5) {
        state.env.headings.push({ level, text, id });
      }
    }
  });

  markdown.renderer.rules.fence = (tokens, index) => {
    const token = tokens[index];
    const languageInfo = (token.info || "").replace(/\s*\{[^}]*\}\s*$/, "").trim();
    const languageRaw = (languageInfo.split(/\s+/)[0] || "text").toLowerCase();
    const language = languageRaw === "c++" ? "cpp" : languageRaw;
    const lineHighlights = codeHighlightRanges(token.info);
    let highlighted = escapeHtml(token.content);

    if (language && hljs.getLanguage(language)) {
      try {
        highlighted = hljs.highlight(token.content, { language }).value;
      } catch {
        highlighted = escapeHtml(token.content);
      }
    }

    const label = LANGUAGE_LABELS[language] || language.toUpperCase() || "TEXT";
    const highlightHtml = lineHighlights.map(range => (
      '<span class="code-line-highlight hl-' + range.color + '" aria-hidden="true" ' +
        'style="--line-start:' + range.start + ';--line-count:' + range.count + '"></span>'
    )).join("");
    const codeWithoutTrailingNewline = token.content.replace(/\r?\n$/, "");
    const lineCount = Math.max(1, codeWithoutTrailingNewline.split(/\r?\n/).length);
    const lineNumbers = Array.from({ length: lineCount }, (_, line) => line + 1).join("\n");
    return (
      '<div class="code-block">' +
        '<div class="code-head"><span>' + escapeHtml(label) + '</span><button class="copy-code" type="button">복사</button></div>' +
        '<pre class="seobkim-code-highlight" style="--code-highlight-padding-top:20px;--code-highlight-line-height:1.75em">' +
          highlightHtml +
          '<span class="code-line-numbers" aria-hidden="true">' + lineNumbers + '</span>' +
          '<code class="hljs language-' + escapeHtml(language) + '">' + highlighted + "</code>" +
        "</pre>" +
      "</div>"
    );
  };

  const defaultLinkOpen = markdown.renderer.rules.link_open || ((tokens, index, options, env, self) => self.renderToken(tokens, index, options));
  markdown.renderer.rules.link_open = (tokens, index, options, env, self) => {
    const href = tokens[index].attrGet("href") || "";
    if (/^https?:\/\//i.test(href)) {
      tokens[index].attrSet("target", "_blank");
      tokens[index].attrSet("rel", "noreferrer");
    }
    return defaultLinkOpen(tokens, index, options, env, self);
  };

  markdown.renderer.rules.image = (tokens, index, options, env) => {
    const token = tokens[index];
    let source = token.attrGet("src") || "";
    const alt = token.content || titleFromFile(source);
    const title = token.attrGet("title") || alt;

    if (!/^(https?:|data:|\/)/i.test(source) && env.currentDocument) {
      const absoluteSource = path.resolve(path.dirname(env.currentDocument.sourceAbs), decodeURIComponent(source));
      const mapped = assetByAbs.get(path.resolve(absoluteSource));
      if (mapped) {
        source = assetUrl(mapped);
      } else {
        warnings.push(env.currentDocument.sourceRel + ": 이미지 경로를 찾지 못했습니다: " + source);
      }
    }

    return (
      '<figure class="doc-figure">' +
        '<button class="image-open" type="button" aria-label="이미지 크게 보기">' +
          '<img src="' + escapeHtml(source) + '" alt="' + escapeHtml(alt) + '" loading="lazy">' +
        "</button>" +
        (title ? "<figcaption>" + escapeHtml(title) + "</figcaption>" : "") +
      "</figure>"
    );
  };

  return markdown;
}
