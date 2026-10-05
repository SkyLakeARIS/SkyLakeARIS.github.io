import assert from "node:assert/strict";
import path from "node:path";
import { createMarkdownRenderer, preprocessObsidian } from "./lib/markdown.mjs";
import { articleHtml } from "./lib/templates.mjs";
import { descriptionFromBody, slugify, stripMarkdown } from "./lib/utils.mjs";

const warnings = [];
const currentDocument = {
  sourceRel: "프로젝트/ModelViewer/현재 문서.md",
  url: "/프로젝트/modelviewer/현재-문서/"
};
const targetDocument = {
  sourceRel: "프로젝트/ModelViewer/버퍼 매니저 추가.md",
  url: "/프로젝트/modelviewer/버퍼-매니저-추가/"
};
const lookup = new Map([
  [slugify("버퍼 매니저 추가"), targetDocument]
]);

const linked = preprocessObsidian(
  "[[버퍼 매니저 추가#^buffer-lifetime|버퍼 수명 관리 방식]]",
  currentDocument,
  lookup,
  new Map(),
  warnings
);
assert.equal(
  linked,
  "[버퍼 수명 관리 방식](/프로젝트/modelviewer/버퍼-매니저-추가/#buffer-lifetime)"
);

const sameDocument = preprocessObsidian(
  "[[#^local-block|현재 문서의 문단]]",
  currentDocument,
  lookup,
  new Map(),
  warnings
);
assert.equal(
  sameDocument,
  "[현재 문서의 문단](/프로젝트/modelviewer/현재-문서/#local-block)"
);

const markdown = createMarkdownRenderer(new Map(), warnings);

const environmentParagraph = [
  "Vulkan 1.4, SDK 1.4.357",
  "GLFW, SDL 대신 기존 win32를 사용합니다.",
  "기존 xinput 라이브러리도 그대로 사용합니다."
];
const expectedEnvironmentHtml = "<p>" + environmentParagraph.join("<br>\n") + "</p>\n";
assert.equal(markdown.render(environmentParagraph.join("\n")), expectedEnvironmentHtml);
assert.equal(markdown.render(environmentParagraph.join("\r\n")), expectedEnvironmentHtml);
assert.equal(markdown.render("첫 줄\n둘째 줄\n\n다음 문단"), "<p>첫 줄<br>\n둘째 줄</p>\n<p>다음 문단</p>\n");
for (const explicitBreak of ["  \n", "\\\n"]) {
  assert.equal(markdown.render("첫 줄" + explicitBreak + "둘째 줄"), "<p>첫 줄<br>\n둘째 줄</p>\n");
}
assert.match(markdown.render("- 첫 항목\n  항목 안의 다음 줄\n- 둘째 항목"), /<li>첫 항목<br>\n항목 안의 다음 줄<\/li>\n<li>둘째 항목<\/li>/);
assert.match(markdown.render("> 첫 줄\n> 둘째 줄"), /<blockquote>\n<p>첫 줄<br>\n둘째 줄<\/p>/);
assert.equal(markdown.render('<mark class="hl-blue">강조한 줄</mark>\n다음 줄'), '<p><mark class="hl-blue">강조한 줄</mark><br>\n다음 줄</p>\n');
const lineBreakCode = markdown.render("```text\nfirst line\nsecond line\n```");
assert.match(lineBreakCode, /<code class="hljs language-text">first line\nsecond line\n<\/code>/);
assert.doesNotMatch(lineBreakCode, /<br>/);
const lineBreakTable = markdown.render("| 항목 | 값 |\n| --- | --- |\n| 첫째 | 하나 |\n| 둘째 | 둘 |");
assert.equal((lineBreakTable.match(/<tr>/g) || []).length, 3);
assert.doesNotMatch(lineBreakTable, /<br>/);

const environment = { headings: [], currentDocument: targetDocument };
const html = markdown.render(
  "버퍼의 생성과 해제는 버퍼 매니저가 전담한다. ^buffer-lifetime",
  environment
);
assert.match(html, /<p id="buffer-lifetime" class="block-target">/);
assert.doesNotMatch(html, /\^buffer-lifetime/);
assert.deepEqual(warnings, []);

const unresolvedLinks = [];
const unpublishedReference = preprocessObsidian(
  "[[아직 공개하지 않은 문서|관련 개념]]",
  currentDocument,
  lookup,
  new Map(),
  warnings,
  unresolvedLinks
);
assert.equal(unpublishedReference, "관련 개념");
assert.doesNotMatch(markdown.render(unpublishedReference), /<a\b/);
assert.equal(unresolvedLinks.length, 1);
assert.deepEqual(warnings, []);

const missingAssetWarnings = [];
preprocessObsidian("![[missing.png]]", currentDocument, lookup, new Map(), missingAssetWarnings, []);
assert.equal(missingAssetWarnings.length, 1);
assert.match(missingAssetWarnings[0], /이미지를 찾지 못했습니다/);

// Obsidian's pasted filenames contain spaces; URL delimiters must also remain part of the filename.
const imageDocument = { ...currentDocument, sourceAbs: path.resolve("content", "현재 문서.md") };
const imageWarnings = [];
const imageFilenames = ["Pasted image 20261004172333.png", "초기화 (1) #100%?.png"];
const imagePaths = new Map(imageFilenames.map(filename => [filename.toLowerCase(), "/assets/media/" + filename]));
const imageRenderer = createMarkdownRenderer(new Map(), imageWarnings);
for (const filename of imageFilenames) {
  const processed = preprocessObsidian(
    "> ![[" + filename + "]]", imageDocument, lookup, imagePaths, imageWarnings
  );
  const imageHtml = imageRenderer.render(processed, { currentDocument: imageDocument });
  const source = imageHtml.match(/<img src="([^"]+)"/)?.[1];
  assert.ok(source, "Every existing wiki image must render as an image, including inside a blockquote");
  assert.equal(decodeURIComponent(source), "/assets/media/" + filename);
  assert.doesNotMatch(source, /[\s#?()]/);
  assert.match(imageHtml, /<blockquote>/);
  assert.doesNotMatch(imageHtml, /!\[/);
}
const relativeImageSource = path.resolve("content", "_assets", imageFilenames[0]);
const relativeImageRenderer = createMarkdownRenderer(new Map([
  [relativeImageSource, "/assets/media/" + imageFilenames[0]]
]), imageWarnings);
const relativeImageHtml = relativeImageRenderer.render(
  '![첨부](<_assets/' + imageFilenames[0] + '>)', { currentDocument: imageDocument }
);
assert.match(relativeImageHtml, /src="\/assets\/media\/Pasted%20image%2020261004172333\.png"/);
assert.deepEqual(imageWarnings, []);

const headingEnvironment = { headings: [], currentDocument };
const nestedBody = markdown.render([
  "# 본문 제목",
  "### 상위 항목",
  "#### 하위 항목",
  "##### 세부 항목",
  "#### **굵은 제목**과 `Draw()`",
  "###### 작은 보충",
  "```text",
  "#### 코드 안의 제목",
  "```"
].join("\n"), headingEnvironment);
assert.deepEqual(headingEnvironment.headings.map(heading => heading.level), [3, 4, 5, 4]);
assert.equal(headingEnvironment.headings.at(-1).text, "굵은 제목과 Draw()");
const nestedDocument = {
  ...currentDocument, title: "목차 확인", description: "계층 목차", folderSegments: ["프로젝트", "ModelViewer"],
  tags: [], date: "2026-10-05", updated: "", headings: headingEnvironment.headings, minutes: 1, html: nestedBody
};
const nestedArticle = articleHtml(nestedDocument, [nestedDocument], null, null);
const tocSections = [...nestedArticle.matchAll(/<nav class="toc-links"[^>]*>([\s\S]*?)<\/nav>/g)];
assert.equal(tocSections.length, 3, "Top, mobile and sidebar tables of contents must all include nested headings");
for (const [, toc] of tocSections) {
  assert.match(toc, /toc-level-3" style="--toc-depth:0"/);
  assert.match(toc, /toc-level-4 toc-subheading" style="--toc-depth:1"/);
  assert.match(toc, /toc-level-5 toc-subheading" style="--toc-depth:2"/);
  assert.doesNotMatch(toc, /작은 보충|코드 안의 제목/);
  assert.doesNotMatch(toc, /\*\*|`Draw/);
  for (const heading of headingEnvironment.headings) {
    assert.ok(toc.includes('href="#' + heading.id + '"'));
    assert.ok(nestedBody.includes('id="' + heading.id + '"'), "Every table of contents link must point to a body heading");
  }
}

const levelTwoEnvironment = { headings: [], currentDocument };
const levelTwoBody = markdown.render("## 큰 항목\n### 하위 항목\n##### 깊은 항목", levelTwoEnvironment);
const levelTwoArticle = articleHtml({ ...nestedDocument, headings: levelTwoEnvironment.headings, html: levelTwoBody }, [nestedDocument], null, null);
assert.match(levelTwoArticle, /toc-level-2" style="--toc-depth:0"/);
assert.match(levelTwoArticle, /toc-level-3 toc-subheading" style="--toc-depth:1"/);
assert.match(levelTwoArticle, /toc-level-5 toc-subheading" style="--toc-depth:3"/);

const highlightedCode = markdown.render([
  '```cpp {hl-yellow="2-3" hl-red="5"}',
  "int first = 1;",
  "int second = 2;",
  "int third = 3;",
  "int fourth = 4;",
  "int fifth = 5;",
  "```"
].join("\n"));
assert.match(highlightedCode, /code-line-highlight hl-yellow/);
assert.match(highlightedCode, /--line-start:2;--line-count:2/);
assert.match(highlightedCode, /code-line-highlight hl-red/);
assert.match(highlightedCode, /--line-start:5;--line-count:1/);
assert.match(highlightedCode, /class="code-line-numbers" aria-hidden="true">1\n2\n3\n4\n5<\/span>/);
assert.doesNotMatch(highlightedCode, /hl-yellow=&quot;/);

const highlightedPlainText = markdown.render([
  '``` {hl-blue="1"}',
  "설명만 있는 코드 블록",
  "```"
].join("\n"));
assert.match(highlightedPlainText, /<span>Text<\/span>/);
assert.match(highlightedPlainText, /code-line-highlight hl-blue/);

const highlightedIntroduction = '<mark class="hl-blue">D3D11 -> Vulkan 포팅을 진행하면서 마주친 검증 레이어 에러에 대한 정보 공유 문서입니다.</mark>';
const introductionText = "D3D11 -> Vulkan 포팅을 진행하면서 마주친 검증 레이어 에러에 대한 정보 공유 문서입니다.";
assert.equal(descriptionFromBody(highlightedIntroduction), introductionText);
assert.equal(stripMarkdown('<mark title="a > b" class="hl-red">중요</mark> **문장** &amp; `std::vector<int>`'), "중요 문장 & std::vector<int>");
assert.equal(stripMarkdown("[[문서 이름]] [[문서 이름|표시 이름]] [링크 이름](https://example.com)"), "문서 이름 표시 이름 링크 이름");
assert.equal(stripMarkdown('<div><span class="hl-blue">첫 문장</span><br>둘째 문장</div>'), "첫 문장 둘째 문장");
assert.equal(stripMarkdown("```cpp\n<mark class=\"hl-blue\">코드 예제</mark>\n```\n\n설명"), "설명");
assert.match(markdown.render(highlightedIntroduction), /<mark class="hl-blue">/);

console.log("Checked Enter and paragraph breaks, Obsidian links, image filenames, nested headings, code line highlights, and clean text descriptions.");
