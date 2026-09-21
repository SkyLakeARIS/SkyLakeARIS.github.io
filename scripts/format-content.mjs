import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { addFrontmatter } from "./lib/frontmatter.mjs";
import { CONTENT_DIR, normalizePath, walkFiles } from "./lib/utils.mjs";

export async function formatContent() {
  const allFiles = await walkFiles(CONTENT_DIR);
  const markdownFiles = allFiles.filter(filePath => path.extname(filePath).toLowerCase() === ".md");
  const changedFiles = [];

  for (const filePath of markdownFiles) {
    const raw = await fs.readFile(filePath, "utf8");
    const formatted = addFrontmatter(filePath, raw);
    if (!formatted.changed) continue;
    await fs.writeFile(filePath, formatted.content, "utf8");
    changedFiles.push(normalizePath(path.relative(CONTENT_DIR, filePath)));
  }

  return changedFiles;
}

const invokedDirectly = process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  formatContent()
    .then(changedFiles => {
      if (changedFiles.length === 0) {
        console.log("All Markdown files already have frontmatter.");
        return;
      }
      console.log("Added frontmatter to " + changedFiles.length + " file(s):");
      for (const filePath of changedFiles) console.log("- " + filePath);
    })
    .catch(error => {
      console.error(error);
      process.exitCode = 1;
    });
}