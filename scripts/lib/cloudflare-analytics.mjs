import fs from "node:fs/promises";
import path from "node:path";

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

function roundMetric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
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
  if (!response.ok) throw new Error("Cloudflare 사이트 조회 오류 (" + response.status + ")");
  if (!payload?.success) {
    const message = payload?.errors?.map(item => item.message).join(" / ");
    throw new Error(message || "Cloudflare Web Analytics 사이트를 조회하지 못했습니다.");
  }

  const sites = Array.isArray(payload.result) ? payload.result : [];
  const site = sites.find(item =>
    item.rules?.some(rule => rule.host === configuration.requestHost) ||
    item.ruleset?.zone_name === configuration.requestHost
  ) || (sites.length === 1 ? sites[0] : null);

  if (!site?.site_tag) {
    throw new Error(configuration.requestHost + " Web Analytics Site Tag를 찾지 못했습니다.");
  }

  siteTagCache.set(cacheKey, site.site_tag);
  return site.site_tag;
}
export async function getCloudflareAnalytics(options = {}) {
  const days = Math.min(90, Math.max(1, Number(options.days) || 30));
  const force = Boolean(options.force);
  const configuration = getConfiguration();

  if (configuration.missing.length) {
    return {
      status: "unconfigured",
      days,
      host: configuration.requestHost,
      missing: configuration.missing
    };
  }

  let siteTag;
  try {
    siteTag = await resolveSiteTag(configuration, force);
  } catch (error) {
    return {
      status: "error",
      days,
      host: configuration.requestHost,
      error: sanitizeError(error, configuration.apiToken)
    };
  }

  const cacheKey = [days, configuration.accountTag, siteTag, configuration.requestHost].join(":");
  const cached = cache.get(cacheKey);
  if (!force && cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return { ...cached.value, cached: true };
  }

  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  const query = `
    query PageAnalytics(
      $accountTag: string!,
      $siteTag: string!,
      $requestHost: string!,
      $start: Time!,
      $end: Time!
    ) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          pages: rumPageloadEventsAdaptiveGroups(
            limit: 1000
            orderBy: [count_DESC]
            filter: {
              siteTag: $siteTag
              requestHost: $requestHost
              datetime_geq: $start
              datetime_leq: $end
            }
          ) {
            count
            sum {
              visits
            }
            dimensions {
              requestPath
            }
          }
        }
      }
    }
  `;

  try {
    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + configuration.apiToken,
        "Content-Type": "application/json",
        "X-Rate-Limit-Type": "account-based"
      },
      body: JSON.stringify({
        query,
        variables: {
          accountTag: configuration.accountTag,
          siteTag,
          requestHost: configuration.requestHost,
          start: start.toISOString(),
          end: end.toISOString()
        }
      }),
      signal: AbortSignal.timeout(15000)
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error("Cloudflare API 응답 오류 (" + response.status + ")");
    }
    if (!payload) throw new Error("Cloudflare API가 JSON을 반환하지 않았습니다.");
    if (payload.errors?.length) {
      throw new Error(payload.errors.map(item => item.message).join(" / "));
    }

    const groups = payload.data?.viewer?.accounts?.[0]?.pages;
    if (!Array.isArray(groups)) {
      throw new Error("Cloudflare Web Analytics 데이터셋을 사용할 수 없습니다.");
    }

    const pages = groups
      .map(group => ({
        path: group.dimensions?.requestPath || "/",
        pageViews: roundMetric(group.count),
        visits: roundMetric(group.sum?.visits)
      }))
      .filter(page => page.pageViews > 0)
      .sort((a, b) => b.pageViews - a.pageViews || a.path.localeCompare(b.path));

    const value = {
      status: "ready",
      days,
      host: configuration.requestHost,
      start: start.toISOString(),
      end: end.toISOString(),
      fetchedAt: new Date().toISOString(),
      totalPageViews: pages.reduce((sum, page) => sum + page.pageViews, 0),
      totalVisits: pages.reduce((sum, page) => sum + page.visits, 0),
      pages,
      cached: false
    };
    cache.set(cacheKey, { cachedAt: Date.now(), value });
    return value;
  } catch (error) {
    return {
      status: "error",
      days,
      host: configuration.requestHost,
      error: sanitizeError(error, configuration.apiToken)
    };
  }
}
