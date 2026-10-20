import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { analyticsPeriod, decorateAnalytics, koreanDay, normalizeAnalyticsPath } from "./lib/analytics-model.mjs";
import { createAnalyticsNotes } from "./lib/analytics-notes.mjs";
import { getCloudflareAnalytics } from "./lib/cloudflare-analytics.mjs";
import { getEngagementAnalytics } from "./lib/engagement-analytics.mjs";
import { deployEngagement, upsertEnvironment } from "./deploy-engagement.mjs";
import worker, { normalizedPath, validatedEvent } from "../workers/engagement/worker.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const local = path.join(root, ".local");
await fs.mkdir(local, { recursive: true });
const temporary = await fs.mkdtemp(path.join(local, "analytics-check-"));
const environment = { ...process.env };
const originalFetch = globalThis.fetch;
let checks = 0;
async function check(name, run) {
  await run(); checks++;
  console.log("PASS " + name);
}
const respond = result => Response.json({ success: true, result });
const fixed = new Date("2026-10-09T16:30:00Z");
const period = analyticsPeriod(7, fixed);
const documentPath = "/학습/vulkan/instance-초기화/";
const encodedPath = encodeURI(documentPath);
const documents = [{ url: documentPath, title: "Instance 초기화", source: "학습/Vulkan/Instance 초기화.md", draft: false }, { url: "/draft/", title: "초안", draft: true }];
const rawData = {
  pages: [{ dimensions: { requestPath: encodedPath }, count: 8, sum: { visits: 3 } }, { dimensions: { requestPath: documentPath }, count: 2, sum: { visits: 1 } }, { dimensions: { requestPath: "/seobkim/" }, count: 2, sum: { visits: 1 } }],
  previousPages: [{ dimensions: { requestPath: encodedPath }, count: 5, sum: { visits: 2 } }],
  totals: [{ count: 12, sum: { visits: 5 } }], previousTotals: [{ count: 5, sum: { visits: 2 } }],
  trend: [{ dimensions: { datetimeHour: "2026-10-09T15:00:00Z" }, count: 4, sum: { visits: 2 } }],
  referrers: [{ dimensions: { refererHost: "" }, count: 4, sum: { visits: 2 } }]
};

function clientHarness({ href = "https://skylakearis.github.io/학습/vulkan/instance-초기화/", preference = null, blocked = false, article = true } = {}) {
  let time = 0, interval, observer;
  const events = new Map(), calls = [], scripts = [], store = new Map();
  if (preference) store.set("seobkim-analytics-opt-out", preference);
  const box = { top: 0, bottom: 2000, height: 2000 };
  const body = { getBoundingClientRect: () => box };
  const location = new URL(href);
  const document = {
    hidden: false,
    getElementById: () => ({ textContent: JSON.stringify({ token: "public-beacon", engagementEndpoint: "https://collector.example", githubUser: "SkyLakeARIS" }) }),
    createElement: () => ({ dataset: {}, style: {}, setAttribute() {}, remove() {} }),
    head: { append: value => scripts.push(value) }, body: { append() {} },
    querySelector: () => article ? body : null,
    addEventListener: (name, callback) => events.set("document:" + name, callback)
  };
  const sandbox = {
    document, location, URL, Blob, performance: { now: () => time }, innerHeight: 800,
    localStorage: {
      getItem: key => { if (blocked) throw Error("blocked"); return store.get(key); },
      setItem: (key, value) => { if (blocked) throw Error("blocked"); store.set(key, value); },
      removeItem: key => { if (blocked) throw Error("blocked"); store.delete(key); }
    },
    history: { replaceState: (_state, _title, value) => calls.push({ history: value }) },
    navigator: { sendBeacon: (_url, payload) => { calls.push({ payload }); return true; } },
    fetch: () => { throw Error("Unexpected network"); },
    setTimeout() {}, setInterval: callback => { interval = callback; return 1; }, clearInterval: () => { interval = null; },
    IntersectionObserver: class { constructor(callback) { observer = callback; } observe() {} },
    addEventListener: (name, callback) => events.set("window:" + name, callback)
  };
  sandbox.window = sandbox;
  return {
    sandbox, document, calls, scripts, store, box,
    dispatch: (name, event = {}) => events.get(name)?.(event),
    observe: value => observer?.([{ isIntersecting: value }]),
    advance: seconds => { for (let i = 0; i < seconds; i++) { time += 1000; interval?.(); } },
    payloads: async () => Promise.all(calls.filter(item => item.payload).map(async item => JSON.parse(await item.payload.text())))
  };
}

try {
  await check("한국 날짜 경계와 90일 비교 기간", () => {
    assert.equal(koreanDay(fixed), "2026-10-10");
    assert.equal(period.start, "2026-10-03T15:00:00.000Z");
    assert.equal(period.previousEnd, period.start);
    assert.equal(Date.parse(period.start) - Date.parse(period.previousStart), 7 * 86400000);
    assert.equal(analyticsPeriod(200, fixed).dates.length, 90);
    assert.equal(normalizeAnalyticsPath(encodedPath + "?secret=1#heading"), documentPath);
  });
  await check("문서 제목·분류·빈 날짜·이전 기간·이력서 집계", () => {
    const value = decorateAnalytics({ status: "ready", ...period, path: "", data: rawData }, documents);
    const page = value.pages.find(item => item.path === documentPath);
    assert.equal(page.title, "Instance 초기화");
    assert.equal(page.group, "학습 / Vulkan");
    assert.equal(page.pageViews, 10);
    assert.equal(page.change, 100);
    assert.equal(value.totalPageViews, 12);
    assert.equal(value.resume.pageViews, 2);
    assert.equal(value.daily.length, 7);
    assert.equal(value.daily.at(-1).pageViews, 4);
    assert.equal(value.daily[0].pageViews, 0);
    assert.equal(value.referrers[0].host, "직접 / 알 수 없음");
    assert.equal(value.pages.some(item => item.path === "/draft/"), false);
    assert.equal(decorateAnalytics({ status: "ready", ...period, path: "/missing/", data: rawData }, documents).selected.pageViews, 0);
  });
  await check("Cloudflare 선택 경로·봇 필터·캐시·토큰 비공개", async () => {
    Object.assign(process.env, { CLOUDFLARE_ACCOUNT_ID: "a".repeat(32), CLOUDFLARE_SITE_TAG: "b".repeat(32), CLOUDFLARE_API_TOKEN: "test-private-token" });
    let requests = 0;
    globalThis.fetch = async (_url, options) => {
      requests++;
      const request = JSON.parse(options.body);
      assert.match(request.query, /bot: 0/);
      assert.match(request.query, /requestPath_in: \$paths/);
      assert.deepEqual(request.variables.paths, [encodedPath, documentPath]);
      return Response.json({ data: { viewer: { accounts: [rawData] } } });
    };
    const value = await getCloudflareAnalytics({ days: 7, now: fixed, path: encodedPath, documents, force: true });
    assert.equal(value.status, "ready");
    assert.equal(value.selected.pageViews, 10);
    assert.equal(JSON.stringify(value).includes("test-private-token"), false);
    const cached = await getCloudflareAnalytics({ days: 7, now: fixed, path: encodedPath, documents: [{ ...documents[0], title: "수정한 제목" }] });
    assert.equal(requests, 1);
    assert.equal(cached.selected.title, "수정한 제목");
    globalThis.fetch = async (_url, options) => {
      const request = JSON.parse(options.body);
      assert.doesNotMatch(request.query, /bot: 0|\$path/);
      return Response.json({ errors: [{ message: "denied test-private-token" }] });
    };
    const failure = await getCloudflareAnalytics({ days: 90, now: fixed, excludeBots: false, force: true });
    assert.equal(failure.status, "error");
    assert.equal(failure.error.includes("test-private-token"), false);
  });
  await check("비공개 제출일 기록 동시 저장·삭제·검증", async () => {
    const notes = createAnalyticsNotes(path.join(temporary, "notes"));
    assert.deepEqual(await notes.read(), []);
    await Promise.all([notes.add({ date: "2026-10-10", label: "회사 A" }), notes.add({ date: "2026-10-09", label: "회사 B" })]);
    const rows = await notes.read();
    assert.equal(rows.length, 2);
    assert.equal(rows[0].label, "회사 B");
    assert.throws(() => notes.add({ date: "2026-02-30", label: "오류" }));
    assert.throws(() => notes.add({ date: "2026-10-10", label: " " }));
    await notes.remove(rows[0].id);
    assert.equal((await notes.read())[0].label, "회사 A");
  });
  await check("Worker 수집 검증·D1 실제 SQL 집계·조회 인증", async () => {
    const database = new DatabaseSync(":memory:");
    database.exec(await fs.readFile(path.join(root, "workers/engagement/schema.sql"), "utf8"));
    const env = { ALLOWED_ORIGIN: "https://skylakearis.github.io", GITHUB_USER: "SkyLakeARIS", ADMIN_TOKEN: "test-secret", DB: {
      prepare: sql => ({ bind: (...args) => ({ run: async () => database.prepare(sql).run(...args), all: async () => ({ results: database.prepare(sql).all(...args) }) }) })
    } };
    const collect = (event, origin = env.ALLOWED_ORIGIN) => worker.fetch(new Request("https://collector.example/collect", { method: "POST", headers: { Origin: origin }, body: JSON.stringify(event) }), env);
    try {
      assert.throws(() => normalizedPath("/%2Fattack"));
      assert.throws(() => normalizedPath("/a%3Fsecret"));
      assert.throws(() => validatedEvent({ type: "toString", path: "/" }, env.GITHUB_USER));
      assert.throws(() => validatedEvent({ type: "repository_click", path: "/", target: "https://github.com/other/repo" }, env.GITHUB_USER));
      assert.equal((await collect({ type: "scroll_50", path: encodedPath }, "https://other.example")).status, 403);
      assert.equal((await collect({ type: "invalid", path: "/" })).status, 400);
      for (const type of ["active_30s", "active_30s", "scroll_50", "scroll_90"]) assert.equal((await collect({ type, path: encodedPath })).status, 204);
      assert.equal((await collect({ type: "repository_click", path: "/seobkim/", target: "https://github.com/SkyLakeARIS/ModelViewer" })).status, 204);
      const day = koreanDay();
      const stats = (query = "", token = env.ADMIN_TOKEN) => worker.fetch(new Request(`https://collector.example/stats?start=${day}&end=${day}${query}`, { headers: { Authorization: "Bearer " + token } }), env);
      assert.equal((await stats("", "wrong")).status, 401);
      const all = await (await stats()).json();
      assert.deepEqual(all.totals, { active30s: 2, scroll50: 1, scroll90: 1, repositoryClicks: 1 });
      assert.equal(all.repositories[0].clicks, 1);
      const selected = await (await stats("&path=" + encodeURIComponent(encodedPath))).json();
      assert.equal(selected.totals.repositoryClicks, 0);
      assert.equal(selected.totals.active30s, 2);
      assert.equal(database.prepare("SELECT COUNT(*) AS n FROM engagement_daily").get().n, 4);
      assert.equal(JSON.stringify(all).includes(env.ADMIN_TOKEN), false);
      assert.equal((await worker.fetch(new Request("https://collector.example/stats?start=2026-01-01&end=2026-12-31", { headers: { Authorization: "Bearer " + env.ADMIN_TOKEN } }), env)).status, 400);
    } finally { database.close(); }
  });
  const client = await fs.readFile(path.join(root, "src/scripts/analytics.js"), "utf8");
  await check("본인 방문 제외·복원·저장소 차단·로컬 수집 제외", async () => {
    for (const options of [{ href: "https://skylakearis.github.io/?analytics=off&keep=1" }, { preference: "1" }, { href: "http://127.0.0.1:8000/" }, { href: "https://skylakearis.github.io/?analytics=off", blocked: true }]) {
      const test = clientHarness(options); vm.runInNewContext(client, test.sandbox);
      assert.equal(test.scripts.length, 0);
      assert.deepEqual(await test.payloads(), []);
    }
    const on = clientHarness({ href: "https://skylakearis.github.io/?analytics=on&keep=1", preference: "1", article: false });
    vm.runInNewContext(client, on.sandbox);
    assert.equal(on.scripts.length, 1);
    assert.equal(on.store.size, 0);
    assert.equal(on.calls[0].history, "/?keep=1");
  });
  await check("보이는 본문 30초·스크롤 50/90·저장소 클릭 중복 방지", async () => {
    const test = clientHarness(); vm.runInNewContext(client, test.sandbox);
    test.observe(true); test.advance(10);
    test.document.hidden = true; test.dispatch("document:visibilitychange"); test.advance(40);
    test.document.hidden = false; test.dispatch("document:visibilitychange"); test.advance(19);
    assert.equal((await test.payloads()).some(event => event.type === "active_30s"), false);
    test.advance(1); test.observe(false); test.advance(50);
    assert.equal((await test.payloads()).filter(event => event.type === "active_30s").length, 1);
    test.box.top = -250; test.box.bottom = 1750; test.dispatch("window:scroll");
    test.box.top = -1100; test.box.bottom = 900; test.dispatch("window:scroll"); test.dispatch("window:scroll");
    const link = { href: "https://github.com/SkyLakeARIS/ModelViewer/tree/main" };
    const click = { type: "click", target: { closest: () => link } };
    test.dispatch("document:click", click); test.dispatch("document:click", click);
    test.dispatch("window:pagehide"); test.dispatch("window:pageshow", { persisted: true }); test.advance(40);
    const payloads = await test.payloads();
    for (const type of ["active_30s", "scroll_50", "scroll_90", "repository_click"]) assert.equal(payloads.filter(event => event.type === type).length, 1, type);
    assert.deepEqual(Object.keys(payloads[0]).sort(), ["path", "target", "type"]);
  });
  await check("추가 통계 API 인증·오류 토큰 숨김", async () => {
    process.env.CLOUDFLARE_ENGAGEMENT_URL = "https://collector.example";
    process.env.CLOUDFLARE_ENGAGEMENT_READ_TOKEN = "test-read-secret";
    const value = await getEngagementAnalytics({ days: 7, path: encodedPath, fetchFn: async (url, options) => {
      assert.equal(url.searchParams.get("path"), encodedPath);
      assert.equal(options.headers.Authorization, "Bearer test-read-secret");
      return Response.json({ status: "ready", daily: [], repositories: [], totals: {} });
    } });
    assert.equal(value.status, "ready");
    const error = await getEngagementAnalytics({ fetchFn: async () => { throw Error("test-read-secret"); } });
    assert.equal(error.error, "[REDACTED]");
  });
  await check("배포 재실행·전용 권한·비밀 토큰과 공개 주소 분리", async () => {
    const deploymentRoot = path.join(temporary, "deployment");
    await fs.mkdir(path.join(deploymentRoot, "src/config"), { recursive: true });
    await fs.mkdir(path.join(deploymentRoot, "workers/engagement"), { recursive: true });
    for (const name of ["worker.mjs", "schema.sql"]) await fs.copyFile(path.join(root, "workers/engagement", name), path.join(deploymentRoot, "workers/engagement", name));
    await fs.writeFile(path.join(deploymentRoot, "src/config/site.mjs"), 'export default { engagementEndpoint: "" };\n');
    await fs.writeFile(path.join(deploymentRoot, ".env.local"), "# preserved\nCLOUDFLARE_API_TOKEN=original-read-only\n");
    let uploaded = false, created = 0;
    const configuration = { siteUrl: "https://skylakearis.github.io", githubUser: "SkyLakeARIS" };
    const database = { name: "seobkim-engagement", uuid: "test-database" };
    const mock = async (input, options = {}) => {
      const url = new URL(input), route = url.pathname.split("/accounts/" + "a".repeat(32))[1];
      if (url.hostname === "seobkim-engagement.account.workers.dev") {
        assert.equal(options.headers.Authorization, "Bearer test-read-token");
        return Response.json({ status: "ready" });
      }
      assert.equal(options.headers.Authorization, "Bearer test-deploy-token");
      if (route === "/workers/subdomain") return respond({ subdomain: "account" });
      if (route === "/workers/scripts") return respond(uploaded ? [{ id: "seobkim-engagement" }] : []);
      if (route === "/d1/database" && !options.method) return respond(created ? [database] : []);
      if (route === "/d1/database" && options.method === "POST") { created++; return respond(database); }
      if (route.endsWith("/query")) return respond([{ success: true }]);
      if (route === "/workers/scripts/seobkim-engagement") {
        const metadata = JSON.parse(await options.body.get("metadata").text());
        assert.equal(metadata.bindings.find(item => item.name === "ADMIN_TOKEN").text, "test-read-token");
        assert.equal(metadata.bindings.find(item => item.name === "DB").id, database.uuid);
        uploaded = true; return respond({});
      }
      if (route.endsWith("/subdomain")) return respond({ enabled: true });
      throw Error("Unexpected deployment route");
    };
    const options = { root: deploymentRoot, fetchFn: mock, accountTag: "a".repeat(32), token: "test-deploy-token", readToken: "test-read-token", configuration };
    await deployEngagement(options); await deployEngagement(options);
    assert.equal(created, 1);
    const publicSource = await fs.readFile(path.join(deploymentRoot, "src/config/site.mjs"), "utf8");
    assert.match(publicSource, /seobkim-engagement\.account\.workers\.dev/);
    assert.equal(publicSource.includes("test-read-token"), false);
    const env = await fs.readFile(path.join(deploymentRoot, ".env.local"), "utf8");
    assert.match(env, /CLOUDFLARE_API_TOKEN=original-read-only/);
    assert.match(env, /CLOUDFLARE_ENGAGEMENT_READ_TOKEN=test-read-token/);
    await assert.rejects(deployEngagement({ ...options, token: "" }), /CLOUDFLARE_DEPLOY_TOKEN/);
    await assert.rejects(deployEngagement({ ...options, fetchFn: async () => Response.json({ success: false, errors: [{ code: 10007 }] }, { status: 404 }) }), /Workers & Pages/);
    await assert.rejects(deployEngagement({ ...options, fetchFn: async () => Response.json({ success: false, errors: [{ code: 10000, message: "test-deploy-token" }] }, { status: 403 }) }), error => !error.message.includes("test-deploy-token"));
    await assert.rejects(deployEngagement({ ...options, fetchFn: (input, request) => new URL(input).hostname.endsWith(".workers.dev") ? Promise.reject(new Error("test-read-token")) : mock(input, request) }), error => error.message.includes("HTTPS") && !error.message.includes("test-read-token"));
    assert.equal(upsertEnvironment("A=old\nB=keep\n", { A: "new" }), "A=new\nB=keep\n");
  });
  console.log(`방문 통계 검사 완료: ${checks}개`);
} finally {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) if (!(key in environment)) delete process.env[key];
  Object.assign(process.env, environment);
  const resolved = path.resolve(temporary);
  if (path.dirname(resolved) !== path.resolve(local) || !path.basename(resolved).startsWith("analytics-check-")) throw Error("Unsafe cleanup path");
  await fs.rm(resolved, { recursive: true, force: true });
}
