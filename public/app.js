const sectorsContainer = document.querySelector("#landingSectors");
const metricResponses = document.querySelector("#metricResponses");
const metricAverage = document.querySelector("#metricAverage");
const metricSectors = document.querySelector("#metricSectors");

// E-mail do utilizador logado (Substitua pela lógica real de sessão do seu sistema)
const loggedUserEmail = localStorage.getItem('userEmail') || 'breno.vilela@objetiva.com.br';

boot();
setupAggressiveCaptureGuard(); 
setupWatermark(loggedUserEmail);

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

// ═══════════════════════════════════════════════════════════
//   PROTEÇÃO CONTRA CAPTURA DE ECRÃ (INSTANTÂNEA)
// ═══════════════════════════════════════════════════════════
function setupAggressiveCaptureGuard() {
    const body = document.body;
    
    // Cria o ecrã de segurança se não existir
    if (!document.getElementById('security-overlay')) {
        const overlay = document.createElement('div');
        overlay.id = 'security-overlay';
        overlay.innerHTML = '<div style="text-align: center;"><div style="font-size: 3rem; margin-bottom: 1rem;">🔒</div><h2>Proteção de Ecrã Ativa</h2><p>A captura de dados é restrita por motivos de segurança.</p></div>';
        body.appendChild(overlay);
    }

    let keysPressed = {};

    window.addEventListener('keydown', (e) => {
        keysPressed[e.key] = true;
        
        // Deteta atalhos do Windows (Win+Shift+S) ou PrintScreen
        if ((keysPressed['Meta'] && keysPressed['Shift']) || (keysPressed['OS'] && keysPressed['Shift']) || e.key === 'PrintScreen' || e.key === 'F12') {
            body.classList.add('capture-guard-active');
        }
    });

    window.addEventListener('keyup', (e) => {
        keysPressed[e.key] = false;
        
        // Restaura apenas se as teclas ativadoras forem largadas
        if (!keysPressed['Meta'] && !keysPressed['OS'] && !keysPressed['Shift']) {
            setTimeout(() => { 
                if (document.hasFocus()) body.classList.remove('capture-guard-active'); 
            }, 300);
        }
    });

    // Perda de foco (ferramenta de recorte ativa)
    window.addEventListener('blur', () => { 
        keysPressed = {}; 
        body.classList.add('capture-guard-active'); 
    });

    // Retorno à página
    window.addEventListener('focus', () => { 
        setTimeout(() => { body.classList.remove('capture-guard-active'); }, 200); 
    });
    
    // Bloqueia clique direito
    document.addEventListener('contextmenu', e => e.preventDefault());
}

// ═══════════════════════════════════════════════════════════
//   MARCA DE ÁGUA DINÂMICA (SVG + OBSERVER)
// ═══════════════════════════════════════════════════════════
function setupWatermark(userEmail) {
    const watermarkText = `USO INTERNO - ${userEmail.toUpperCase()} - EQUIPE PLANEJAMENTO`;
    
    function createLayer() {
        if (document.getElementById('watermark-layer')) return;

        const overlay = document.createElement('div');
        overlay.id = 'watermark-layer';
        
        // Gera um SVG como Background Image. 
        // Resolve problemas de CORS e Tainting, pois é processado localmente e instantaneamente.
        const svgString = `
            <svg xmlns="http://www.w3.org/2000/svg" width="500" height="400">
                <style>
                    .txt { font-family: 'IBM Plex Mono', monospace; font-size: 13px; font-weight: 600; fill: rgba(0, 9, 40, 0.18); }
                </style>
                <g transform="rotate(-25, 250, 200)">
                    <image href="/assets/objetiva-logo.png" x="175" y="140" width="150" opacity="0.12" />
                    <text x="250" y="240" class="txt" text-anchor="middle">${watermarkText}</text>
                </g>
            </svg>
        `;
        
        // Codifica o SVG para Base64 para usar em CSS
        const encodedSvg = btoa(unescape(encodeURIComponent(svgString)));
        overlay.style.backgroundImage = `url("data:image/svg+xml;base64,${encodedSvg}")`;
        document.body.appendChild(overlay);
    }

    createLayer();

    // Vigia o DOM para evitar que removam a marca de água pelo "Inspecionar Elemento"
    const observer = new MutationObserver(() => {
        const layer = document.getElementById('watermark-layer');
        if (!layer) {
            createLayer();
        } else if (layer.style.display === 'none' || layer.style.opacity === '0' || layer.style.visibility === 'hidden') {
            layer.style.display = 'block';
            layer.style.opacity = '1';
            layer.style.visibility = 'visible';
        }
    });

    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
}