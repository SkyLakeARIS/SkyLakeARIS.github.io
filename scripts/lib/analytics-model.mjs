const DAY = 86400000;
const KST = 9 * 3600000;

export function koreanDay(value = new Date()) {
  return new Date(new Date(value).getTime() + KST).toISOString().slice(0, 10);
}

export function analyticsPeriod(days = 30, now = new Date()) {
  days = Math.min(90, Math.max(1, Math.trunc(Number(days) || 30)));
  const today = koreanDay(now);
  const midnight = Date.parse(today + "T00:00:00+09:00");
  const start = midnight - (days - 1) * DAY;
  return {
    days, start: new Date(start).toISOString(), end: new Date(now).toISOString(),
    previousStart: new Date(start - days * DAY).toISOString(), previousEnd: new Date(start).toISOString(),
    dates: Array.from({ length: days }, (_, index) => koreanDay(start + index * DAY))
  };
}

export function normalizeAnalyticsPath(value = "/") {
  let result = String(value).split(/[?#]/)[0];
  try { result = decodeURIComponent(result); } catch { /* Keep malformed historical URLs readable. */ }
  result = result.normalize("NFC");
  if (!result.startsWith("/") || result.startsWith("//")) return "/";
  return result === "/" || /\.[a-z0-9]+$/i.test(result) ? result : result.replace(/\/+$/, "") + "/";
}

export function metric(value) {
  return Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : 0;
}

export function percentageChange(current, previous) {
  return previous > 0 ? Math.round((current - previous) / previous * 1000) / 10 : null;
}

function pageIdentity(path, documents, resumePath) {
  const note = documents.find(item => !item.draft && normalizeAnalyticsPath(item.url) === path);
  if (note) {
    const folders = (note.source || "").split("/").slice(0, -1);
    return { title: note.title, group: folders.slice(0, 2).join(" / ") || note.category || "문서" };
  }
  if (path === normalizeAnalyticsPath(resumePath)) return { title: "이력서 링크", group: "이력서" };
  if (path === "/") return { title: "홈", group: "기본 페이지" };
  if (path === "/docs/") return { title: "전체 문서", group: "기본 페이지" };
  return { title: path, group: "기타 경로" };
}

export function decorateAnalytics(raw, documents = [], resumePath = "/seobkim/") {
  if (raw.status !== "ready") return raw;
  const pages = new Map();
  function add(groups, previous) {
    for (const item of groups || []) {
      const path = normalizeAnalyticsPath(item.dimensions?.requestPath);
      const row = pages.get(path) || { path, queryPath: item.dimensions?.requestPath || path, pageViews: 0, visits: 0, previousPageViews: 0, previousVisits: 0 };
      row[previous ? "previousPageViews" : "pageViews"] += metric(item.count);
      row[previous ? "previousVisits" : "visits"] += metric(item.sum?.visits);
      pages.set(path, row);
    }
  }
  add(raw.data.pages, false);
  add(raw.data.previousPages, true);
  for (const item of documents.filter(item => !item.draft)) {
    const path = normalizeAnalyticsPath(item.url);
    if (!pages.has(path)) pages.set(path, { path, queryPath: item.url, pageViews: 0, visits: 0, previousPageViews: 0, previousVisits: 0 });
  }
  for (const path of ["/", "/docs/", normalizeAnalyticsPath(resumePath)]) {
    if (!pages.has(path)) pages.set(path, { path, queryPath: path, pageViews: 0, visits: 0, previousPageViews: 0, previousVisits: 0 });
  }
  const rows = [...pages.values()].map(item => ({
    ...item, ...pageIdentity(item.path, documents, resumePath), change: percentageChange(item.pageViews, item.previousPageViews)
  })).sort((a, b) => b.pageViews - a.pageViews || a.title.localeCompare(b.title, "ko"));
  const groups = new Map();
  for (const page of rows) {
    const group = groups.get(page.group) || { name: page.group, pageViews: 0, visits: 0, previousPageViews: 0 };
    group.pageViews += page.pageViews;
    group.visits += page.visits;
    group.previousPageViews += page.previousPageViews;
    groups.set(page.group, group);
  }
  const daily = new Map(raw.dates.map(date => [date, { date, pageViews: 0, visits: 0 }]));
  for (const item of raw.data.trend || []) {
    const date = koreanDay(item.dimensions.datetimeHour);
    const day = daily.get(date);
    if (day) { day.pageViews += metric(item.count); day.visits += metric(item.sum?.visits); }
  }
  const total = raw.data.totals?.[0] || {};
  const previous = raw.data.previousTotals?.[0] || {};
  const pageViews = metric(total.count);
  const previousViews = metric(previous.count);
  const selectedPath = raw.path ? normalizeAnalyticsPath(raw.path) : "";
  const selected = selectedPath ? rows.find(item => item.path === selectedPath) : null;
  const result = { ...raw };
  delete result.data;
  delete result.dates;
  return {
    ...result, totalPageViews: pageViews, totalVisits: metric(total.sum?.visits),
    previous: { pageViews: previousViews, visits: metric(previous.sum?.visits) },
    change: percentageChange(pageViews, previousViews), viewedPaths: rows.filter(item => item.pageViews > 0).length,
    pages: rows, groups: [...groups.values()].sort((a, b) => b.pageViews - a.pageViews),
    daily: [...daily.values()], resume: rows.find(item => item.path === normalizeAnalyticsPath(resumePath)),
    selected: selected || { path: selectedPath, title: selectedPath ? pageIdentity(selectedPath, documents, resumePath).title : "사이트 전체", pageViews: selectedPath ? 0 : pageViews, visits: selectedPath ? 0 : metric(total.sum?.visits), previousPageViews: selectedPath ? 0 : previousViews, change: selectedPath ? null : percentageChange(pageViews, previousViews) },
    referrers: (raw.data.referrers || []).map(item => ({
      host: item.dimensions?.refererHost || "직접 / 알 수 없음", pageViews: metric(item.count), visits: metric(item.sum?.visits)
    })),
    truncated: (raw.data.pages?.length || 0) >= 10000 || (raw.data.previousPages?.length || 0) >= 10000
  };
}
