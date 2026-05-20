'use strict';

// =============================================
//  PORTFOLIO
// =============================================
let _portfolio     = [];
let _portfolioGoal = null;
let _pfFilter      = '';
let _pfShowAll     = false;

const ASSET_COLORS = [
  '#6366f1','#10b981','#f59e0b','#3b82f6','#ec4899',
  '#8b5cf6','#14b8a6','#f97316','#84cc16','#06b6d4',
];

function _portfolioKey() { return `atlas_pf_demo`; }
function _goalKey()      { return 'atlas_goal_demo'; }

async function loadPortfolio() {
  if (typeof Demo !== 'undefined' && Demo.active) {
    _portfolio = JSON.parse(localStorage.getItem(_portfolioKey()) || '[]');
    return;
  }
  try {
    const data = await API.req('GET', '/api/portfolio');
    _portfolio = Array.isArray(data) ? data : [];
  } catch { _portfolio = []; }
}

async function addPortfolioEntry(entry) {
  if (typeof Demo !== 'undefined' && Demo.active) {
    const saved = { ...entry, id: Date.now().toString(36) + Math.random().toString(36).slice(2), created_at: new Date().toISOString() };
    _portfolio.unshift(saved);
    localStorage.setItem(_portfolioKey(), JSON.stringify(_portfolio));
    renderPortfolio();
    return;
  }
  const saved = await API.req('POST', '/api/portfolio', entry);
  _portfolio.unshift(saved);
  renderPortfolio();
}

async function deletePortfolioEntry(id) {
  if (typeof Demo !== 'undefined' && Demo.active) {
    _portfolio = _portfolio.filter(e => e.id !== id);
    localStorage.setItem(_portfolioKey(), JSON.stringify(_portfolio));
    renderPortfolio();
    return;
  }
  await API.req('DELETE', `/api/portfolio/${id}`);
  _portfolio = _portfolio.filter(e => e.id !== id);
  renderPortfolio();
}

async function updatePortfolioEntry(id, updates) {
  if (typeof Demo !== 'undefined' && Demo.active) {
    const idx = _portfolio.findIndex(e => e.id === id);
    if (idx < 0) throw new Error('Aporte não encontrado.');
    _portfolio[idx] = { ..._portfolio[idx], ...updates };
    localStorage.setItem(_portfolioKey(), JSON.stringify(_portfolio));
    renderPortfolio();
    return;
  }
  await API.req('PATCH', `/api/portfolio/${id}`, updates);
  const idx = _portfolio.findIndex(e => e.id === id);
  if (idx >= 0) _portfolio[idx] = { ..._portfolio[idx], ...updates };
  renderPortfolio();
}

// ── Goal ──────────────────────────────────────
function loadPortfolioGoal() {
  _portfolioGoal = JSON.parse(localStorage.getItem(_goalKey()) || 'null');
}

function renderPortfolioGoal() {
  const el = document.getElementById('portfolio-goal-section');
  if (!el) return;
  if (!_portfolioGoal || !_portfolio.length) { el.style.display = 'none'; return; }

  const { name, amount, date } = _portfolioGoal;
  const total      = _portfolio.reduce((s, e) => s + +e.amount, 0);
  const pct        = Math.min((total / amount) * 100, 100);
  const remaining  = Math.max(amount - total, 0);
  const fmt        = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const now        = new Date();
  const target     = new Date(date + 'T12:00:00');
  const monthsLeft = Math.max((target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth()), 1);
  const monthlyNeeded = remaining > 0 ? remaining / monthsLeft : 0;
  const dateLabel  = target.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });

  el.style.display = '';
  el.innerHTML = `
    <div class="portfolio-goal">
      <div class="portfolio-goal-top">
        <div class="portfolio-goal-left">
          <span class="portfolio-goal-icon">🎯</span>
          <div>
            <div class="portfolio-goal-name">${escHtml(name)}</div>
            <div class="portfolio-goal-sub">Meta: ${fmt(amount)} · ${dateLabel}</div>
          </div>
        </div>
        <div class="portfolio-goal-pct-wrap">
          <span class="portfolio-goal-pct">${pct.toFixed(1).replace('.', ',')}%</span>
          <span class="portfolio-goal-pct-label">atingido</span>
        </div>
      </div>
      <div class="portfolio-goal-bar-bg">
        <div class="portfolio-goal-bar-fill" style="width:${pct.toFixed(2)}%"></div>
      </div>
      <div class="portfolio-goal-bottom">
        <span>Faltam ${fmt(remaining)}</span>
        <span>~${fmt(monthlyNeeded)}/mês por ${monthsLeft} ${monthsLeft === 1 ? 'mês' : 'meses'}</span>
      </div>
    </div>`;
}

function openGoalModal() {
  const modal = document.getElementById('modal-goal');
  if (!modal) return;
  const g = _portfolioGoal;
  document.getElementById('goal-name').value   = g?.name   || '';
  document.getElementById('goal-amount').value = g?.amount || '';
  document.getElementById('goal-date').value   = g?.date   || '';
  const clearBtn = document.getElementById('btn-goal-clear');
  if (clearBtn) clearBtn.style.display = g ? '' : 'none';
  openModal('modal-goal');
  document.getElementById('goal-name').focus();
}

function saveGoalModal() {
  const name   = document.getElementById('goal-name').value.trim();
  const amount = parseFloat(document.getElementById('goal-amount').value);
  const date   = document.getElementById('goal-date').value;
  if (!name)               return toast?.('Preencha o nome da meta.', 'err');
  if (!amount || amount <= 0) return toast?.('Valor alvo inválido.', 'err');
  if (!date)               return toast?.('Selecione a data alvo.', 'err');
  _portfolioGoal = { name, amount, date };
  localStorage.setItem(_goalKey(), JSON.stringify(_portfolioGoal));
  closeModal('modal-goal');
  renderPortfolioGoal();
  toast?.('Meta salva!');
}

function clearGoalModal() {
  if (!confirm('Remover a meta financeira?')) return;
  _portfolioGoal = null;
  localStorage.removeItem(_goalKey());
  closeModal('modal-goal');
  renderPortfolioGoal();
  toast?.('Meta removida.');
}

// ── Export CSV ────────────────────────────────
function exportPortfolioCSV() {
  if (!_portfolio.length) return toast?.('Nenhum aporte para exportar.', 'err');
  const headers = ['Data', 'Ativo', 'Valor (R$)', 'Observação'];
  const rows = _portfolio.map(e => [
    e.date,
    e.asset,
    (+e.amount).toFixed(2).replace('.', ','),
    e.notes || '',
  ]);
  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
    .join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `carteira_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
  toast?.('CSV exportado!');
}

function renderPortfolio() {
  const section = document.getElementById('portfolio-section');
  if (!section) return;

  const cards   = document.getElementById('portfolio-cards');
  const charts  = document.getElementById('portfolio-charts-area');
  const proj    = document.getElementById('portfolio-projection');
  const entries = document.getElementById('portfolio-entries-area');
  const goal    = document.getElementById('portfolio-goal-section');
  const body    = document.getElementById('portfolio-body');

  if (!_portfolio.length) {
    if (cards)   cards.style.display   = 'none';
    if (charts)  charts.style.display  = 'none';
    if (proj)    proj.style.display    = 'none';
    if (entries) entries.style.display = 'none';
    if (goal)    goal.style.display    = 'none';
    if (body) body.innerHTML = `
      <div class="portfolio-empty">
        <span class="portfolio-empty-icon">📂</span>
        <p>Você ainda não registrou nenhum aporte.<br>Clique em <strong>Novo aporte</strong> para começar.</p>
      </div>`;
    return;
  }

  if (body) body.innerHTML = '';
  renderPortfolioCards();
  renderPortfolioGoal();
  renderPortfolioCharts();
  renderPortfolioEntries();
}

// ── Summary cards ──────────────────────────────
function renderPortfolioCards() {
  const el = document.getElementById('portfolio-cards');
  if (!el) return;

  const total     = _portfolio.reduce((s, e) => s + +e.amount, 0);
  const now       = new Date();
  const thisMonth = _portfolio.filter(e => {
    const d = new Date(e.date + 'T12:00:00');
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const monthTotal = thisMonth.reduce((s, e) => s + +e.amount, 0);
  const noAlert    = monthTotal === 0;

  const months = new Map();
  _portfolio.forEach(e => {
    const d = new Date(e.date + 'T12:00:00');
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    months.set(key, (months.get(key) || 0) + +e.amount);
  });
  const avgMonthly   = months.size ? [...months.values()].reduce((s, v) => s + v, 0) / months.size : 0;
  const uniqueAssets = new Set(_portfolio.map(e => e.asset)).size;
  const fmt          = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // Estimated portfolio value using CDI
  let estCard = '';
  if (_cachedRates) {
    const cdiMonthly = Math.pow(1 + _cachedRates.cdi.value / 100, 1 / 12) - 1;
    const estValue   = _portfolio.reduce((sum, e) => {
      const d = new Date(e.date + 'T12:00:00');
      const m = Math.max((now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth()), 0);
      return sum + +e.amount * Math.pow(1 + cdiMonthly, m);
    }, 0);
    const estGain  = estValue - total;
    const estPct   = total > 0 ? ((estGain / total) * 100).toFixed(1).replace('.', ',') : '0,0';
    estCard = `
    <div class="portfolio-card">
      <div class="portfolio-card-label">Rendimento est. CDI</div>
      <div class="portfolio-card-value" style="color:var(--green)">${fmt(estValue)}</div>
      <div class="portfolio-card-sub">+ ${fmt(estGain)} (${estPct}%)</div>
    </div>`;
  }

  el.innerHTML = `
    <div class="portfolio-card">
      <div class="portfolio-card-label">Total investido</div>
      <div class="portfolio-card-value accent">${fmt(total)}</div>
      <div class="portfolio-card-sub">${_portfolio.length} aportes registrados</div>
    </div>
    <div class="portfolio-card${noAlert ? ' portfolio-card-alert' : ''}">
      <div class="portfolio-card-label">Este mês${noAlert ? ' ⚠' : ''}</div>
      <div class="portfolio-card-value month">${fmt(monthTotal)}</div>
      <div class="portfolio-card-sub">${noAlert ? 'Sem aportes este mês' : `${thisMonth.length} aporte${thisMonth.length !== 1 ? 's' : ''} no período`}</div>
    </div>
    ${estCard}
    <div class="portfolio-card">
      <div class="portfolio-card-label">Média mensal</div>
      <div class="portfolio-card-value">${fmt(avgMonthly)}</div>
      <div class="portfolio-card-sub">base: ${months.size} ${months.size !== 1 ? 'meses' : 'mês'}</div>
    </div>
    <div class="portfolio-card">
      <div class="portfolio-card-label">Ativos</div>
      <div class="portfolio-card-value">${uniqueAssets}</div>
      <div class="portfolio-card-sub">tipo${uniqueAssets !== 1 ? 's' : ''} de investimento</div>
    </div>`;
}

// ── Charts ─────────────────────────────────────
function renderPortfolioCharts() {
  drawPortfolioBarChart();
  drawPortfolioPieChart();
  renderProjectionTable();
}

// Monthly bars: how much invested each month
function drawPortfolioBarChart() {
  const canvas = document.getElementById('portfolio-bar-chart');
  if (!canvas) return;

  // Build month buckets (last 12 months)
  const buckets = new Map();
  _portfolio.forEach(e => {
    const d   = new Date(e.date + 'T12:00:00');
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    buckets.set(key, (buckets.get(key) || 0) + +e.amount);
  });

  const sorted = [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-12);
  if (!sorted.length) return;

  const W    = canvas.parentElement.clientWidth || 400;
  const H    = 160;
  canvas.width  = W;
  canvas.height = H;

  const ctx  = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  const maxVal = Math.max(...sorted.map(s => s[1]), 1);
  const pL = 6, pR = 6, pT = 10, pB = 28;
  const n   = sorted.length;
  const bW  = Math.floor((W - pL - pR) / n) - 4;
  const cH  = H - pT - pB;

  const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const fmt = v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0);

  sorted.forEach(([key, val], i) => {
    const x   = pL + i * ((W - pL - pR) / n);
    const bH  = Math.max((val / maxVal) * cH, 3);
    const y   = pT + cH - bH;
    const [yr, mo] = key.split('-');
    const isNow = key === `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

    const g = ctx.createLinearGradient(0, y, 0, y + bH);
    g.addColorStop(0, isNow ? '#6366f1' : '#7c3aed');
    g.addColorStop(1, isNow ? '#818cf8' : '#a78bfa');
    ctx.fillStyle = g;
    ctx.beginPath(); rrect(ctx, x + 2, y, bW, bH, 4); ctx.fill();

    // Label above bar
    ctx.fillStyle    = chartFg(0.65);
    ctx.font         = '9px Inter';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(fmt(val), x + 2 + bW / 2, y - 2);

    // Month label below
    ctx.fillStyle    = chartFg(isNow ? 0.9 : 0.4);
    ctx.font         = isNow ? 'bold 9px Inter' : '9px Inter';
    ctx.textBaseline = 'top';
    ctx.fillText(MONTHS[+mo - 1], x + 2 + bW / 2, H - pB + 4);
  });
}

// Pie chart: % per asset
let _pieSlices   = [];
let _pieHov      = -1;
let _pieCtx      = null;
let _pieGeo      = {};

function drawPortfolioPieChart() {
  const canvas = document.getElementById('portfolio-pie-chart');
  if (!canvas) return;

  const totals = {};
  _portfolio.forEach(e => { totals[e.asset] = (totals[e.asset] || 0) + +e.amount; });
  const total  = Object.values(totals).reduce((s, v) => s + v, 0);
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);

  const size = Math.min(canvas.parentElement.clientWidth || 200, 180);
  canvas.width = size; canvas.height = size;

  const ctx  = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  _pieCtx = ctx;

  const cx = size / 2, cy = size / 2;
  const OR = size * 0.42, IR = size * 0.26;
  _pieGeo = { cx, cy, OR, IR, size };

  let angle = -Math.PI / 2;
  _pieSlices = sorted.map(([asset, val], i) => {
    const sweep = (val / total) * Math.PI * 2;
    const sa    = angle;
    angle      += sweep;
    return { asset, val, pct: (val / total * 100).toFixed(1), sa, ea: angle, color: ASSET_COLORS[i % ASSET_COLORS.length] };
  });

  _pieHov = -1;
  _redrawPie(-1);

  // Legend
  const legEl = document.getElementById('portfolio-pie-legend');
  if (legEl) {
    legEl.innerHTML = _pieSlices.map((sl, i) => `
      <div class="pie-legend-item" data-pie-idx="${i}">
        <div class="pie-legend-dot" style="background:${sl.color}"></div>
        <span class="pie-legend-name">${escHtml(sl.asset)}</span>
        <span class="pie-legend-pct">${sl.pct}%</span>
      </div>`).join('');

    legEl.querySelectorAll('.pie-legend-item').forEach(item => {
      const idx = +item.dataset.pieIdx;
      item.addEventListener('mouseenter', () => { _pieHov = idx; _redrawPie(idx); });
      item.addEventListener('mouseleave', () => { _pieHov = -1; _redrawPie(-1); });
    });
  }

  canvas.onmousemove = e => {
    const r   = canvas.getBoundingClientRect();
    const mx  = (e.clientX - r.left) * (size / r.width);
    const my  = (e.clientY - r.top)  * (size / r.height);
    const dist = Math.hypot(mx - cx, my - cy);
    if (dist < IR || dist > OR + 8) { if (_pieHov !== -1) { _pieHov = -1; _redrawPie(-1); } canvas.style.cursor = 'default'; return; }
    let rel = (Math.atan2(my - cy, mx - cx) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
    const idx = _pieSlices.findIndex(sl => {
      let sa = (sl.sa + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
      let ea = (sl.ea + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
      return sa <= ea ? rel >= sa && rel <= ea : rel >= sa || rel <= ea;
    });
    canvas.style.cursor = idx >= 0 ? 'default' : 'default';
    if (idx !== _pieHov) { _pieHov = idx; _redrawPie(idx); }
  };
  canvas.onmouseleave = () => { _pieHov = -1; _redrawPie(-1); canvas.style.cursor = 'default'; };
}

function _redrawPie(hovIdx) {
  if (!_pieCtx || !_pieSlices.length) return;
  const ctx = _pieCtx;
  const { cx, cy, OR, IR, size } = _pieGeo;
  ctx.clearRect(0, 0, size, size);

  _pieSlices.forEach((sl, i) => {
    const expand = i === hovIdx ? 7 : 0;
    const mid    = sl.sa + (sl.ea - sl.sa) / 2;
    const ox     = expand * Math.cos(mid), oy = expand * Math.sin(mid);
    ctx.beginPath();
    ctx.moveTo(cx + ox, cy + oy);
    ctx.arc(cx + ox, cy + oy, OR + (i === hovIdx ? 3 : 0), sl.sa, sl.ea);
    ctx.closePath();
    ctx.fillStyle   = sl.color;
    ctx.globalAlpha = (hovIdx >= 0 && i !== hovIdx) ? 0.35 : 1;
    ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = chartBg(); ctx.lineWidth = 2; ctx.stroke();
  });

  ctx.beginPath(); ctx.arc(cx, cy, IR, 0, Math.PI * 2);
  ctx.fillStyle = chartBg(); ctx.fill();

  const fmt = v => v >= 1000 ? `R$${(v / 1000).toFixed(1)}k` : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  ctx.fillStyle = chartFg(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (hovIdx >= 0) {
    const sl = _pieSlices[hovIdx];
    ctx.font = 'bold 11px Inter'; ctx.fillText(fmt(sl.val), cx, cy - 7);
    ctx.font = '9px Inter'; ctx.fillStyle = chartFg(0.55); ctx.fillText(sl.pct + '%', cx, cy + 8);
  } else {
    const tot = _pieSlices.reduce((s, sl) => s + sl.val, 0);
    ctx.font = 'bold 10px Inter'; ctx.fillText(fmt(tot), cx, cy);
  }
}

// ── Projection table ───────────────────────────
function renderProjectionTable() {
  const el = document.getElementById('portfolio-projection');
  if (!el) return;

  const cdiAnnual  = _cachedRates?.cdi.value ?? 10.5;
  const cdiMonthly = Math.pow(1 + cdiAnnual / 100, 1 / 12) - 1;

  // Monthly average contribution
  const months = new Map();
  _portfolio.forEach(e => {
    const d   = new Date(e.date + 'T12:00:00');
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    months.set(key, (months.get(key) || 0) + +e.amount);
  });
  const pmt = months.size ? [...months.values()].reduce((s, v) => s + v, 0) / months.size : 0;
  const pv  = _portfolio.reduce((s, e) => s + +e.amount, 0);

  const fv = n => pv * Math.pow(1 + cdiMonthly, n) + (pmt * (Math.pow(1 + cdiMonthly, n) - 1) / cdiMonthly);
  const fmt = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const periods = [
    { label: '1 ano',    n: 12  },
    { label: '3 anos',   n: 36  },
    { label: '5 anos',   n: 60  },
    { label: '10 anos',  n: 120 },
    { label: '20 anos',  n: 240 },
  ];

  el.innerHTML = `
    <table class="projection-table">
      <thead>
        <tr>
          <th>Prazo</th>
          <th>Total aportado</th>
          <th>Com rendimento</th>
          <th>Ganho estimado</th>
        </tr>
      </thead>
      <tbody>
        ${periods.map(({ label, n }) => {
          const invested = pv + pmt * n;
          const total    = fv(n);
          const yield_   = total - invested;
          return `<tr>
            <td>${label}</td>
            <td>${fmt(invested)}</td>
            <td>${fmt(total)}</td>
            <td class="yield-val">+ ${fmt(yield_)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    <p class="projection-cdi-note">
      CDI usado: ${cdiAnnual.toFixed(2).replace('.', ',')}% a.a. · Aporte mensal médio: ${fmt(pmt)}
    </p>`;
}

// ── Entries list ───────────────────────────────
function renderPortfolioEntries() {
  const fmt     = v => (+v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtDate = d => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' });

  const cards   = document.getElementById('portfolio-cards');
  const charts  = document.getElementById('portfolio-charts-area');
  const entries = document.getElementById('portfolio-entries-area');
  const proj    = document.getElementById('portfolio-projection');

  if (cards)   cards.style.display   = '';
  if (charts)  charts.style.display  = '';
  if (proj)    proj.style.display    = '';
  if (entries) entries.style.display = '';

  document.getElementById('portfolio-empty-state')?.remove();

  const entEl    = document.getElementById('portfolio-entries');
  const footerEl = document.getElementById('portfolio-entries-footer');
  if (!entEl) return;

  // Wire filter input
  const filterInput = document.getElementById('pf-filter-text');
  if (filterInput && !filterInput._wired) {
    filterInput._wired = true;
    filterInput.addEventListener('input', e => {
      _pfFilter  = e.target.value.trim().toLowerCase();
      _pfShowAll = false;
      renderPortfolioEntries();
    });
  }
  if (filterInput) filterInput.value = _pfFilter;

  let filtered = _pfFilter
    ? _portfolio.filter(e => e.asset.toLowerCase().includes(_pfFilter))
    : _portfolio;

  const limit   = _pfShowAll ? filtered.length : 20;
  const visible = filtered.slice(0, limit);

  entEl.innerHTML = visible.map(e => `
    <div class="portfolio-entry-row">
      <span class="portfolio-entry-date">${fmtDate(e.date)}</span>
      <span class="portfolio-entry-asset">${escHtml(e.asset)}</span>
      <span class="portfolio-entry-amount">${fmt(e.amount)}</span>
      <button class="btn-entry-edit"   data-id="${e.id}" title="Editar aporte">✏</button>
      <button class="btn-entry-delete" data-id="${e.id}" title="Remover aporte">✕</button>
    </div>`).join('');

  if (footerEl) {
    if (!_pfShowAll && filtered.length > 20) {
      footerEl.innerHTML = `<div class="portfolio-entries-more">Mostrando ${visible.length} de ${filtered.length} · <button class="btn-link" id="btn-pf-showall">Ver todos</button></div>`;
      footerEl.querySelector('#btn-pf-showall')?.addEventListener('click', () => { _pfShowAll = true; renderPortfolioEntries(); });
    } else if (_pfShowAll && filtered.length > 20) {
      footerEl.innerHTML = `<div class="portfolio-entries-more">${filtered.length} aportes · <button class="btn-link" id="btn-pf-hideall">Mostrar menos</button></div>`;
      footerEl.querySelector('#btn-pf-hideall')?.addEventListener('click', () => { _pfShowAll = false; renderPortfolioEntries(); });
    } else {
      footerEl.innerHTML = _pfFilter && filtered.length !== _portfolio.length
        ? `<div class="portfolio-entries-more">${filtered.length} resultado${filtered.length !== 1 ? 's' : ''} encontrado${filtered.length !== 1 ? 's' : ''}</div>`
        : '';
    }
  }

  entEl.querySelectorAll('.btn-entry-edit').forEach(btn => {
    btn.addEventListener('click', () => openEditEntryModal(btn.dataset.id));
  });
  entEl.querySelectorAll('.btn-entry-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remover este aporte?')) return;
      try { await deletePortfolioEntry(btn.dataset.id); }
      catch { toast?.('Erro ao remover aporte.', 'err'); }
    });
  });
}

// ── Asset Picker ───────────────────────────────
const ASSET_GROUPS = [
  {
    label: '📈 Ações',
    badge: 'purple',
    items: [
      { value: 'PETR4',  name: 'Petrobras PN'      },
      { value: 'VALE3',  name: 'Vale'               },
      { value: 'ITUB4',  name: 'Itaú Unibanco PN'  },
      { value: 'ABEV3',  name: 'Ambev'              },
      { value: 'BBDC4',  name: 'Bradesco PN'        },
    ],
  },
  {
    label: '🏛️ Renda Fixa',
    badge: 'green',
    items: [
      { value: 'Tesouro Selic',  name: 'Baixo risco · liquidez diária' },
      { value: 'Tesouro IPCA+', name: 'Indexado à inflação'            },
      { value: 'CDB',            name: 'Certificado de Depósito'       },
      { value: 'LCI',            name: 'Isento de IR'                  },
      { value: 'LCA',            name: 'Isento de IR'                  },
      { value: 'Fundo DI',       name: 'Rende próximo ao CDI'          },
    ],
  },
  {
    label: '₿ Cripto',
    badge: 'yellow',
    items: [
      { value: 'Bitcoin',   name: 'BTC' },
      { value: 'Ethereum',  name: 'ETH' },
      { value: 'Cripto',    name: 'Outras criptomoedas' },
    ],
  },
  {
    label: '🏢 FIIs',
    badge: 'orange',
    items: [
      { value: 'MXRF11', name: 'Maxi Renda — papel'       },
      { value: 'XPML11', name: 'XP Malls — shoppings'     },
      { value: 'HGLG11', name: 'CSHG Log — logística'     },
      { value: 'KNRI11', name: 'Kinea Renda — híbrido'    },
      { value: 'VISC11', name: 'Vinci Shopping — shoppings' },
      { value: 'BCFF11', name: 'BTG Fundo de Fundos'      },
    ],
  },
];

const ICON_MAP = {
  purple: '📈', green: '🏛️', yellow: '₿', orange: '🏢',
};

function initAssetPicker() {
  const picker   = document.getElementById('asset-picker');
  const input    = document.getElementById('pf-asset');
  const drop     = document.getElementById('asset-picker-drop');
  const iconEl   = document.getElementById('asset-picker-icon');
  if (!picker || !input || !drop) return;

  let focusedIdx = -1;
  let allOptions = [];

  function buildOptions(filter) {
    drop.innerHTML = '';
    allOptions = [];
    focusedIdx = -1;
    const q = filter.toLowerCase();

    ASSET_GROUPS.forEach(group => {
      const matches = group.items.filter(
        it => it.value.toLowerCase().includes(q) || it.name.toLowerCase().includes(q)
      );
      if (!matches.length) return;

      const grpEl = document.createElement('div');
      grpEl.className = 'asset-group';
      grpEl.innerHTML = `<div class="asset-group-label">${group.label}</div>`;

      matches.forEach(item => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'asset-option';
        btn.dataset.value = item.value;
        btn.dataset.badge = group.badge;
        btn.innerHTML = `
          <span class="asset-opt-badge ${group.badge}">${item.value}</span>
          <span class="asset-opt-name">${item.name}</span>`;
        btn.addEventListener('mousedown', e => {
          e.preventDefault();
          selectOption(item.value, group.badge);
        });
        grpEl.appendChild(btn);
        allOptions.push(btn);
      });

      drop.appendChild(grpEl);
    });

    if (!allOptions.length) {
      drop.innerHTML = `<div class="asset-picker-empty">Nenhum ativo encontrado — será salvo como digitado</div>`;
    }
  }

  function selectOption(value, badge) {
    input.value = value;
    if (iconEl) iconEl.textContent = badge === 'green' ? '🏛️' : badge === 'yellow' ? '₿' : badge === 'orange' ? '🏢' : '📈';
    closeDrop();
    input.focus();
  }

  function openDrop() {
    buildOptions(input.value);
    drop.classList.remove('hidden');
    picker.classList.add('open');
  }

  function closeDrop() {
    drop.classList.add('hidden');
    picker.classList.remove('open');
    focusedIdx = -1;
  }

  function moveFocus(dir) {
    if (drop.classList.contains('hidden')) { openDrop(); return; }
    const opts = drop.querySelectorAll('.asset-option');
    if (!opts.length) return;
    opts[focusedIdx]?.classList.remove('focused');
    focusedIdx = (focusedIdx + dir + opts.length) % opts.length;
    opts[focusedIdx].classList.add('focused');
    opts[focusedIdx].scrollIntoView({ block: 'nearest' });
  }

  input.addEventListener('focus', () => openDrop());
  input.addEventListener('input', () => {
    if (iconEl) iconEl.textContent = '📊';
    buildOptions(input.value);
    if (drop.classList.contains('hidden')) drop.classList.remove('hidden');
    picker.classList.add('open');
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown')  { e.preventDefault(); moveFocus(1); }
    if (e.key === 'ArrowUp')    { e.preventDefault(); moveFocus(-1); }
    if (e.key === 'Enter') {
      const focused = drop.querySelector('.asset-option.focused');
      if (focused) { e.preventDefault(); selectOption(focused.dataset.value, focused.dataset.badge); }
    }
    if (e.key === 'Escape') closeDrop();
  });
  input.addEventListener('blur', () => setTimeout(closeDrop, 150));

  picker.querySelector('.asset-picker-field').addEventListener('click', () => {
    if (drop.classList.contains('hidden')) openDrop();
    input.focus();
  });
}

// ── Modal ──────────────────────────────────────
function openPortfolioModal() {
  const modal = document.getElementById('modal-portfolio');
  if (!modal) return;
  document.getElementById('pf-date').value   = new Date().toISOString().slice(0, 10);
  document.getElementById('pf-asset').value  = '';
  document.getElementById('pf-amount').value = '';
  document.getElementById('pf-notes').value  = '';
  const iconEl = document.getElementById('asset-picker-icon');
  if (iconEl) iconEl.textContent = '📊';
  modal.classList.remove('hidden');
  initAssetPicker();
  document.getElementById('pf-asset').focus();
}

function closePortfolioModal() {
  document.getElementById('modal-portfolio')?.classList.add('hidden');
}

async function savePortfolioEntry() {
  const date   = document.getElementById('pf-date').value;
  const asset  = document.getElementById('pf-asset').value.trim();
  const amount = parseFloat(document.getElementById('pf-amount').value);
  const notes  = document.getElementById('pf-notes').value.trim();

  if (!date || !asset)       return toast?.('Preencha data e ativo.', 'err');
  if (!amount || amount <= 0) return toast?.('Valor inválido.', 'err');

  const btn = document.getElementById('btn-pf-save');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando…'; }

  try {
    await addPortfolioEntry({ date, asset, amount, notes: notes || null });
    closePortfolioModal();
    toast('Aporte registrado!');
  } catch (err) {
    console.error('[Portfolio] save error:', err);
    const msg = err?.message || 'Erro ao salvar.';
    const hint = msg.toLowerCase().includes('relation') || msg.toLowerCase().includes('table')
      ? ' Execute o SQL de migração no Supabase.'
      : '';
    toast(msg + hint, 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Salvar'; }
  }
}

// ── Edit entry modal ──────────────────────────
function openEditEntryModal(id) {
  const entry = _portfolio.find(e => e.id === id);
  if (!entry) return;
  document.getElementById('edit-entry-id').value    = entry.id;
  document.getElementById('edit-pf-date').value     = entry.date;
  document.getElementById('edit-pf-asset').value    = entry.asset;
  document.getElementById('edit-pf-amount').value   = entry.amount;
  document.getElementById('edit-pf-notes').value    = entry.notes || '';
  openModal('modal-edit-entry');
  document.getElementById('edit-pf-asset').focus();
}

function closeEditEntryModal() { closeModal('modal-edit-entry'); }

async function saveEditEntry() {
  const id     = document.getElementById('edit-entry-id').value;
  const date   = document.getElementById('edit-pf-date').value;
  const asset  = document.getElementById('edit-pf-asset').value.trim();
  const amount = parseFloat(document.getElementById('edit-pf-amount').value);
  const notes  = document.getElementById('edit-pf-notes').value.trim();
  if (!date || !asset)        return toast?.('Preencha data e ativo.', 'err');
  if (!amount || amount <= 0) return toast?.('Valor inválido.', 'err');
  const btn = document.getElementById('btn-edit-entry-save');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando…'; }
  try {
    await updatePortfolioEntry(id, { date, asset, amount, notes: notes || null });
    closeEditEntryModal();
    toast?.('Aporte atualizado!');
  } catch (err) {
    toast?.(err?.message || 'Erro ao atualizar.', 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Salvar'; }
  }
}

// =============================================
//  STATIC DATA
// =============================================
const BANKS = [
  { name: 'PicPay',          pct: 102, color: '#11c76f' },
  { name: 'Nubank',          pct: 100, color: '#820ad1' },
  { name: 'Inter',           pct: 100, color: '#ff6600' },
  { name: 'C6 Bank',         pct: 100, color: '#7b7b9a' },
  { name: 'BTG Pactual',     pct: 100, color: '#4080e8' },
  { name: 'Santander',       pct:  90, color: '#ec0000' },
  { name: 'Itaú',            pct:  87, color: '#3366bb' },
  { name: 'Bradesco',        pct:  75, color: '#cc092f' },
  { name: 'Banco do Brasil', pct:  70, color: '#e8a200' },
];

// IR regressivo para CDB (dias corridos)
function irRate(days) {
  if (days <= 180) return 0.225;
  if (days <= 360) return 0.20;
  if (days <= 720) return 0.175;
  return 0.15;
}

// =============================================
//  STATE
// =============================================
let _cachedRates    = null;
let _simType        = 'cdb';
let _invReady       = false;
let _banksDrawn     = false;

// =============================================
//  INIT
// =============================================
async function initInvestments() {
  if (_invReady) {
    if (_cachedRates) {
      drawBanksChart(_cachedRates.cdi.value);
      runSimulator();
      runComparison();
    }
    renderPortfolio();
    return;
  }
  _invReady = true;
  loadPortfolioGoal();
  setupSimulatorListeners();
  setupComparisonListeners();

  // Goal modal
  document.getElementById('btn-portfolio-goal')?.addEventListener('click', openGoalModal);
  document.getElementById('btn-goal-cancel')?.addEventListener('click', () => closeModal('modal-goal'));
  document.getElementById('btn-goal-save')?.addEventListener('click', saveGoalModal);
  document.getElementById('btn-goal-clear')?.addEventListener('click', clearGoalModal);

  // Export CSV
  document.getElementById('btn-portfolio-export')?.addEventListener('click', exportPortfolioCSV);

  // Edit entry modal
  document.getElementById('btn-edit-entry-cancel')?.addEventListener('click', closeEditEntryModal);
  document.getElementById('btn-edit-entry-save')?.addEventListener('click', saveEditEntry);

  // Load in parallel — market data, rates, and portfolio are independent
  await Promise.all([loadMarketRates(), loadMarketData(), loadPortfolio()]);
  renderPortfolio();
}

// =============================================
//  MARKET RATES — BCB API (direto do browser)
// =============================================

// Valores de referência usados como fallback quando a BCB está inacessível
const RATES_FALLBACK = {
  selic: { value: 14.75, date: 'referência', unit: '% a.a.', fallback: true },
  cdi:   { value: 14.65, date: 'referência', unit: '% a.a.', fallback: true },
  ipca:  { value: 5.06,  date: 'referência', unit: '% 12m',  fallback: true },
};

async function bcbFetch(series, n) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), 18_000);
  try {
    const r = await fetch(
      `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${series}/dados/ultimos/${n || 1}?formato=json`,
      { signal: ctrl.signal }
    );
    clearTimeout(tid);
    if (!r.ok) throw new Error(`bcb_${series}_${r.status}`);
    return await r.json();
  } catch (e) {
    clearTimeout(tid);
    throw e;
  }
}

async function loadMarketRates() {
  const grid = document.getElementById('rates-grid');
  if (!grid) return;

  grid.innerHTML = Array(4).fill('<div class="rate-card rate-card-skeleton"></div>').join('');

  let rates;
  try {
    // Séries: 4390 = SELIC acum. mês (% a.m.), 4391 = CDI acum. mês (% a.m.), 13522 = IPCA 12m (%)
    const [selicData, cdiData, ipcaData] = await Promise.all([
      bcbFetch(4390),
      bcbFetch(4391),
      bcbFetch(13522),
    ]);

    const parseVal = arr => parseFloat((arr?.[0]?.valor || '0').replace(',', '.'));
    const dateOf   = arr => arr?.[0]?.data || '';
    const annualize = monthly => +((Math.pow(1 + monthly / 100, 12) - 1) * 100).toFixed(2);

    rates = {
      selic: { value: annualize(parseVal(selicData)), date: dateOf(selicData), unit: '% a.a.' },
      cdi:   { value: annualize(parseVal(cdiData)),   date: dateOf(cdiData),   unit: '% a.a.' },
      ipca:  { value: parseVal(ipcaData),             date: dateOf(ipcaData),  unit: '% 12m'  },
    };
  } catch {
    // Tenta o proxy do backend como segunda tentativa
    try {
      const res = await fetch('/api/market-rates');
      if (!res.ok) throw new Error('backend_fail');
      rates = await res.json();
    } catch {
      rates = RATES_FALLBACK;
    }
  }

  _cachedRates = rates;
  renderRateCards(rates);
  drawBanksChart(rates.cdi.value);
  const cdiInput = document.getElementById('sim-cdi-annual');
  if (cdiInput && !cdiInput.value) cdiInput.value = rates.cdi.value.toFixed(2);
  runSimulator();

  const cmpCdi  = document.getElementById('cmp-cdi');
  const cmpIpca = document.getElementById('cmp-ipca');
  if (cmpCdi  && !cmpCdi.value)  cmpCdi.value  = rates.cdi.value.toFixed(2);
  if (cmpIpca && !cmpIpca.value) cmpIpca.value = rates.ipca.value.toFixed(2);
  runComparison();
}

function renderRateCards(rates) {
  const grid      = document.getElementById('rates-grid');
  const updatedEl = document.getElementById('rates-updated');
  if (!grid) return;
  if (updatedEl) {
    if (rates.selic.fallback) {
      updatedEl.textContent = 'Valores de referência (BCB indisponível)';
      updatedEl.style.color = 'var(--yellow)';
    } else {
      updatedEl.textContent = `Atualizado em ${rates.selic.date}`;
      updatedEl.style.color = '';
    }
  }

  const realYield  = rates.selic.value - rates.ipca.value;
  const realColor  = realYield >= 0 ? '#10b981' : '#ef4444';
  const realIcon   = realYield >= 0 ? '📈' : '📉';
  const realPrefix = realYield >= 0 ? '+' : '';

  const cards = [
    {
      accent: '#6366f1',
      icon:   '🏛️',
      label:  'SELIC Meta',
      value:  rates.selic.value,
      period: '% a.a.',
      note:   'Taxa básica definida pelo COPOM — piso de todos os juros da economia',
    },
    {
      accent: '#10b981',
      icon:   '💰',
      label:  'CDI',
      value:  rates.cdi.value,
      period: '% a.a.',
      note:   'Referência para CDB, LCI, LCA e fundos DI — acompanha a SELIC',
    },
    {
      accent: '#f59e0b',
      icon:   '📊',
      label:  'IPCA 12m',
      value:  rates.ipca.value,
      period: '% 12m',
      note:   'Inflação oficial acumulada nos últimos 12 meses',
    },
    {
      accent: realColor,
      icon:   realIcon,
      label:  'Juro Real',
      value:  realYield,
      period: '% a.a.',
      prefix: realPrefix,
      valueColor: realColor,
      note:   `SELIC − IPCA: seu dinheiro ${realYield >= 0 ? 'cresce acima' : 'perde para'} da inflação`,
    },
  ];

  grid.innerHTML = cards.map(c => `
    <div class="rate-card" style="--card-accent:${c.accent}">
      <div class="rate-card-header">
        <span class="rate-card-icon">${c.icon}</span>
        <span class="rate-card-label">${c.label}</span>
      </div>
      <div class="rate-card-value" ${c.valueColor ? `style="color:${c.valueColor}"` : ''}>
        ${c.prefix || ''}${fmtRate(c.value)}<span class="rate-unit">%</span>
      </div>
      <div class="rate-card-period">${c.period}</div>
      <div class="rate-card-note">${c.note}</div>
    </div>
  `).join('');
}

function fmtRate(v) {
  return v.toFixed(2).replace('.', ',');
}

// =============================================
//  BANKS CHART
// =============================================
function drawBanksChart(cdiAnnual) {
  const canvas = document.getElementById('banks-chart');
  if (!canvas) return;

  const parent = canvas.parentElement;
  const cs     = getComputedStyle(parent);
  const W      = Math.floor(parent.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) || 600;
  const sorted = [...BANKS].sort((a, b) => b.pct - a.pct);
  const barH   = 22;
  const gap    = 13;
  const pT     = 8, pB = 8;
  const H      = pT + sorted.length * (barH + gap) - gap + pB;

  canvas.width  = W;
  canvas.height = H;

  const ctx    = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  const pL     = 122;
  const pR     = 120;
  const trackW = W - pL - pR;
  const maxPct = Math.max(...sorted.map(b => b.pct));

  sorted.forEach(({ name, pct, color }, i) => {
    const bW  = (pct / maxPct) * trackW;
    const y   = pT + i * (barH + gap);
    const mid = y + barH / 2;

    // Bank name
    ctx.fillStyle    = chartFg(0.78);
    ctx.font         = '12px Inter';
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, pL - 10, mid);

    // Track background
    ctx.fillStyle = chartFg(0.06);
    ctx.beginPath(); rrect(ctx, pL, y, trackW, barH, 5); ctx.fill();

    // Gradient bar
    const g = ctx.createLinearGradient(pL, 0, pL + bW, 0);
    g.addColorStop(0, color);
    g.addColorStop(1, color + '99');
    ctx.fillStyle = g;
    ctx.beginPath(); rrect(ctx, pL, y, Math.max(bW, 6), barH, 5); ctx.fill();

    // Label: "100% CDI — 14,50% a.a."
    const effRate = cdiAnnual * pct / 100;
    const label   = `${pct}% CDI — ${effRate.toFixed(2).replace('.', ',')}% a.a.`;
    ctx.fillStyle    = chartFg(0.82);
    ctx.font         = '11px Inter';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, pL + bW + 9, mid);
  });

  _banksDrawn = true;
}

// =============================================
//  SIMULATOR
// =============================================
function setupSimulatorListeners() {
  ['sim-amount', 'sim-months', 'sim-cdi-annual'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', runSimulator);
  });

  document.querySelectorAll('.sim-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sim-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _simType = btn.dataset.type;
      runSimulator();
    });
  });
}

function runSimulator() {
  const amount    = parseFloat(document.getElementById('sim-amount')?.value)     || 1000;
  const months    = parseInt(document.getElementById('sim-months')?.value)        || 12;
  const cdiAnnual = parseFloat(document.getElementById('sim-cdi-annual')?.value)
                    || (_cachedRates?.cdi.value ?? 10.5);
  const exempt    = _simType === 'lci';

  if (amount <= 0 || months <= 0 || months > 600) return;

  const monthly = Math.pow(1 + cdiAnnual / 100, 1 / 12) - 1;

  const pts = [{ m: 0, total: amount, gross: 0, net: 0 }];
  for (let m = 1; m <= months; m++) {
    const total     = amount * Math.pow(1 + monthly, m);
    const gross     = total - amount;
    const tax       = exempt ? 0 : irRate(m * 30);
    const net       = gross * (1 - tax);
    pts.push({ m, total: amount + net, gross, net, tax });
  }

  drawSimChart(pts, amount);
  renderSimResults(pts[pts.length - 1], amount, months, exempt);
}

function drawSimChart(pts, principal) {
  const canvas = document.getElementById('sim-chart');
  if (!canvas) return;

  const W = canvas.parentElement.clientWidth || 500;
  const H = 200;
  canvas.width  = W;
  canvas.height = H;

  const ctx     = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  const months  = pts.length - 1;
  const maxVal  = pts[pts.length - 1].total;
  const minVal  = principal * 0.998;
  const range   = Math.max(maxVal - minVal, 1);

  const pL = 68, pR = 16, pT = 20, pB = 32;
  const cW = W - pL - pR;
  const cH = H - pT - pB;

  const gX = m => pL + (m / Math.max(months, 1)) * cW;
  const gY = v => pT + cH - ((v - minVal) / range) * cH;

  // Grid lines & Y labels
  ctx.strokeStyle = chartFg(0.07);
  ctx.lineWidth   = 1;
  ctx.font        = '10px Inter';
  ctx.fillStyle   = chartFg(0.45);
  ctx.textAlign   = 'right';
  ctx.textBaseline = 'middle';

  for (let i = 0; i <= 4; i++) {
    const y = pT + (cH / 4) * i;
    const v = maxVal - ((maxVal - principal) * i / 4);
    ctx.beginPath(); ctx.moveTo(pL, y); ctx.lineTo(W - pR, y); ctx.stroke();
    ctx.fillText(v >= 1000 ? `R$${(v / 1000).toFixed(1)}k` : `R$${v.toFixed(0)}`, pL - 5, y);
  }

  // X labels (months)
  ctx.fillStyle   = chartFg(0.4);
  ctx.textAlign   = 'center';
  ctx.textBaseline = 'top';
  const step = Math.max(1, Math.ceil(months / 8));
  for (let m = 0; m <= months; m += step) {
    ctx.fillText(`${m}m`, gX(m), H - pB + 6);
  }

  // Principal dashed baseline
  const baseY = gY(principal);
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = chartFg(0.18);
  ctx.lineWidth   = 1;
  ctx.beginPath(); ctx.moveTo(pL, baseY); ctx.lineTo(W - pR, baseY); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Filled gradient area
  const grad = ctx.createLinearGradient(0, pT, 0, pT + cH);
  grad.addColorStop(0, 'rgba(16,185,129,.32)');
  grad.addColorStop(1, 'rgba(16,185,129,.01)');

  ctx.beginPath();
  ctx.moveTo(gX(0), pT + cH);
  pts.forEach(p => ctx.lineTo(gX(p.m), gY(p.total)));
  ctx.lineTo(gX(months), pT + cH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.moveTo(gX(pts[0].m), gY(pts[0].total));
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1], curr = pts[i];
    const cpx  = (gX(prev.m) + gX(curr.m)) / 2;
    ctx.bezierCurveTo(cpx, gY(prev.total), cpx, gY(curr.total), gX(curr.m), gY(curr.total));
  }
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth   = 2.5;
  ctx.stroke();

  // End dot
  const last = pts[pts.length - 1];
  ctx.beginPath();
  ctx.arc(gX(last.m), gY(last.total), 5, 0, Math.PI * 2);
  ctx.fillStyle   = '#10b981';
  ctx.fill();
  ctx.strokeStyle = chartBg();
  ctx.lineWidth   = 2;
  ctx.stroke();
}

function renderSimResults(last, principal, months, exempt) {
  const el = document.getElementById('sim-results');
  if (!el) return;

  const fmt     = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const pctFmt  = v => (v * 100).toFixed(1).replace('.', ',') + '%';
  const gross   = last.gross;
  const ir      = exempt ? 0 : gross - last.net;
  const net     = last.net;
  const total   = principal + net;
  const taxRate = exempt ? 0 : last.tax;

  el.innerHTML = `
    <div class="sim-result-grid">
      <div class="sim-result-row">
        <span class="sim-result-label">Principal investido</span>
        <span class="sim-result-val">${fmt(principal)}</span>
      </div>
      <div class="sim-result-row">
        <span class="sim-result-label">Rendimento bruto</span>
        <span class="sim-result-val positive">+ ${fmt(gross)}</span>
      </div>
      <div class="sim-result-row">
        <span class="sim-result-label">Imposto de Renda ${exempt ? '' : `(${pctFmt(taxRate)})`}</span>
        ${exempt
          ? '<span class="sim-result-val exempt">Isento — LCI/LCA</span>'
          : `<span class="sim-result-val negative">− ${fmt(ir)}</span>`
        }
      </div>
      <div class="sim-result-divider"></div>
      <div class="sim-result-row total">
        <span class="sim-result-label">Total em ${months} ${months === 1 ? 'mês' : 'meses'}</span>
        <span class="sim-result-val positive">${fmt(total)}</span>
      </div>
    </div>
    ${!exempt ? `
    <p class="sim-ir-note">
      IR regressivo: 22,5% (até 180d) → 20% (até 360d) → 17,5% (até 720d) → 15% (acima de 720d)
    </p>` : ''}
  `;
}

// =============================================
//  MARKET DATA (IBOVESPA + CÂMBIO + CRYPTO)
// =============================================

const TICKER_META = {
  '^BVSP': { label: 'IBOVESPA', icon: '📈', color: '#6366f1', pts: true },
  'USD':   { label: 'Dólar',    icon: '🇺🇸', color: '#10b981' },
  'EUR':   { label: 'Euro',     icon: '🇪🇺', color: '#3b82f6' },
  'BTC':   { label: 'Bitcoin',  icon: '₿',   color: '#f59e0b' },
  'ETH':   { label: 'Ethereum', icon: 'Ξ',   color: '#8b5cf6' },
};

async function loadMarketData() {
  const tickerEl = document.getElementById('market-ticker');
  const tableEl  = document.getElementById('stocks-table');
  if (!tickerEl) return;

  // Loading skeletons
  tickerEl.innerHTML = Array(5).fill('<div class="ticker-skeleton"></div>').join('');
  if (tableEl) tableEl.innerHTML = '<div class="stocks-error">Carregando...</div>';

  // Fetch câmbio/crypto (awesomeapi — CORS aberto) e ações (backend)
  const [ibovResult, currencyResult] = await Promise.allSettled([
    fetch('/api/market-stocks').then(r => r.ok ? r.json() : Promise.reject()),
    fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL,BTC-BRL,ETH-BRL')
      .then(r => r.ok ? r.json() : Promise.reject()),
  ]);

  // ── Ticker ──────────────────────────────────────
  const tickerItems = [];

  // IBOVESPA from stocks result
  if (ibovResult.status === 'fulfilled') {
    const ibov = ibovResult.value.find(q => q.symbol === '^BVSP');
    if (ibov) {
      tickerItems.push({ key: '^BVSP', value: ibov.price, pct: ibov.pct, change: ibov.change });
    }
  }

  // Câmbio / crypto
  if (currencyResult.status === 'fulfilled') {
    const d = currencyResult.value;
    const map = [
      { key: 'USD', raw: d.USDBRL },
      { key: 'EUR', raw: d.EURBRL },
      { key: 'BTC', raw: d.BTCBRL },
      { key: 'ETH', raw: d.ETHBRL },
    ];
    map.forEach(({ key, raw }) => {
      if (!raw) return;
      tickerItems.push({
        key,
        value:  +raw.bid,
        pct:    +raw.pctChange,
        change: +raw.varBid,
      });
    });
  }

  if (tickerItems.length === 0) {
    tickerEl.innerHTML = '<p class="stocks-error">Dados do mercado indisponíveis no momento.</p>';
  } else {
    renderMarketTicker(tickerItems);
  }

  // Update timestamp
  const updEl = document.getElementById('market-updated');
  if (updEl) {
    const now = new Date();
    updEl.textContent = `Atualizado às ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  }

  // ── Stocks table ────────────────────────────────
  if (!tableEl) return;
  if (ibovResult.status === 'fulfilled') {
    const stocks = ibovResult.value.filter(q => q.symbol !== '^BVSP');
    renderStocksTable(stocks, tableEl);
  } else {
    tableEl.innerHTML = '<p class="stocks-error">Cotações indisponíveis. Os dados de ações dependem do Yahoo Finance — tente novamente em instantes.</p>';
  }
}

function renderMarketTicker(items) {
  const el = document.getElementById('market-ticker');
  if (!el) return;

  el.innerHTML = items.map(({ key, value, pct, change }) => {
    const meta    = TICKER_META[key] || { label: key, icon: '📊', color: '#6366f1' };
    const dir     = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
    const arrow   = pct > 0 ? '▲' : pct < 0 ? '▼' : '—';
    const pctFmt  = pct != null ? `${pct > 0 ? '+' : ''}${pct.toFixed(2).replace('.', ',')}%` : '—';

    let valFmt;
    if (meta.pts) {
      valFmt = value != null ? value.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' pts' : '—';
    } else if (key === 'BTC' || key === 'ETH') {
      valFmt = value != null ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }) : '—';
    } else {
      valFmt = value != null ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '—';
    }

    return `
      <div class="ticker-item" style="--ticker-color:${meta.color}">
        <div class="ticker-label">
          <span class="ticker-icon">${meta.icon}</span>
          ${meta.label}
        </div>
        <div class="ticker-value">${valFmt}</div>
        <div class="ticker-change ${dir}">${arrow} ${pctFmt}</div>
      </div>`;
  }).join('');
}

function renderStocksTable(stocks, tableEl) {
  if (!stocks.length) {
    tableEl.innerHTML = '<p class="stocks-error">Nenhuma ação disponível.</p>';
    return;
  }

  const fmtBRL = v => v != null
    ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : '—';

  tableEl.innerHTML = `
    <div class="stocks-table">
      <div class="stocks-header">
        <span>Código</span>
        <span>Empresa</span>
        <span>Preço</span>
        <span>Variação</span>
      </div>
      ${stocks.map(s => {
        const dir   = s.pct > 0 ? 'up' : s.pct < 0 ? 'down' : 'flat';
        const arrow = s.pct > 0 ? '▲' : s.pct < 0 ? '▼' : '—';
        const pctFmt = s.pct != null
          ? `${s.pct > 0 ? '+' : ''}${s.pct.toFixed(2).replace('.', ',')}%`
          : '—';
        return `
          <div class="stock-row">
            <span class="stock-ticker">${escHtml(s.symbol)}</span>
            <span class="stock-name">${escHtml(s.name)}</span>
            <span class="stock-price">${fmtBRL(s.price)}</span>
            <span class="stock-pct ${dir}">${arrow} ${pctFmt}</span>
          </div>`;
      }).join('')}
    </div>
    <p class="stocks-delay-note">* Cotações com delay de até 15 min. Fonte: Yahoo Finance</p>`;
}

// =============================================
//  COMPARISON SIMULATOR
// =============================================
function setupComparisonListeners() {
  ['cmp-amount', 'cmp-months', 'cmp-cdi', 'cmp-ipca'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', runComparison);
  });
}

function runComparison() {
  const amount = parseFloat(document.getElementById('cmp-amount')?.value) || 10000;
  const months = parseInt(document.getElementById('cmp-months')?.value)   || 24;
  const cdi    = parseFloat(document.getElementById('cmp-cdi')?.value)    || (_cachedRates?.cdi.value  ?? 10.5);
  const ipca   = parseFloat(document.getElementById('cmp-ipca')?.value)   || (_cachedRates?.ipca.value ?? 5.0);

  if (amount <= 0 || months <= 0 || months > 600) return;

  const mr = r => Math.pow(1 + r / 100, 1 / 12) - 1;
  const poupancaAnnual = cdi > 8.5 ? 6.168 : cdi * 0.7;

  const opts = [
    { name: 'Poupança',          rate: mr(poupancaAnnual), exempt: true,  tag: cdi > 8.5 ? '0,5%/mês' : '70% CDI'       },
    { name: 'CDB 90% CDI',       rate: mr(cdi * 0.9),      exempt: false, tag: '90% CDI'                                  },
    { name: 'CDB 100% CDI',      rate: mr(cdi),            exempt: false, tag: '100% CDI'                                 },
    { name: 'LCI/LCA 87% CDI',   rate: mr(cdi * 0.87),     exempt: true,  tag: '87% CDI · isento de IR'                  },
    { name: 'LCI/LCA 100% CDI',  rate: mr(cdi),            exempt: true,  tag: '100% CDI · isento de IR'                 },
    { name: 'Tesouro IPCA+6%',   rate: mr(ipca + 6),       exempt: false, tag: `IPCA (${fmtRate(ipca)}%) + 6% a.a.`      },
  ];

  const results = opts.map(o => {
    const gross = amount * Math.pow(1 + o.rate, months) - amount;
    const tax   = o.exempt ? 0 : gross * irRate(months * 30);
    const net   = gross - tax;
    return { ...o, gross, net, total: amount + net };
  }).sort((a, b) => b.net - a.net);

  const best = Math.max(results[0]?.net || 0, 1);
  const fmt  = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const el   = document.getElementById('cmp-results');
  if (!el) return;

  el.innerHTML = `
    <div class="cmp-table">
      ${results.map((r, i) => {
        const bar    = ((r.net / best) * 100).toFixed(1);
        const isBest = i === 0;
        return `
          <div class="cmp-row${isBest ? ' cmp-row-best' : ''}">
            <div class="cmp-row-meta">
              <span class="cmp-row-name">${r.name}${isBest ? ' <span class="cmp-best-badge">Melhor</span>' : ''}</span>
              <span class="cmp-row-tag">${r.tag}</span>
            </div>
            <div class="cmp-bar-wrap"><div class="cmp-bar-fill" style="width:${bar}%"></div></div>
            <div class="cmp-row-vals">
              <span class="cmp-val-total">${fmt(r.total)}</span>
              <span class="cmp-val-net">+${fmt(r.net)}</span>
            </div>
          </div>`;
      }).join('')}
    </div>
    <p class="projection-cdi-note">CDI: ${fmtRate(cdi)}% a.a. · IPCA: ${fmtRate(ipca)}% · Principal: ${fmt(amount)} · ${months} meses</p>`;
}

// =============================================
//  REDRAW ON RESIZE
// =============================================

// Redraw on resize when tab is active
window.addEventListener('resize', () => {
  const tab = document.getElementById('tab-investments');
  if (!tab?.classList.contains('active') || !_cachedRates) return;
  drawBanksChart(_cachedRates.cdi.value);
  runSimulator();
});
