import path from "node:path";
import {
  stripMarkdown,
  titleFromFile
} from "./utils.mjs";

export function hasFrontmatter(rawContent) {
  const content = String(rawContent ?? "").replace(/^\uFEFF/, "");
  return /^---[ \t]*(?:\r?\n|$)/.test(content);
}

function koreanTimestamp() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return (
    values.year + "-" + values.month + "-" + values.day +
    "T" + values.hour + ":" + values.minute + ":" + values.second + "+09:00"
  );
}

function descriptionFromContent(rawContent) {
  const blocks = String(rawContent ?? "").split(/\r?\n\s*\r?\n/);
  for (const block of blocks) {
    if (/^\s*#{1,6}\s/.test(block)) continue;
    const plain = stripMarkdown(block);
    if (plain) return plain.slice(0, 150);
  }
  return "";
}

function yamlString(value) {
  return JSON.stringify(String(value ?? ""));
}

export function addFrontmatter(filePath, rawContent) {
  if (hasFrontmatter(rawContent)) {
    return { changed: false, content: rawContent, metadata: null };
  }

  const content = String(rawContent ?? "").replace(/^\uFEFF/, "");
  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  const parsedName = path.parse(filePath).name;
  const metadata = {
    title: titleFromFile(parsedName),
    description: descriptionFromContent(content),
    date: koreanTimestamp(),
    draft: false,
    tags: []
  };
  const header = [
    "---",
    "title: " + yamlString(metadata.title),
    "description: " + yamlString(metadata.description),
    "date: " + yamlString(metadata.date),
    "draft: false",
    "tags: []",
    "---"
  ].join(newline);

  return {
    changed: true,
    content: header + newline + newline + content,
    metadata
  };
}