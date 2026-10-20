import fs from "node:fs/promises";
import path from "node:path";
import { analyticsPeriod, decorateAnalytics, normalizeAnalyticsPath } from "./analytics-model.mjs";

const GRAPHQL_ENDPOINT = "https://api.cloudflare.com/client/v4/graphql";
const API_ENDPOINT = "https://api.cloudflare.com/client/v4";
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();
const siteTagCache = new Map();

function stripQuotes(value) {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

export async function loadLocalEnvironment(root) {
  const envPath = path.join(root, ".env.local");
  let raw;
  try {
    raw = await fs.readFile(envPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;

    const key = trimmed.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (process.env[key] !== undefined) continue;
    process.env[key] = stripQuotes(trimmed.slice(separator + 1).trim());
  }

  return true;
}

function getConfiguration() {
  const values = {
    accountTag: process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || "",
    siteTag: process.env.CLOUDFLARE_SITE_TAG?.trim() || "",
    apiToken: process.env.CLOUDFLARE_API_TOKEN?.trim() || "",
    requestHost: process.env.CLOUDFLARE_ANALYTICS_HOST?.trim() || "skylakearis.github.io"
  };

  const required = [
    ["CLOUDFLARE_ACCOUNT_ID", values.accountTag],
    ["CLOUDFLARE_API_TOKEN", values.apiToken]
  ];
  const missing = required.filter(([, value]) => !value).map(([name]) => name);
  return { ...values, missing };
}

function sanitizeError(error, token) {
  const message = error instanceof Error ? error.message : String(error);
  return token ? message.replaceAll(token, "[REDACTED]") : message;
}

async function resolveSiteTag(configuration, force) {
  if (configuration.siteTag) return configuration.siteTag;

  const cacheKey = configuration.accountTag + ":" + configuration.requestHost;
  if (!force && siteTagCache.has(cacheKey)) return siteTagCache.get(cacheKey);

  const url =
    API_ENDPOINT + "/accounts/" + encodeURIComponent(configuration.accountTag) +
    "/rum/site_info/list?per_page=50";
  const response = await fetch(url, {
    headers: {
      "Authorization": "Bearer " + configuration.apiToken
    },
    signal: AbortSignal.timeout(15000)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const hint = response.status === 404 ? " Cloudflare 계정 ID를 확인해 주세요." : "";
    throw new Error("Cloudflare 사이트 조회 오류 (" + response.status + ")." + hint);
  }
  if (!payload?.success) {
    const message = payload?.errors?.map(item => item.message).join(" / ");
    throw new Error(message || "Cloudflare Web Analytics 사이트를 조회하지 못했습니다.");
  }

  const sites = Array.isArray(payload.result) ? payload.result : [];
  const site = sites.find(item =>
    item.host === configuration.requestHost ||
    item.rules?.some(rule => rule.host === configuration.requestHost) ||
    item.ruleset?.zone_name === configuration.requestHost
  );

  if (!site?.site_tag) {
    throw new Error(configuration.requestHost + " Web Analytics Site Tag를 찾지 못했습니다.");
  }

  siteTagCache.set(cacheKey, site.site_tag);
  return site.site_tag;
}
export async function getCloudflareAnalytics(options = {}) {
  const period = analyticsPeriod(options.days, options.now);
  const pathFilter = String(options.path || "").slice(0, 600);
  const excludeBots = options.excludeBots !== false;
  const force = Boolean(options.force);
  const configuration = getConfiguration();
  const base = { ...period, path: pathFilter, excludeBots, host: configuration.requestHost };
  if (configuration.missing.length) return { ...base, status: "unconfigured", missing: configuration.missing };
  if (!/^[a-f0-9]{32}$/i.test(configuration.accountTag)) {
    return { ...base, status: "error", error: "Cloudflare 계정 ID 형식이 올바르지 않습니다. 32자리 계정 ID를 확인해 주세요." };
  }
  try {
    const siteTag = await resolveSiteTag(configuration, force);
    const cacheKey = [period.days, period.start, pathFilter, excludeBots, configuration.accountTag, siteTag, configuration.requestHost].join(":");
    const cached = cache.get(cacheKey);
    if (!force && cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      return decorateAnalytics({ ...cached.value, cached: true }, options.documents, options.resumePath);
    }
    const common = `siteTag: $siteTag, requestHost: $requestHost${excludeBots ? ", bot: 0" : ""}`;
    const current = common + ", datetime_geq: $start, datetime_lt: $end";
    const previous = common + ", datetime_geq: $previousStart, datetime_lt: $previousEnd";
    const selected = current + (pathFilter ? ", requestPath_in: $paths" : "");
    const paths = pathFilter ? [...new Set([pathFilter, normalizeAnalyticsPath(pathFilter), encodeURI(normalizeAnalyticsPath(pathFilter))])] : [];
    const query = `query PageAnalytics(
      $accountTag: string!, $siteTag: string!, $requestHost: string!,
      $start: Time!, $end: Time!, $previousStart: Time!, $previousEnd: Time!
      ${pathFilter ? ", $paths: [string!]" : ""}
    ) { viewer { accounts(filter: {accountTag: $accountTag}) {
      pages: rumPageloadEventsAdaptiveGroups(limit: 10000, orderBy: [count_DESC], filter: {${current}}) {
        count sum {visits} dimensions {requestPath}
      }
      previousPages: rumPageloadEventsAdaptiveGroups(limit: 10000, orderBy: [count_DESC], filter: {${previous}}) {
        count sum {visits} dimensions {requestPath}
      }
      totals: rumPageloadEventsAdaptiveGroups(limit: 1, filter: {${current}}) { count sum {visits} }
      previousTotals: rumPageloadEventsAdaptiveGroups(limit: 1, filter: {${previous}}) { count sum {visits} }
      trend: rumPageloadEventsAdaptiveGroups(limit: 10000, orderBy: [datetimeHour_ASC], filter: {${selected}}) {
        count sum {visits} dimensions {datetimeHour}
      }
      referrers: rumPageloadEventsAdaptiveGroups(limit: 100, orderBy: [count_DESC], filter: {${selected}}) {
        count sum {visits} dimensions {refererHost}
      }
    } } }`;
    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: { Authorization: "Bearer " + configuration.apiToken, "Content-Type": "application/json", "X-Rate-Limit-Type": "account-based" },
      body: JSON.stringify({ query, variables: {
        accountTag: configuration.accountTag, siteTag, requestHost: configuration.requestHost,
        start: period.start, end: period.end, previousStart: period.previousStart, previousEnd: period.previousEnd,
        ...(pathFilter ? { paths } : {})
      } }),
      signal: AbortSignal.timeout(20000)
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error("Cloudflare API 응답 오류 (" + response.status + ")");
    if (!payload) throw new Error("Cloudflare API가 JSON을 반환하지 않았습니다.");
    if (payload.errors?.length) throw new Error(payload.errors.map(item => item.message).join(" / "));
    const data = payload.data?.viewer?.accounts?.[0];
    if (!["pages", "previousPages", "totals", "previousTotals", "trend", "referrers"].every(key => Array.isArray(data?.[key]))) {
      throw new Error("Cloudflare Web Analytics 데이터셋을 사용할 수 없습니다.");
    }
    const value = { ...base, status: "ready", data, fetchedAt: new Date().toISOString(), cached: false };
    cache.set(cacheKey, { cachedAt: Date.now(), value });
    return decorateAnalytics(value, options.documents, options.resumePath);
  } catch (error) {
    return { ...base, status: "error", error: sanitizeError(error, configuration.apiToken) };
  }
}
