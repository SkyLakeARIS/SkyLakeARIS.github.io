import path from "node:path";
import MarkdownIt from "markdown-it";
import taskLists from "markdown-it-task-lists";
import hljs from "highlight.js";
import {
  escapeHtml,
  headingSlug,
  slugify,
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

export function preprocessObsidian(body, document, documentLookup, assetByBase, warnings) {
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
    return "![" + caption + "](" + asset + ")";
  });

  output = output.replace(/\[\[([^\]]+)\]\]/g, (match, inside) => {
    const aliasParts = inside.split("|");
    const targetWithHeading = aliasParts[0].trim();
    const targetParts = targetWithHeading.split("#");
    const target = targetParts[0].trim();
    const heading = targetParts.slice(1).join("#").trim();
    const label = (aliasParts[1] || heading || titleFromFile(target)).trim();
    const linkedDocument = documentLookup.get(slugify(target)) || documentLookup.get(target.toLowerCase());

    if (!linkedDocument) {
      warnings.push(document.sourceRel + ": 문서 링크를 찾지 못했습니다: " + target);
      return label;
    }

    const hash = heading ? "#" + headingSlug(heading) : "";
    return "[" + label + "](" + linkedDocument.url + hash + ")";
  });

  return output;
}

export function createMarkdownRenderer(assetByAbs, warnings) {
  const markdown = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: false
  }).use(taskLists, { enabled: true, label: true, labelAfter: true });

  markdown.core.ruler.push("seobkim-headings", state => {
    const counts = new Map();
    state.env.headings = [];

    for (let index = 0; index < state.tokens.length; index += 1) {
      const token = state.tokens[index];
      if (token.type !== "heading_open") continue;

      const inline = state.tokens[index + 1];
      const level = Number(token.tag.slice(1));
      const text = inline?.content || "section";
      const base = headingSlug(text);
      const count = counts.get(base) || 0;
      counts.set(base, count + 1);
      const id = count === 0 ? base : base + "-" + (count + 1);
      token.attrSet("id", id);

      if (level === 2 || level === 3) {
        state.env.headings.push({ level, text, id });
      }
    }
  });

  markdown.renderer.rules.fence = (tokens, index) => {
    const token = tokens[index];
    const languageRaw = (token.info || "text").trim().split(/\s+/)[0].toLowerCase();
    const language = languageRaw === "c++" ? "cpp" : languageRaw;
    let highlighted = escapeHtml(token.content);

    if (language && hljs.getLanguage(language)) {
      try {
        highlighted = hljs.highlight(token.content, { language }).value;
      } catch {
        highlighted = escapeHtml(token.content);
      }
    }

    const label = LANGUAGE_LABELS[language] || language.toUpperCase() || "TEXT";
    return (
      '<div class="code-block">' +
        '<div class="code-head"><span>' + escapeHtml(label) + '</span><button class="copy-code" type="button">복사</button></div>' +
        '<pre><code class="hljs language-' + escapeHtml(language) + '">' + highlighted + "</code></pre>" +
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
        source = mapped;
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