const pointForm = document.querySelector("#pointForm");
const pointFormFeedback = document.querySelector("#pointFormFeedback");
const pointsList = document.querySelector("#pointsList");
const summaryCards = document.querySelector("#summaryCards");
const trendChart = document.querySelector("#trendChart");
const breakdownJourney = document.querySelector("#breakdownJourney");
const breakdownChannel = document.querySelector("#breakdownChannel");
const breakdownArea = document.querySelector("#breakdownArea");
const commentsList = document.querySelector("#commentsList");
const signalsList = document.querySelector("#signalsList");
const pointFilter = document.querySelector("#pointFilter");
const exportButton = document.querySelector("#exportButton");

const state = {
  points: [],
  filterPointId: "",
};

pointForm.addEventListener("submit", handleCreatePoint);
pointFilter.addEventListener("change", () => {
  state.filterPointId = pointFilter.value;
  refreshDashboard();
});

boot();

async function boot() {
  await loadPoints();
  await refreshDashboard();
}

async function loadPoints() {
  const { points } = await fetchJson("/api/points");
  state.points = points;
  populateFilter(points);
  renderPoints(points);
}

async function refreshDashboard() {
  const query = new URLSearchParams();
  if (state.filterPointId) {
    query.set("pointId", state.filterPointId);
  }

  exportButton.href = `/api/dashboard/export.csv${query.toString() ? `?${query.toString()}` : ""}`;

  const { dashboard } = await fetchJson(`/api/dashboard${query.toString() ? `?${query.toString()}` : ""}`);
  renderSummary(dashboard.summary);
  renderTrend(dashboard.trend);
  renderBarList(breakdownJourney, dashboard.breakdowns.byJourney, "etapa");
  renderBarList(breakdownChannel, dashboard.breakdowns.byChannel, "canal");
  renderBarList(breakdownArea, dashboard.breakdowns.byArea, "area");
  renderSignals(dashboard.lowScoreSignals);
  renderComments(dashboard.comments);
}

function populateFilter(points) {
  const current = state.filterPointId;
  pointFilter.innerHTML = `<option value="">Todos</option>${points
    .map((point) => `<option value="${point.id}">${point.unitName} • ${point.title}</option>`)
    .join("")}`;
  pointFilter.value = current;
}

function renderSummary(summary) {
  const cards = [
    ["Respostas", summary.totalResponses || "0"],
    ["Media geral", summary.averageOverall ? `${summary.averageOverall}/5` : "--"],
    ["Atendimento", summary.averageServiceQuality ? `${summary.averageServiceQuality}/5` : "--"],
    ["Clareza", summary.averageGuidanceClarity ? `${summary.averageGuidanceClarity}/5` : "--"],
    ["Solucao", summary.averageSolutionFit ? `${summary.averageSolutionFit}/5` : "--"],
    ["Eficiencia", summary.averageOperationalEfficiency ? `${summary.averageOperationalEfficiency}/5` : "--"],
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
    trendChart.innerHTML = `<p class="empty-state">As tendencias vao aparecer assim que houver respostas registradas.</p>`;
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

function renderBarList(container, rows, label) {
  if (!rows.length) {
    container.innerHTML = `<p class="empty-state">Sem dados por ${label} ainda.</p>`;
    return;
  }

  const maxResponses = Math.max(...rows.map((row) => row.responses), 1);
  container.innerHTML = rows
    .map(
      (row) => `
        <article class="bar-row">
          <div class="bar-row-copy">
            <strong>${row.label}</strong>
            <span>${row.responses} respostas • ${row.average_score}/5</span>
          </div>
          <div class="bar-row-meter">
            <span style="width:${(row.responses / maxResponses) * 100}%"></span>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderSignals(rows) {
  if (!rows.length) {
    signalsList.innerHTML = `<p class="empty-state">Nenhum sinal critico identificado por enquanto.</p>`;
    return;
  }

  signalsList.innerHTML = rows
    .map(
      (row) => `
        <article class="signal-item">
          <strong>${row.title}</strong>
          <span>${row.unit_name}</span>
          <p>${row.low_score_count} resposta(s) com nota geral ate 2.</p>
        </article>
      `,
    )
    .join("");
}

function renderComments(comments) {
  if (!comments.length) {
    commentsList.innerHTML = `<p class="empty-state">Os comentarios recentes aparecerao aqui quando comecarem a chegar respostas.</p>`;
    return;
  }

  commentsList.innerHTML = comments
    .map(
      (comment) => `
        <article class="comment-card">
          <div class="comment-header">
            <strong>${comment.title}</strong>
            <span>${comment.unitName} • ${comment.overallScore}/5</span>
          </div>
          <p>${comment.comment}</p>
          <small>${new Date(comment.createdAt).toLocaleString("pt-BR")}</small>
        </article>
      `,
    )
    .join("");
}

function renderPoints(points) {
  if (!points.length) {
    pointsList.innerHTML = `<p class="empty-state">Crie o primeiro ponto de coleta para gerar um link e um QR code.</p>`;
    return;
  }

  pointsList.innerHTML = points
    .map(
      (point) => `
        <article class="point-card admin-card">
          <div class="point-card-header">
            <div>
              <p class="eyebrow">${point.unitName}</p>
              <h4>${point.title}</h4>
            </div>
            <span class="status-pill">${point.active ? "Ativo" : "Inativo"}</span>
          </div>
          <p>${point.journeyStage} • ${point.channel} • ${point.responsibleArea}</p>
          <p class="muted-text">${point.description || "Sem descricao complementar."}</p>
          <div class="point-meta-row">
            <span>${point.responseCount} resposta(s)</span>
            <span>${point.averageScore ? `${point.averageScore}/5 media` : "Sem media ainda"}</span>
          </div>
          <div class="qr-wrap">
            <img src="${point.qrCodeUrl}" alt="QR code de acesso para ${point.title}" />
          </div>
          <label class="link-box">
            <span>Link publico</span>
            <input type="text" value="${point.accessUrl}" readonly />
          </label>
          <div class="card-actions">
            <button class="ghost-button small" data-copy="${point.accessUrl}">Copiar link</button>
            <a class="ghost-button small" href="${point.accessUrl}" target="_blank" rel="noreferrer">Abrir formulario</a>
          </div>
        </article>
      `,
    )
    .join("");

  pointsList.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(button.dataset.copy);
        button.textContent = "Link copiado";
        setTimeout(() => {
          button.textContent = "Copiar link";
        }, 1800);
      } catch {
        button.textContent = "Copie manualmente";
      }
    });
  });
}

async function handleCreatePoint(event) {
  event.preventDefault();
  pointFormFeedback.textContent = "Gerando acesso...";

  const formData = new FormData(pointForm);
  const payload = Object.fromEntries(formData.entries());
  payload.deliveryApplicable = formData.get("deliveryApplicable") === "on";

  try {
    const { point } = await fetchJson("/api/points", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    pointForm.reset();
    pointFormFeedback.textContent = `Ponto criado com sucesso. Link pronto: ${point.accessUrl}`;
    await loadPoints();
    state.filterPointId = point.id;
    pointFilter.value = String(point.id);
    await refreshDashboard();
  } catch (error) {
    pointFormFeedback.textContent = error.message;
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "Falha na requisicao.");
  }

  return payload;
}
