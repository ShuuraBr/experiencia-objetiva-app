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
    if (el) {
      const nameEl  = document.querySelector("#authName");
      if (data.name && nameEl) nameEl.textContent = data.name;
      else if (data.name && el) {
        // insert name above email
        el.insertAdjacentHTML("beforebegin", `<p id="authName" style="color:rgba(255,255,255,0.92);font-size:0.92rem;font-weight:600;margin:0 0 2px;">${data.name}</p>`);
      }
      el.textContent = data.email;
    }
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
const modalContentQuestions = document.querySelector("#modalContentQuestions");
const tabQuestions          = document.querySelector("#tabQuestions");

// ---------------------------------------------------------------------------
// Modal — todos os listeners registrados IMEDIATAMENTE (fora do boot)
// ---------------------------------------------------------------------------
function openModal()  { modalOverlay?.classList.add("modal-open");    document.body.style.overflow = "hidden"; }
function closeModal() { modalOverlay?.classList.remove("modal-open"); document.body.style.overflow = ""; }

modalClose?.addEventListener("click",  (e) => { e.stopPropagation(); closeModal(); });
modalOverlay?.addEventListener("click", (e) => { if (e.target === modalOverlay) closeModal(); });
document.addEventListener("keydown",   (e) => { if (e.key === "Escape") closeModal(); });

tabSector?.addEventListener("click", () => {
  tabSector.classList.add("active");   tabEmployee.classList.remove("active"); tabQuestions?.classList.remove("active");
  modalContentSector.hidden = false;   modalContentEmployee.hidden = true; if (modalContentQuestions) modalContentQuestions.hidden = true;
});
tabEmployee?.addEventListener("click", () => {
  tabEmployee.classList.add("active"); tabSector.classList.remove("active"); tabQuestions?.classList.remove("active");
  modalContentEmployee.hidden = false; modalContentSector.hidden = true; if (modalContentQuestions) modalContentQuestions.hidden = true;
});
tabQuestions?.addEventListener("click", () => {
  tabQuestions.classList.add("active"); tabSector.classList.remove("active"); tabEmployee.classList.remove("active");
  modalContentQuestions.hidden = false; modalContentSector.hidden = true; modalContentEmployee.hidden = true;
});

// KPI clickable — registrados aqui para funcionar mesmo antes do dashboard carregar
document.querySelector("#kpiLow")?.addEventListener("click",  () => openRankingModal("low",  "Ranking — Nível Baixo (😡 Péssimo + 😕 Ruim)"));
document.querySelector("#kpiHigh")?.addEventListener("click", () => openRankingModal("high", "Ranking — Nível Alto (🙂 Bom + 😍 Excelente)"));
document.querySelectorAll(".kpi-emoji-card.kpi-clickable").forEach((card) => {
  card.addEventListener("click", () => {
    const labels = { 1:"😡 Péssimo", 2:"😕 Ruim", 3:"😐 Neutro", 4:"🙂 Bom", 5:"😍 Excelente" };
    const score  = Number(card.dataset.score);
    openScoreModal(score, labels[score]);
  });
});

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const state = {
  sectors: [],
  filterSectorId: "",
  filterStartDate: "",
  filterEndDate: "",
  charts: {},
  chartRuntimeReady: false,
  questionsByScore: {},
};

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
  try {
    const { dashboard } = await fetchJson(`/api/dashboard${q ? `?${q}` : ""}`);
    renderKpis(dashboard.summary, dashboard.scoreDistribution);
    renderCharts(dashboard);
    renderEmployeeBreakdown(dashboard.breakdowns.topEmployees);
    renderSignals(dashboard.lowScoreSignals);
    renderComments(dashboard.comments);
  } catch (error) {
    console.error("[dashboard] erro ao carregar:", error);
    renderDashboardError(error);
  }
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
  state.questionsByScore = dist.questionsByScore || {};
  for (let i = 1; i <= 5; i++) {
    const el   = document.querySelector(`#count${i}`);
    const card = document.querySelector(`#kpi${i}`);
    if (el) {
      el.textContent = dist.counts[i] || 0;
      el.style.color = SC[i - 1];
    }
    if (card) {
      card.classList.remove("kpi-active-low", "kpi-active-high");
    }
  }
}

function renderDashboardError(error) {
  if (metricTotal) metricTotal.textContent = "--";
  if (metricAvg) metricAvg.textContent = "--";
  if (metricLow) metricLow.textContent = "--%";
  if (metricLowCount) metricLowCount.textContent = "Falha ao carregar";
  if (metricHigh) metricHigh.textContent = "--%";
  if (metricHighCount) metricHighCount.textContent = "Falha ao carregar";
  if (metricSectors) metricSectors.textContent = String(state.sectors.length || "--");

  renderChartErrorState(error?.message || "Nao foi possivel carregar os graficos.");
  if (breakdownEmployees) breakdownEmployees.innerHTML = `<p class="empty-state">Nao foi possivel carregar os destaques agora.</p>`;
  if (signalsList) signalsList.innerHTML = `<p class="empty-state">Nao foi possivel carregar os alertas agora.</p>`;
  if (commentsList) commentsList.innerHTML = `<p class="empty-state" style="grid-column:1/-1;">Nao foi possivel carregar os comentarios agora.</p>`;
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------
const CC = { accent:"#0E2E9B", success:"#00965e", grid:"rgba(14,46,155,0.08)", text:"rgba(0,9,40,0.6)" };
const SC = ["#D63B2F","#E8A300","#8A93B4","#3BA35B","#00965e"];
const chartCanvases = [trendCanvas, sectorCanvas, avgSectorCanvas, distCanvas].filter(Boolean);

// Custom plugin: draw value labels at the end of horizontal bars
const barDataLabelsPlugin = {
  id: "barDataLabels",
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    chart.data.datasets.forEach((dataset, i) => {
      const meta = chart.getDatasetMeta(i);
      if (!meta.visible) return;
      const formatter = dataset.labelFormatter || ((v) => String(v));
      meta.data.forEach((bar, idx) => {
        const value = dataset.data[idx];
        if (value == null) return;
        ctx.save();
        ctx.fillStyle = "rgba(0,9,40,0.72)";
        ctx.font = "600 11px Manrope, sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(formatter(value), bar.x + 6, bar.y);
        ctx.restore();
      });
    });
  },
};

// Custom plugin: draw percentage labels on doughnut slices
const doughnutDataLabelsPlugin = {
  id: "doughnutDataLabels",
  afterDatasetsDraw(chart) {
    const { ctx, data } = chart;
    const meta = chart.getDatasetMeta(0);
    if (!meta?.data?.length) return;
    const total = (data.datasets[0]?.data || []).reduce((s, v) => s + Number(v || 0), 0);
    if (!total) return;
    meta.data.forEach((arc, i) => {
      const value = data.datasets[0].data[i];
      if (!value) return;
      const pct = Math.round((value / total) * 100);
      if (pct < 4) return;
      const midAngle = (arc.startAngle + arc.endAngle) / 2;
      const midRadius = (arc.outerRadius + arc.innerRadius) / 2;
      const lx = arc.x + Math.cos(midAngle) * midRadius;
      const ly = arc.y + Math.sin(midAngle) * midRadius;
      ctx.save();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 12px Manrope, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0,0,0,0.25)";
      ctx.shadowBlur = 3;
      ctx.fillText(`${pct}%`, lx, ly);
      ctx.restore();
    });
  },
};

const chartAreaBackgroundPlugin = {
  id: "chartAreaBackground",
  beforeDraw(chart, _args, opts) {
    if (!opts?.color) return;
    const { ctx, chartArea } = chart;
    if (!chartArea) return;
    ctx.save();
    ctx.fillStyle = opts.color;
    ctx.fillRect(chartArea.left, chartArea.top, chartArea.width, chartArea.height);
    ctx.restore();
  },
};

function getChartFrame(canvas) {
  return canvas?.closest(".chart-frame") || canvas?.parentElement || null;
}

function clearChartMessage(canvas) {
  const frame = getChartFrame(canvas);
  if (!frame) return;
  frame.classList.remove("chart-frame-empty");
  const message = frame.querySelector(".chart-empty-state");
  if (message) message.remove();
  if (canvas) canvas.hidden = false;
}

function showChartMessage(canvas, message) {
  const frame = getChartFrame(canvas);
  if (!frame) return;

  let text = frame.querySelector(".chart-empty-state");
  if (!text) {
    text = document.createElement("p");
    text.className = "chart-empty-state";
    frame.appendChild(text);
  }

  text.textContent = message;
  frame.classList.add("chart-frame-empty");
  if (canvas) canvas.hidden = true;
}

function renderChartErrorState(message) {
  chartCanvases.forEach((canvas) => {
    destroyChart(canvas.id.replace("Canvas", ""));
    showChartMessage(canvas, message);
  });
}

function ensureChartRuntime() {
  if (state.chartRuntimeReady) return true;
  if (typeof window.Chart === "undefined") {
    renderChartErrorState("A biblioteca de graficos nao carregou. Recarregue a pagina.");
    return false;
  }
  window.Chart.register(chartAreaBackgroundPlugin);
  window.Chart.register(barDataLabelsPlugin);
  window.Chart.register(doughnutDataLabelsPlugin);
  state.chartRuntimeReady = true;
  return true;
}

function destroyChart(key) {
  if (state.charts[key]) {
    state.charts[key].destroy();
    state.charts[key] = null;
  }
}

// ── Screenshot / Screen-capture protection ────────────────────────────────
(function initScreenshotProtection() {
  // 1) Fullscreen block overlay — shown on capture detection
  const overlay = document.createElement("div");
  overlay.id = "screenshot-overlay";
  Object.assign(overlay.style, {
    position: "fixed", inset: "0", zIndex: "999999",
    background: "rgba(0,9,40,0.97)",
    display: "none", alignItems: "center", justifyContent: "center",
    flexDirection: "column", gap: "16px",
    fontFamily: "Manrope, sans-serif",
    color: "rgba(255,255,255,0.9)",
    pointerEvents: "auto",
    opacity: "0",
    transition: "opacity 120ms ease",
    backdropFilter: "blur(18px)",
  });
  overlay.innerHTML = `
    <div style="font-size:3rem;">🔒</div>
    <div style="font-size:1.4rem;font-weight:700;letter-spacing:-0.03em;">Captura de tela bloqueada</div>
    <div style="font-size:0.9rem;opacity:0.65;max-width:340px;text-align:center;line-height:1.6;">
      Este painel é de uso exclusivo interno.<br>A captura de tela não é permitida.
    </div>`;
  document.body.appendChild(overlay);
  let hideTimer = 0;


  // 3) Intercept screenshot keys BEFORE the OS acts
  //    keydown fires before Windows processes Win+Shift+S, so the overlay
  //    is already visible by the time the Snipping Tool captures the screen.
  window.addEventListener("keydown", (e) => {
    // PrintScreen variants
    const isPrintScreen =
      e.key === "PrintScreen" ||
      (e.shiftKey && e.key === "PrintScreen");

    // macOS Cmd+Shift+3/4/S
    const isMacCapture =
      e.shiftKey && e.metaKey && ["3","4","s","S"].includes(e.key);

    // Win+Shift+S — Windows key is not exposed to JS, but browser DOES receive
    // Shift+S keydown first. We block it when the user is NOT typing in a field.
    const isWinShiftS =
      e.code === "KeyS" && e.shiftKey && !e.ctrlKey && !e.altKey && !e.repeat;

    if (isPrintScreen || isMacCapture || isWinShiftS) {
      e.preventDefault();
      e.stopPropagation();
      showCaptureBlock();
    }
  }, true); // capture phase = fires before any other handler

  window.addEventListener("keyup", (e) => {
    const shouldRelease =
      e.key === "PrintScreen" ||
      e.key === "Shift" ||
      e.code === "KeyS" ||
      e.code === "Digit3" ||
      e.code === "Digit4";
    if (shouldRelease && overlay.style.display === "flex" && !document.hidden) {
      hideCaptureBlock();
    }
  }, true);

  // 4) Fallback: window loses focus when Snipping Tool / other capture tools open
  window.addEventListener("blur", showCaptureBlock);
  window.addEventListener("focus", hideCaptureBlock);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) showCaptureBlock();
    else hideCaptureBlock();
  });

  // 5) Disable right-click to prevent "Save image as"
  document.addEventListener("contextmenu", (e) => e.preventDefault());

  function showCaptureBlock() {
    clearTimeout(hideTimer);
    overlay.style.display = "flex";
    overlay.style.opacity = "1";
    document.body.classList.add("capture-guard-active");
    hideTimer = window.setTimeout(releaseCaptureBlock, 1600);
  }
  function hideCaptureBlock() {
    // Browsers cannot reliably block OS-level screenshots, so we keep the overlay
    // visible a bit longer to reduce the gap between the shortcut and the blur event.
    clearTimeout(hideTimer);
    hideTimer = window.setTimeout(releaseCaptureBlock, 900);
  }
  function releaseCaptureBlock() {
    overlay.style.opacity = "0";
    overlay.style.display = "none";
    document.body.classList.remove("capture-guard-active");
  }
})();

function renderCharts(d) {
  if (!ensureChartRuntime()) return;
  renderTrendChart(d.trend);
  renderSectorChart(d.breakdowns.bySector);
  renderAvgSectorChart(d.breakdowns.bySector);
  renderDistChart(d.scoreDistribution);
}

function renderTrendChart(trend) {
  destroyChart("trend");
  if (!trendCanvas) return;
  clearChartMessage(trendCanvas);
  if (!trend.length) {
    showChartMessage(trendCanvas, "A tendencia diaria aparecera assim que houver respostas no periodo selecionado.");
    return;
  }

  try {
    state.charts.trend = new window.Chart(trendCanvas, {
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
      plugins:{ legend:{ labels:{ color:CC.text, font:{family:"Manrope"} } }, chartAreaBackground:{color:"transparent"} },
      scales:{
        x:{ grid:{color:CC.grid}, ticks:{color:CC.text,font:{family:"Manrope"}} },
        yCount:{ type:"linear", position:"left", grid:{color:CC.grid}, ticks:{color:CC.text,font:{family:"Manrope"},stepSize:1} },
        yScore:{ type:"linear", position:"right", min:0, max:5, grid:{display:false}, ticks:{color:CC.success,font:{family:"Manrope"}} },
      }},
    });
  } catch (error) {
    console.error("[chart] trend:", error);
    showChartMessage(trendCanvas, "Nao foi possivel renderizar o grafico de tendencia.");
  }
}

function renderSectorChart(bySector) {
  destroyChart("sector");
  if (!sectorCanvas) return;
  clearChartMessage(sectorCanvas);
  if (!bySector.length) {
    showChartMessage(sectorCanvas, "Os setores mais avaliados aparecerao depois das primeiras respostas.");
    return;
  }
  const s = [...bySector].sort((a,b)=>b.responses-a.responses).slice(0,10);
  try {
    state.charts.sector = new window.Chart(sectorCanvas, {
    type:"bar",
    data:{ labels:s.map((r)=>r.label), datasets:[
      { label:"Respostas", data:s.map((r)=>r.responses),
        backgroundColor:s.map((_,i)=>`hsla(${225+i*14},62%,44%,0.82)`),
        borderRadius:12, borderSkipped:false, barThickness:22 },
    ]},
    options:{ responsive:true, maintainAspectRatio:false, indexAxis:"y",
      plugins:{ legend:{display:false}, tooltip:{enabled:false} },
      scales:{
        x:{grid:{color:CC.grid},ticks:{color:CC.text,font:{family:"Manrope"}}},
        y:{grid:{display:false},ticks:{color:CC.text,font:{family:"Manrope",size:11}}} }},
    });
  } catch (error) {
    console.error("[chart] sector:", error);
    showChartMessage(sectorCanvas, "Nao foi possivel renderizar o grafico por setor.");
  }
}

function renderAvgSectorChart(bySector) {
  destroyChart("avgSector");
  if (!avgSectorCanvas) return;
  clearChartMessage(avgSectorCanvas);
  const s = [...bySector].filter((r)=>r.average_score!==null)
    .sort((a,b)=>(b.average_score||0)-(a.average_score||0)).slice(0,10);
  if (!s.length) {
    showChartMessage(avgSectorCanvas, "As medias por setor aparecerao quando houver respostas suficientes.");
    return;
  }

  try {
    state.charts.avgSector = new window.Chart(avgSectorCanvas, {
    type:"bar",
    data:{ labels:s.map((r)=>r.label), datasets:[{ label:"Média", data:s.map((r)=>r.average_score),
      labelFormatter:(v)=>`${v}/5`,
      backgroundColor:s.map((r)=>{const v=r.average_score||0;
        return v>=4?"rgba(0,150,94,0.85)":v>=3?"rgba(14,46,155,0.75)":v>=2?"rgba(232,163,0,0.85)":"rgba(214,59,47,0.85)";
      }), borderRadius:12, borderSkipped:false, barThickness:24 }] },
    options:{ responsive:true, maintainAspectRatio:false, indexAxis:"y",
      plugins:{legend:{display:false}, tooltip:{enabled:false}},
      scales:{
        x:{min:0,max:5,grid:{color:CC.grid},ticks:{color:CC.text,font:{family:"Manrope"}}},
        y:{grid:{display:false},ticks:{color:CC.text,font:{family:"Manrope",size:11}}} }},
    });
  } catch (error) {
    console.error("[chart] avgSector:", error);
    showChartMessage(avgSectorCanvas, "Nao foi possivel renderizar o grafico de medias por setor.");
  }
}

function renderDistChart(dist) {
  destroyChart("dist");
  if (!distCanvas) return;
  clearChartMessage(distCanvas);
  const values = [dist.counts[1], dist.counts[2], dist.counts[3], dist.counts[4], dist.counts[5]];
  const total = values.reduce((sum, value) => sum + Number(value || 0), 0);
  if (!total) {
    showChartMessage(distCanvas, "A distribuicao por nota aparecera assim que a primeira avaliacao for registrada.");
    return;
  }

  try {
    state.charts.dist = new window.Chart(distCanvas, {
    type:"doughnut",
    data:{ labels:["😡 Péssimo","😕 Ruim","😐 Neutro","🙂 Bom","😍 Excelente"],
      datasets:[{ data:values,
        backgroundColor:SC, borderWidth:2, borderColor:"#ffffff", borderRadius:10 }] },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ position:"right", labels:{ color:CC.text,font:{family:"Manrope"},padding:14,boxWidth:14 } }, tooltip:{enabled:false} } },
    });
  } catch (error) {
    console.error("[chart] dist:", error);
    showChartMessage(distCanvas, "Nao foi possivel renderizar a distribuicao por nota.");
  }
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
  if (!comments.length) {
    commentsList.innerHTML=`<p class="empty-state" style="grid-column:1/-1;">Os comentários recentes aparecerão quando começarem a chegar respostas.</p>`;
    return;
  }
  commentsList.innerHTML = comments.map((c)=>`
    <article class="comment-card">
      <div class="comment-header">
        <strong>${escapeHtml(c.employeeName||"Sem funcionário")}</strong>
        <span style="color:${scoreColor(c.overallScore)}">${scoreEmoji(c.overallScore)} ${c.overallScore??'--'}/5</span>
      </div>
      <p class="comment-sector">${escapeHtml(c.sectorName)}</p>
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
  if (modalContentQuestions) modalContentQuestions.innerHTML = `<p class="empty-state">Carregando...</p>`;
  tabSector.classList.add("active");   tabEmployee.classList.remove("active"); tabQuestions?.classList.remove("active");
  modalContentSector.hidden = false;   modalContentEmployee.hidden = true; if (modalContentQuestions) modalContentQuestions.hidden = true;
  openModal();
  try {
    const q = new URLSearchParams({ type });
    if (state.filterSectorId)  q.set("sectorId",  state.filterSectorId);
    if (state.filterStartDate) q.set("startDate", state.filterStartDate);
    if (state.filterEndDate)   q.set("endDate",   state.filterEndDate);
    const qBase = new URLSearchParams();
    if (state.filterSectorId)  qBase.set("sectorId",  state.filterSectorId);
    if (state.filterStartDate) qBase.set("startDate", state.filterStartDate);
    if (state.filterEndDate)   qBase.set("endDate",   state.filterEndDate);
    const [{ ranking }, { questions }] = await Promise.all([
      fetchJson(`/api/dashboard/ranking?${q}`),
      fetchJson(`/api/dashboard/questions?${qBase}`),
    ]);
    renderRankingContent(modalContentSector,   ranking.bySector,   "category");
    renderRankingContent(modalContentEmployee, ranking.byEmployee, "sector_name");
    if (modalContentQuestions) renderQuestionsContent(modalContentQuestions, questions);
  } catch (err) { modalContentSector.innerHTML=`<p class="empty-state">Erro: ${err.message}</p>`; }
}

function renderQuestionsContent(container, questions) {
  if (!questions.length) { container.innerHTML=`<p class="empty-state">Sem dados para exibir.</p>`; return; }
  const LABELS = { 1:"😡 Péssimo", 2:"😕 Ruim", 3:"😐 Neutro", 4:"🙂 Bom", 5:"😍 Excelente" };
  const COLORS = { 1:"#D63B2F", 2:"#E8A300", 3:"#8A93B4", 4:"#3BA35B", 5:"#00965e" };
  // Group by sector
  const bySector = {};
  for (const q of questions) {
    if (!bySector[q.sectorName]) bySector[q.sectorName] = [];
    bySector[q.sectorName].push(q);
  }
  container.innerHTML = Object.entries(bySector).map(([sector, qs]) => `
    <div class="questions-sector-block">
      <p class="questions-sector-label">${escapeHtml(sector)}</p>
      ${qs.map((q) => {
        const bars = [1,2,3,4,5].map((score) => {
          const count = q.counts[score] || 0;
          const pct = q.total > 0 ? Math.round((count / q.total) * 100) : 0;
          return `<div class="q-score-row">
            <span class="q-score-label" style="color:${COLORS[score]}">${LABELS[score]}</span>
            <div class="q-score-bar-wrap">
              <div class="q-score-bar"><span style="width:${pct}%;background:${COLORS[score]}"></span></div>
            </div>
            <span class="q-score-count">${count}</span>
          </div>`;
        }).join("");
        return `<article class="question-dist-card">
          <p class="question-dist-text">${escapeHtml(q.text)}</p>
          <div class="question-dist-bars">${bars}</div>
        </article>`;
      }).join("")}
    </div>`).join("");
}

// ── Score-specific modal: Por Setor / Por Colaborador / Por Pergunta ──
async function openScoreModal(score, label) {
  if (!modalTitle) return;
  const COLORS = { 1:"#D63B2F", 2:"#E8A300", 3:"#8A93B4", 4:"#3BA35B", 5:"#00965e" };
  const color = COLORS[score];

  modalTitle.innerHTML = `<span style="color:${color}">${label}</span> — Detalhamento`;

  // Restore all tabs visibility (may have been hidden by previous call)
  tabEmployee.style.display = "";
  tabQuestions && (tabQuestions.style.display = "");

  // Switch to first tab
  tabSector.classList.add("active");
  tabEmployee.classList.remove("active");
  tabQuestions?.classList.remove("active");
  modalContentSector.hidden   = false;
  modalContentEmployee.hidden = true;
  if (modalContentQuestions) modalContentQuestions.hidden = true;

  modalContentSector.innerHTML   = `<p class="empty-state">Carregando...</p>`;
  modalContentEmployee.innerHTML = `<p class="empty-state">Carregando...</p>`;
  if (modalContentQuestions) modalContentQuestions.innerHTML = `<p class="empty-state">Carregando...</p>`;

  openModal();

  try {
    const qRank = new URLSearchParams({ type: String(score) });
    const qBase = new URLSearchParams();
    if (state.filterSectorId)  { qRank.set("sectorId",  state.filterSectorId);  qBase.set("sectorId",  state.filterSectorId); }
    if (state.filterStartDate) { qRank.set("startDate", state.filterStartDate); qBase.set("startDate", state.filterStartDate); }
    if (state.filterEndDate)   { qRank.set("endDate",   state.filterEndDate);   qBase.set("endDate",   state.filterEndDate); }

    const [{ ranking }, { questions }] = await Promise.all([
      fetchJson(`/api/dashboard/ranking?${qRank}`),
      fetchJson(`/api/dashboard/questions?${qBase}`),
    ]);

    // ── Por Setor ──
    if (!ranking.bySector.length) {
      modalContentSector.innerHTML = `<p class="empty-state">Nenhum setor avaliado com ${label} ainda.</p>`;
    } else {
      const maxR = Math.max(...ranking.bySector.map(r => r.responses), 1);
      modalContentSector.innerHTML = `
        <p class="score-modal-summary">
          <span class="score-badge" style="background:${color}20;color:${color};border-color:${color}40;">${label}</span>
          ${ranking.bySector.reduce((s,r)=>s+r.responses,0)} resposta(s) — ordenado por quantidade
        </p>
        ${ranking.bySector.map((r,i)=>`
          <article class="ranking-row">
            <span class="ranking-pos">${i+1}</span>
            <div class="ranking-info">
              <strong>${escapeHtml(r.label)}</strong>
              <span class="ranking-meta">${escapeHtml(r.category||"")} · Média geral: ${r.average_score??'--'}/5</span>
            </div>
            <div class="ranking-bar-wrap">
              <div class="ranking-bar"><span style="width:${(r.responses/maxR)*100}%;background:${color};"></span></div>
              <span class="ranking-count">${r.responses} resp.</span>
            </div>
          </article>`).join("")}`;
    }

    // ── Por Colaborador ──
    if (!ranking.byEmployee.length) {
      modalContentEmployee.innerHTML = `<p class="empty-state">Nenhum colaborador avaliado com ${label} ainda.</p>`;
    } else {
      const maxE = Math.max(...ranking.byEmployee.map(r => r.responses), 1);
      modalContentEmployee.innerHTML = `
        <p class="score-modal-summary">
          <span class="score-badge" style="background:${color}20;color:${color};border-color:${color}40;">${label}</span>
          ${ranking.byEmployee.reduce((s,r)=>s+r.responses,0)} resposta(s) — ordenado por quantidade
        </p>
        ${ranking.byEmployee.map((r,i)=>`
          <article class="ranking-row">
            <span class="ranking-pos">${i+1}</span>
            <div class="ranking-info">
              <strong>${escapeHtml(r.label)}</strong>
              <span class="ranking-meta">${escapeHtml(r.sector_name||"")} · Média geral: ${r.average_score??'--'}/5</span>
            </div>
            <div class="ranking-bar-wrap">
              <div class="ranking-bar"><span style="width:${(r.responses/maxE)*100}%;background:${color};"></span></div>
              <span class="ranking-count">${r.responses} resp.</span>
            </div>
          </article>`).join("")}`;
    }

    // ── Por Pergunta — filtra apenas contagem do score clicado ──
    if (modalContentQuestions) {
      const filtered = questions.map(q => ({
        ...q,
        scoreCount: q.counts[score] || 0,
      })).filter(q => q.scoreCount > 0).sort((a,b) => b.scoreCount - a.scoreCount);

      if (!filtered.length) {
        modalContentQuestions.innerHTML = `<p class="empty-state">Nenhuma pergunta avaliada com ${label} ainda.</p>`;
      } else {
        const maxQ = Math.max(...filtered.map(q => q.scoreCount), 1);
        // Group by sector
        const bySector = {};
        for (const q of filtered) {
          if (!bySector[q.sectorName]) bySector[q.sectorName] = [];
          bySector[q.sectorName].push(q);
        }
        modalContentQuestions.innerHTML = `
          <p class="score-modal-summary">
            <span class="score-badge" style="background:${color}20;color:${color};border-color:${color}40;">${label}</span>
            ${filtered.reduce((s,q)=>s+q.scoreCount,0)} resposta(s) — por pergunta
          </p>
          ${Object.entries(bySector).map(([sector, qs]) => `
            <div class="score-sector-group">
              <p class="score-sector-label">${escapeHtml(sector)}</p>
              ${qs.map(q => {
                const pct = Math.round((q.scoreCount / maxQ) * 100);
                return `<article class="score-question-row">
                  <p class="score-question-text">${escapeHtml(q.text)}</p>
                  <div class="score-question-meter">
                    <div class="score-question-bar">
                      <span style="width:${pct}%;background:${color};"></span>
                    </div>
                    <span class="score-question-count" style="color:${color};">${q.scoreCount}×</span>
                  </div>
                </article>`;
              }).join("")}
            </div>`).join("")}`;
      }
    }

  } catch (err) {
    modalContentSector.innerHTML = `<p class="empty-state">Erro ao carregar: ${escapeHtml(err.message)}</p>`;
  }
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
