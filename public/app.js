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

// --- Funcionalidade Anti-Captura de Ecrã (Ultra Rápida) ---
function setupAggressiveCaptureGuard() {
    const body = document.body;
    
    // 1. Cria a tela de bloqueio dinamicamente
    const overlay = document.createElement('div');
    overlay.id = 'security-overlay';
    overlay.innerHTML = '<div style="text-align: center;"><div style="font-size: 3rem; margin-bottom: 1rem;">🔒</div><h2>Proteção de Ecrã Ativa</h2><p>A captura de dados é restrita por motivos de segurança.</p></div>';
    body.appendChild(overlay);

    // Dicionário para rastrear as teclas pressionadas em tempo real
    let keysPressed = {};

    window.addEventListener('keydown', (e) => {
        keysPressed[e.key] = true;
        
        // Se a tecla Meta (Windows) E a tecla Shift estiverem pressionadas em simultâneo
        // OU se premir PrintScreen / F12
        if ((keysPressed['Meta'] && keysPressed['Shift']) || (keysPressed['OS'] && keysPressed['Shift']) || e.key === 'PrintScreen' || e.key === 'F12') {
            body.classList.add('capture-guard-active');
        }
    });

    window.addEventListener('keyup', (e) => {
        keysPressed[e.key] = false;
        
        // Só remove se já não estiver a carregar no Windows nem no Shift
        if (!keysPressed['Meta'] && !keysPressed['OS'] && !keysPressed['Shift']) {
            setTimeout(() => {
                if (document.hasFocus()) {
                    body.classList.remove('capture-guard-active');
                }
            }, 300);
        }
    });

    // Perda de foco (quando o recorte do Windows assume o controlo do rato/ecrã)
    window.addEventListener('blur', () => {
        keysPressed = {}; // Limpa o estado das teclas por segurança
        body.classList.add('capture-guard-active');
    });

    // Quando o utilizador clica de volta na página
    window.addEventListener('focus', () => {
        setTimeout(() => {
            body.classList.remove('capture-guard-active');
        }, 200);
    });
    
    // Bloqueia clique direito
    document.addEventListener('contextmenu', e => e.preventDefault());
}

// Inicializa a proteção assim que o DOM carregar
document.addEventListener('DOMContentLoaded', setupAggressiveCaptureGuard);