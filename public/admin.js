// ---------------------------------------------------------------------------
// Auth check
// ---------------------------------------------------------------------------
async function checkAuth() {
  try {
    const res  = await fetch("/api/auth/me");
    if (!res.ok) { window.location.href = "/login"; return false; }
    const data = await res.json();
    if (!data.authenticated) { window.location.href = "/login"; return false; }
    const el = document.querySelector("#authEmail");
    if (el) el.textContent = data.email;
    return true;
  } catch { window.location.href = "/login"; return false; }
}

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------
const trendCanvas         = document.querySelector("#trendCanvas");
const sectorCanvas        = document.querySelector("#sectorCanvas");
const avgSectorCanvas     = document.querySelector("#avgSectorCanvas");
const distCanvas          = document.querySelector("#distCanvas");
const breakdownEmployees  = document.querySelector("#breakdownEmployees");
const commentsList        = document.querySelector("#commentsList");
const signalsList         = document.querySelector("#signalsList");
const sectorFilter        = document.querySelector("#sectorFilter");
const startDateInput      = document.querySelector("#startDate");
const endDateInput        = document.querySelector("#endDate");
const exportButton        = document.querySelector("#exportButton");
const surveyLink          = document.querySelector("#surveyLink");
const openSurveyLink      = document.querySelector("#openSurveyLink");
const copyLinkButton      = document.querySelector("#copyLinkButton");
const logoutBtn           = document.querySelector("#logoutBtn");
const metricTotal         = document.querySelector("#metricTotal");
const metricAvg           = document.querySelector("#metricAvg");
const metricLow           = document.querySelector("#metricLow");
const metricLowCount      = document.querySelector("#metricLowCount");
const metricHigh          = document.querySelector("#metricHigh");
const metricHighCount     = document.querySelector("#metricHighCount");
const metricSectors       = document.querySelector("#metricSectors");
const modalOverlay         = document.querySelector("#modalOverlay");
const modalTitle           = document.querySelector("#modalTitle");
const modalClose           = document.querySelector("#modalClose");
const tabSector            = document.querySelector("#tabSector");
const tabEmployee          = document.querySelector("#tabEmployee");
const modalContentSector   = document.querySelector("#modalContentSector");
const modalContentEmployee = document.querySelector("#modalContentEmployee");

// ---------------------------------------------------------------------------
// Modal — todos os listeners registrados IMEDIATAMENTE (fora do boot)
// ---------------------------------------------------------------------------
function openModal()  { modalOverlay?.classList.add("modal-open");    document.body.style.overflow = "hidden"; }
function closeModal() { modalOverlay?.classList.remove("modal-open"); document.body.style.overflow = ""; }

modalClose?.addEventListener("click",  (e) => { e.stopPropagation(); closeModal(); });
modalOverlay?.addEventListener("click", (e) => { if (e.target === modalOverlay) closeModal(); });
document.addEventListener("keydown",   (e) => { if (e.key === "Escape") closeModal(); });

tabSector?.addEventListener("click", () => {
  tabSector.classList.add("active");   tabEmployee.classList.remove("active");
  modalContentSector.hidden = false;   modalContentEmployee.hidden = true;
});
tabEmployee?.addEventListener("click", () => {
  tabEmployee.classList.add("active"); tabSector.classList.remove("active");
  modalContentEmployee.hidden = false; modalContentSector.hidden = true;
});

// KPI clickable — registrados aqui para funcionar mesmo antes do dashboard carregar
document.querySelector("#kpiLow")?.addEventListener("click",  () => openRankingModal("low",  "Ranking — Nível Baixo (😡 Péssimo + 😕 Ruim)"));
document.querySelector("#kpiHigh")?.addEventListener("click", () => openRankingModal("high", "Ranking — Nível Alto (🙂 Bom + 😍 Excelente)"));
document.querySelectorAll(".kpi-emoji-card.kpi-clickable").forEach((card) => {
  card.addEventListener("click", () => {
    const labels = { 1:"😡 Péssimo", 2:"😕 Ruim", 3:"😐 Neutro", 4:"🙂 Bom", 5:"😍 Excelente" };
    openRankingModal(card.dataset.score, `Ranking — ${labels[card.dataset.score]}`);
  });
});

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const state = { sectors: [], filterSectorId: "", filterStartDate: "", filterEndDate: "", charts: {} };

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
const authed = await checkAuth();
if (authed) boot();

async function boot() {
  try {
    await loadConfig();
    await loadSectors();
    await refreshDashboard();
    setupFiltersAndActions();
  } catch (err) {
    console.error("[boot] erro:", err);
  }
}

function setupFiltersAndActions() {
  sectorFilter?.addEventListener("change",  () => { state.filterSectorId  = sectorFilter.value;   refreshDashboard(); });
  startDateInput?.addEventListener("change", () => { state.filterStartDate = startDateInput.value; refreshDashboard(); });
  endDateInput?.addEventListener("change",   () => { state.filterEndDate   = endDateInput.value;   refreshDashboard(); });

  copyLinkButton?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(surveyLink.value);
      copyLinkButton.textContent = "Copiado!";
      setTimeout(() => { copyLinkButton.textContent = "Copiar link"; }, 1800);
    } catch { copyLinkButton.textContent = "Copie manualmente"; }
  });

  logoutBtn?.addEventListener("click", async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    sessionStorage.removeItem("auth_token");
    window.location.href = "/login";
  });
}

// ---------------------------------------------------------------------------
// Config + Sectors
// ---------------------------------------------------------------------------
async function loadConfig() {
  try {
    const config = await fetchJson("/api/config");
    if (surveyLink)    surveyLink.value    = config.surveyUrl;
    if (openSurveyLink) openSurveyLink.href = config.surveyUrl;
  } catch { if (surveyLink) surveyLink.value = `${window.location.origin}/avaliar`; }
}

async function loadSectors() {
  const { sectors } = await fetchJson("/api/sectors");
  state.sectors = sectors;
  if (metricSectors) metricSectors.textContent = String(sectors.length);
  if (sectorFilter) {
    sectorFilter.innerHTML = `<option value="">Todos</option>` +
      sectors.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("");
  }
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
async function refreshDashboard() {
  const q = buildQuery();
  if (exportButton) exportButton.href = `/api/dashboard/export.csv${q ? `?${q}` : ""}`;
  const { dashboard } = await fetchJson(`/api/dashboard${q ? `?${q}` : ""}`);
  renderKpis(dashboard.summary, dashboard.scoreDistribution);
  renderCharts(dashboard);
  renderEmployeeBreakdown(dashboard.breakdowns.topEmployees);
  renderSignals(dashboard.lowScoreSignals);
  renderComments(dashboard.comments);
}

function buildQuery() {
  const p = new URLSearchParams();
  if (state.filterSectorId)  p.set("sectorId",  state.filterSectorId);
  if (state.filterStartDate) p.set("startDate", state.filterStartDate);
  if (state.filterEndDate)   p.set("endDate",   state.filterEndDate);
  return p.toString();
}

function renderKpis(summary, dist) {
  if (metricTotal)     metricTotal.textContent     = summary.totalResponses || "0";
  if (metricAvg)       metricAvg.textContent       = summary.averageOverall ? `${summary.averageOverall}/5` : "--";
  if (metricLow)       metricLow.textContent       = `${dist.lowPercent}%`;
  if (metricLowCount)  metricLowCount.textContent  = `${dist.lowCount} respostas`;
  if (metricHigh)      metricHigh.textContent      = `${dist.highPercent}%`;
  if (metricHighCount) metricHighCount.textContent = `${dist.highCount} respostas`;
  for (let i = 1; i <= 5; i++) {
    const el   = document.querySelector(`#count${i}`);
    const card = document.querySelector(`#kpi${i}`);
    if (el)   el.textContent = dist.counts[i] || 0;
    if (card) {
      card.classList.remove("kpi-active-low", "kpi-active-high");
      if (i <= 2 && dist.counts[i] > 0) card.classList.add("kpi-active-low");
      if (i >= 4 && dist.counts[i] > 0) card.classList.add("kpi-active-high");
    }
  }
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------
const CC = { accent:"#0E2E9B", success:"#00965e", grid:"rgba(14,46,155,0.08)", text:"rgba(0,9,40,0.6)" };
const SC = ["#D63B2F","#E8A300","#8A93B4","#3BA35B","#00965e"];
function destroyChart(k) { if (state.charts[k]) { state.charts[k].destroy(); delete state.charts[k]; } }

function renderCharts(d) {
  renderTrendChart(d.trend);
  renderSectorChart(d.breakdowns.bySector);
  renderAvgSectorChart(d.breakdowns.bySector);
  renderDistChart(d.scoreDistribution);
}

function renderTrendChart(trend) {
  destroyChart("trend"); if (!trend.length || !trendCanvas) return;
  state.charts.trend = new Chart(trendCanvas, {
    type:"line",
    data:{ labels:trend.map((d)=>formatDay(d.day)), datasets:[
      { label:"Respostas", data:trend.map((d)=>d.responses), borderColor:CC.accent,
        backgroundColor:"rgba(14,46,155,0.08)", tension:0.4, fill:true, yAxisID:"yCount",
        pointBackgroundColor:CC.accent, pointRadius:4 },
      { label:"Média", data:trend.map((d)=>d.averageScore), borderColor:CC.success,
        backgroundColor:"transparent", tension:0.4, borderDash:[5,4], yAxisID:"yScore",
        pointBackgroundColor:CC.success, pointRadius:4 },
    ]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ labels:{ color:CC.text, font:{family:"Manrope"} } } },
      scales:{
        x:{ grid:{color:CC.grid}, ticks:{color:CC.text,font:{family:"Manrope"}} },
        yCount:{ type:"linear", position:"left", grid:{color:CC.grid}, ticks:{color:CC.text,font:{family:"Manrope"},stepSize:1} },
        yScore:{ type:"linear", position:"right", min:0, max:5, grid:{display:false}, ticks:{color:CC.success,font:{family:"Manrope"}} },
      }},
  });
}

function renderSectorChart(bySector) {
  destroyChart("sector"); if (!bySector.length || !sectorCanvas) return;
  const s = [...bySector].sort((a,b)=>b.responses-a.responses).slice(0,8);
  state.charts.sector = new Chart(sectorCanvas, {
    type:"bar",
    data:{ labels:s.map((r)=>r.label), datasets:[{ label:"Respostas", data:s.map((r)=>r.responses),
      backgroundColor:s.map((_,i)=>`hsla(${225+i*15},60%,45%,0.8)`), borderRadius:8 }] },
    options:{ responsive:true, maintainAspectRatio:false, indexAxis:"y",
      plugins:{legend:{display:false}},
      scales:{ x:{grid:{color:CC.grid},ticks:{color:CC.text,font:{family:"Manrope"}}},
               y:{grid:{display:false},ticks:{color:CC.text,font:{family:"Manrope",size:11}}} }},
  });
}

function renderAvgSectorChart(bySector) {
  destroyChart("avgSector"); if (!bySector.length || !avgSectorCanvas) return;
  const s = [...bySector].filter((r)=>r.average_score!==null)
    .sort((a,b)=>(b.average_score||0)-(a.average_score||0)).slice(0,8);
  state.charts.avgSector = new Chart(avgSectorCanvas, {
    type:"bar",
    data:{ labels:s.map((r)=>r.label), datasets:[{ label:"Média", data:s.map((r)=>r.average_score),
      backgroundColor:s.map((r)=>{const v=r.average_score||0;
        return v>=4?"rgba(0,150,94,0.8)":v>=3?"rgba(14,46,155,0.7)":v>=2?"rgba(232,163,0,0.8)":"rgba(214,59,47,0.8)";
      }), borderRadius:8 }] },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}},
      scales:{ x:{grid:{display:false},ticks:{color:CC.text,font:{family:"Manrope",size:11}}},
               y:{min:0,max:5,grid:{color:CC.grid},ticks:{color:CC.text,font:{family:"Manrope"}}} }},
  });
}

function renderDistChart(dist) {
  destroyChart("dist"); if (!distCanvas) return;
  state.charts.dist = new Chart(distCanvas, {
    type:"doughnut",
    data:{ labels:["😡 Péssimo","😕 Ruim","😐 Neutro","🙂 Bom","😍 Excelente"],
      datasets:[{ data:[dist.counts[1],dist.counts[2],dist.counts[3],dist.counts[4],dist.counts[5]],
        backgroundColor:SC, borderWidth:2, borderColor:"#ffffff" }] },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ position:"right", labels:{ color:CC.text,font:{family:"Manrope"},padding:14,boxWidth:14 } } } },
  });
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------
function renderEmployeeBreakdown(rows) {
  if (!breakdownEmployees) return;
  if (!rows.length) { breakdownEmployees.innerHTML=`<p class="empty-state">Os destaques aparecem após as primeiras respostas.</p>`; return; }
  breakdownEmployees.innerHTML = rows.map((r)=>`
    <article class="bar-row">
      <div class="bar-row-copy">
        <strong>${escapeHtml(r.label)}</strong>
        <span>${escapeHtml(r.sectorName)} · ${r.responses} resposta(s)</span>
      </div>
      <div class="bar-row-meter">
        <span style="width:${((r.average_score??0)/5)*100}%;background:${scoreColor(r.average_score)}"></span>
      </div>
      <strong style="min-width:40px;text-align:right;color:${scoreColor(r.average_score)}">${r.average_score??'--'}/5</strong>
    </article>`).join("");
}

function renderSignals(rows) {
  if (!signalsList) return;
  if (!rows.length) { signalsList.innerHTML=`<p class="empty-state">Nenhum sinal crítico identificado.</p>`; return; }
  signalsList.innerHTML = rows.map((r)=>`
    <article class="signal-item">
      <strong>${escapeHtml(r.employeeName||"Sem funcionário")}</strong>
      <span>${escapeHtml(r.sectorName)}</span>
      <p>${r.lowScoreCount} resposta(s) com nota ≤ 2</p>
    </article>`).join("");
}

function renderComments(comments) {
  if (!commentsList) return;
  if (!comments.length) { commentsList.innerHTML=`<p class="empty-state">Os comentários recentes aparecerão quando começarem a chegar respostas.</p>`; return; }
  commentsList.innerHTML = comments.map((c)=>`
    <article class="comment-card">
      <div class="comment-header">
        <strong>${escapeHtml(c.employeeName||"Sem funcionário")}</strong>
        <span style="color:${scoreColor(c.overallScore)}">${scoreEmoji(c.overallScore)} ${c.overallScore??'--'}/5 · ${escapeHtml(c.sectorName)}</span>
      </div>
      <p>${escapeHtml(c.comment)}</p>
      <small>${escapeHtml(c.customerName||"Sem nome")} · ${new Date(c.createdAt).toLocaleString("pt-BR")}</small>
    </article>`).join("");
}

// ---------------------------------------------------------------------------
// Ranking Modal
// ---------------------------------------------------------------------------
async function openRankingModal(type, title) {
  if (!modalTitle) return;
  modalTitle.textContent = title;
  modalContentSector.innerHTML   = `<p class="empty-state">Carregando...</p>`;
  modalContentEmployee.innerHTML = `<p class="empty-state">Carregando...</p>`;
  tabSector.classList.add("active");   tabEmployee.classList.remove("active");
  modalContentSector.hidden = false;   modalContentEmployee.hidden = true;
  openModal();
  try {
    const q = new URLSearchParams({ type });
    if (state.filterSectorId)  q.set("sectorId",  state.filterSectorId);
    if (state.filterStartDate) q.set("startDate", state.filterStartDate);
    if (state.filterEndDate)   q.set("endDate",   state.filterEndDate);
    const { ranking } = await fetchJson(`/api/dashboard/ranking?${q}`);
    renderRankingContent(modalContentSector,   ranking.bySector,   "category");
    renderRankingContent(modalContentEmployee, ranking.byEmployee, "sector_name");
  } catch (err) { modalContentSector.innerHTML=`<p class="empty-state">Erro: ${err.message}</p>`; }
}

function renderRankingContent(container, rows, subtitleKey) {
  if (!rows.length) { container.innerHTML=`<p class="empty-state">Sem dados para exibir.</p>`; return; }
  const max = Math.max(...rows.map((r)=>r.responses), 1);
  container.innerHTML = rows.map((r,i)=>`
    <article class="ranking-row">
      <span class="ranking-pos">${i+1}</span>
      <div class="ranking-info">
        <strong>${escapeHtml(r.label)}</strong>
        <span>${escapeHtml(r[subtitleKey]||"")}</span>
      </div>
      <div class="ranking-bar-wrap">
        <div class="ranking-bar"><span style="width:${(r.responses/max)*100}%;background:${scoreColor(r.average_score)}"></span></div>
        <span class="ranking-count">${r.responses} resp.</span>
      </div>
      <strong class="ranking-score" style="color:${scoreColor(r.average_score)}">${scoreEmoji(r.average_score)} ${r.average_score??'--'}/5</strong>
    </article>`).join("");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function scoreColor(s) {
  if (s==null) return "#8A93B4";
  if (s>=4.5) return "#00965e"; if (s>=3.5) return "#3BA35B";
  if (s>=2.5) return "#0E2E9B"; if (s>=1.5) return "#E8A300";
  return "#D63B2F";
}
function scoreEmoji(s) {
  if (s==null) return "";
  if (s>=4.5) return "😍"; if (s>=3.5) return "🙂";
  if (s>=2.5) return "😐"; if (s>=1.5) return "😕";
  return "😡";
}
function formatDay(day) { if (!day) return ""; const [,m,d]=day.split("-"); return `${d}/${m}`; }
function escapeHtml(v) {
  if (v==null) return "";
  return String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
async function fetchJson(url, options={}) {
  const token = sessionStorage.getItem("auth_token");
  if (token) { options.headers = options.headers||{}; options.headers.Authorization = `Bearer ${token}`; }
  const res = await fetch(url, options);
  if (res.status === 401) { window.location.href="/login"; throw new Error("Não autenticado"); }
  const data = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(data.error||"Falha na requisição.");
  return data;
}
