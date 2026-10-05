import assert from "node:assert/strict";
import { createMarkdownRenderer, preprocessObsidian } from "./lib/markdown.mjs";
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
const environment = { headings: [], currentDocument: targetDocument };
const html = markdown.render(
  "버퍼의 생성과 해제는 버퍼 매니저가 전담한다. ^buffer-lifetime",
  environment
);
assert.match(html, /<p id="buffer-lifetime" class="block-target">/);
assert.doesNotMatch(html, /\^buffer-lifetime/);
assert.deepEqual(warnings, []);

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

console.log("Checked Obsidian links, code line highlights, and clean text descriptions.");
