'use strict';

// =============================================
//  PORTFOLIO — DATA MODEL & CRUD
// =============================================
let _portfolio     = [];
let _portfolioGoal = null;
let _pfFilter      = '';
let _pfShowAll     = false;

function _portfolioKey() { return 'atlas_pf_demo'; }
function _goalKey()      { return 'atlas_goal_demo'; }

const ASSET_OPTIONS_BY_TYPE = {
  'Ações': [
    'ABEV3','AZUL4','B3SA3','BBAS3','BBDC4','BEEF3','BPAC11','BRAP4',
    'BRFS3','CSAN3','CSNA3','EGIE3','EQTL3','FLRY3','GOLL4','HAPV3',
    'ITSA4','ITUB4','KLBN11','LREN3','MGLU3','MRFG3','MRVE3','MULT3',
    'PETR3','PETR4','PETZ3','QUAL3','RADL3','RAIL3','RDOR3','RENT3',
    'SBSP3','SLCE3','STBP3','SUZB3','TAEE11','TIMS3','TOTS3','UGPA3',
    'USIM5','VALE3','VIVT3','WEGE3','YDUQ3',
  ],
  'FIIs': [
    'BCFF11','BRCO11','BTLG11','CPTS11','HGBS11','HGLG11','HGRU11',
    'HSML11','KNRI11','MXRF11','RBRF11','RECR11','RVBI11','TGAR11',
    'URPR11','VISC11','VGIP11','VILG11','XPLG11','XPML11',
  ],
  'Stock': [
    'AAPL','ABBV','AMZN','BAC','BRK.B','C','CVX','DIS','GOOGL',
    'JNJ','JPM','KO','META','MSFT','NFLX','NVDA','PEP','PFE',
    'TSLA','UNH','V','WMT','XOM',
  ],
  'Reit': ['AMT','AVB','DLR','EQR','O','PLD','PSA','SPG','VNQ','WPC'],
  'BDRs': [
    'AAPL34','AMZO34','GOGL34','MSFT34','MVBI11','NVDC34','TSLA34',
  ],
  'ETFs': [
    'BOVA11','BRAX11','DIVO11','HASH11','IFIX11','IVVB11','PIBB11',
    'SMAL11','SMLL11','SPXI11',
  ],
  'ETFs Internacionais': [
    'IAU','IEF','IVV','QQQ','SCHD','SPY','VEA','VNQ','VTI','VOO',
  ],
  'Tesouro Direto': [
    'Tesouro Prefixado 2026','Tesouro Prefixado 2029','Tesouro Prefixado 2031',
    'Tesouro IPCA+ 2029','Tesouro IPCA+ 2035','Tesouro IPCA+ 2045',
    'Tesouro Selic 2027','Tesouro Selic 2029','Tesouro Selic 2031',
    'Tesouro RendA+ 2030','Tesouro RendA+ 2035',
    'Tesouro Educa+ 2030','Tesouro Educa+ 2040',
  ],
  'Renda Fixa (CDB/LCI/LCA/LC/LF/RDB)': [
    'CDB','LCI','LCA','LC','LF','RDB',
  ],
  'Outros': [],
};

const TYPE_COLORS = {
  'Ações':      '#3b82f6',
  'FIIs':       '#06b6d4',
  'Stock':      '#8b5cf6',
  'Reit':       '#ec4899',
  'BDRs':       '#f97316',
  'ETFs':       '#10b981',
  'ETFs Internacionais': '#6366f1',
  'Tesouro Direto': '#f59e0b',
  'Renda Fixa (CDB/LCI/LCA/LC/LF/RDB)': '#14b8a6',
  'Outros':     '#94a3b8',
};

const TYPE_SHORT = {
  'Ações':      'Ações',
  'FIIs':       'FIIs',
  'Stock':      'Stock',
  'Reit':       'Reit',
  'BDRs':       'BDRs',
  'ETFs':       'ETFs',
  'ETFs Internacionais': 'ETFs Int.',
  'Tesouro Direto': 'Tesouro',
  'Renda Fixa (CDB/LCI/LCA/LC/LF/RDB)': 'Renda Fixa',
  'Outros':     'Outros',
};

// ── CRUD ──────────────────────────────────────
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
    if (idx < 0) throw new Error('Lançamento não encontrado.');
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
  const el      = document.getElementById('portfolio-goal-section');
  const emptyEl = document.getElementById('inv-metas-empty');
  if (!el) return;

  const buys = _portfolio.filter(e => (e.transaction_type || 'compra') === 'compra');
  if (!_portfolioGoal) {
    el.style.display = 'none';
    emptyEl?.classList.remove('hidden');
    return;
  }
  emptyEl?.classList.add('hidden');

  const { name, amount, date } = _portfolioGoal;
  const portfolioTotal = buys.reduce((s, e) => s + +e.amount, 0);
  const total = _portfolioGoal.savedAmount != null ? _portfolioGoal.savedAmount : portfolioTotal;
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
        <div style="display:flex;align-items:center;gap:10px">
          <div class="portfolio-goal-pct-wrap">
            <span class="portfolio-goal-pct">${pct.toFixed(1).replace('.', ',')}%</span>
            <span class="portfolio-goal-pct-label">atingido</span>
          </div>
          <button class="btn-pf-action" onclick="openGoalModal()">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Editar
          </button>
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
  document.getElementById('goal-saved').value  = g?.savedAmount != null ? g.savedAmount : '';
  const clearBtn = document.getElementById('btn-goal-clear');
  if (clearBtn) clearBtn.style.display = g ? '' : 'none';
  openModal('modal-goal');
  document.getElementById('goal-name').focus();
}

function saveGoalModal() {
  const name        = document.getElementById('goal-name').value.trim();
  const amount      = parseFloat(document.getElementById('goal-amount').value);
  const date        = document.getElementById('goal-date').value;
  const savedRaw    = document.getElementById('goal-saved').value;
  const savedAmount = savedRaw !== '' ? parseFloat(savedRaw) : null;
  if (!name)               return toast?.('Preencha o nome da meta.', 'err');
  if (!amount || amount <= 0) return toast?.('Valor alvo inválido.', 'err');
  if (!date)               return toast?.('Selecione a data alvo.', 'err');
  _portfolioGoal = { name, amount, date, ...(savedAmount !== null && { savedAmount }) };
  localStorage.setItem(_goalKey(), JSON.stringify(_portfolioGoal));
  closeModal('modal-goal');
  renderPortfolioGoal();
  _renderDashGoalCard?.();
  toast?.('Meta salva!');
}

function clearGoalModal() {
  if (!confirm('Remover a meta financeira?')) return;
  _portfolioGoal = null;
  localStorage.removeItem(_goalKey());
  closeModal('modal-goal');
  renderPortfolioGoal();
  _renderDashGoalCard?.();
  toast?.('Meta removida.');
}

function getPortfolioGoalData() {
  const buys = _portfolio.filter(e => (e.transaction_type || 'compra') === 'compra');
  const portfolioTotal = buys.reduce((s, e) => s + +e.amount, 0);
  const totalSaved = _portfolioGoal?.savedAmount != null ? _portfolioGoal.savedAmount : portfolioTotal;
  return { goal: _portfolioGoal, totalSaved };
}

// ── Export CSV ─────────────────────────────────
function exportPortfolioCSV() {
  if (!_portfolio.length) return toast?.('Nenhum lançamento para exportar.', 'err');
  const headers = ['Data','Tipo','Ativo','Tipo de Ativo','Qtd','Preço','Outros Custos','Total'];
  const rows = _portfolio.map(e => [
    e.date,
    e.transaction_type || 'compra',
    e.asset,
    e.asset_type || '',
    e.quantity   != null ? +e.quantity   : '',
    e.price      != null ? +e.price      : '',
    e.other_costs != null ? +e.other_costs : '',
    (+e.amount).toFixed(2).replace('.', ','),
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

// =============================================
//  PORTFOLIO RENDER
// =============================================
function renderPortfolio() {
  renderInvSummaryGrid();
  renderPortfolioGoal();

  const hasData       = _portfolio.length > 0;
  const chartsRow     = document.getElementById('inv-charts-row');
  const assetsSection = document.getElementById('inv-assets-section');
  const emptyState    = document.getElementById('inv-empty-state');

  if (hasData) {
    chartsRow?.classList.remove('hidden');
    assetsSection?.classList.remove('hidden');
    emptyState?.classList.add('hidden');
    populateTypeFilters();
    drawEvolutionChart();
    drawAllocationDonut();
    renderAssetsTable();
  } else {
    chartsRow?.classList.add('hidden');
    assetsSection?.classList.add('hidden');
    emptyState?.classList.remove('hidden');
  }
}

// ── Summary Cards ──────────────────────────────
function _portfolioStats() {
  const now  = new Date();
  const buys  = _portfolio.filter(e => (e.transaction_type || 'compra') === 'compra');
  const sells = _portfolio.filter(e => e.transaction_type === 'venda');
  const buy_total  = buys.reduce((s, e) => s + +e.amount, 0);
  const sell_total = sells.reduce((s, e) => s + +e.amount, 0);
  const net_invested = buy_total - sell_total;

  let cdi_gain = 0;
  if (_cachedRates && net_invested > 0) {
    const cdiMonthly = Math.pow(1 + _cachedRates.cdi.value / 100, 1 / 12) - 1;
    cdi_gain = buys.reduce((sum, e) => {
      const d = new Date(e.date + 'T12:00:00');
      const m = Math.max((now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth()), 0);
      return sum + +e.amount * (Math.pow(1 + cdiMonthly, m) - 1);
    }, 0);
  }

  const patrimonio         = net_invested + cdi_gain;
  const variation_pct      = buy_total > 0 ? (cdi_gain / buy_total) * 100 : 0;
  const rentabilidade_pct  = buy_total > 0 ? (cdi_gain / buy_total) * 100 : 0;

  return { buy_total, sell_total, net_invested, cdi_gain, patrimonio, variation_pct, rentabilidade_pct };
}

function renderInvSummaryGrid() {
  const el = document.getElementById('inv-summary-grid');
  if (!el) return;
  const fmt    = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const { buy_total, net_invested, cdi_gain, patrimonio, variation_pct } = _portfolioStats();
  const varDir   = variation_pct >= 0 ? 'up' : 'down';
  const varArrow = variation_pct >= 0 ? '▲' : '▼';
  const gainSign = cdi_gain >= 0 ? '+' : '';
  const cdiAnnual = _cachedRates ? _cachedRates.cdi.value.toFixed(2).replace('.', ',') : '0,00';
  const rentVsCdi = _cachedRates && _cachedRates.cdi.value > 0
    ? Math.round(variation_pct / _cachedRates.cdi.value * 100)
    : 0;

  el.innerHTML = `
    <div class="inv-scard">
      <div class="inv-scard-top">
        <div class="inv-scard-icon-wrap">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20h20M6 20V10l6-6 6 6v10"/><path d="M10 20v-5h4v5"/></svg>
        </div>
        <span class="inv-scard-label">Patrimônio Total</span>
      </div>
      <div class="inv-scard-value">${fmt(patrimonio)}</div>
      <div class="inv-scard-sub">
        <span class="inv-scard-badge ${varDir}">${varArrow} ${Math.abs(variation_pct).toFixed(2).replace('.', ',')}% no ano</span>
        <span class="inv-scard-badge-secondary ${varDir}">${gainSign}${fmt(cdi_gain)}</span>
      </div>
      <div class="inv-scard-footer">Valor Investido <span>${fmt(net_invested)}</span></div>
    </div>

    <div class="inv-scard">
      <div class="inv-scard-top">
        <div class="inv-scard-icon-wrap">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
        </div>
        <span class="inv-scard-label">Lucro Total</span>
      </div>
      <div class="inv-scard-value ${cdi_gain >= 0 ? 'green' : 'red'}">${gainSign}${fmt(cdi_gain)}</div>
      <div class="inv-scard-split">
        <div class="inv-scard-split-item">
          <span class="inv-scard-split-label">Ganho de Capital</span>
          <span class="inv-scard-split-val">${gainSign}${fmt(cdi_gain)}</span>
        </div>
        <div class="inv-scard-split-item">
          <span class="inv-scard-split-label">Dividendos Recebidos</span>
          <span class="inv-scard-split-val">${fmt(0)}</span>
        </div>
      </div>
    </div>

    <div class="inv-scard">
      <div class="inv-scard-top">
        <div class="inv-scard-icon-wrap">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
        </div>
        <span class="inv-scard-label">Proventos Recebidos (12M)</span>
      </div>
      <div class="inv-scard-value">${fmt(0)}</div>
      <div class="inv-scard-footer">Total <span>${fmt(0)}</span></div>
    </div>

    <div class="inv-scard inv-scard-double">
      <div class="inv-scard-half">
        <div class="inv-scard-top">
          <div class="inv-scard-icon-wrap small">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/></svg>
          </div>
          <span class="inv-scard-label">Variação no Mês</span>
        </div>
        <div class="inv-scard-value small ${varDir}">${varArrow} ${Math.abs(variation_pct).toFixed(2).replace('.', ',')}%</div>
        <div class="inv-scard-footer">${gainSign}${fmt(cdi_gain)}</div>
      </div>
      <div class="inv-scard-divider"></div>
      <div class="inv-scard-half">
        <div class="inv-scard-top">
          <span class="inv-scard-label">Rentabilidade vs CDI</span>
        </div>
        <div class="inv-scard-value small ${varDir}">${varArrow} ${Math.abs(rentVsCdi)}% do CDI</div>
        <div class="inv-scard-footer inv-scard-footer-sub">CDI estimado ${cdiAnnual}% a.a.</div>
      </div>
    </div>
  `;

  requestAnimationFrame(() => {
    el.querySelectorAll('.inv-scard-value').forEach(v => _countUpCurrency(v));
  });
}

// ── Count-up animation ────────────────────────
function _countUpCurrency(el, duration) {
  duration = duration || 750;
  const raw = el.textContent.trim();
  if (!raw.includes('R$')) return;
  const num = parseFloat(raw.replace('R$', '').replace(/\./g, '').replace(',', '.').trim());
  if (isNaN(num) || num === 0) return;
  const fmt = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const start = performance.now();
  function step(now) {
    const t    = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    el.textContent = fmt(num * ease);
    if (t < 1) requestAnimationFrame(step);
    else el.textContent = fmt(num);
  }
  requestAnimationFrame(step);
}

// ── Evolution Bar Chart ────────────────────────
let _invPeriod     = '12';
let _invTypeFilter = 'all';
let _evoData       = [];
let _evoDraw       = {};
let _evoHovIdx     = -1;
let _evoCanvas     = null;

function populateTypeFilters() {
  const types = [...new Set(_portfolio.map(e => e.asset_type).filter(Boolean))];
  ['inv-type-filter', 'inv-alloc-filter'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="all">Todos</option>' +
      types.map(t => `<option value="${escHtml(t)}"${t === cur ? ' selected' : ''}>${escHtml(t)}</option>`).join('');
  });
}

function drawEvolutionChart() {
  const canvas = document.getElementById('inv-evolution-chart');
  if (!canvas) return;

  const periodMonths = _invPeriod === 'all' ? 9999 : parseInt(_invPeriod);
  const now = new Date();

  let slots = [];
  const numSlots = Math.min(periodMonths, 24);
  for (let i = numSlots - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    slots.push({ year: d.getFullYear(), month: d.getMonth() });
  }

  if (_invPeriod === 'all') {
    const keySet = new Set();
    _portfolio.forEach(e => {
      if (_invTypeFilter !== 'all' && e.asset_type !== _invTypeFilter) return;
      if ((e.transaction_type || 'compra') !== 'compra') return;
      const d = new Date(e.date + 'T12:00:00');
      keySet.add(`${d.getFullYear()}-${d.getMonth()}`);
    });
    if (keySet.size > 0) {
      slots = [...keySet].sort().slice(-24).map(k => {
        const [yr, mo] = k.split('-');
        return { year: +yr, month: +mo };
      });
    }
  }

  const cdiMonthly = _cachedRates ? Math.pow(1 + _cachedRates.cdi.value / 100, 1 / 12) - 1 : 0;

  _evoData = slots.map(sl => {
    const slotEnd = new Date(sl.year, sl.month + 1, 0);
    const entries = _portfolio.filter(e => {
      if ((e.transaction_type || 'compra') !== 'compra') return false;
      if (_invTypeFilter !== 'all' && e.asset_type !== _invTypeFilter) return false;
      const d = new Date(e.date + 'T12:00:00');
      return d <= slotEnd;
    });
    const applied = entries.reduce((s, e) => s + +e.amount, 0);
    const gain = _cachedRates ? entries.reduce((s, e) => {
      const d = new Date(e.date + 'T12:00:00');
      const m = Math.max(
        (slotEnd.getFullYear() - d.getFullYear()) * 12 + (slotEnd.getMonth() - d.getMonth()), 0
      );
      return s + +e.amount * (Math.pow(1 + cdiMonthly, m) - 1);
    }, 0) : 0;
    return { ...sl, applied, gain };
  }).filter(s => s.applied > 0);

  if (!_evoData.length) return;

  const W = canvas.parentElement?.clientWidth || 500;
  const H = 220;
  const pL = 10, pR = 10, pT = 16, pB = 28;
  const maxVal = Math.max(..._evoData.map(s => s.applied + s.gain), 1);
  const n      = _evoData.length;
  const slotW  = (W - pL - pR) / n;
  const bW     = Math.max(slotW * 0.62, 4);
  const bGap   = (slotW - bW) / 2;
  _evoDraw = { W, H, pL, pR, pT, pB, maxVal, n, slotW, bW, bGap };
  _evoCanvas = canvas;

  canvas.width  = W;
  canvas.height = H;
  _renderEvoLine(-1);

  if (!canvas._evoWired) {
    canvas._evoWired = true;
    canvas.addEventListener('mousemove', _onEvoMove);
    canvas.addEventListener('mouseleave', _onEvoLeave);
  }
}

function _renderEvoLine(hovIdx) {
  if (!_evoCanvas || !_evoData.length) return;
  const { W, H, pL, pR, pT, pB, maxVal } = _evoDraw;
  const cH  = H - pT - pB;
  const ctx = _evoCanvas.getContext('2d');
  const now = new Date();
  const n   = _evoData.length;
  ctx.clearRect(0, 0, W, H);

  const xOf = i => pL + (n === 1 ? (W - pL - pR) / 2 : (i / (n - 1)) * (W - pL - pR));
  const yOf = v => pT + cH - Math.max((v / maxVal) * cH, 0);

  // Subtle horizontal grid lines
  ctx.lineWidth = 1; ctx.setLineDash([]);
  for (let j = 1; j <= 3; j++) {
    const y = pT + (cH / 4) * j;
    ctx.beginPath();
    ctx.moveTo(pL, y); ctx.lineTo(W - pR, y);
    ctx.strokeStyle = chartFg(0.05);
    ctx.stroke();
  }

  if (n >= 2) {
    // Applied area fill
    const gradA = ctx.createLinearGradient(0, pT, 0, pT + cH);
    gradA.addColorStop(0, 'rgba(21,128,61,0.45)');
    gradA.addColorStop(1, 'rgba(21,128,61,0.03)');
    ctx.beginPath();
    ctx.moveTo(xOf(0), pT + cH);
    _evoData.forEach((sl, i) => ctx.lineTo(xOf(i), yOf(sl.applied)));
    ctx.lineTo(xOf(n - 1), pT + cH);
    ctx.closePath();
    ctx.fillStyle = gradA; ctx.fill();

    // Gain area between applied and total
    const hasGain = _evoData.some(s => s.gain > 0.01);
    if (hasGain) {
      const gradG = ctx.createLinearGradient(0, pT, 0, pT + cH);
      gradG.addColorStop(0, 'rgba(134,239,172,0.35)');
      gradG.addColorStop(1, 'rgba(134,239,172,0.03)');
      ctx.beginPath();
      _evoData.forEach((sl, i) => {
        if (i === 0) ctx.moveTo(xOf(i), yOf(sl.applied));
        else         ctx.lineTo(xOf(i), yOf(sl.applied));
      });
      for (let i = n - 1; i >= 0; i--) {
        ctx.lineTo(xOf(i), yOf(_evoData[i].applied + _evoData[i].gain));
      }
      ctx.closePath();
      ctx.fillStyle = gradG; ctx.fill();

      // Estimated gain line (dotted)
      ctx.beginPath();
      _evoData.forEach((sl, i) => {
        if (i === 0) ctx.moveTo(xOf(i), yOf(sl.applied + sl.gain));
        else         ctx.lineTo(xOf(i), yOf(sl.applied + sl.gain));
      });
      ctx.strokeStyle = '#86efac'; ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]);
    }

    // Applied line — smooth bezier curves
    ctx.beginPath();
    _evoData.forEach((sl, i) => {
      const x = xOf(i), y = yOf(sl.applied);
      if (i === 0) { ctx.moveTo(x, y); return; }
      const px = xOf(i - 1), py = yOf(_evoData[i - 1].applied);
      const cpx = (px + x) / 2;
      ctx.bezierCurveTo(cpx, py, cpx, y, x, y);
    });
    ctx.strokeStyle = '#15803d'; ctx.lineWidth = 2.5;
    ctx.setLineDash([]); ctx.stroke();
  }

  // Hover indicator
  if (hovIdx >= 0 && _evoData[hovIdx]) {
    const sl = _evoData[hovIdx];
    const x  = xOf(hovIdx), ya = yOf(sl.applied);
    ctx.beginPath(); ctx.moveTo(x, pT); ctx.lineTo(x, pT + cH);
    ctx.strokeStyle = chartFg(0.18); ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(x, ya, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#22c55e'; ctx.fill();
    ctx.strokeStyle = chartBg(); ctx.lineWidth = 2; ctx.stroke();
    if (sl.gain > 0.01) {
      const yt = yOf(sl.applied + sl.gain);
      ctx.beginPath(); ctx.arc(x, yt, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#86efac'; ctx.fill();
      ctx.strokeStyle = chartBg(); ctx.lineWidth = 2; ctx.stroke();
    }
  }

  // X-axis labels
  const step = Math.max(1, Math.ceil(n / 8));
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  _evoData.forEach((sl, i) => {
    const isNow = sl.year === now.getFullYear() && sl.month === now.getMonth();
    if (i !== 0 && i !== n - 1 && i % step !== 0 && !isNow) return;
    const mo = String(sl.month + 1).padStart(2, '0');
    const yr = String(sl.year).slice(2);
    ctx.fillStyle = isNow ? chartFg(0.85) : chartFg(0.4);
    ctx.font      = isNow ? 'bold 9px Inter' : '9px Inter';
    ctx.fillText(`${mo}/${yr}`, xOf(i), H - pB + 4);
  });
}

function _onEvoMove(e) {
  const canvas = e.currentTarget;
  const r  = canvas.getBoundingClientRect();
  const mx = (e.clientX - r.left) * (canvas.width / r.width);
  const { pL, pR, W } = _evoDraw;
  const n = _evoData.length;

  let newHov = -1;
  if (n > 0) {
    let minDist = Infinity;
    _evoData.forEach((_, i) => {
      const x = pL + (n === 1 ? (W - pL - pR) / 2 : (i / (n - 1)) * (W - pL - pR));
      const d = Math.abs(mx - x);
      if (d < minDist) { minDist = d; newHov = i; }
    });
    if (minDist > 30) newHov = -1;
  }

  if (newHov !== _evoHovIdx) {
    _evoHovIdx = newHov;
    _renderEvoLine(newHov);
  }
  if (newHov >= 0) _showEvoTooltip(e, newHov);
  else _hideEvoTooltip();
}

function _onEvoLeave() {
  _evoHovIdx = -1;
  _renderEvoLine(-1);
  _hideEvoTooltip();
}

function _showEvoTooltip(e, idx) {
  let tip = document.getElementById('inv-evo-tooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'inv-evo-tooltip';
    tip.className = 'inv-evo-tooltip';
    document.body.appendChild(tip);
  }
  const sl  = _evoData[idx];
  const fmt = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const mo  = String(sl.month + 1).padStart(2, '0');
  tip.innerHTML = `
    <div class="evo-tip-month">${mo}/${sl.year}</div>
    <div class="evo-tip-row"><span>Investido</span><span>${fmt(sl.applied)}</span></div>
    ${sl.gain > 0.01 ? `<div class="evo-tip-row gain"><span>Ganho est.</span><span>+${fmt(sl.gain)}</span></div>` : ''}
    <div class="evo-tip-row total"><span>Total</span><span>${fmt(sl.applied + sl.gain)}</span></div>
  `;
  const vw = window.innerWidth, vh = window.innerHeight;
  let tx = e.clientX + 14, ty = e.clientY - 10;
  if (tx + 160 > vw) tx = e.clientX - 160;
  if (ty + 100 > vh) ty = e.clientY - 100;
  tip.style.left    = tx + 'px';
  tip.style.top     = ty + 'px';
  tip.style.display = 'block';
}

function _hideEvoTooltip() {
  const tip = document.getElementById('inv-evo-tooltip');
  if (tip) tip.style.display = 'none';
}

// ── Allocation Donut ───────────────────────────
let _invDonutSlices = [];
let _invDonutHov    = -1;
let _invDonutCtx    = null;
let _invDonutGeo    = {};

function drawAllocationDonut() {
  const canvas = document.getElementById('inv-donut-chart');
  if (!canvas) return;

  const filter = document.getElementById('inv-alloc-filter')?.value || 'all';
  const totals = {};
  _portfolio.forEach(e => {
    if ((e.transaction_type || 'compra') !== 'compra') return;
    if (filter !== 'all' && e.asset_type !== filter) return;
    const key = e.asset_type || 'Outros';
    totals[key] = (totals[key] || 0) + +e.amount;
  });

  const total = Object.values(totals).reduce((s, v) => s + v, 0);
  if (total === 0) { canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height); return; }
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);

  const size = Math.min(canvas.parentElement?.clientWidth || 160, 160);
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  _invDonutCtx = ctx;

  const cx = size / 2, cy = size / 2;
  const OR = size * 0.43, IR = size * 0.27;
  _invDonutGeo = { cx, cy, OR, IR, size };

  let angle = -Math.PI / 2;
  _invDonutSlices = sorted.map(([type, val]) => {
    const sweep = (val / total) * Math.PI * 2;
    const sa    = angle;
    angle      += sweep;
    return { type, val, pct: (val / total * 100).toFixed(1), sa, ea: angle, color: TYPE_COLORS[type] || '#94a3b8' };
  });

  _invDonutHov = -1;
  _redrawDonut(-1);

  const legEl = document.getElementById('inv-donut-legend');
  if (legEl) {
    legEl.innerHTML = _invDonutSlices.map((sl, i) => `
      <div class="inv-donut-leg-item" data-idx="${i}">
        <div class="inv-donut-leg-dot" style="background:${sl.color}"></div>
        <span class="inv-donut-leg-name">${escHtml(TYPE_SHORT[sl.type] || sl.type)}</span>
        <span class="inv-donut-leg-pct">${sl.pct}%</span>
      </div>`).join('');

    legEl.querySelectorAll('.inv-donut-leg-item').forEach(item => {
      const idx = +item.dataset.idx;
      item.addEventListener('mouseenter', () => { _invDonutHov = idx; _redrawDonut(idx); });
      item.addEventListener('mouseleave', () => { _invDonutHov = -1; _redrawDonut(-1); });
    });
  }

  canvas.onmousemove = e => {
    const r = canvas.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (size / r.width);
    const my = (e.clientY - r.top)  * (size / r.height);
    const dist = Math.hypot(mx - cx, my - cy);
    if (dist < IR || dist > OR + 8) {
      if (_invDonutHov !== -1) { _invDonutHov = -1; _redrawDonut(-1); }
      return;
    }
    let rel = (Math.atan2(my - cy, mx - cx) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
    const idx = _invDonutSlices.findIndex(sl => {
      let sa = (sl.sa + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
      let ea = (sl.ea + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
      return sa <= ea ? rel >= sa && rel <= ea : rel >= sa || rel <= ea;
    });
    if (idx !== _invDonutHov) { _invDonutHov = idx; _redrawDonut(idx); }
  };
  canvas.onmouseleave = () => { _invDonutHov = -1; _redrawDonut(-1); };
}

function _redrawDonut(hovIdx) {
  if (!_invDonutCtx || !_invDonutSlices.length) return;
  const ctx = _invDonutCtx;
  const { cx, cy, OR, IR, size } = _invDonutGeo;
  ctx.clearRect(0, 0, size, size);

  _invDonutSlices.forEach((sl, i) => {
    const expand = i === hovIdx ? 6 : 0;
    const mid    = sl.sa + (sl.ea - sl.sa) / 2;
    const ox = expand * Math.cos(mid), oy = expand * Math.sin(mid);
    ctx.beginPath();
    ctx.moveTo(cx + ox, cy + oy);
    ctx.arc(cx + ox, cy + oy, OR + (i === hovIdx ? 3 : 0), sl.sa, sl.ea);
    ctx.closePath();
    ctx.fillStyle   = sl.color;
    ctx.globalAlpha = (hovIdx >= 0 && i !== hovIdx) ? 0.3 : 1;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = chartBg();
    ctx.lineWidth   = 2;
    ctx.stroke();
  });

  ctx.beginPath(); ctx.arc(cx, cy, IR, 0, Math.PI * 2);
  ctx.fillStyle = chartBg(); ctx.fill();

  const fmt = v => v >= 1000 ? `R$${(v / 1000).toFixed(1)}k` : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  ctx.fillStyle = chartFg(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (hovIdx >= 0 && _invDonutSlices[hovIdx]) {
    const sl = _invDonutSlices[hovIdx];
    ctx.font = 'bold 10px Inter'; ctx.fillText(fmt(sl.val), cx, cy - 6);
    ctx.font = '9px Inter'; ctx.fillStyle = chartFg(0.5); ctx.fillText(sl.pct + '%', cx, cy + 7);
  } else {
    const tot = _invDonutSlices.reduce((s, sl) => s + sl.val, 0);
    ctx.font = 'bold 10px Inter'; ctx.fillText(fmt(tot), cx, cy);
  }
}

// ── Assets Table ───────────────────────────────
let _expandedAssets = new Set();

function renderAssetsTable() {
  const tableEl  = document.getElementById('inv-assets-table');
  const countEl  = document.getElementById('inv-assets-count');
  const footerEl = document.getElementById('inv-assets-footer');
  if (!tableEl) return;

  const filterInput = document.getElementById('pf-filter-text');
  if (filterInput && !filterInput._wired) {
    filterInput._wired = true;
    filterInput.addEventListener('input', e => {
      _pfFilter  = e.target.value.trim().toLowerCase();
      _pfShowAll = false;
      renderAssetsTable();
    });
  }
  if (filterInput) filterInput.value = _pfFilter;

  const fmt     = v => (+v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // Group by asset name
  const grouped = new Map();
  _portfolio.forEach(e => {
    const key = e.asset;
    if (!grouped.has(key)) grouped.set(key, { asset: e.asset, asset_type: e.asset_type || 'Outros', entries: [] });
    grouped.get(key).entries.push(e);
  });

  let items = [...grouped.values()];
  if (_pfFilter) items = items.filter(it => it.asset.toLowerCase().includes(_pfFilter) || (it.asset_type || '').toLowerCase().includes(_pfFilter));

  if (countEl) countEl.textContent = `(${items.length})`;

  const limit   = _pfShowAll ? items.length : 15;
  const visible = items.slice(0, limit);

  const now        = new Date();
  const cdiMonthly = _cachedRates ? Math.pow(1 + _cachedRates.cdi.value / 100, 1 / 12) - 1 : 0;

  const MONTHS = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

  tableEl.innerHTML = `
    <div class="inv-assets-head">
      <span></span>
      <span>Ativo</span>
      <span>Tipo</span>
      <span>Qtd / Lançamentos</span>
      <span>Total Investido</span>
      <span>Estimativa</span>
      <span></span>
    </div>
    ${visible.map(it => {
      const buys  = it.entries.filter(e => (e.transaction_type || 'compra') === 'compra');
      const sells = it.entries.filter(e => e.transaction_type === 'venda');
      const totalBuy  = buys.reduce((s, e) => s + +e.amount, 0);
      const totalSell = sells.reduce((s, e) => s + +e.amount, 0);
      const netTotal  = totalBuy - totalSell;
      const totalQty  = buys.reduce((s, e) => s + (e.quantity != null ? +e.quantity : 0), 0)
                      - sells.reduce((s, e) => s + (e.quantity != null ? +e.quantity : 0), 0);
      const hasQty    = buys.some(e => e.quantity != null && +e.quantity > 0);
      const estVal    = _cachedRates ? buys.reduce((sum, e) => {
        const d = new Date(e.date + 'T12:00:00');
        const m = Math.max((now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth()), 0);
        return sum + +e.amount * Math.pow(1 + cdiMonthly, m);
      }, 0) - totalSell : netTotal;
      const gain      = estVal - netTotal;
      const gainPct   = netTotal > 0 ? ((gain / netTotal) * 100).toFixed(2).replace('.', ',') : '0,00';
      const gainDir   = gain >= 0 ? 'up' : 'down';
      const color     = TYPE_COLORS[it.asset_type] || '#94a3b8';
      const shortType = TYPE_SHORT[it.asset_type] || it.asset_type;
      const expanded  = _expandedAssets.has(it.asset);
      const hasMulti  = it.entries.length > 1;

      const subRows = expanded ? `
        <div class="inv-asset-sub" data-asset="${escHtml(it.asset)}">
          <div class="inv-sub-head">
            <span>Data</span><span>Tipo</span><span>Qtd</span><span>Preço</span><span>Total</span><span></span>
          </div>
          ${it.entries.sort((a, b) => b.date.localeCompare(a.date)).map(e => {
            const d   = new Date(e.date + 'T12:00:00');
            const isBuy = (e.transaction_type || 'compra') === 'compra';
            return `
              <div class="inv-sub-row">
                <span class="inv-sub-date">${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}</span>
                <span class="inv-sub-type ${isBuy ? 'buy' : 'sell'}">${isBuy ? 'Compra' : 'Venda'}</span>
                <span class="inv-sub-qty">${e.quantity != null ? (+e.quantity).toLocaleString('pt-BR', { maximumFractionDigits: 4 }) + ' un' : '—'}</span>
                <span class="inv-sub-price">${e.price != null ? fmt(+e.price) : '—'}</span>
                <span class="inv-sub-total">${fmt(+e.amount)}</span>
                <span class="inv-sub-actions">
                  <button class="btn-asset-edit btn-sub-edit" data-id="${escHtml(e.id)}" data-asset="${escHtml(it.asset)}" title="Editar">✏</button>
                  <button class="btn-entry-delete btn-sub-del" data-id="${escHtml(e.id)}" data-asset="${escHtml(it.asset)}" title="Remover">✕</button>
                </span>
              </div>`;
          }).join('')}
        </div>` : '';

      return `
        <div class="inv-asset-row${expanded ? ' is-expanded' : ''}" data-asset="${escHtml(it.asset)}">
          <button class="btn-asset-expand${!hasMulti ? ' single' : ''}" data-asset="${escHtml(it.asset)}" title="${expanded ? 'Recolher' : 'Ver lançamentos'}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" class="expand-chevron${expanded ? ' open' : ''}"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <div class="inv-asset-info">
            <span class="inv-asset-ticker">${escHtml(it.asset)}</span>
          </div>
          <div>
            <span class="inv-asset-type-badge" style="background:${color}20;color:${color};border:1px solid ${color}40">${escHtml(shortType)}</span>
          </div>
          <div class="inv-asset-qty">
            ${hasQty && totalQty > 0
              ? `<span>${totalQty.toLocaleString('pt-BR', { maximumFractionDigits: 4 })} un</span>`
              : `<span>${it.entries.length} lançamento${it.entries.length !== 1 ? 's' : ''}</span>`}
          </div>
          <div class="inv-asset-invested">${fmt(netTotal)}</div>
          <div class="inv-asset-est">
            <span class="inv-asset-est-val">${fmt(estVal)}</span>
            <span class="inv-asset-gain ${gainDir}">${gain >= 0 ? '+' : ''}${fmt(gain)} (${gain >= 0 ? '+' : ''}${gainPct}%)</span>
          </div>
          <div class="inv-asset-actions">
            <button class="btn-asset-edit" data-id="${escHtml(it.entries[0]?.id || '')}" data-asset="${escHtml(it.asset)}" title="Editar último lançamento">✏</button>
            <button class="btn-entry-delete" data-asset="${escHtml(it.asset)}" title="Remover todos">✕</button>
          </div>
        </div>
        ${subRows}`;
    }).join('')}
  `;

  if (footerEl) {
    if (!_pfShowAll && items.length > 15) {
      footerEl.innerHTML = `<div class="portfolio-entries-more">Mostrando ${visible.length} de ${items.length} · <button class="btn-link" id="btn-pf-showall">Ver todos</button></div>`;
      footerEl.querySelector('#btn-pf-showall')?.addEventListener('click', () => { _pfShowAll = true; renderAssetsTable(); });
    } else if (_pfShowAll && items.length > 15) {
      footerEl.innerHTML = `<div class="portfolio-entries-more">${items.length} ativos · <button class="btn-link" id="btn-pf-hideall">Mostrar menos</button></div>`;
      footerEl.querySelector('#btn-pf-hideall')?.addEventListener('click', () => { _pfShowAll = false; renderAssetsTable(); });
    } else {
      footerEl.innerHTML = '';
    }
  }

  // Expand/collapse
  tableEl.querySelectorAll('.btn-asset-expand').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const asset = btn.dataset.asset;
      if (_expandedAssets.has(asset)) _expandedAssets.delete(asset);
      else _expandedAssets.add(asset);
      renderAssetsTable();
    });
  });

  // Edit (row-level — opens latest entry)
  tableEl.querySelectorAll('.btn-asset-edit').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openPortfolioModal(btn.dataset.id);
    });
  });

  // Delete — row-level (all entries for asset) vs sub-row (single entry)
  tableEl.querySelectorAll('.btn-entry-delete').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const singleId = btn.dataset.id;
      const asset    = btn.dataset.asset;
      if (singleId && btn.classList.contains('btn-sub-del')) {
        if (!confirm(`Remover este lançamento de "${asset}"?`)) return;
        try { await deletePortfolioEntry(singleId); } catch { toast?.('Erro ao remover.', 'err'); }
      } else {
        const toDelete = _portfolio.filter(e => e.asset === asset);
        const msg = toDelete.length === 1
          ? `Remover o lançamento de "${asset}"?`
          : `Remover todos os ${toDelete.length} lançamentos de "${asset}"?`;
        if (!confirm(msg)) return;
        try { for (const e of toDelete) await deletePortfolioEntry(e.id); }
        catch { toast?.('Erro ao remover.', 'err'); }
      }
    });
  });
}

// =============================================
//  MODAL — ADICIONAR / EDITAR LANÇAMENTO
// =============================================
function openPortfolioModal(editId) {
  const modal = document.getElementById('modal-portfolio');
  if (!modal) return;

  const isEdit = Boolean(editId);
  document.getElementById('modal-portfolio-title').textContent = isEdit ? 'Editar Lançamento' : 'Adicionar Lançamento';
  document.getElementById('btn-pf-save').innerHTML = isEdit
    ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg> Salvar alterações'
    : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Adicionar Lançamento';

  document.getElementById('pf-edit-id').value = editId || '';

  if (isEdit) {
    const entry = _portfolio.find(e => e.id === editId);
    if (!entry) return;
    _setLcTab(entry.transaction_type || 'compra');
    const assetType = entry.asset_type || 'Ações';
    _setAssetType(assetType);
    populateAssetOptions(assetType, entry.asset);
    document.getElementById('pf-date').value        = entry.date;
    document.getElementById('pf-quantity').value    = entry.quantity   ?? 1;
    document.getElementById('pf-price').value       = entry.price      ?? entry.amount;
    document.getElementById('pf-other-costs').value = entry.other_costs ?? 0;
  } else {
    _setLcTab('compra');
    _setAssetType('Ações');
    populateAssetOptions('Ações');
    document.getElementById('pf-date').value        = new Date().toISOString().slice(0, 10);
    document.getElementById('pf-quantity').value    = '1';
    document.getElementById('pf-price').value       = '0';
    document.getElementById('pf-other-costs').value = '0';
  }

  _updateTotalDisplay();
  openModal('modal-portfolio');
}

function closePortfolioModal() {
  closeModal('modal-portfolio');
}

function _setLcTab(type) {
  document.getElementById('pf-transaction-type').value = type;
  document.querySelectorAll('.lc-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === type);
  });
  const dateLabel = document.querySelector('label[for="pf-date"]');
  if (dateLabel) dateLabel.textContent = type === 'venda' ? 'Data da venda' : 'Data da compra';
}

const _typeIcons = {
  'Ações':      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>',
  'FIIs':       '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="1"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
  'Stock':      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
  'Reit':       '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  'BDRs':       '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
  'ETFs':       '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
  'ETFs Internacionais': '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>',
  'Tesouro Direto': '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12 2 20 7 4 7 12 2"/></svg>',
  'Renda Fixa (CDB/LCI/LCA/LC/LF/RDB)': '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>',
  'Outros':     '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
};

const _typeShortLabels = {
  'Renda Fixa (CDB/LCI/LCA/LC/LF/RDB)': 'Renda Fixa',
  'ETFs Internacionais': 'ETFs Int.',
};

function _setAssetType(value) {
  const hidden = document.getElementById('pf-asset-type');
  const iconEl = document.getElementById('lc-type-sel-icon');
  const textEl = document.getElementById('lc-type-sel-text');
  if (hidden) hidden.value = value;
  if (iconEl) iconEl.innerHTML = _typeIcons[value] || _typeIcons['Outros'];
  if (textEl) textEl.textContent = _typeShortLabels[value] || value;
  document.querySelectorAll('#lc-type-drop .lc-type-opt').forEach(b =>
    b.classList.toggle('selected', b.dataset.value === value)
  );
}

function _closeLcTypePicker() {
  document.getElementById('lc-type-drop')?.classList.add('hidden');
  document.getElementById('lc-type-picker')?.classList.remove('open');
}

function populateAssetOptions(type, selectedVal) {
  const hidden    = document.getElementById('pf-asset');
  const textInput = document.getElementById('pf-asset-input');
  const drop      = document.getElementById('pf-asset-drop');
  const pickerEl  = document.getElementById('pf-asset-picker');
  const iconEl    = document.getElementById('ap-icon');
  if (!hidden || !textInput || !drop) return;

  const opts = ASSET_OPTIONS_BY_TYPE[type] || [];
  if (iconEl) iconEl.innerHTML = _typeIcons[type] || _typeIcons['Outros'];

  hidden.value    = selectedVal || '';
  textInput.value = selectedVal || '';
  textInput.oninput  = null;
  textInput.onfocus  = null;
  drop.innerHTML  = '';
  drop.classList.add('hidden');
  pickerEl?.classList.remove('open');

  if (type === 'Outros' || opts.length === 0) {
    textInput.placeholder = 'Ex: XPTO3, CDB XYZ...';
    textInput.oninput = () => { hidden.value = textInput.value.trim(); };
    return;
  }

  textInput.placeholder = 'Buscar ativo...';

  function renderOpts(filter) {
    const q       = (filter || '').toLowerCase();
    const matches = q ? opts.filter(o => o.toLowerCase().includes(q)) : opts;
    if (!matches.length) {
      drop.innerHTML = '<div class="asset-picker-empty">Nenhum resultado</div>';
    } else {
      drop.innerHTML = matches.map(o =>
        `<button class="asset-option" type="button" data-val="${escHtml(o)}"><span class="asset-opt-badge">${escHtml(o)}</span><span class="asset-opt-name">${escHtml(o)}</span></button>`
      ).join('');
      drop.querySelectorAll('.asset-option').forEach(btn => {
        btn.addEventListener('mousedown', e => {
          e.preventDefault();
          hidden.value    = btn.dataset.val;
          textInput.value = btn.dataset.val;
          drop.classList.add('hidden');
          pickerEl?.classList.remove('open');
        });
      });
    }
  }

  textInput.oninput = () => {
    hidden.value = textInput.value.trim();
    renderOpts(textInput.value.trim());
    drop.classList.remove('hidden');
    pickerEl?.classList.add('open');
  };

  textInput.onfocus = () => {
    renderOpts(textInput.value.trim());
    drop.classList.remove('hidden');
    pickerEl?.classList.add('open');
  };

  textInput.onblur = () => {
    setTimeout(() => {
      drop.classList.add('hidden');
      pickerEl?.classList.remove('open');
    }, 150);
  };
}

function _updateTotalDisplay() {
  const qty   = parseFloat(document.getElementById('pf-quantity')?.value)    || 0;
  const price = parseFloat(document.getElementById('pf-price')?.value)        || 0;
  const other = parseFloat(document.getElementById('pf-other-costs')?.value) || 0;
  const total = qty * price + other;
  const dispEl = document.getElementById('pf-total-display');
  if (dispEl) dispEl.textContent = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

async function savePortfolioEntry() {
  const editId    = document.getElementById('pf-edit-id').value;
  const type      = document.getElementById('pf-transaction-type').value;
  const assetType = document.getElementById('pf-asset-type').value;
  const assetEl   = document.getElementById('pf-asset');
  const asset     = (assetEl?.value || '').trim();
  const date      = document.getElementById('pf-date').value;
  const quantity  = parseFloat(document.getElementById('pf-quantity').value);
  const price     = parseFloat(document.getElementById('pf-price').value) || 0;
  const other     = parseFloat(document.getElementById('pf-other-costs').value) || 0;
  const amount    = quantity * price + other;

  if (!date)                        return toast?.('Preencha a data.', 'err');
  if (!asset)                       return toast?.('Selecione ou informe o ativo.', 'err');
  if (!quantity || quantity <= 0)   return toast?.('Quantidade inválida.', 'err');
  if (amount <= 0)                  return toast?.('Valor total deve ser maior que zero.', 'err');

  const entry = {
    date, asset, asset_type: assetType,
    transaction_type: type,
    quantity, price, other_costs: other, amount,
  };

  const btn = document.getElementById('btn-pf-save');
  if (btn) btn.disabled = true;

  try {
    if (editId) {
      await updatePortfolioEntry(editId, entry);
      closePortfolioModal();
      toast?.('Lançamento atualizado!');
    } else {
      await addPortfolioEntry(entry);
      closePortfolioModal();
      toast?.('Lançamento registrado!');
    }
  } catch (err) {
    const msg  = err?.message || 'Erro ao salvar.';
    const m    = msg.toLowerCase();
    const hint = (m.includes('relation') || m.includes('table') || m.includes('column') || m.includes('schema'))
      ? ' Execute portfolio-migration.sql no Supabase SQL Editor.'
      : '';
    toast?.(msg + hint, 'err');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// =============================================
//  STATE
// =============================================
let _cachedRates = null;
let _invReady    = false;

// =============================================
//  INIT
// =============================================
function _switchInvTab(tab) {
  document.querySelectorAll('.inv-subnav-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.inv-subnav-btn[data-inv-tab="${tab}"]`)?.classList.add('active');
  document.querySelectorAll('.inv-tab-pane').forEach(p => p.classList.remove('active'));
  document.getElementById(`inv-tab-${tab}`)?.classList.add('active');
  if (tab === 'metas') renderPortfolioGoal();
  if (tab === 'carteira' && _portfolio.length) {
    requestAnimationFrame(() => { drawEvolutionChart(); drawAllocationDonut(); });
  }
}

async function initInvestments() {
  if (_invReady) {
    renderPortfolio();
    return;
  }
  _invReady = true;
  loadPortfolioGoal();

  // Sub-tab switching
  document.querySelectorAll('.inv-subnav-btn').forEach(btn => {
    btn.addEventListener('click', () => _switchInvTab(btn.dataset.invTab));
  });

  // Goal modal (from Metas tab) — btn-goal-* listeners live in bindEvents (app.js) so they work before this tab loads
  document.getElementById('btn-metas-goal-add')?.addEventListener('click', openGoalModal);

  // Export CSV
  document.getElementById('btn-portfolio-export')?.addEventListener('click', exportPortfolioCSV);

  // Open add-lancamento modal
  document.getElementById('btn-portfolio-add')?.addEventListener('click', () => openPortfolioModal());

  // Modal close/cancel
  document.getElementById('btn-pf-close')?.addEventListener('click', closePortfolioModal);
  document.getElementById('btn-pf-cancel')?.addEventListener('click', closePortfolioModal);

  // Modal save
  document.getElementById('btn-pf-save')?.addEventListener('click', savePortfolioEntry);

  // Compra/Venda tab switching
  document.querySelectorAll('.lc-tab').forEach(btn => {
    btn.addEventListener('click', () => _setLcTab(btn.dataset.type));
  });

  // Type picker — toggle
  document.getElementById('lc-type-trigger')?.addEventListener('click', () => {
    const drop = document.getElementById('lc-type-drop');
    const picker = document.getElementById('lc-type-picker');
    const isOpen = !drop?.classList.contains('hidden');
    if (isOpen) _closeLcTypePicker();
    else { drop?.classList.remove('hidden'); picker?.classList.add('open'); }
  });

  // Type picker — select option + populate SVG icons
  document.querySelectorAll('.lc-type-opt').forEach(btn => {
    const iconSpan = btn.querySelector('.lc-type-opt-icon');
    if (iconSpan) iconSpan.innerHTML = _typeIcons[btn.dataset.value] || _typeIcons['Outros'];
    btn.addEventListener('click', () => {
      const val = btn.dataset.value;
      _setAssetType(val);
      _closeLcTypePicker();
      populateAssetOptions(val);
      _updateTotalDisplay();
    });
  });

  // Inicializa ícone do trigger e do asset picker
  const selIcon = document.getElementById('lc-type-sel-icon');
  if (selIcon) selIcon.innerHTML = _typeIcons['Ações'];
  const apIcon = document.getElementById('ap-icon');
  if (apIcon) apIcon.innerHTML = _typeIcons['Ações'];

  // Close pickers on outside click
  document.addEventListener('click', e => {
    if (!e.target.closest('#lc-type-picker'))  _closeLcTypePicker();
    if (!e.target.closest('#pf-asset-picker')) {
      document.getElementById('pf-asset-drop')?.classList.add('hidden');
      document.getElementById('pf-asset-picker')?.classList.remove('open');
    }
  });

  // Price/qty/costs → recalculate total
  document.addEventListener('input', e => {
    if (['pf-quantity', 'pf-price', 'pf-other-costs'].includes(e.target.id)) {
      _updateTotalDisplay();
    }
  });

  // Evolution chart period/type filters
  document.getElementById('inv-period-filter')?.addEventListener('change', e => {
    _invPeriod = e.target.value;
    drawEvolutionChart();
  });
  document.getElementById('inv-type-filter')?.addEventListener('change', e => {
    _invTypeFilter = e.target.value;
    drawEvolutionChart();
  });

  // Donut alloc filter
  document.getElementById('inv-alloc-filter')?.addEventListener('change', () => drawAllocationDonut());

  // Load everything in parallel
  await Promise.all([loadMarketRates(), loadMarketData(), loadPortfolio()]);
  renderPortfolio();
}

// =============================================
//  MARKET RATES — BCB API (direto do browser)
// =============================================

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
    const [selicData, cdiData, ipcaData] = await Promise.all([
      bcbFetch(4390),
      bcbFetch(4391),
      bcbFetch(13522),
    ]);

    const parseVal  = arr => parseFloat((arr?.[0]?.valor || '0').replace(',', '.'));
    const dateOf    = arr => arr?.[0]?.data || '';
    const annualize = monthly => +((Math.pow(1 + monthly / 100, 12) - 1) * 100).toFixed(2);

    rates = {
      selic: { value: annualize(parseVal(selicData)), date: dateOf(selicData), unit: '% a.a.' },
      cdi:   { value: annualize(parseVal(cdiData)),   date: dateOf(cdiData),   unit: '% a.a.' },
      ipca:  { value: parseVal(ipcaData),             date: dateOf(ipcaData),  unit: '% 12m'  },
    };
  } catch {
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
  if (_portfolio.length) renderInvSummaryGrid();
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
    { accent: '#6366f1', icon: '🏛️', label: 'SELIC Meta',  value: rates.selic.value, period: '% a.a.', note: 'Taxa básica definida pelo COPOM — piso de todos os juros da economia' },
    { accent: '#10b981', icon: '💰', label: 'CDI',          value: rates.cdi.value,   period: '% a.a.', note: 'Referência para CDB, LCI, LCA e fundos DI — acompanha a SELIC' },
    { accent: '#f59e0b', icon: '📊', label: 'IPCA 12m',     value: rates.ipca.value,  period: '% 12m',  note: 'Inflação oficial acumulada nos últimos 12 meses' },
    { accent: realColor, icon: realIcon, label: 'Juro Real', value: realYield, period: '% a.a.', prefix: realPrefix, valueColor: realColor, note: `SELIC − IPCA: seu dinheiro ${realYield >= 0 ? 'cresce acima' : 'perde para'} da inflação` },
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

  tickerEl.innerHTML = Array(5).fill('<div class="ticker-skeleton"></div>').join('');
  if (tableEl) tableEl.innerHTML = '<div class="stocks-error">Carregando...</div>';

  const [ibovResult, currencyResult] = await Promise.allSettled([
    fetch('/api/market-stocks').then(r => r.ok ? r.json() : Promise.reject()),
    fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL,BTC-BRL,ETH-BRL')
      .then(r => r.ok ? r.json() : Promise.reject()),
  ]);

  const tickerItems = [];

  if (ibovResult.status === 'fulfilled') {
    const ibov = ibovResult.value.find(q => q.symbol === '^BVSP');
    if (ibov) tickerItems.push({ key: '^BVSP', value: ibov.price, pct: ibov.pct, change: ibov.change });
  }

  if (currencyResult.status === 'fulfilled') {
    const d   = currencyResult.value;
    const map = [
      { key: 'USD', raw: d.USDBRL },
      { key: 'EUR', raw: d.EURBRL },
      { key: 'BTC', raw: d.BTCBRL },
      { key: 'ETH', raw: d.ETHBRL },
    ];
    map.forEach(({ key, raw }) => {
      if (!raw) return;
      tickerItems.push({ key, value: +raw.bid, pct: +raw.pctChange, change: +raw.varBid });
    });
  }

  if (tickerItems.length === 0) {
    tickerEl.innerHTML = '<p class="stocks-error">Dados do mercado indisponíveis no momento.</p>';
  } else {
    renderMarketTicker(tickerItems);
  }

  const updEl = document.getElementById('market-updated');
  if (updEl) {
    const now = new Date();
    updEl.textContent = `Atualizado às ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  }

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
    const meta   = TICKER_META[key] || { label: key, icon: '📊', color: '#6366f1' };
    const dir    = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
    const arrow  = pct > 0 ? '▲' : pct < 0 ? '▼' : '—';
    const pctFmt = pct != null ? `${pct > 0 ? '+' : ''}${pct.toFixed(2).replace('.', ',')}%` : '—';

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
        <div class="ticker-label"><span class="ticker-icon">${meta.icon}</span>${meta.label}</div>
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

  const fmtBRL = v => v != null ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—';

  tableEl.innerHTML = `
    <div class="stocks-table">
      <div class="stocks-header">
        <span>Código</span><span>Empresa</span><span>Preço</span><span>Variação</span>
      </div>
      ${stocks.map(s => {
        const dir    = s.pct > 0 ? 'up' : s.pct < 0 ? 'down' : 'flat';
        const arrow  = s.pct > 0 ? '▲' : s.pct < 0 ? '▼' : '—';
        const pctFmt = s.pct != null ? `${s.pct > 0 ? '+' : ''}${s.pct.toFixed(2).replace('.', ',')}%` : '—';
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
//  REDRAW ON RESIZE
// =============================================
window.addEventListener('resize', () => {
  const tab = document.getElementById('tab-investments');
  if (!tab?.classList.contains('active')) return;
  if (_portfolio.length) {
    drawEvolutionChart();
    drawAllocationDonut();
  }
});
