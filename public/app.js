const sectorsContainer = document.querySelector("#landingSectors");
const metricResponses = document.querySelector("#metricResponses");
const metricAverage = document.querySelector("#metricAverage");
const metricSectors = document.querySelector("#metricSectors");

// Substitua esta linha pela lógica real que obtém o e-mail do utilizador logado no seu sistema
const loggedUserEmail = localStorage.getItem('userEmail') || 'breno.vilela@objetiva.com.br';

boot();
setupAggressiveCaptureGuard(); // Inicia proteção contra prints
setupWatermark(loggedUserEmail); // Inicia marca de água

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
    
    const overlay = document.createElement('div');
    overlay.id = 'security-overlay';
    overlay.innerHTML = '<div style="text-align: center;"><div style="font-size: 3rem; margin-bottom: 1rem;">🔒</div><h2>Proteção de Ecrã Ativa</h2><p>A captura de dados é restrita por motivos de segurança.</p></div>';
    body.appendChild(overlay);

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

// --- Funcionalidade de Marca de Água Dinâmica (Robusta a Falhas) ---
function setupWatermark(userEmail) {
  const text = `Uso Interno - ${userEmail} - Equipe Planejamento`;

  function buildWatermark(withImage) {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      canvas.width = 450;
      canvas.height = 300;

      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(-Math.PI / 8); 
      ctx.translate(-canvas.width / 2, -canvas.height / 2);

      ctx.fillStyle = 'rgba(0, 9, 40, 0.9)'; 
      ctx.font = '600 14px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center';

      if (withImage && withImage.complete && withImage.naturalWidth > 0) {
          const imgWidth = 140;
          const imgHeight = (withImage.height / withImage.width) * imgWidth;
          ctx.drawImage(withImage, (canvas.width - imgWidth) / 2, (canvas.height / 2) - imgHeight - 15, imgWidth, imgHeight);
          ctx.fillText(text, canvas.width / 2, (canvas.height / 2) + 20);
      } else {
          // Fallback seguro se a imagem falhar
          ctx.fillText(text, canvas.width / 2, canvas.height / 2);
      }

      try {
          return canvas.toDataURL('image/png');
      } catch (e) {
          console.error("Erro de CORS no Canvas. A cair para marca de água em texto.", e);
          return null; // Força a geração apenas em texto
      }
  }

  function applyAndProtectWatermark(dataUrl) {
      function createWatermarkLayer() {
          if (document.getElementById('watermark-layer')) return;
          const overlay = document.createElement('div');
          overlay.id = 'watermark-layer';
          overlay.style.backgroundImage = `url(${dataUrl})`;
          document.body.appendChild(overlay);
      }

      createWatermarkLayer();

      const observer = new MutationObserver((mutations) => {
          let needsRespawn = false;

          mutations.forEach((mutation) => {
              if (mutation.type === 'childList') {
                  const watermarkNode = document.getElementById('watermark-layer');
                  if (!watermarkNode) needsRespawn = true;
              } else if (mutation.type === 'attributes' && mutation.target.id === 'watermark-layer') {
                  const el = mutation.target;
                  if (el.style.display === 'none' || el.style.opacity === '0' || el.style.visibility === 'hidden') {
                      el.style.display = 'block';
                      el.style.visibility = 'visible';
                  }
              }
          });

          if (needsRespawn) {
              observer.disconnect();
              createWatermarkLayer();
              observer.observe(document.body, { childList: true, subtree: true, attributes: true });
          }
      });

      observer.observe(document.body, { childList: true, subtree: true, attributes: true });
  }

  const img = new Image();
  img.crossOrigin = 'anonymous'; // Essencial para exportar canvas com imagens
  img.src = '/assets/objetiva-logo.png'; 

  img.onload = () => {
      let dataUrl = buildWatermark(img);
      if (!dataUrl) { // Se o CORS contaminar o canvas
          dataUrl = buildWatermark(null);
      }
      applyAndProtectWatermark(dataUrl);
  };

  img.onerror = () => { // Se o caminho da imagem estiver quebrado
      const dataUrl = buildWatermark(null);
      applyAndProtectWatermark(dataUrl);
  };
}