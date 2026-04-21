// ---------------------------------------------------------------------------
// Auth check — redirect to login if not authenticated
// ---------------------------------------------------------------------------
async function checkAuth() {
  try {
    const res = await fetch("/api/auth/me");
    if (!res.ok) { window.location.href = "/login"; return false; }
    const data = await res.json();
    if (!data.authenticated) { window.location.href = "/login"; return false; }
    const authEmailEl = document.querySelector("#authEmail");
    if (authEmailEl) authEmailEl.textContent = data.email;
    return true;
  } catch {
    window.location.href = "/login";
    return false;
  }
}

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------
const employeeForm        = document.querySelector("#employeeForm");
const employeeFormFeedback = document.querySelector("#employeeFormFeedback");
const employeeFormSector  = document.querySelector("#employeeFormSector");
const employeesList       = document.querySelector("#employeesList");
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

// KPI elements
const metricTotal         = document.querySelector("#metricTotal");
const metricAvg           = document.querySelector("#metricAvg");
const metricLow           = document.querySelector("#metricLow");
const metricLowCount      = document.querySelector("#metricLowCount");
const metricHigh          = document.querySelector("#metricHigh");
const metricHighCount     = document.querySelector("#metricHighCount");
const metricSectors       = document.querySelector("#metricSectors");
const metricEmployees     = document.querySelector("#metricEmployees");

// Modal
const modalOverlay        = document.querySelector("#modalOverlay");
const modalTitle          = document.querySelector("#modalTitle");
const modalClose          = document.querySelector("#modalClose");
const tabSector           = document.querySelector("#tabSector");
const tabEmployee         = document.querySelector("#tabEmployee");
const modalContentSector  = document.querySelector("#modalContentSector");
const modalContentEmployee = document.querySelector("#modalContentEmployee");

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const state = {
  sectors: [],
  employees: [],
  filterSectorId: "",
  filterStartDate: "",
  filterEndDate: "",
  charts: {},
};

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
const authed = await checkAuth();
if (authed) {
  boot();
}

async function boot() {
  await loadConfig();
  await loadSectors();
  await loadEmployees();
  await refreshDashboard();
  setupEventListeners();
}

function setupEventListeners() {
  employeeForm?.addEventListener("submit", handleCreateEmployee);

  sectorFilter?.addEventListener("change", () => {
    state.filterSectorId = sectorFilter.value;
    refreshDashboard();
  });

  startDateInput?.addEventListener("change", () => {
    state.filterStartDate = startDateInput.value;
    refreshDashboard();
  });

  endDateInput?.addEventListener("change", () => {
    state.filterEndDate = endDateInput.value;
    refreshDashboard();
  });

  copyLinkButton?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(surveyLink.value);
      copyLinkButton.textContent = "Copiado!";
      setTimeout(() => { copyLinkButton.textContent = "Copiar link"; }, 1800);
    } catch {
      copyLinkButton.textContent = "Copie manualmente";
    }
  });

  logoutBtn?.addEventListener("click", async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    sessionStorage.removeItem("auth_token");
    window.location.href = "/login";
  });

  // KPI clickable cards — low/high level
  document.querySelector("#kpiLow")?.addEventListener("click", () => openRankingModal("low", "Ranking — Nível Baixo (😡 Péssimo + 😕 Ruim)"));
  document.querySelector("#kpiHigh")?.addEventListener("click", () => openRankingModal("high", "Ranking — Nível Alto (🙂 Bom + 😍 Excelente)"));

  // Score distribution cards
  document.querySelectorAll(".score-dist-card.kpi-clickable").forEach((card) => {
    card.addEventListener("click", () => {
      const score = card.dataset.score;
      const labels = { 1: "😡 Péssimo", 2: "😕 Ruim", 3: "😐 Neutro", 4: "🙂 Bom", 5: "😍 Excelente" };
      openRankingModal(score, `Ranking — ${labels[score] || score}`);
    });
  });

  // Modal close
  modalClose?.addEventListener("click", closeModal);
  modalOverlay?.addEventListener("click", (e) => { if (e.target === modalOverlay) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

  tabSector?.addEventListener("click", () => {
    tabSector.classList.add("active");
    tabEmployee.classList.remove("active");
    modalContentSector.hidden = false;
    modalContentEmployee.hidden = true;
  });

  tabEmployee?.addEventListener("click", () => {
    tabEmployee.classList.add("active");
    tabSector.classList.remove("active");
    modalContentEmployee.hidden = false;
    modalContentSector.hidden = true;
  });
}

// ---------------------------------------------------------------------------
// Config / sectors / employees
// ---------------------------------------------------------------------------
async function loadConfig() {
  try {
    const config = await fetchJson("/api/config");
    if (surveyLink) surveyLink.value = config.surveyUrl;
    if (openSurveyLink && config.surveyUrl) openSurveyLink.href = config.surveyUrl;
  } catch {
    if (surveyLink) surveyLink.value = `${window.location.origin}/avaliar`;
  }
}

async function loadSectors() {
  const { sectors } = await fetchJson("/api/sectors");
  state.sectors = sectors;
  populateSectorSelect(employeeFormSector, sectors, { placeholder: "Selecione" });
  populateSectorSelect(sectorFilter, sectors, { includeAll: true });
  if (state.filterSectorId) sectorFilter.value = state.filterSectorId;
  if (metricSectors) metricSectors.textContent = String(sectors.length);
}

async function loadEmployees() {
  const { employees } = await fetchJson("/api/employees");
  state.employees = employees;
  renderEmployees(employees);
  if (metricEmployees) metricEmployees.textContent = String(employees.length);
}

// ---------------------------------------------------------------------------
// Dashboard refresh
// ---------------------------------------------------------------------------
async function refreshDashboard() {
  const query = buildQuery();
  if (exportButton) exportButton.href = `/api/dashboard/export.csv${query ? `?${query}` : ""}`;

  const { dashboard } = await fetchJson(`/api/dashboard${query ? `?${query}` : ""}`);
  renderKpis(dashboard.summary, dashboard.scoreDistribution);
  renderCharts(dashboard);
  renderEmployeeBreakdown(dashboard.breakdowns.topEmployees);
  renderSignals(dashboard.lowScoreSignals);
  renderComments(dashboard.comments);
}

function buildQuery() {
  const params = new URLSearchParams();
  if (state.filterSectorId) params.set("sectorId", state.filterSectorId);
  if (state.filterStartDate) params.set("startDate", state.filterStartDate);
  if (state.filterEndDate) params.set("endDate", state.filterEndDate);
  return params.toString();
}

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------
function renderKpis(summary, dist) {
  if (metricTotal) metricTotal.textContent = summary.totalResponses || "0";
  if (metricAvg) metricAvg.textContent = summary.averageOverall ? `${summary.averageOverall}/5` : "--";

  if (metricLow) metricLow.textContent = `${dist.lowPercent}%`;
  if (metricLowCount) metricLowCount.textContent = `${dist.lowCount} respostas`;
  if (metricHigh) metricHigh.textContent = `${dist.highPercent}%`;
  if (metricHighCount) metricHighCount.textContent = `${dist.highCount} respostas`;

  // Score distribution counts
  for (let i = 1; i <= 5; i++) {
    const el = document.querySelector(`#count${i}`);
    if (el) el.textContent = dist.counts[i] || 0;

    const card = document.querySelector(`#kpi${i}`);
    if (card) {
      card.classList.toggle("kpi-active-low", i <= 2 && dist.counts[i] > 0);
      card.classList.toggle("kpi-active-high", i >= 4 && dist.counts[i] > 0);
    }
  }
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------
const CHART_COLORS = {
  accent: "#0E2E9B",
  success: "#00965e",
  warn: "#E8A300",
  danger: "#D63B2F",
  neutral: "#8A93B4",
  grid: "rgba(14,46,155,0.08)",
  text: "rgba(0,9,40,0.6)",
};

const SCORE_COLORS = ["#D63B2F", "#E8A300", "#8A93B4", "#3BA35B", "#00965e"];

function destroyChart(key) {
  if (state.charts[key]) {
    state.charts[key].destroy();
    delete state.charts[key];
  }
}

function renderCharts(dashboard) {
  renderTrendChart(dashboard.trend);
  renderSectorChart(dashboard.breakdowns.bySector);
  renderAvgSectorChart(dashboard.breakdowns.bySector);
  renderDistChart(dashboard.scoreDistribution);
}

function renderTrendChart(trend) {
  destroyChart("trend");
  if (!trend.length) return;
  const labels = trend.map((d) => formatDay(d.day));
  state.charts.trend = new Chart(trendCanvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Respostas",
          data: trend.map((d) => d.responses),
          borderColor: CHART_COLORS.accent,
          backgroundColor: "rgba(14,46,155,0.08)",
          tension: 0.4, fill: true, yAxisID: "yCount",
          pointBackgroundColor: CHART_COLORS.accent, pointRadius: 4,
        },
        {
          label: "Média",
          data: trend.map((d) => d.averageScore),
          borderColor: CHART_COLORS.success,
          backgroundColor: "transparent",
          tension: 0.4, borderDash: [5, 4], yAxisID: "yScore",
          pointBackgroundColor: CHART_COLORS.success, pointRadius: 4,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: CHART_COLORS.text, font: { family: "Manrope" } } } },
      scales: {
        x: { grid: { color: CHART_COLORS.grid }, ticks: { color: CHART_COLORS.text, font: { family: "Manrope" } } },
        yCount: {
          type: "linear", position: "left",
          grid: { color: CHART_COLORS.grid },
          ticks: { color: CHART_COLORS.text, font: { family: "Manrope" }, stepSize: 1 },
        },
        yScore: {
          type: "linear", position: "right", min: 0, max: 5,
          grid: { display: false },
          ticks: { color: CHART_COLORS.success, font: { family: "Manrope" } },
        },
      },
    },
  });
}

function renderSectorChart(bySector) {
  destroyChart("sector");
  if (!bySector.length) return;
  const sorted = [...bySector].sort((a, b) => b.responses - a.responses).slice(0, 8);
  state.charts.sector = new Chart(sectorCanvas, {
    type: "bar",
    data: {
      labels: sorted.map((r) => r.label),
      datasets: [{
        label: "Respostas",
        data: sorted.map((r) => r.responses),
        backgroundColor: sorted.map((_, i) => `hsla(${225 + i * 15},60%,45%,0.8)`),
        borderRadius: 8,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: "y",
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: CHART_COLORS.grid }, ticks: { color: CHART_COLORS.text, font: { family: "Manrope" } } },
        y: { grid: { display: false }, ticks: { color: CHART_COLORS.text, font: { family: "Manrope", size: 11 } } },
      },
    },
  });
}

function renderAvgSectorChart(bySector) {
  destroyChart("avgSector");
  if (!bySector.length) return;
  const sorted = [...bySector]
    .filter((r) => r.average_score !== null)
    .sort((a, b) => (b.average_score || 0) - (a.average_score || 0))
    .slice(0, 8);

  state.charts.avgSector = new Chart(avgSectorCanvas, {
    type: "bar",
    data: {
      labels: sorted.map((r) => r.label),
      datasets: [{
        label: "Média",
        data: sorted.map((r) => r.average_score),
        backgroundColor: sorted.map((r) => {
          const s = r.average_score || 0;
          if (s >= 4) return "rgba(0,150,94,0.8)";
          if (s >= 3) return "rgba(14,46,155,0.7)";
          if (s >= 2) return "rgba(232,163,0,0.8)";
          return "rgba(214,59,47,0.8)";
        }),
        borderRadius: 8,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: CHART_COLORS.text, font: { family: "Manrope", size: 11 } } },
        y: {
          min: 0, max: 5, grid: { color: CHART_COLORS.grid },
          ticks: { color: CHART_COLORS.text, font: { family: "Manrope" } },
        },
      },
    },
  });
}

function renderDistChart(dist) {
  destroyChart("dist");
  const labels = ["😡 Péssimo", "😕 Ruim", "😐 Neutro", "🙂 Bom", "😍 Excelente"];
  const data = [dist.counts[1], dist.counts[2], dist.counts[3], dist.counts[4], dist.counts[5]];
  state.charts.dist = new Chart(distCanvas, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: SCORE_COLORS,
        borderWidth: 2, borderColor: "#ffffff",
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: "right", labels: { color: CHART_COLORS.text, font: { family: "Manrope" }, padding: 14, boxWidth: 14 } },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Employee breakdown / signals / comments
// ---------------------------------------------------------------------------
function renderEmployeeBreakdown(rows) {
  if (!rows.length) {
    breakdownEmployees.innerHTML = `<p class="empty-state">Os destaques aparecem após as primeiras respostas.</p>`;
    return;
  }
  breakdownEmployees.innerHTML = rows
    .map((row) => `
      <article class="bar-row">
        <div class="bar-row-copy">
          <strong>${escapeHtml(row.label)}</strong>
          <span>${escapeHtml(row.sectorName)} · ${row.responses} resposta(s)</span>
        </div>
        <div class="bar-row-meter">
          <span style="width:${((row.average_score ?? 0) / 5) * 100}%;background:${scoreColor(row.average_score)}"></span>
        </div>
        <strong style="min-width:40px;text-align:right;color:${scoreColor(row.average_score)}">
          ${row.average_score ?? "--"}/5
        </strong>
      </article>`)
    .join("");
}

function renderSignals(rows) {
  if (!rows.length) {
    signalsList.innerHTML = `<p class="empty-state">Nenhum sinal crítico identificado.</p>`;
    return;
  }
  signalsList.innerHTML = rows
    .map((row) => `
      <article class="signal-item">
        <strong>${escapeHtml(row.employeeName || "Sem funcionário")}</strong>
        <span>${escapeHtml(row.sectorName)}</span>
        <p>${row.lowScoreCount} resposta(s) com nota ≤ 2</p>
      </article>`)
    .join("");
}

function renderComments(comments) {
  if (!comments.length) {
    commentsList.innerHTML = `<p class="empty-state">Os comentários recentes aparecerão quando começarem a chegar respostas.</p>`;
    return;
  }
  commentsList.innerHTML = comments
    .map((c) => `
      <article class="comment-card">
        <div class="comment-header">
          <strong>${escapeHtml(c.employeeName || "Sem funcionário")}</strong>
          <span style="color:${scoreColor(c.overallScore)}">
            ${scoreEmoji(c.overallScore)} ${c.overallScore ?? "--"}/5 · ${escapeHtml(c.sectorName)}
          </span>
        </div>
        <p>${escapeHtml(c.comment)}</p>
        <small>${escapeHtml(c.customerName || "Sem nome")} · ${new Date(c.createdAt).toLocaleString("pt-BR")}</small>
      </article>`)
    .join("");
}

function renderEmployees(employees) {
  if (!employees.length) {
    employeesList.innerHTML = `<p class="empty-state">Cadastre os funcionários para que apareçam no formulário.</p>`;
    return;
  }
  const grouped = employees.reduce((acc, e) => {
    if (!acc[e.sectorName]) acc[e.sectorName] = [];
    acc[e.sectorName].push(e);
    return acc;
  }, {});

  employeesList.innerHTML = Object.entries(grouped)
    .map(([sectorName, list]) => `
      <section class="employees-group">
        <h4>${escapeHtml(sectorName)}</h4>
        <div class="employees-row">
          ${list.map((e) => `
            <article class="employee-card">
              <div>
                <strong>${escapeHtml(e.name)}</strong>
                <p>${escapeHtml(e.role || "Atendimento")}</p>
              </div>
              <div class="employee-card-meta">
                <span>${e.responseCount} resposta(s)</span>
                <span style="color:${scoreColor(e.averageScore)}">${e.averageScore ? `${e.averageScore}/5` : "Sem média"}</span>
              </div>
              <button class="ghost-button small" data-employee-id="${e.id}">Remover</button>
            </article>`).join("")}
        </div>
      </section>`)
    .join("");

  employeesList.querySelectorAll("[data-employee-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.employeeId;
      const emp = state.employees.find((e) => String(e.id) === String(id));
      if (!emp || !confirm(`Remover ${emp.name} do setor ${emp.sectorName}?`)) return;
      try {
        await fetchJson(`/api/employees/${id}`, { method: "DELETE" });
        await loadEmployees();
        await refreshDashboard();
      } catch (err) {
        alert(err.message || "Não foi possível remover.");
      }
    });
  });
}

async function handleCreateEmployee(event) {
  event.preventDefault();
  employeeFormFeedback.textContent = "Cadastrando...";
  const formData = new FormData(employeeForm);
  try {
    await fetchJson("/api/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: formData.get("name"), sectorId: formData.get("sectorId"), role: formData.get("role") }),
    });
    employeeForm.reset();
    employeeFormFeedback.textContent = "Funcionário cadastrado com sucesso.";
    await loadEmployees();
    await refreshDashboard();
  } catch (err) {
    employeeFormFeedback.textContent = err.message || "Não foi possível cadastrar.";
  }
}

// ---------------------------------------------------------------------------
// Ranking Modal
// ---------------------------------------------------------------------------
async function openRankingModal(type, title) {
  modalTitle.textContent = title;
  modalContentSector.innerHTML = `<p class="empty-state">Carregando...</p>`;
  modalContentEmployee.innerHTML = `<p class="empty-state">Carregando...</p>`;
  modalOverlay.hidden = false;
  document.body.style.overflow = "hidden";

  // Reset tabs
  tabSector.classList.add("active");
  tabEmployee.classList.remove("active");
  modalContentSector.hidden = false;
  modalContentEmployee.hidden = true;

  try {
    const query = new URLSearchParams({ type });
    if (state.filterSectorId) query.set("sectorId", state.filterSectorId);
    if (state.filterStartDate) query.set("startDate", state.filterStartDate);
    if (state.filterEndDate) query.set("endDate", state.filterEndDate);

    const { ranking } = await fetchJson(`/api/dashboard/ranking?${query.toString()}`);
    renderRankingContent(modalContentSector, ranking.bySector, "setor", "category");
    renderRankingContent(modalContentEmployee, ranking.byEmployee, "colaborador", "sector_name");
  } catch (err) {
    modalContentSector.innerHTML = `<p class="empty-state">Erro: ${err.message}</p>`;
  }
}

function renderRankingContent(container, rows, tipo, subtitleKey) {
  if (!rows.length) {
    container.innerHTML = `<p class="empty-state">Sem dados para exibir.</p>`;
    return;
  }
  const maxResponses = Math.max(...rows.map((r) => r.responses), 1);
  container.innerHTML = rows.map((row, i) => `
    <article class="ranking-row">
      <span class="ranking-pos">${i + 1}</span>
      <div class="ranking-info">
        <strong>${escapeHtml(row.label)}</strong>
        <span>${escapeHtml(row[subtitleKey] || "")}</span>
      </div>
      <div class="ranking-bar-wrap">
        <div class="ranking-bar">
          <span style="width:${(row.responses / maxResponses) * 100}%;background:${scoreColor(row.average_score)}"></span>
        </div>
        <span class="ranking-count">${row.responses} resp.</span>
      </div>
      <strong class="ranking-score" style="color:${scoreColor(row.average_score)}">
        ${scoreEmoji(row.average_score)} ${row.average_score ?? "--"}/5
      </strong>
    </article>`).join("");
}

function closeModal() {
  modalOverlay.hidden = true;
  document.body.style.overflow = "";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function populateSectorSelect(selectEl, sectors, { includeAll = false, placeholder = "" } = {}) {
  if (!selectEl) return;
  const prefix = includeAll ? `<option value="">Todos</option>` : placeholder ? `<option value="">${placeholder}</option>` : "";
  selectEl.innerHTML = prefix + sectors.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("");
}

function scoreColor(score) {
  if (score === null || score === undefined) return "#8A93B4";
  if (score >= 4.5) return "#00965e";
  if (score >= 3.5) return "#3BA35B";
  if (score >= 2.5) return "#0E2E9B";
  if (score >= 1.5) return "#E8A300";
  return "#D63B2F";
}

function scoreEmoji(score) {
  if (score === null || score === undefined) return "";
  if (score >= 4.5) return "😍";
  if (score >= 3.5) return "🙂";
  if (score >= 2.5) return "😐";
  if (score >= 1.5) return "😕";
  return "😡";
}

function formatDay(day) {
  if (!day) return "";
  const [, m, d] = day.split("-");
  return `${d}/${m}`;
}

function escapeHtml(value) {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

async function fetchJson(url, options = {}) {
  // Add auth header from sessionStorage as fallback (cookie is primary)
  const token = sessionStorage.getItem("auth_token");
  if (token && options.headers === undefined) {
    options.headers = { Authorization: `Bearer ${token}` };
  } else if (token && options.headers && !options.headers.Authorization) {
    options.headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(url, options);
  if (response.status === 401) {
    window.location.href = "/login";
    throw new Error("Não autenticado");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Falha na requisição.");
  return payload;
}
