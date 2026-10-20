import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import site from "../src/config/site.mjs";
import { loadLocalEnvironment } from "./lib/cloudflare-analytics.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function upsertEnvironment(source, values) {
  let result = source;
  for (const [key, value] of Object.entries(values)) {
    const pattern = new RegExp("^" + key + "=.*$", "m");
    result = pattern.test(result) ? result.replace(pattern, () => key + "=" + value) : result.replace(/\s*$/, "\n") + key + "=" + value + "\n";
  }
  return result;
}

export async function deployEngagement({ root = ROOT, fetchFn = fetch, accountTag = process.env.CLOUDFLARE_ACCOUNT_ID, token = process.env.CLOUDFLARE_DEPLOY_TOKEN, readToken = process.env.CLOUDFLARE_ENGAGEMENT_READ_TOKEN, configuration = site } = {}) {
  if (!/^[a-f0-9]{32}$/i.test(accountTag || "")) throw new Error(".env.local의 CLOUDFLARE_ACCOUNT_ID를 확인해 주세요.");
  if (!token) throw new Error(".env.local에 CLOUDFLARE_DEPLOY_TOKEN을 추가해 주세요. 필요한 권한: Workers Scripts Edit, D1 Edit. 기존 통계 조회용 토큰은 그대로 사용합니다.");
  const workerName = "seobkim-engagement";
  const databaseName = "seobkim-engagement";
  const localDirectory = path.join(root, ".local");
  const stateFile = path.join(localDirectory, "engagement-deployment.json");
  const siteFile = path.join(root, "src", "config", "site.mjs");
  const siteSource = await fs.readFile(siteFile, "utf8");
  if (!/engagementEndpoint:\s*"[^"]*"/.test(siteSource)) throw new Error("사이트 설정에 engagementEndpoint 항목이 필요합니다.");
  const apiBase = "https://api.cloudflare.com/client/v4/accounts/" + accountTag;
  async function api(route, options = {}) {
    const headers = { Authorization:"Bearer " + token, ...options.headers };
    const response = await fetchFn(apiBase + route, { ...options, headers, signal:AbortSignal.timeout(20000) });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.success) {
      if (route === "/workers/subdomain" && response.status === 404 && result?.errors?.some(error => error.code === 10007)) {
        throw new Error("workers.dev 주소가 아직 없습니다. Cloudflare의 Workers & Pages 화면을 한 번 열어 초기 설정을 완료한 뒤 같은 명령을 다시 실행해 주세요.");
      }
      const codes = result?.errors?.map(error => error.code).join(", ") || "";
      throw new Error("Cloudflare 배포 API 오류 (" + response.status + (codes ? ", " + codes : "") + "). Workers Scripts Edit·D1 Edit 권한과 계정 범위를 확인해 주세요.");
    }
    return result.result;
  }
  const jsonOptions = (method, body) => ({ method, headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) });
  let state = {};
  try { state = JSON.parse(await fs.readFile(stateFile, "utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  const [subdomain, workers, databases] = await Promise.all([
    api("/workers/subdomain"), api("/workers/scripts"), api("/d1/database")
  ]);
  if (!/^[a-z0-9-]+$/i.test(subdomain?.subdomain || "")) throw new Error("Cloudflare Workers & Pages에서 workers.dev 도메인을 먼저 설정해 주세요.");
  const existingWorker = workers.find(worker => worker.id === workerName);
  if (existingWorker && (state.workerName !== workerName || state.origin !== configuration.siteUrl)) {
    throw new Error("같은 이름의 Worker가 이미 있습니다. 원래 배포 PC의 .local/engagement-deployment.json과 추가 통계 읽기 토큰을 사용해 주세요. 기존 Worker를 자동으로 덮어쓰지 않습니다.");
  }
  if (existingWorker && !readToken) throw new Error("기존 추가 통계 읽기 토큰이 필요합니다. CLOUDFLARE_ENGAGEMENT_READ_TOKEN을 설정해 주세요.");
  let database = databases.find(item => item.uuid === state.databaseId);
  if (database && database.name !== databaseName) throw new Error("저장된 D1 데이터베이스 이름이 다릅니다.");
  if (!database) {
    if (databases.some(item => item.name === databaseName)) throw new Error("같은 이름의 D1 데이터베이스가 이미 있습니다. 기존 배포 상태 파일을 확인해 주세요.");
    database = await api("/d1/database", jsonOptions("POST", { name:databaseName, primary_location_hint:"apac" }));
  }
  await fs.mkdir(localDirectory, {recursive:true});
  const endpoint = "https://" + workerName + "." + subdomain.subdomain + ".workers.dev";
  await fs.writeFile(stateFile, JSON.stringify({ workerName, databaseId:database.uuid, origin:configuration.siteUrl, endpoint }, null, 2) + "\n", {mode:0o600});
  const schema = await fs.readFile(path.join(root, "workers", "engagement", "schema.sql"), "utf8");
  await api("/d1/database/" + database.uuid + "/query", jsonOptions("POST", {sql:schema}));
  const secret = readToken || randomBytes(32).toString("hex");
  // Save a generated read secret before upload so interrupted deployments can be resumed.
  const environmentFile = path.join(root, ".env.local");
  let environmentSource = "";
  try { environmentSource = await fs.readFile(environmentFile, "utf8"); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  environmentSource = upsertEnvironment(environmentSource, {CLOUDFLARE_ENGAGEMENT_READ_TOKEN:secret});
  await fs.writeFile(environmentFile, environmentSource, {mode:0o600});
  const form = new FormData();
  form.set("metadata", new Blob([JSON.stringify({
    main_module:"worker.mjs", compatibility_date:"2026-10-10", observability:{enabled:false},
    bindings:[
      {type:"d1",name:"DB",id:database.uuid},
      {type:"plain_text",name:"ALLOWED_ORIGIN",text:configuration.siteUrl},
      {type:"plain_text",name:"GITHUB_USER",text:configuration.githubUser},
      {type:"secret_text",name:"ADMIN_TOKEN",text:secret}
    ]
  })], {type:"application/json"}), "metadata.json");
  form.set("worker.mjs", new Blob([await fs.readFile(path.join(root, "workers", "engagement", "worker.mjs"), "utf8")], {type:"application/javascript+module"}), "worker.mjs");
  await api("/workers/scripts/" + workerName, {method:"PUT",body:form});
  await api("/workers/scripts/" + workerName + "/subdomain", jsonOptions("POST", {enabled:true,previews_enabled:false}));
  const today = new Date(Date.now()+9*3600000).toISOString().slice(0,10);
  const healthUrl = new URL("/stats", endpoint);
  healthUrl.searchParams.set("start",today); healthUrl.searchParams.set("end",today);
  let healthData;
  try {
    const health = await fetchFn(healthUrl, {headers:{Authorization:"Bearer " + secret},signal:AbortSignal.timeout(15000)});
    healthData = health.ok ? await health.json().catch(()=>null) : null;
  } catch {
    throw new Error("Worker와 D1은 배포됐지만 새 주소의 HTTPS 연결이 아직 준비되지 않았습니다. 잠시 후 같은 명령을 다시 실행해 주세요. 기존 저장소와 토큰은 재사용합니다.");
  }
  if (healthData?.status !== "ready") throw new Error("Worker를 배포했지만 통계 조회 확인이 완료되지 않았습니다. 잠시 후 같은 명령을 다시 실행해 주세요.");
  await fs.writeFile(environmentFile, upsertEnvironment(environmentSource,{CLOUDFLARE_ENGAGEMENT_URL:endpoint}), {mode:0o600});
  await fs.writeFile(siteFile, siteSource.replace(/engagementEndpoint:\s*"[^"]*"/, "engagementEndpoint: " + JSON.stringify(endpoint)), "utf8");
  return {endpoint};
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await loadLocalEnvironment(ROOT);
  try {
    const result = await deployEngagement();
    console.log("추가 통계 수집 서버 연결 완료: " + result.endpoint);
    console.log("로컬 서버를 재시작한 뒤, 사이트 설정 변경을 커밋·푸시하면 공개 페이지에서 수집을 시작합니다.");
  } catch (error) { console.error(error.message); process.exitCode=1; }
}
