import assert from "node:assert/strict";
import fs from "node:fs/promises";
import matter from "gray-matter";
import { fetchPinnedRepositories } from "./sync-pins.mjs";
import { verifyPagesSource } from "./check-pages.mjs";

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

const repositories = await fetchPinnedRepositories("example", "test-token", async (url, options) => {
  assert.equal(url, "https://api.github.com/graphql");
  assert.equal(JSON.parse(options.body).variables.login, "example");
  return jsonResponse({ data: { user: { pinnedItems: { nodes: [
    { name: "Second", url: "https://github.com/example/Second", isPrivate: false, description: null, primaryLanguage: null },
    null,
    { name: "Private", url: "https://github.com/example/Private", isPrivate: true },
    { name: "First", url: "https://github.com/example/First", isPrivate: false, description: "설명", primaryLanguage: { name: "C++" } }
  ] } } } });
});
assert.deepEqual(repositories.map(repository => repository.name), ["Second", "First"]);
assert.equal(repositories[0].description, "");
assert.equal(repositories[0].language, "");
assert.equal(repositories[1].language, "C++");
assert.deepEqual(await fetchPinnedRepositories("example", "test-token", async () =>
  jsonResponse({ data: { user: { pinnedItems: { nodes: [] } } } })), []);
await assert.rejects(fetchPinnedRepositories("example", "test-token", async () =>
  jsonResponse({ data: { user: null } })), /목록을 조회하지 못했습니다/);
await assert.rejects(fetchPinnedRepositories("example", "test-token", async () =>
  jsonResponse({ errors: [{ message: "Not permitted" }] })), /Not permitted/);
await assert.rejects(fetchPinnedRepositories("example", "test-token", async () =>
  jsonResponse({}, 401)), /401/);

await verifyPagesSource("example/site", "test-token", async (url, options) => {
  assert.equal(url, "https://api.github.com/repos/example/site/pages");
  assert.equal(options.headers.Authorization, "Bearer test-token");
  return jsonResponse({ build_type: "workflow" });
});
await assert.rejects(verifyPagesSource("example/site", "test-token", async () =>
  jsonResponse({ build_type: "legacy" })), /Source를 GitHub Actions로 변경/);
await assert.rejects(verifyPagesSource("example/site", "test-token", async () =>
  jsonResponse({}, 404)), /Pages 설정 조회 실패/);

const workflowSource = await fs.readFile(new URL("../.github/workflows/deploy.yml", import.meta.url), "utf8");
const workflow = matter("---\n" + workflowSource + "\n---").data;
assert.ok(workflow.on.schedule?.length, "Pin 변경을 확인하는 정기 배포가 필요합니다.");
assert.equal(workflow.permissions.pages, "read");
const steps = workflow.jobs.build.steps;
const buildIndex = steps.findIndex(step => step.run === "pnpm build");
const syncIndex = steps.findIndex(step => step.run === "pnpm sync:pins");
const sourceIndex = steps.findIndex(step => step.run === "node scripts/check-pages.mjs");
assert.ok(sourceIndex >= 0 && sourceIndex < buildIndex, "Pages 배포 소스를 빌드 전에 검사해야 합니다.");
assert.ok(syncIndex >= 0 && syncIndex < buildIndex, "Pin 목록을 빌드 전에 갱신해야 합니다.");
assert.equal(steps[syncIndex].env.GITHUB_TOKEN, "${{ secrets.GITHUB_TOKEN }}");
assert.equal(steps[sourceIndex].env.GITHUB_TOKEN, "${{ secrets.GITHUB_TOKEN }}");

const jekyllSource = await fs.readFile(new URL("../_config.yml", import.meta.url), "utf8");
const jekyll = matter("---\n" + jekyllSource + "\n---").data;
for (const directory of ["admin", "content", "scripts", "src"]) {
  assert.ok(jekyll.exclude.includes(directory), directory + " must not be published by Jekyll.");
}

console.log("Checked public Pin ordering and removal, GitHub failures, Pages source validation, scheduled sync, and Jekyll source exclusions.");
