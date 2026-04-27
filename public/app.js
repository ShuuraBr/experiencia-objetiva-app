const sectorsContainer = document.querySelector("#landingSectors");
const metricResponses = document.querySelector("#metricResponses");
const metricAverage = document.querySelector("#metricAverage");
const metricSectors = document.querySelector("#metricSectors");

// Substitua esta linha pela lógica real que obtém o e-mail do utilizador logado no seu sistema
const loggedUserEmail = localStorage.getItem('userEmail') || 'nome.sobrenome@objetiva.com.br';

boot();
setupAggressiveCaptureGuard(); // Proteção contra prints
setupWatermark(loggedUserEmail); // Inicializa a marca d'água em toda a tela

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
        
        if ((keysPressed['Meta'] && keysPressed['Shift']) || (keysPressed['OS'] && keysPressed['Shift']) || e.key === 'PrintScreen' || e.key === 'F12') {
            body.classList.add('capture-guard-active');
        }
    });

    window.addEventListener('keyup', (e) => {
        keysPressed[e.key] = false;
        
        if (!keysPressed['Meta'] && !keysPressed['OS'] && !keysPressed['Shift']) {
            setTimeout(() => {
                if (document.hasFocus()) {
                    body.classList.remove('capture-guard-active');
                }
            }, 300);
        }
    });

    window.addEventListener('blur', () => {
        keysPressed = {}; 
        body.classList.add('capture-guard-active');
    });

    window.addEventListener('focus', () => {
        setTimeout(() => {
            body.classList.remove('capture-guard-active');
        }, 200);
    });
    
    document.addEventListener('contextmenu', e => e.preventDefault());
}

// --- Funcionalidade de Marca d'Água Dinâmica ---
function setupWatermark(userEmail) {
  // 1. Cria um canvas invisível para desenhar o padrão
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  // Define o tamanho de cada bloco da marca d'água (espaçamento)
  canvas.width = 450;
  canvas.height = 300;

  // 2. Configura a rotação (diagonal)
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(-Math.PI / 8); // Ângulo suave
  ctx.translate(-canvas.width / 2, -canvas.height / 2);

  // 3. Configuração do texto
  const text = `Uso Interno - ${userEmail} - Equipe Planejamento`;
  ctx.fillStyle = 'rgba(0, 9, 40, 1)'; // Cor base escura (a transparência será controlada pelo CSS)
  ctx.font = '500 13px "IBM Plex Mono", monospace';
  ctx.textAlign = 'center';

  // 4. Carrega a logo
  const img = new Image();
  img.src = '/assets/objetiva-logo.png'; // O caminho da logo baseado no seu repositório

  // Função para desenhar e aplicar após imagem carregar
  img.onload = () => {
      // Desenha a logo centralizada (ajuste o 120 para alterar o tamanho da logo)
      const imgWidth = 140;
      const imgHeight = (img.height / img.width) * imgWidth;
      ctx.drawImage(img, (canvas.width - imgWidth) / 2, (canvas.height / 2) - imgHeight - 15, imgWidth, imgHeight);

      // Desenha o texto abaixo da logo
      ctx.fillText(text, canvas.width / 2, (canvas.height / 2) + 20);

      applyWatermarkToDOM(canvas.toDataURL('image/png'));
  };

  // Se a imagem falhar (caminho errado, etc), desenha só o texto
  img.onerror = () => {
      ctx.fillText(text, canvas.width / 2, canvas.height / 2);
      applyWatermarkToDOM(canvas.toDataURL('image/png'));
  };

  function applyWatermarkToDOM(dataUrl) {
      // Cria a camada div de sobreposição
      let overlay = document.getElementById('watermark-layer');
      if (!overlay) {
          overlay = document.createElement('div');
          overlay.id = 'watermark-layer';
          document.body.appendChild(overlay);
      }
      overlay.style.backgroundImage = `url(${dataUrl})`;
  }
}