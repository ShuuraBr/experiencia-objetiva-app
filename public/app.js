const sectorsContainer = document.querySelector("#landingSectors");
const metricResponses = document.querySelector("#metricResponses");
const metricAverage = document.querySelector("#metricAverage");
const metricSectors = document.querySelector("#metricSectors");

boot();

async function boot() {
  try {
    const [{ sectors }, { dashboard }] = await Promise.all([
      fetchJson("/api/sectors"),
      fetchJson("/api/dashboard"),
    ]);

    metricResponses.textContent = dashboard.summary.totalResponses || "0";
    metricAverage.textContent = dashboard.summary.averageOverall ? `${dashboard.summary.averageOverall}/5` : "--";
    metricSectors.textContent = String(sectors.length);

    renderSectors(sectors);
  } catch (error) {
    metricResponses.textContent = "--";
    metricAverage.textContent = "--";
    metricSectors.textContent = "--";
    sectorsContainer.innerHTML = `<p class="empty-state">Não foi possível carregar os setores agora.</p>`;
  }
}

function renderSectors(sectors) {
  if (!sectors.length) {
    sectorsContainer.innerHTML = `<p class="empty-state">Nenhum setor ativo. Configure no painel administrativo.</p>`;
    return;
  }

  sectorsContainer.innerHTML = sectors
    .map(
      (sector) => `
        <article class="point-card">
          <div>
            <p class="eyebrow">${escapeHtml(sector.name)}</p>
            <h4>${sector.employeeCount} funcionário(s)</h4>
            <p>${sector.responseCount} resposta(s) coletadas</p>
          </div>
          <div class="point-card-footer">
            <span>${sector.averageScore ? `${sector.averageScore}/5` : "Sem média ainda"}</span>
            <a class="inline-link" href="/avaliar">Avaliar</a>
          </div>
        </article>
      `,
    )
    .join("");
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
  if (!response.ok) {
    throw new Error("Falha na requisição.");
  }
  return response.json();
}
