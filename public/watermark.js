/**
 * watermark.js — Marca d'água interna
 * Gera um overlay em canvas com: logo + email do usuário + "USO INTERNO" + "EQUIPE PLANEJAMENTO"
 * Injetado em todas as páginas para rastreabilidade e proteção contra plágio.
 */
(async function initWatermark() {
  /* ── 1. Buscar dados do usuário autenticado ── */
  let userEmail = '';
  let userName  = '';
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const d = await res.json();
      if (d.authenticated) {
        userEmail = d.email || '';
        userName  = d.name  || '';
      }
    }
  } catch { /* página pública — sem sessão */ }

  /* ── 2. Parâmetros do tile ── */
  const TILE_W   = 380;
  const TILE_H   = 200;
  const ANGLE_DEG = -28;

  /* ── 3. Canvas do tile ── */
  const canvas = document.createElement('canvas');
  canvas.width  = TILE_W;
  canvas.height = TILE_H;
  const ctx = canvas.getContext('2d');

  /* ── 4. Carregar logo ── */
  const logo = new Image();
  logo.src = '/assets/objetiva-logo.png';

  function renderTile() {
    ctx.clearRect(0, 0, TILE_W, TILE_H);
    ctx.save();

    /* Rotação centralizada */
    ctx.translate(TILE_W / 2, TILE_H / 2);
    ctx.rotate((ANGLE_DEG * Math.PI) / 180);
    ctx.translate(-TILE_W / 2, -TILE_H / 2);

    const cx = TILE_W / 2;

    /* Logo */
    if (logo.complete && logo.naturalWidth > 0) {
      const aspect = logo.naturalWidth / logo.naturalHeight;
      const lh = 30;
      const lw = lh * aspect;
      ctx.globalAlpha = 0.11;
      ctx.drawImage(logo, cx - lw / 2, 44, lw, lh);
    }

    /* Texto principal */
    ctx.globalAlpha = 0.10;
    ctx.fillStyle   = '#0E2E9B';
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'top';

    ctx.font = 'bold 11px "Manrope","Segoe UI",Arial,sans-serif';
    ctx.fillText('USO INTERNO · EQUIPE PLANEJAMENTO', cx, 84);

    /* E-mail do usuário (se autenticado) */
    if (userEmail) {
      ctx.font = '10px "Manrope","Segoe UI",Arial,sans-serif';
      ctx.fillText(userEmail, cx, 100);
    }

    /* Nome do usuário (se disponível) */
    if (userName) {
      ctx.font = '10px "Manrope","Segoe UI",Arial,sans-serif';
      ctx.globalAlpha = 0.08;
      ctx.fillText(userName, cx, 115);
    }

    ctx.restore();
    applyOverlay();
  }

  /* ── 5. Injetar overlay no DOM ── */
  function applyOverlay() {
    let el = document.getElementById('wm-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'wm-overlay';
      el.setAttribute('aria-hidden', 'true');
      el.setAttribute('data-wm', '1');
      Object.assign(el.style, {
        position:        'fixed',
        top:             '0',
        left:            '0',
        width:           '100%',
        height:          '100%',
        pointerEvents:   'none',
        userSelect:      'none',
        webkitUserSelect:'none',
        zIndex:          '9998',
        backgroundRepeat:'repeat',
        backgroundSize:  TILE_W + 'px ' + TILE_H + 'px',
      });
      document.body.appendChild(el);
    }
    el.style.backgroundImage = 'url(' + canvas.toDataURL('image/png') + ')';
  }

  /* ── 6. Proteção anti-remoção: MutationObserver ── */
  function watchOverlay() {
    const observer = new MutationObserver(() => {
      const el = document.getElementById('wm-overlay');
      if (!el || !el.style.backgroundImage) {
        renderTile(); // recriar se removido
      }
    });
    observer.observe(document.body, { childList: true, subtree: false, attributes: false });
  }

  /* ── 7. Iniciar ── */
  logo.onload  = renderTile;
  logo.onerror = renderTile;   // renderiza mesmo sem logo
  if (logo.complete) renderTile();

  // Garantir execução mesmo se o logo já estiver em cache
  setTimeout(() => {
    if (!document.getElementById('wm-overlay')) renderTile();
  }, 300);

  // Iniciar observer após renderização inicial
  setTimeout(watchOverlay, 500);
})();
