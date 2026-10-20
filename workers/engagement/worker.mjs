const EVENT_KEYS = { active_30s:"active30s", scroll_50:"scroll50", scroll_90:"scroll90", repository_click:"repositoryClicks" };
const emptyTotals = () => ({ active30s:0, scroll50:0, scroll90:0, repositoryClicks:0 });
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers:{"Content-Type":"application/json", "Cache-Control":"no-store", "X-Content-Type-Options":"nosniff"} });

export function normalizedPath(value) {
  if (typeof value !== "string" || value.length > 600 || !value.startsWith("/") || value.startsWith("//") || /[?#\u0000-\u001f]/.test(value)) throw new Error("Invalid path");
  let path = value;
  try { path = decodeURIComponent(path); } catch { throw new Error("Invalid path encoding"); }
  if (!path.startsWith("/") || path.startsWith("//") || /[?#\\\u0000-\u001f]/.test(path)) throw new Error("Invalid path");
  return path === "/" ? path : path.normalize("NFC").replace(/\/+$/, "") + "/";
}

export function validatedEvent(value, githubUser) {
  if (!value || !Object.hasOwn(EVENT_KEYS, value.type)) throw new Error("Invalid event");
  const path = normalizedPath(value.path);
  let target = "";
  if (value.type === "repository_click") {
    const url = new URL(value.target);
    const parts = url.pathname.split("/").filter(Boolean);
    if (url.protocol !== "https:" || url.hostname !== "github.com" || url.username || url.password || url.port || url.search || url.hash || parts.length !== 2 || parts[0].toLowerCase() !== githubUser.toLowerCase() || !/^[A-Za-z0-9._-]{1,100}$/.test(parts[1])) throw new Error("Invalid repository");
    target = "https://github.com/" + githubUser + "/" + parts[1];
  }
  return { type:value.type, path, target };
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "") && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
}

async function authenticated(request, token) {
  if (!token) return false;
  const provided = request.headers.get("Authorization") || "";
  const hash = async value => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  const [actual, expected] = await Promise.all([hash(provided), hash("Bearer " + token)]);
  return actual.reduce((difference, byte, index) => difference | (byte ^ expected[index]), 0) === 0;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") return new Response(null,{status:204});
    if (url.pathname === "/collect") {
      const origin = request.headers.get("Origin");
      if (!env.ALLOWED_ORIGIN || origin !== env.ALLOWED_ORIGIN) return json({error:"Origin not allowed"},403);
      const headers = { "Access-Control-Allow-Origin":origin, "Access-Control-Allow-Methods":"POST, OPTIONS", "Access-Control-Allow-Headers":"Content-Type", "Vary":"Origin", "Cache-Control":"no-store" };
      if (request.method === "OPTIONS") return new Response(null,{status:204,headers});
      if (request.method !== "POST") return json({error:"Method not allowed"},405);
      if (Number(request.headers.get("Content-Length") || 0) > 2048) return json({error:"Payload too large"},413);
      try {
        const raw = await request.text();
        if (new TextEncoder().encode(raw).length > 2048) return json({error:"Payload too large"},413);
        const event = validatedEvent(JSON.parse(raw), env.GITHUB_USER || "SkyLakeARIS");
        const day = new Date(Date.now() + 9*3600000).toISOString().slice(0,10);
        await env.DB.prepare("INSERT INTO engagement_daily(day,path,event_type,target,count) VALUES(?,?,?,?,1) ON CONFLICT(day,path,event_type,target) DO UPDATE SET count=count+1").bind(day,event.path,event.type,event.target).run();
        return new Response(null,{status:204,headers});
      } catch { return json({error:"Event could not be recorded"},400); }
    }
    if (url.pathname === "/stats") {
      if (request.method !== "GET") return json({error:"Method not allowed"},405);
      if (!await authenticated(request,env.ADMIN_TOKEN)) return json({error:"Unauthorized"},401);
      const start=url.searchParams.get("start"), end=url.searchParams.get("end");
      const range=Date.parse(end)-Date.parse(start);
      if (!validDate(start) || !validDate(end) || range < 0 || range > 89*86400000) return json({error:"Invalid date range"},400);
      let path;
      try { path=url.searchParams.get("path") ? normalizedPath(url.searchParams.get("path")) : ""; }
      catch { return json({error:"Invalid path"},400); }
      const condition="day>=? AND day<=?"+(path ? " AND path=?" : "");
      const parameters=path ? [start,end,path] : [start,end];
      try {
        const dailyRows=await env.DB.prepare("SELECT day,event_type,SUM(count) AS count FROM engagement_daily WHERE "+condition+" GROUP BY day,event_type ORDER BY day").bind(...parameters).all();
        const repoRows=await env.DB.prepare("SELECT target,SUM(count) AS clicks FROM engagement_daily WHERE "+condition+" AND event_type='repository_click' GROUP BY target ORDER BY clicks DESC").bind(...parameters).all();
        const daily=new Map();
        const totals=emptyTotals();
        for(let time=Date.parse(start);time<=Date.parse(end);time+=86400000) {
          const date=new Date(time).toISOString().slice(0,10);
          daily.set(date,{date,...emptyTotals()});
        }
        for(const row of dailyRows.results) {
          const key=EVENT_KEYS[row.event_type];
          if(key) { daily.get(row.day)[key]+=row.count; totals[key]+=row.count; }
        }
        return json({status:"ready",start,end,path,totals,daily:[...daily.values()],repositories:repoRows.results.map(row=>({url:row.target,clicks:row.clicks}))});
      } catch { return json({error:"Statistics unavailable"},503); }
    }
    return json({error:"Not found"},404);
  }
};
