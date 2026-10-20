import { analyticsPeriod } from "./analytics-model.mjs";

export async function getEngagementAnalytics({ days = 30, path = "", fetchFn = fetch } = {}) {
  const endpoint = process.env.CLOUDFLARE_ENGAGEMENT_URL?.trim();
  const token = process.env.CLOUDFLARE_ENGAGEMENT_READ_TOKEN?.trim();
  if (!endpoint || !token) return { status: "unconfigured" };
  try {
    const url = new URL("stats", endpoint.replace(/\/*$/, "/"));
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("추가 통계 서버 주소는 인증 정보 없는 HTTPS여야 합니다.");
    const period = analyticsPeriod(days);
    url.searchParams.set("start", period.dates[0]);
    url.searchParams.set("end", period.dates.at(-1));
    if (path) url.searchParams.set("path", path);
    const response = await fetchFn(url, { headers: { Authorization: "Bearer " + token }, signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error("추가 통계 서버 응답 오류 (" + response.status + ")");
    const data = await response.json();
    if (data.status !== "ready" || !Array.isArray(data.daily) || !Array.isArray(data.repositories)) throw new Error("추가 통계 응답 형식이 올바르지 않습니다.");
    return data;
  } catch (error) {
    return { status: "error", error: String(error.message || error).replaceAll(token, "[REDACTED]") };
  }
}
