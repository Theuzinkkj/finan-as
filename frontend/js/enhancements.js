'use strict';

// =============================================
//  FINANCIAL PROJECTION
// =============================================
function renderProjection() {
  const grid = document.getElementById('projection-grid');
  const note = document.getElementById('projection-note');
  if (!grid) return;

  const txs     = txOfMonth();
  const income  = txs.filter(t => t.type === 'receita').reduce((s, t) => s + t.amount, 0);
  const expense = txs.filter(t => t.type === 'despesa').reduce((s, t) => s + t.amount, 0);
  const balance = income - expense;

  if (!income && !expense) {
    grid.innerHTML = '<p style="color:var(--text-3);font-size:.85rem">Adicione transações para ver a projeção.</p>';
    if (note) note.textContent = '';
    return;
  }

  const savRate   = income > 0 ? balance / income : 0;
  const monthly   = balance > 0 ? balance : 0;
  const in6months = monthly * 6;
  const in12months = monthly * 12;
  const in24months = monthly * 24;

  const bal6  = balance * 6;
  const bal12 = balance * 12;

  const items = [
    { label: 'Saldo este mês', value: balance, months: null },
    { label: 'Em 6 meses',     value: bal6,    months: 6  },
    { label: 'Em 12 meses',    value: bal12,   months: 12 },
    { label: 'Taxa de poupança', value: null,  pct: (savRate * 100) },
  ];

  grid.innerHTML = items.map(item => {
    if (item.pct !== undefined) {
      const pctVal = item.pct;
      const color  = pctVal >= 20 ? 'var(--green)' : pctVal >= 10 ? 'var(--yellow)' : 'var(--red)';
      return `<div class="projection-item">
        <div class="projection-item-label">${item.label}</div>
        <div class="projection-item-value" style="color:${color}">${pctVal.toFixed(1)}%</div>
      </div>`;
    }
    const positive = item.value >= 0;
    return `<div class="projection-item">
      <div class="projection-item-label">${item.label}</div>
      <div class="projection-item-value ${positive ? '' : 'negative'}">${positive ? '' : '−'}${fmt(Math.abs(item.value))}</div>
    </div>`;
  }).join('');

  if (note) {
    if (balance > 0) {
      note.textContent = `Mantendo este ritmo, você economizará ${fmt(in12months)} em 1 ano e ${fmt(in24months)} em 2 anos.`;
    } else if (balance < 0) {
      note.textContent = `Atenção: suas despesas superam a renda. Reduza gastos para voltar ao verde.`;
      note.style.color = 'var(--red)';
    } else {
      note.textContent = 'Saldo zerado. Tente guardar pelo menos 10% da sua renda mensalmente.';
    }
  }
}

// =============================================
//  SCORE HISTORY
// =============================================
function saveScore(score, month) {
  const history = Storage.getJSON(Storage.scoreHistKey(), {});
  history[month] = score;
  // Keep last 12 months only
  const months  = Object.keys(history).sort();
  if (months.length > 12) months.slice(0, months.length - 12).forEach(m => delete history[m]);
  Storage.setJSON(Storage.scoreHistKey(), history);
  renderScoreHistory();
}

function renderScoreHistory() {
  const container = document.getElementById('score-history-content');
  const subtitle  = document.getElementById('score-history-subtitle');
  if (!container) return;

  const history = Storage.getJSON(Storage.scoreHistKey(), {});
  const entries = Object.entries(history).sort(([a], [b]) => a.localeCompare(b));

  if (entries.length < 2) {
    container.innerHTML = '<div class="score-history-empty">Execute a análise IA para registrar seu score e acompanhar a evolução.</div>';
    if (subtitle) subtitle.textContent = '';
    return;
  }

  if (subtitle) subtitle.textContent = `${entries.length} meses registrados`;

  const scores = entries.map(([, v]) => v);
  const maxScore = Math.max(...scores);
  const last  = scores[scores.length - 1];
  const prev  = scores[scores.length - 2];
  const trend = last > prev ? `↑ +${last - prev} pts` : last < prev ? `↓ ${last - prev} pts` : '→ estável';
  const trendColor = last > prev ? 'var(--green)' : last < prev ? 'var(--red)' : 'var(--text-3)';

  const scoreColor = s => s >= 75 ? '#10b981' : s >= 50 ? '#f59e0b' : '#ef4444';

  container.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
      <div style="font-size:1.8rem;font-weight:800;color:${scoreColor(last)}">${last}</div>
      <div>
        <div style="font-size:.78rem;color:var(--text-3)">Score atual</div>
        <div style="font-size:.82rem;font-weight:600;color:${trendColor}">${trend} vs mês anterior</div>
      </div>
    </div>
    <div class="score-history-bars">
      ${entries.map(([month, score]) => {
        const [y, m] = month.split('-');
        const label  = new Date(+y, +m - 1, 1).toLocaleString('pt-BR', { month: 'short' });
        const height = Math.max(8, (score / 100) * 68);
        const color  = scoreColor(score);
        return `<div class="score-history-bar-wrap">
          <div class="score-history-value" style="color:${color}">${score}</div>
          <div class="score-history-bar" style="height:${height}px;background:${color};opacity:.85" data-tip="${label}: ${score}"></div>
          <div class="score-history-label">${label}</div>
        </div>`;
      }).join('')}
    </div>`;
}

// =============================================
//  ACHIEVEMENTS / BADGES
// =============================================
const ACHIEVEMENTS_DEF = [
  { id: 'first_tx',      icon: '📝', name: 'Primeira Transação',   desc: 'Registrou a primeira transação',     check: (txs) => txs.length >= 1 },
  { id: 'ten_tx',        icon: '🗂️',  name: '10 Transações',        desc: 'Registrou 10 ou mais transações',    check: (txs) => txs.length >= 10 },
  { id: 'month_green',   icon: '🟢', name: 'Mês no Verde',          desc: 'Fechou um mês com saldo positivo',   check: (txs) => { const i = txs.filter(t=>t.type==='receita').reduce((s,t)=>s+t.amount,0); const e = txs.filter(t=>t.type==='despesa').reduce((s,t)=>s+t.amount,0); return i > 0 && i > e; } },
  { id: 'budget_set',    icon: '🎯', name: 'Meta de Gastos',        desc: 'Configurou uma meta de orçamento',   check: () => Object.keys(budgets || {}).length >= 1 },
  { id: 'invested',      icon: '📈', name: 'Investidor',            desc: 'Adicionou um ativo ao portfólio',    check: () => typeof portfolioEntries !== 'undefined' && portfolioEntries.length >= 1 },
  { id: 'save_20',       icon: '💰', name: 'Regra dos 20%',         desc: 'Poupou 20% ou mais da renda',        check: (txs) => { const i = txs.filter(t=>t.type==='receita').reduce((s,t)=>s+t.amount,0); const e = txs.filter(t=>t.type==='despesa').reduce((s,t)=>s+t.amount,0); return i > 0 && (i - e) / i >= 0.2; } },
  { id: 'import_csv',    icon: '📂', name: 'Extrato Importado',     desc: 'Importou um extrato CSV',            check: () => Storage.flag(Storage.CSV_IMPORTED) },
  { id: 'score_good',    icon: '⭐', name: 'Score Bom',             desc: 'Atingiu score financeiro ≥ 70',      check: () => { const h = Storage.getJSON(Storage.scoreHistKey(), {}); return Object.values(h).some(s => s >= 70); } },
];

function checkAchievements() {
  const unlocked  = new Set(Storage.getJSON(Storage.achievKey(), []));
  const prevCount = unlocked.size;
  const txs       = transactions || [];

  ACHIEVEMENTS_DEF.forEach(a => {
    if (unlocked.has(a.id)) return;
    try {
      if (a.check(txs)) {
        unlocked.add(a.id);
        showAchievementToast(a);
      }
    } catch {}
  });

  if (unlocked.size !== prevCount) {
    Storage.setJSON(Storage.achievKey(), [...unlocked]);
    renderAchievements();
  }
}

function renderAchievements() {
  const unlocked = new Set(Storage.getJSON(Storage.achievKey(), []));
  const count    = unlocked.size;

  const badge = document.getElementById('achievements-profile-badge');
  if (badge) {
    badge.textContent = `${count}/${ACHIEVEMENTS_DEF.length}`;
  }

  const modalGrid  = document.getElementById('achievements-modal-grid');
  const modalCount = document.getElementById('achievements-modal-count');
  if (!modalGrid) return;

  if (modalCount) modalCount.textContent = `${count}/${ACHIEVEMENTS_DEF.length} conquistadas`;

  modalGrid.innerHTML = [
    ...ACHIEVEMENTS_DEF.filter(a => unlocked.has(a.id)),
    ...ACHIEVEMENTS_DEF.filter(a => !unlocked.has(a.id)),
  ].map(a => {
    const isUnlocked = unlocked.has(a.id);
    return `<div class="achievement-badge ${isUnlocked ? 'unlocked' : 'locked'}" title="${a.desc}">
      <span class="achievement-badge-icon">${a.icon}</span>
      <div class="achievement-badge-info">
        <span class="achievement-badge-name">${a.name}</span>
        <span class="achievement-badge-desc">${a.desc}</span>
      </div>
    </div>`;
  }).join('');
}

function openAchievementsModal() {
  renderAchievements();
  const overlay = document.getElementById('achievements-modal-overlay');
  if (overlay) {
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }
}

function closeAchievementsModal() {
  const overlay = document.getElementById('achievements-modal-overlay');
  if (overlay) {
    overlay.classList.add('hidden');
    document.body.style.overflow = '';
  }
}

function showAchievementToast(achievement) {
  const container = document.getElementById('toast-container') || document.body;
  const el = document.createElement('div');
  el.className = 'toast-achievement';
  el.innerHTML = `
    <span class="toast-achievement-icon">${achievement.icon}</span>
    <div>
      <div style="font-weight:700;font-size:.9rem">Conquista desbloqueada!</div>
      <div style="font-size:.8rem;opacity:.85">${achievement.name}</div>
    </div>`;

  // Posicionar como toast
  el.style.cssText = `
    position:fixed;bottom:80px;right:20px;z-index:9000;
    animation:slideUp .4s ease;
  `;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);

  triggerConfetti();
}

// =============================================
//  CONFETTI
// =============================================
function triggerConfetti(duration = 2500) {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  const ctx    = canvas.getContext('2d');
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;

  const colors  = ['#7c3aed','#10b981','#f59e0b','#3b82f6','#ec4899','#6366f1'];
  const pieces  = Array.from({ length: 80 }, () => ({
    x:    Math.random() * canvas.width,
    y:    Math.random() * -canvas.height * 0.3,
    w:    (Math.random() * 8) + 4,
    h:    (Math.random() * 6) + 3,
    vx:   (Math.random() - 0.5) * 3,
    vy:   (Math.random() * 3) + 2,
    rot:  Math.random() * Math.PI * 2,
    vrot: (Math.random() - 0.5) * 0.2,
    color: colors[Math.floor(Math.random() * colors.length)],
    alpha: 1,
  }));

  const start = Date.now();
  let raf;

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const elapsed = Date.now() - start;
    if (elapsed > duration) { ctx.clearRect(0, 0, canvas.width, canvas.height); return; }

    pieces.forEach(p => {
      p.x   += p.vx;
      p.y   += p.vy;
      p.rot += p.vrot;
      p.vy  += 0.05; // gravity
      if (elapsed > duration - 600) p.alpha = Math.max(0, p.alpha - 0.02);

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });

    raf = requestAnimationFrame(draw);
  }

  draw();
  setTimeout(() => { cancelAnimationFrame(raf); ctx.clearRect(0, 0, canvas.width, canvas.height); }, duration + 100);
}

// =============================================
//  GUIDED TOUR
// =============================================
const TOUR_STEPS = [
  {
    target:  'tab-dashboard',
    title:   'Dashboard',
    desc:    'Aqui você vê seu saldo do mês, receitas e despesas em tempo real. Navegue pelos meses com as setas.',
    pos:     'bottom',
  },
  {
    target:  'nav-tab-transactions',
    title:   'Transações',
    desc:    'Registre receitas e despesas. Use o botão + para adicionar, ou importe um extrato CSV de qualquer banco.',
    pos:     'bottom',
  },
  {
    target:  'nav-tab-analysis',
    title:   'Análise IA',
    desc:    'A IA analisa seus gastos, dá um score de saúde financeira e sugere onde economizar.',
    pos:     'bottom',
  },
  {
    target:  'nav-tab-investments',
    title:   'Investimentos',
    desc:    'Acompanhe seu portfólio de ações, FIIs, renda fixa e veja cotações em tempo real.',
    pos:     'bottom',
  },
  {
    target:  'btn-chat',
    title:   'Assistente IA',
    desc:    'Clique aqui para conversar com a IA. Pergunte sobre seus gastos, peça dicas ou simule cenários.',
    pos:     'left',
  },
];

let _tourStep = 0;

function startTour() {
  if (Storage.flag(Storage.tourKey())) return;
  _tourStep = 0;
  document.getElementById('tour-overlay')?.classList.remove('hidden');
  _renderTourStep();
}

function _renderTourStep() {
  const overlay = document.getElementById('tour-overlay');
  const hl      = document.getElementById('tour-highlight');
  const tooltip = document.getElementById('tour-tooltip');
  if (!overlay || !hl || !tooltip) return;

  const step = TOUR_STEPS[_tourStep];
  if (!step) { endTour(); return; }

  const target = document.getElementById(step.target);
  if (!target) { _tourStep++; _renderTourStep(); return; }

  const rect = target.getBoundingClientRect();
  const pad  = 6;

  // Highlight
  hl.style.left   = `${rect.left - pad}px`;
  hl.style.top    = `${rect.top  - pad + window.scrollY}px`;
  hl.style.width  = `${rect.width  + pad * 2}px`;
  hl.style.height = `${rect.height + pad * 2}px`;

  // Step info
  document.getElementById('tour-step-label').textContent = `Passo ${_tourStep + 1} de ${TOUR_STEPS.length}`;
  document.getElementById('tour-title').textContent = step.title;
  document.getElementById('tour-desc').textContent  = step.desc;

  // Dots
  document.getElementById('tour-dots').innerHTML = TOUR_STEPS.map((_, i) =>
    `<div class="tour-dot ${i === _tourStep ? 'active' : ''}"></div>`
  ).join('');

  // Button label
  const btn = document.getElementById('tour-next');
  if (btn) btn.textContent = _tourStep === TOUR_STEPS.length - 1 ? 'Concluir ✓' : 'Próximo →';

  // Position tooltip
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const tw = 290, th = 180;
  let left, top;

  if (step.pos === 'bottom') {
    left = Math.min(rect.left, vw - tw - 16);
    top  = rect.bottom + 14;
    if (top + th > vh) top = rect.top - th - 14;
  } else {
    left = rect.left - tw - 14;
    if (left < 16) left = rect.right + 14;
    top  = Math.min(rect.top, vh - th - 16);
  }

  tooltip.style.left = `${Math.max(16, left)}px`;
  tooltip.style.top  = `${Math.max(16, top)}px`;
}

function tourNext() {
  _tourStep++;
  if (_tourStep >= TOUR_STEPS.length) { endTour(); return; }
  _renderTourStep();
}

function endTour() {
  document.getElementById('tour-overlay')?.classList.add('hidden');
  Storage.setFlag(Storage.tourKey());
}

function initTour() {
  document.getElementById('tour-next')?.addEventListener('click', tourNext);
  document.getElementById('tour-skip')?.addEventListener('click', endTour);
}

// =============================================
//  PWA INSTALL PROMPT
// =============================================
let _deferredInstall = null;

function initPWAInstall() {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    _deferredInstall = e;

    // Show banner after 30s or on second visit
    const visits = +(Storage.get(Storage.VISITS, '0')) + 1;
    Storage.set(Storage.VISITS, visits);

    if (visits >= 2 && !Storage.flag(Storage.PWA_DISMISSED)) {
      setTimeout(showInstallBanner, 3000);
    }
  });
}

function showInstallBanner() {
  if (document.getElementById('pwa-banner')) return;
  const el = document.createElement('div');
  el.id = 'pwa-banner';
  el.className = 'pwa-install-banner';
  el.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
    <span>Instale o Atlas no seu celular</span>
    <button onclick="installPWA()">Instalar</button>
    <button class="pwa-dismiss" onclick="dismissInstall()">✕</button>`;
  document.body.appendChild(el);
}

async function installPWA() {
  if (!_deferredInstall) return;
  _deferredInstall.prompt();
  const { outcome } = await _deferredInstall.userChoice;
  if (outcome === 'accepted') {
    document.getElementById('pwa-banner')?.remove();
    Storage.setFlag(Storage.PWA_DISMISSED);
  }
  _deferredInstall = null;
}

function dismissInstall() {
  document.getElementById('pwa-banner')?.remove();
  Storage.setFlag(Storage.PWA_DISMISSED);
}

// =============================================
//  INIT
// =============================================
function initEnhancements() {
  initTour();
  initPWAInstall();
  renderScoreHistory();
  renderAchievements();
}

// Hook into renderAIResult to save score and check achievements
const _origRenderAIResult = typeof renderAIResult !== 'undefined' ? renderAIResult : null;
if (typeof renderAIResult === 'function') {
  const _origFn = renderAIResult;
  window.renderAIResult = function(a) {
    _origFn(a);
    const monthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
    const score    = Math.max(0, Math.min(100, a.score || 0));
    const prevH    = Storage.getJSON(Storage.scoreHistKey(), {});
    const prevScore = prevH[monthKey];

    saveScore(score, monthKey);
    checkAchievements();

    if (prevScore !== undefined && score > prevScore) {
      triggerConfetti(2000);
    } else if (!prevScore && score >= 75) {
      triggerConfetti(2000);
    }
  };
}

// Hook into renderDashboard to check achievements and projections
document.addEventListener('atlas:rendered', () => {
  checkAchievements();
  renderAchievements();
  renderProjection();
});
