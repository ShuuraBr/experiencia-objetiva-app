const employeeForm = document.querySelector("#employeeForm");
const employeeFormFeedback = document.querySelector("#employeeFormFeedback");
const employeeFormSector = document.querySelector("#employeeFormSector");
const employeesList = document.querySelector("#employeesList");
const summaryCards = document.querySelector("#summaryCards");
const trendChart = document.querySelector("#trendChart");
const breakdownSector = document.querySelector("#breakdownSector");
const breakdownEmployees = document.querySelector("#breakdownEmployees");
const commentsList = document.querySelector("#commentsList");
const signalsList = document.querySelector("#signalsList");
const sectorFilter = document.querySelector("#sectorFilter");
const exportButton = document.querySelector("#exportButton");
const surveyLink = document.querySelector("#surveyLink");
const openSurveyLink = document.querySelector("#openSurveyLink");
const copyLinkButton = document.querySelector("#copyLinkButton");

const state = {
  sectors: [],
  employees: [],
  filterSectorId: "",
};

employeeForm.addEventListener("submit", handleCreateEmployee);
sectorFilter.addEventListener("change", () => {
  state.filterSectorId = sectorFilter.value;
  refreshDashboard();
});
copyLinkButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(surveyLink.value);
    copyLinkButton.textContent = "Link copiado";
    setTimeout(() => {
      copyLinkButton.textContent = "Copiar link";
    }, 1800);
  } catch {
    copyLinkButton.textContent = "Copie manualmente";
  }
});

boot();

async function boot() {
  await loadConfig();
  await loadSectors();
  await loadEmployees();
  await refreshDashboard();
}

async function loadConfig() {
  try {
    const config = await fetchJson("/api/config");
    if (surveyLink) {
      surveyLink.value = config.surveyUrl;
    }
    if (openSurveyLink && config.surveyUrl) {
      openSurveyLink.href = config.surveyUrl;
    }
  } catch {
    if (surveyLink) {
      surveyLink.value = `${window.location.origin}/avaliar`;
    }
  }
}

async function loadSectors() {
  const { sectors } = await fetchJson("/api/sectors");
  state.sectors = sectors;
  populateSectorSelect(employeeFormSector, sectors, { includeAll: false, placeholder: "Selecione" });
  populateSectorSelect(sectorFilter, sectors, { includeAll: true });
  if (state.filterSectorId) {
    sectorFilter.value = state.filterSectorId;
  }
}

async function loadEmployees() {
  const { employees } = await fetchJson("/api/employees");
  state.employees = employees;
  renderEmployees(employees);
}

async function refreshDashboard() {
  const query = new URLSearchParams();
  if (state.filterSectorId) {
    query.set("sectorId", state.filterSectorId);
  }

  exportButton.href = `/api/dashboard/export.csv${query.toString() ? `?${query.toString()}` : ""}`;

  const { dashboard } = await fetchJson(`/api/dashboard${query.toString() ? `?${query.toString()}` : ""}`);
  renderSummary(dashboard.summary);
  renderTrend(dashboard.trend);
  renderSectorBreakdown(dashboard.breakdowns.bySector);
  renderEmployeeBreakdown(dashboard.breakdowns.topEmployees);
  renderSignals(dashboard.lowScoreSignals);
  renderComments(dashboard.comments);
}

function populateSectorSelect(selectEl, sectors, { includeAll = false, placeholder = "" } = {}) {
  if (!selectEl) return;
  const prefix = includeAll
    ? `<option value="">Todos</option>`
    : placeholder
      ? `<option value="">${placeholder}</option>`
      : "";
  selectEl.innerHTML =
    prefix +
    sectors.map((sector) => `<option value="${sector.id}">${escapeHtml(sector.name)}</option>`).join("");
}

function renderSummary(summary) {
  const cards = [
    ["Respostas", summary.totalResponses || "0"],
    ["Média geral", summary.averageOverall ? `${summary.averageOverall}/5` : "--"],
    ["Setores ativos", String(state.sectors.length)],
    ["Funcionários", String(state.employees.length)],
  ];

  summaryCards.innerHTML = cards
    .map(
      ([label, value]) => `
        <article class="metric-card">
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `,
    )
    .join("");
}

function renderTrend(trend) {
  if (!trend.length) {
    trendChart.innerHTML = `<p class="empty-state">As tendências vão aparecer assim que houver respostas registradas.</p>`;
    return;
  }

  const maxResponses = Math.max(...trend.map((item) => item.responses), 1);
  trendChart.innerHTML = trend
    .map(
      (item) => `
        <article class="trend-bar">
          <div class="trend-bar-meter">
            <span style="height:${Math.max((item.responses / maxResponses) * 100, 10)}%"></span>
          </div>
          <strong>${item.responses}</strong>
          <small>${item.day.slice(5)}</small>
          <em>${item.averageScore ? `${item.averageScore}/5` : "--"}</em>
        </article>
      `,
    )
    .join("");
}

function renderSectorBreakdown(rows) {
  if (!rows.length) {
    breakdownSector.innerHTML = `<p class="empty-state">Sem dados por setor ainda.</p>`;
    return;
  }

  const maxResponses = Math.max(...rows.map((row) => row.responses), 1);
  breakdownSector.innerHTML = rows
    .map(
      (row) => `
        <article class="bar-row">
          <div class="bar-row-copy">
            <strong>${escapeHtml(row.label)}</strong>
            <span>${row.responses} respostas • ${row.average_score ?? "--"}/5</span>
          </div>
          <div class="bar-row-meter">
            <span style="width:${(row.responses / maxResponses) * 100}%"></span>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderEmployeeBreakdown(rows) {
  if (!rows.length) {
    breakdownEmployees.innerHTML = `<p class="empty-state">Os destaques individuais aparecem após as primeiras respostas.</p>`;
    return;
  }

  const maxScore = 5;
  breakdownEmployees.innerHTML = rows
    .map(
      (row) => `
        <article class="bar-row">
          <div class="bar-row-copy">
            <strong>${escapeHtml(row.label)}</strong>
            <span>${escapeHtml(row.sectorName)} • ${row.responses} resposta(s)</span>
          </div>
          <div class="bar-row-meter">
            <span style="width:${((row.average_score ?? 0) / maxScore) * 100}%"></span>
          </div>
          <strong>${row.average_score ?? "--"}/5</strong>
        </article>
      `,
    )
    .join("");
}

function renderSignals(rows) {
  if (!rows.length) {
    signalsList.innerHTML = `<p class="empty-state">Nenhum sinal crítico identificado por enquanto.</p>`;
    return;
  }

  signalsList.innerHTML = rows
    .map(
      (row) => `
        <article class="signal-item">
          <strong>${escapeHtml(row.employeeName || "Sem funcionário vinculado")}</strong>
          <span>${escapeHtml(row.sectorName)}</span>
          <p>${row.lowScoreCount} resposta(s) com nota geral até 2.</p>
        </article>
      `,
    )
    .join("");
}

function renderComments(comments) {
  if (!comments.length) {
    commentsList.innerHTML = `<p class="empty-state">Os comentários recentes aparecerão aqui quando começarem a chegar respostas.</p>`;
    return;
  }

  commentsList.innerHTML = comments
    .map(
      (comment) => `
        <article class="comment-card">
          <div class="comment-header">
            <strong>${escapeHtml(comment.employeeName || "Sem funcionário")}</strong>
            <span>${escapeHtml(comment.sectorName)} • ${comment.overallScore ?? "--"}/5</span>
          </div>
          <p>${escapeHtml(comment.comment)}</p>
          <small>${escapeHtml(comment.customerName || "Sem nome")} • ${new Date(comment.createdAt).toLocaleString("pt-BR")}</small>
        </article>
      `,
    )
    .join("");
}

function renderEmployees(employees) {
  if (!employees.length) {
    employeesList.innerHTML = `<p class="empty-state">Cadastre os funcionários para que apareçam no formulário de avaliação.</p>`;
    return;
  }

  const grouped = employees.reduce((acc, employee) => {
    const key = employee.sectorName;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(employee);
    return acc;
  }, {});

  employeesList.innerHTML = Object.entries(grouped)
    .map(
      ([sectorName, list]) => `
        <section class="employees-group">
          <h4>${escapeHtml(sectorName)}</h4>
          <div class="employees-row">
            ${list
              .map(
                (employee) => `
                  <article class="employee-card">
                    <div>
                      <strong>${escapeHtml(employee.name)}</strong>
                      <p>${escapeHtml(employee.role || "Atendimento")}</p>
                    </div>
                    <div class="employee-card-meta">
                      <span>${employee.responseCount} resposta(s)</span>
                      <span>${employee.averageScore ? `${employee.averageScore}/5` : "Sem média"}</span>
                    </div>
                    <button class="ghost-button small" data-employee-id="${employee.id}">Remover</button>
                  </article>
                `,
              )
              .join("")}
          </div>
        </section>
      `,
    )
    .join("");

  employeesList.querySelectorAll("[data-employee-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.employeeId;
      const employee = state.employees.find((item) => String(item.id) === String(id));
      if (!employee) return;
      if (!window.confirm(`Remover ${employee.name} do setor ${employee.sectorName}?`)) {
        return;
      }
      try {
        await fetchJson(`/api/employees/${id}`, { method: "DELETE" });
        await loadEmployees();
        await loadSectors();
        await refreshDashboard();
      } catch (error) {
        alert(error.message || "Não foi possível remover o funcionário.");
      }
    });
  });
}

async function handleCreateEmployee(event) {
  event.preventDefault();
  employeeFormFeedback.textContent = "Cadastrando funcionário...";

  const formData = new FormData(employeeForm);
  const payload = {
    name: formData.get("name"),
    sectorId: formData.get("sectorId"),
    role: formData.get("role"),
  };

  try {
    await fetchJson("/api/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    employeeForm.reset();
    employeeFormFeedback.textContent = "Funcionário cadastrado com sucesso.";
    await loadEmployees();
    await loadSectors();
    await refreshDashboard();
  } catch (error) {
    employeeFormFeedback.textContent = error.message || "Não foi possível cadastrar.";
  }
}

function escapeHtml(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "Falha na requisição.");
  }

  return payload;
}
