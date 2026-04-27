const sectorsContainer = document.querySelector("#landingSectors");
const metricResponses = document.querySelector("#metricResponses");
const metricAverage = document.querySelector("#metricAverage");
const metricSectors = document.querySelector("#metricSectors");

boot();
setupAggressiveCaptureGuard(); // Inicia a proteção anti-captura

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

// --- Funcionalidade Anti-Captura de Ecrã ---
function setupAggressiveCaptureGuard() {
    const body = document.body;

    // 1. AÇÃO ANTECIPATIVA: Bloqueia assim que as teclas de atalho (Win+Shift ou PrintScreen) começam a ser premidas
    window.addEventListener('keydown', (e) => {
        if ((e.metaKey && e.shiftKey) || e.key === 'PrintScreen' || e.key === 'F12') {
            body.classList.add('capture-guard-active');
        }
    });

    // 2. RECUPERAÇÃO: Se o utilizador soltar as teclas sem pressionar o 'S'
    window.addEventListener('keyup', (e) => {
        if (e.key === 'Meta' || e.key === 'Shift') {
            setTimeout(() => {
                if (document.hasFocus()) {
                    body.classList.remove('capture-guard-active');
                }
            }, 300);
        }
    });

    // 3. PERDA DE FOCO: Se a ferramenta de recorte roubar o foco ou houver um Alt+Tab
    window.addEventListener('blur', () => {
        body.classList.add('capture-guard-active');
    });

    // 4. RESTAURAÇÃO: Quando o utilizador clica de volta na página
    window.addEventListener('focus', () => {
        setTimeout(() => {
            body.classList.remove('capture-guard-active');
        }, 200);
    });
    
    // Bloqueia clique direito (evita a inspeção fácil ou tentativa de copiar texto)
    document.addEventListener('contextmenu', e => e.preventDefault());
}