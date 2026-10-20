(() => {
  const $ = id => document.getElementById(id);
  const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[char]);
  const number = value => new Intl.NumberFormat("ko-KR").format(Number(value) || 0);
  const change = (current, previous) => previous > 0 ? ((current - previous) / previous * 100 >= 0 ? "+" : "") + ((current - previous) / previous * 100).toFixed(1) + "%" : current > 0 ? "새 조회" : "변화 없음";
  let data;
  let generation = 0;
  let controller;

  function renderNotes(notes) {
    $("analytics-notes").innerHTML = notes.length ? [...notes].reverse().map(note =>
      `<li><time>${escape(note.date)}</time><span>${escape(note.label)}</span><button type="button" data-remove-note="${escape(note.id)}" aria-label="${escape(note.label)} 기록 삭제">삭제</button></li>`
    ).join("") : '<li><span>제출일을 기록하면 조회 그래프에 표시됩니다.</span></li>';
  }

  function renderChart() {
    const days = data.daily || [];
    const notes = data.notes || [];
    const max = Math.max(1, ...days.map(day => day.pageViews));
    const width = 840, height = 210, left = 34, bottom = 174;
    const step = (width - left - 15) / Math.max(1, days.length);
    const grid = [0, .5, 1].map(fraction => {
      const y = bottom - fraction * 135;
      return `<line class="chart-grid" x1="${left}" x2="825" y1="${y}" y2="${y}"/><text x="25" y="${y + 4}" text-anchor="end">${number(Math.round(max * fraction))}</text>`;
    }).join("");
    const bars = days.map((day, index) => {
      const x = left + index * step + step / 2;
      const barHeight = day.pageViews / max * 135;
      const labels = notes.filter(note => note.date === day.date).map(note => note.label);
      const title = `${day.date} · 조회 ${number(day.pageViews)} · 방문 시작 ${number(day.visits)}${labels.length ? " · " + labels.join(", ") : ""}`;
      const tick = index === 0 || index === days.length - 1 || index % Math.max(1, Math.ceil(days.length / 7)) === 0;
      return `<g tabindex="0" data-chart-day="${index}" role="button" aria-label="${escape(title)}"><title>${escape(title)}</title><rect class="chart-bar" x="${x - Math.max(2, step * .3)}" y="${bottom - Math.max(1, barHeight)}" width="${Math.max(4, step * .6)}" height="${Math.max(1, barHeight)}" rx="2"/>${labels.length ? `<circle class="chart-note" cx="${x}" cy="17" r="4"/>` : ""}${tick ? `<text x="${x}" y="198" text-anchor="middle">${day.date.slice(5)}</text>` : ""}</g>`;
    }).join("");
    $("analytics-chart").innerHTML = `<svg class="analytics-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="한국 시간 기준 일별 조회수. 주황 점은 제출일 기록입니다.">${grid}${bars}</svg>`;
    $("analytics-chart-title").textContent = data.selected.title + " · 일별 조회";
    $("analytics-chart-summary").textContent = `조회 ${number(data.selected.pageViews)} · 이전 기간 ${number(data.selected.previousPageViews)} · ${change(data.selected.pageViews, data.selected.previousPageViews)}`;
    $("analytics-day-detail").textContent = "날짜를 선택하면 조회수와 제출일 기록을 확인할 수 있습니다.";
  }

  function renderTable() {
    const group = $("analytics-group").value;
    const rows = data.pages.filter(item => !group || item.group === group);
    $("analytics-table").innerHTML = rows.map(item =>
      `<tr><td><button class="analytics-title-button" type="button" data-select-path="${escape(item.queryPath)}">${escape(item.title)}</button><small>${escape(item.group)} · ${escape(item.path)}</small></td><td class="analytics-number">${number(item.pageViews)}</td><td class="analytics-number">${number(item.visits)}</td><td class="analytics-number">${number(item.previousPageViews)}</td><td class="analytics-number">${escape(change(item.pageViews, item.previousPageViews))}</td></tr>`
    ).join("") || '<tr><td colspan="5">표시할 문서가 없습니다.</td></tr>';
    $("analytics-table-count").textContent = rows.length + "개";
  }

  function renderEngagement(value) {
    const message = $("analytics-engagement-message");
    $("analytics-engagement-content").hidden = value?.status !== "ready";
    message.hidden = value?.status === "ready";
    if (value?.status !== "ready") {
      message.textContent = value?.status === "error" ? value.error : "추가 수집 서버 연결 전입니다. Cloudflare Worker 연결 후 활성 상태 30초, 본문 스크롤, 저장소 링크 클릭 횟수가 표시됩니다.";
      return;
    }
    for (const [key, id] of [["active30s","active"],["scroll50","scroll50"],["scroll90","scroll90"],["repositoryClicks","clicks"]]) {
      $("engagement-" + id).textContent = number(value.totals?.[key]);
    }
    $("analytics-repositories").innerHTML = value.repositories.length ? value.repositories.map(item => `<li><span>${escape(item.url.replace("https://github.com/", ""))}</span><strong>${number(item.clicks)}</strong></li>`).join("") : '<li><span>선택한 기간에 저장소 링크 클릭 기록이 없습니다.</span></li>';
  }

  function render(value) {
    data = value;
    renderNotes(value.notes || []);
    if (value.ownerExclusion) {
      $("analytics-owner-off").href = value.ownerExclusion.offUrl;
      $("analytics-owner-on").href = value.ownerExclusion.onUrl;
    }
    renderEngagement(value.engagement);
    const ready = value.status === "ready";
    $("analytics-overview").hidden = !ready;
    document.querySelectorAll(".analytics-ready").forEach(element => { element.hidden = !ready; });
    $("analytics-message").hidden = ready;
    if (!ready) {
      $("analytics-total").textContent = value.status === "unconfigured" ? "OFF" : "—";
      $("analytics-period").textContent = "통계 연결 확인 필요";
      $("analytics-state").textContent = "확인 필요";
      $("analytics-message").textContent = value.error || "Cloudflare 계정 ID와 통계 조회용 API 토큰을 .env.local에 설정해 주세요.";
      return;
    }
    $("analytics-state").textContent = value.cached ? "캐시" : "조회됨";
    $("analytics-total").textContent = number(value.totalPageViews);
    $("analytics-period").textContent = "최근 " + value.days + "일";
    $("analytics-pageviews").textContent = number(value.totalPageViews);
    $("analytics-change").textContent = "이전 " + value.days + "일 대비 " + change(value.totalPageViews, value.previous.pageViews);
    $("analytics-visits").textContent = number(value.totalVisits);
    $("analytics-resume").textContent = number(value.resume.pageViews);
    $("analytics-resume-visits").textContent = "방문 시작 " + number(value.resume.visits) + "회";
    $("analytics-paths").textContent = number(value.viewedPaths);
    $("analytics-dashboard-text").textContent = `최근 ${value.days}일 · 조회 ${number(value.totalPageViews)} · 이력서 링크 조회 ${number(value.resume.pageViews)}`;
    const selected = $("analytics-page").value;
    $("analytics-page").innerHTML = '<option value="">사이트 전체</option>' + [...value.pages].sort((a,b) => a.title.localeCompare(b.title,"ko")).map(item => `<option value="${escape(item.queryPath)}">${escape(item.title)}</option>`).join("");
    if ([...$("analytics-page").options].some(option => option.value === selected)) $("analytics-page").value = selected;
    const selectedGroup = $("analytics-group").value;
    $("analytics-group").innerHTML = '<option value="">모든 분류</option>' + value.groups.map(group => `<option value="${escape(group.name)}">${escape(group.name)} · ${number(group.pageViews)}</option>`).join("");
    $("analytics-group").value = selectedGroup;
    renderChart(); renderTable();
    $("analytics-referrers").innerHTML = value.referrers.length ? value.referrers.map(item => `<li><span>${escape(item.host)}<small> · 방문 시작 ${number(item.visits)}</small></span><strong>${number(item.pageViews)}</strong></li>`).join("") : '<li><span>선택한 기간에 기록된 경로가 없습니다.</span></li>';
    $("analytics-groups").innerHTML = value.groups.map(item => `<li><span>${escape(item.name)}</span><strong>${number(item.pageViews)}</strong></li>`).join("");
    $("analytics-note").textContent = "한국 시간 · 오늘 진행 중인 수치 포함 · " + new Date(value.fetchedAt).toLocaleString("ko-KR") + " 조회 · 최대 5분 캐시" + (value.truncated ? " · 경로 목록이 반환 한도에 도달했습니다. 전체 합계는 별도 조회합니다." : "");
  }

  async function load(force = false) {
    const current = ++generation;
    controller?.abort(); controller = new AbortController();
    $("analytics-refresh").disabled = true;
    $("analytics-state").textContent = "조회 중";
    const query = new URLSearchParams({ days: $("analytics-days").value, path: $("analytics-page").value, bots: $("analytics-bots").checked ? "exclude" : "include" });
    if (force) query.set("refresh", "1");
    try {
      const response = await fetch("/__admin/api/analytics?" + query, { cache:"no-store", signal:controller.signal });
      const value = await response.json();
      if (current === generation) render(value);
    } catch (error) {
      if (error.name !== "AbortError" && current === generation) render({ status:"error", error:error.message });
    } finally { if (current === generation) $("analytics-refresh").disabled = false; }
  }

  async function saveNote(method, input) {
    $("analytics-note-error").textContent = "";
    const response = await fetch("/__admin/api/analytics-notes", { method, headers:{"Content-Type":"application/json"}, body:JSON.stringify(input) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "기록을 저장하지 못했습니다.");
    renderNotes(result.notes);
    if (data) { data.notes = result.notes; if (data.status === "ready") renderChart(); }
    return result;
  }
  $("analytics-notes-form").addEventListener("submit", async event => {
    event.preventDefault(); const button = event.currentTarget.querySelector("button"); button.disabled = true;
    try { await saveNote("POST", { date:$("analytics-note-date").value, label:$("analytics-note-label").value }); $("analytics-note-label").value = ""; }
    catch(error) { $("analytics-note-error").textContent = error.message; }
    finally { button.disabled = false; }
  });
  $("analytics-notes").addEventListener("click", async event => {
    const button = event.target.closest("[data-remove-note]"); if (!button) return;
    button.disabled = true;
    try { await saveNote("DELETE", { id:button.dataset.removeNote }); }
    catch(error) { $("analytics-note-error").textContent = error.message; button.disabled = false; }
  });
  const showDay = event => {
    const target = event.target.closest("[data-chart-day]"); if (!target || !data) return;
    const day = data.daily[Number(target.dataset.chartDay)];
    const labels = (data.notes || []).filter(note => note.date === day.date).map(note => note.label);
    $("analytics-day-detail").textContent = `${day.date} · 조회 ${number(day.pageViews)} · 방문 시작 ${number(day.visits)}${labels.length ? " · " + labels.join(", ") : ""}`;
  };
  for (const event of ["pointerover","focusin","click"]) $("analytics-chart").addEventListener(event, showDay);
  $("analytics-chart").addEventListener("keydown", event => { if (["Enter"," "].includes(event.key)) { event.preventDefault(); showDay(event); } });
  $("analytics-table").addEventListener("click", event => { const button = event.target.closest("[data-select-path]"); if (button) { $("analytics-page").value = button.dataset.selectPath; load(); } });
  for (const id of ["analytics-days","analytics-page","analytics-bots"]) $(id).addEventListener("change", () => load());
  $("analytics-group").addEventListener("change", renderTable);
  $("analytics-refresh").addEventListener("click", () => load(true));
  $("analytics-note-date").value = new Date(Date.now()+9*3600000).toISOString().slice(0,10);
  $("analytics-export").addEventListener("click", () => {
    if (data?.status !== "ready") return;
    const cell = value => '"' + String(value ?? "").replace(/^[=+@-]/,"'$&").replaceAll('"','""') + '"';
    const csv = [["문서","분류","경로","조회수","방문 시작","이전 기간 조회수"], ...data.pages.map(item => [item.title,item.group,item.path,item.pageViews,item.visits,item.previousPageViews])].map(row => row.map(cell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF"+csv], {type:"text/csv;charset=utf-8"}));
    const link = document.createElement("a"); link.href=url; link.download="seobkim-analytics-"+new Date().toISOString().slice(0,10)+".csv"; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  load();
})();
