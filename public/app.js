const pointsContainer = document.querySelector("#landingPoints");
const metricResponses = document.querySelector("#metricResponses");
const metricAverage = document.querySelector("#metricAverage");
const metricPoints = document.querySelector("#metricPoints");

boot();

async function boot() {
  try {
    const [{ points }, { dashboard }] = await Promise.all([
      fetchJson("/api/points"),
      fetchJson("/api/dashboard"),
    ]);

    metricResponses.textContent = dashboard.summary.totalResponses || "0";
    metricAverage.textContent = dashboard.summary.averageOverall ? `${dashboard.summary.averageOverall}/5` : "--";
    metricPoints.textContent = String(points.length);

    renderPoints(points);
  } catch (error) {
    metricResponses.textContent = "--";
    metricAverage.textContent = "--";
    metricPoints.textContent = "--";
    pointsContainer.innerHTML = `<p class="empty-state">Nao foi possivel carregar os pontos de coleta agora.</p>`;
  }
}

function renderPoints(points) {
  if (!points.length) {
    pointsContainer.innerHTML = `<p class="empty-state">Nenhum ponto ativo ainda. Crie o primeiro acesso no painel administrativo.</p>`;
    return;
  }

  pointsContainer.innerHTML = points
    .slice(0, 3)
    .map(
      (point) => `
        <article class="point-card">
          <div>
            <p class="eyebrow">${point.unitName}</p>
            <h4>${point.title}</h4>
            <p>${point.journeyStage} • ${point.channel}</p>
          </div>
          <div class="point-card-footer">
            <span>${point.responseCount} resposta(s)</span>
            <a class="inline-link" href="${point.accessUrl}">Abrir avaliacao</a>
          </div>
        </article>
      `,
    )
    .join("");
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error("Falha na requisicao.");
  }
  return response.json();
}
