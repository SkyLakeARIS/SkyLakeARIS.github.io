(() => {
  const configElement=document.getElementById("site-analytics-config");
  if(!configElement) return;
  let config;
  try { config=JSON.parse(configElement.textContent); } catch { return; }
  const optOutKey="seobkim-analytics-opt-out";
  const url=new URL(location.href);
  const preference=url.searchParams.get("analytics");
  let excluded=false, saved=true;
  try { excluded=localStorage.getItem(optOutKey)==="1"; } catch { /* Tracking remains optional when storage is unavailable. */ }
  if(preference==="off" || preference==="on") {
    excluded=preference==="off";
    try { if(excluded) localStorage.setItem(optOutKey,"1"); else localStorage.removeItem(optOutKey); }
    catch { saved=false; }
    url.searchParams.delete("analytics");
    history.replaceState(null,"",url.pathname+url.search+url.hash);
    const notice=document.createElement("div");
    notice.setAttribute("role","status");
    notice.style.cssText="position:fixed;bottom:24px;right:24px;max-width:340px;padding:12px 16px;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:9px;box-shadow:0 8px 24px #0002;z-index:100;font-size:13px";
    notice.textContent=saved ? (excluded ? "이 브라우저의 방문을 통계에서 제외합니다." : "이 브라우저의 방문을 다시 수집합니다.") : "이 페이지에는 설정을 적용했지만 브라우저 저장소에 저장하지 못했습니다.";
    document.body.append(notice); setTimeout(()=>notice.remove(),5000);
  }
  if(excluded || ["localhost","127.0.0.1","[::1]"].includes(location.hostname)) return;
  if(config.token) {
    const script=document.createElement("script");
    script.type="module"; script.src="https://static.cloudflareinsights.com/beacon.min.js";
    script.dataset.cfBeacon=JSON.stringify({token:config.token});
    document.head.append(script);
  }
  if(!config.engagementEndpoint) return;
  let endpoint;
  try { const base=new URL(config.engagementEndpoint.replace(/\/*$/,"/")); if(base.protocol!=="https:") return; endpoint=new URL("collect",base).href; }
  catch { return; }
  const sent=new Set();
  function emit(type,target="") {
    const key=type+":"+target;
    if(sent.has(key)) return;
    sent.add(key);
    const payload=JSON.stringify({type,path:location.pathname,target});
    try {
      if(navigator.sendBeacon?.(endpoint,new Blob([payload],{type:"text/plain;charset=UTF-8"}))) return;
      fetch(endpoint,{method:"POST",body:payload,headers:{"Content-Type":"text/plain;charset=UTF-8"},credentials:"omit",referrerPolicy:"no-referrer",keepalive:true}).catch(()=>{});
    } catch { /* A blocked collector must not interrupt reading or navigation. */ }
  }
  function repositoryClick(event) {
    if(event.type==="auxclick" && event.button!==1) return;
    const link=event.target.closest("a[href]"); if(!link) return;
    try {
      const target=new URL(link.href,location.href), parts=target.pathname.split("/").filter(Boolean);
      if(target.hostname!=="github.com" || target.protocol!=="https:" || parts.length<2 || parts[0].toLowerCase()!==String(config.githubUser).toLowerCase()) return;
      const repository=parts[1]; if(!/^[A-Za-z0-9._-]{1,100}$/.test(repository)) return;
      emit("repository_click","https://github.com/"+config.githubUser+"/"+repository);
    } catch { /* Ignore malformed document links. */ }
  }
  document.addEventListener("click",repositoryClick);
  document.addEventListener("auxclick",repositoryClick);
  const article=document.querySelector(".article-body");
  if(!article) return;
  let visible=false, activeMilliseconds=0, last=performance.now(), wasActive=false;
  function tick() {
    const now=performance.now();
    if(wasActive) activeMilliseconds+=Math.min(5000,Math.max(0,now-last));
    last=now; wasActive=visible && !document.hidden;
    if(activeMilliseconds>=30000) emit("active_30s");
  }
  function progress() {
    if(document.hidden) return;
    const rect=article.getBoundingClientRect();
    if(rect.height<=0 || rect.top>=innerHeight || rect.bottom<=0) return;
    const fraction=Math.max(0,Math.min(1,(innerHeight-rect.top)/rect.height));
    if(fraction>=.5) emit("scroll_50");
    if(fraction>=.9) emit("scroll_90");
  }
  if("IntersectionObserver" in window) {
    const observer=new IntersectionObserver(entries=>{tick(); visible=entries[0].isIntersecting; wasActive=visible && !document.hidden; progress();});
    observer.observe(article);
  } else {
    const updateVisible=()=>{tick();const rect=article.getBoundingClientRect();visible=rect.bottom>0 && rect.top<innerHeight;wasActive=visible && !document.hidden;};
    updateVisible();window.addEventListener("scroll",updateVisible,{passive:true});
  }
  let timer=setInterval(tick,1000);
  document.addEventListener("visibilitychange",()=>{tick();progress();});
  window.addEventListener("scroll",progress,{passive:true});
  window.addEventListener("resize",progress,{passive:true});
  window.addEventListener("pagehide",()=>{tick();clearInterval(timer);});
  window.addEventListener("pageshow",event=>{if(event.persisted){last=performance.now();wasActive=visible&&!document.hidden;timer=setInterval(tick,1000);}});
})();
