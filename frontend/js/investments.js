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
  const el = document.getElementById('portfolio-goal-section');
  if (!el) return;
  const buys = _portfolio.filter(e => (e.transaction_type || 'compra') === 'compra');
  if (!_portfolioGoal || !buys.length) { el.style.display = 'none'; return; }
  const { name, amount, date } = _portfolioGoal;
  const total      = buys.reduce((s, e) => s + +e.amount, 0);
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

  el.innerHTML = `
    <div class="inv-scard">
      <div class="inv-scard-top">
        <div class="inv-scard-icon-wrap">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20h20M6 20V10l6-6 6 6v10"/><path d="M10 20v-5h4v5"/></svg>
        </div>
        <span class="inv-scard-label">Patrimônio total</span>
      </div>
      <div class="inv-scard-value">${fmt(patrimonio)}</div>
      <div class="inv-scard-sub">
        <span class="inv-scard-badge ${varDir}">${varArrow} ${Math.abs(variation_pct).toFixed(2).replace('.', ',')}%</span>
      </div>
      <div class="inv-scard-footer">Valor Investido <span>${fmt(net_invested)}</span></div>
    </div>

    <div class="inv-scard">
      <div class="inv-scard-top">
        <div class="inv-scard-icon-wrap">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
        </div>
        <span class="inv-scard-label">Lucro total</span>
      </div>
      <div class="inv-scard-value ${cdi_gain >= 0 ? 'green' : 'red'}">${fmt(cdi_gain)}</div>
      <div class="inv-scard-split">
        <div class="inv-scard-split-item">
          <span class="inv-scard-split-label">Ganho de Capital</span>
          <span class="inv-scard-split-val">${fmt(cdi_gain)}</span>
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
          <span class="inv-scard-label">Variação</span>
        </div>
        <div class="inv-scard-value small ${varDir}">${varArrow} ${Math.abs(variation_pct).toFixed(2).replace('.', ',')}%</div>
        <div class="inv-scard-footer">${fmt(cdi_gain)}</div>
      </div>
      <div class="inv-scard-divider"></div>
      <div class="inv-scard-half">
        <div class="inv-scard-top">
          <span class="inv-scard-label">Rentabilidade</span>
        </div>
        <div class="inv-scard-value small ${varDir}">${varArrow} ${Math.abs(variation_pct).toFixed(2).replace('.', ',')}%</div>
        <div class="inv-scard-footer inv-scard-footer-sub">CDI estimado</div>
      </div>
    </div>
  `;
}

// ── Evolution Bar Chart ────────────────────────
let _invPeriod     = '12';
let _invTypeFilter = 'all';

function populateTypeFilters() {
  const types = [...new Set(_portfolio.map(e => e.asset_type).filter(Boolean))];
  ['inv-type-filter', 'inv-alloc-filter'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="all">Todos os tipos</option>' +
      types.map(t => `<option value="${escHtml(t)}"${t === cur ? ' selected' : ''}>${escHtml(t)}</option>`).join('');
  });
}

function drawEvolutionChart() {
  const canvas = document.getElementById('inv-evolution-chart');
  if (!canvas) return;

  const periodMonths = _invPeriod === 'all' ? 9999 : parseInt(_invPeriod);
  const now = new Date();

  // Build month slots (last N months)
  const numSlots = Math.min(periodMonths, 24);
  let slots = [];
  for (let i = numSlots - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    slots.push({ year: d.getFullYear(), month: d.getMonth() });
  }

  // When "all": derive slots from actual data
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

  const slotData = slots.map(sl => {
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
        (slotEnd.getFullYear() - d.getFullYear()) * 12 + (slotEnd.getMonth() - d.getMonth()),
        0
      );
      return s + +e.amount * (Math.pow(1 + cdiMonthly, m) - 1);
    }, 0) : 0;
    return { ...sl, applied, gain };
  }).filter(s => s.applied > 0);

  if (!slotData.length) return;

  const W = canvas.parentElement?.clientWidth || 500;
  const H = 220;
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  const maxVal = Math.max(...slotData.map(s => s.applied + s.gain), 1);
  const n      = slotData.length;
  const pL = 10, pR = 10, pT = 16, pB = 28;
  const cH     = H - pT - pB;
  const slotW  = (W - pL - pR) / n;
  const bW     = Math.max(slotW * 0.62, 4);
  const bGap   = (slotW - bW) / 2;

  slotData.forEach((sl, i) => {
    const x      = pL + i * slotW + bGap;
    const totalH = Math.max(((sl.applied + sl.gain) / maxVal) * cH, 3);
    const gainH  = sl.applied > 0 ? Math.min((sl.gain / (sl.applied + sl.gain)) * totalH, totalH * 0.4) : 0;
    const appH   = totalH - gainH;
    const y      = pT + cH - totalH;
    const isNow  = sl.year === now.getFullYear() && sl.month === now.getMonth();

    // Applied (dark green, main body + rounded bottom)
    ctx.fillStyle = isNow ? '#15803d' : '#166534';
    ctx.beginPath(); rrect(ctx, x, y + gainH, bW, appH, gainH > 1 ? 0 : 3); ctx.fill();

    // Gain (light green, top cap with rounded top)
    if (gainH > 1) {
      ctx.fillStyle = '#86efac';
      ctx.beginPath(); rrect(ctx, x, y, bW, gainH + 2, 3); ctx.fill();
      // Re-draw applied bar without rounded top to mask the overlap
      ctx.fillStyle = isNow ? '#15803d' : '#166534';
      ctx.fillRect(x, y + gainH + 2, bW, appH - 2);
    }

    // Month label
    ctx.fillStyle    = chartFg(isNow ? 0.85 : 0.4);
    ctx.font         = isNow ? 'bold 9px Inter' : '9px Inter';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    const mo = String(sl.month + 1).padStart(2, '0');
    const yr = String(sl.year).slice(2);
    ctx.fillText(`${mo}/${yr}`, x + bW / 2, H - pB + 4);

    // Value label (only when bars are wide enough)
    if (bW >= 20 && sl.applied >= 100) {
      const fmtV = v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0);
      ctx.fillStyle    = chartFg(0.45);
      ctx.font         = '8px Inter';
      ctx.textBaseline = 'bottom';
      ctx.fillText(fmtV(sl.applied + sl.gain), x + bW / 2, y - 2);
    }
  });
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

  tableEl.innerHTML = `
    <div class="inv-assets-head">
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
      const hasQty = buys.some(e => e.quantity != null && +e.quantity > 0);

      const estVal = _cachedRates ? buys.reduce((sum, e) => {
        const d = new Date(e.date + 'T12:00:00');
        const m = Math.max((now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth()), 0);
        return sum + +e.amount * Math.pow(1 + cdiMonthly, m);
      }, 0) - totalSell : netTotal;

      const gain    = estVal - netTotal;
      const gainPct = netTotal > 0 ? ((gain / netTotal) * 100).toFixed(2).replace('.', ',') : '0,00';
      const gainDir = gain >= 0 ? 'up' : 'down';
      const color   = TYPE_COLORS[it.asset_type] || '#94a3b8';
      const shortType = TYPE_SHORT[it.asset_type] || it.asset_type;

      return `
        <div class="inv-asset-row">
          <div class="inv-asset-info">
            <span class="inv-asset-ticker">${escHtml(it.asset)}</span>
          </div>
          <div>
            <span class="inv-asset-type-badge" style="background:${color}20;color:${color};border:1px solid ${color}40">${escHtml(shortType)}</span>
          </div>
          <div class="inv-asset-qty">
            ${hasQty && totalQty > 0
              ? `<span>${totalQty.toLocaleString('pt-BR', { maximumFractionDigits: 4 })} un</span>`
              : `<span>${it.entries.length} lançamento${it.entries.length !== 1 ? 's' : ''}</span>`
            }
          </div>
          <div class="inv-asset-invested">${fmt(netTotal)}</div>
          <div class="inv-asset-est">
            <span class="inv-asset-est-val">${fmt(estVal)}</span>
            <span class="inv-asset-gain ${gainDir}">${gain >= 0 ? '+' : ''}${fmt(gain)} (${gain >= 0 ? '+' : ''}${gainPct}%)</span>
          </div>
          <div class="inv-asset-actions">
            <button class="btn-asset-edit" data-id="${escHtml(it.entries[0]?.id || '')}" data-asset="${escHtml(it.asset)}" title="Editar último lançamento">✏</button>
            <button class="btn-entry-delete" data-asset="${escHtml(it.asset)}" title="Remover lançamentos">✕</button>
          </div>
        </div>`;
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

  tableEl.querySelectorAll('.btn-asset-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const asset = btn.dataset.asset;
      const entries = _portfolio.filter(e => e.asset === asset);
      if (entries.length === 1) {
        openPortfolioModal(entries[0].id);
      } else if (entries.length > 1) {
        openPortfolioModal(entries[0].id);
      }
    });
  });

  tableEl.querySelectorAll('.btn-entry-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const asset = btn.dataset.asset;
      const toDelete = _portfolio.filter(e => e.asset === asset);
      const msg = toDelete.length === 1
        ? `Remover o lançamento de "${asset}"?`
        : `Remover todos os ${toDelete.length} lançamentos de "${asset}"?`;
      if (!confirm(msg)) return;
      try {
        for (const e of toDelete) await deletePortfolioEntry(e.id);
      } catch { toast?.('Erro ao remover.', 'err'); }
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
    document.getElementById('pf-asset-type').value = assetType;
    populateAssetOptions(assetType, entry.asset);
    document.getElementById('pf-date').value        = entry.date;
    document.getElementById('pf-quantity').value    = entry.quantity   ?? 1;
    document.getElementById('pf-price').value       = entry.price      ?? entry.amount;
    document.getElementById('pf-other-costs').value = entry.other_costs ?? 0;
  } else {
    _setLcTab('compra');
    document.getElementById('pf-asset-type').value = 'Ações';
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

function populateAssetOptions(type, selectedVal) {
  const oldEl = document.getElementById('pf-asset');
  if (!oldEl) return;
  const opts = ASSET_OPTIONS_BY_TYPE[type] || [];

  if (type === 'Outros' || opts.length === 0) {
    if (oldEl.tagName !== 'INPUT') {
      const input = document.createElement('input');
      input.type = 'text';
      input.id   = 'pf-asset';
      input.className = 'form-select';
      input.placeholder = 'Ex: XPTO3, CDB XYZ...';
      input.value = selectedVal || '';
      input.autocomplete = 'off';
      input.addEventListener('input', _updateTotalDisplay);
      oldEl.replaceWith(input);
    } else {
      oldEl.value = selectedVal || '';
    }
    return;
  }

  let selEl = oldEl;
  if (oldEl.tagName === 'INPUT') {
    const select = document.createElement('select');
    select.id = 'pf-asset';
    select.className = 'form-select';
    select.addEventListener('change', _updateTotalDisplay);
    oldEl.replaceWith(select);
    selEl = document.getElementById('pf-asset');
  }
  selEl.innerHTML = '<option value="">Selecionar</option>' +
    opts.map(o => `<option value="${escHtml(o)}"${o === selectedVal ? ' selected' : ''}>${escHtml(o)}</option>`).join('');
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
    const hint = msg.toLowerCase().includes('relation') || msg.toLowerCase().includes('table')
      ? ' Execute o SQL de migração no Supabase.'
      : '';
    toast?.(msg + hint, 'err');
  } finally {
    if (btn) btn.disabled = false;
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
let _cachedRates = null;
let _simType     = 'cdb';
let _invReady    = false;
let _banksDrawn  = false;

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

  // Asset type change → repopulate asset list
  document.getElementById('pf-asset-type')?.addEventListener('change', e => {
    populateAssetOptions(e.target.value);
    _updateTotalDisplay();
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
  drawBanksChart(rates.cdi.value);
  // Re-render portfolio summary now that rates are available
  if (_portfolio.length) renderInvSummaryGrid();

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

    ctx.fillStyle    = chartFg(0.78);
    ctx.font         = '12px Inter';
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, pL - 10, mid);

    ctx.fillStyle = chartFg(0.06);
    ctx.beginPath(); rrect(ctx, pL, y, trackW, barH, 5); ctx.fill();

    const g = ctx.createLinearGradient(pL, 0, pL + bW, 0);
    g.addColorStop(0, color);
    g.addColorStop(1, color + '99');
    ctx.fillStyle = g;
    ctx.beginPath(); rrect(ctx, pL, y, Math.max(bW, 6), barH, 5); ctx.fill();

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
    const total = amount * Math.pow(1 + monthly, m);
    const gross = total - amount;
    const tax   = exempt ? 0 : irRate(m * 30);
    const net   = gross * (1 - tax);
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

  const ctx    = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  const months = pts.length - 1;
  const maxVal = pts[pts.length - 1].total;
  const minVal = principal * 0.998;
  const range  = Math.max(maxVal - minVal, 1);

  const pL = 68, pR = 16, pT = 20, pB = 32;
  const cW = W - pL - pR;
  const cH = H - pT - pB;

  const gX = m => pL + (m / Math.max(months, 1)) * cW;
  const gY = v => pT + cH - ((v - minVal) / range) * cH;

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

  ctx.fillStyle    = chartFg(0.4);
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  const step = Math.max(1, Math.ceil(months / 8));
  for (let m = 0; m <= months; m += step) {
    ctx.fillText(`${m}m`, gX(m), H - pB + 6);
  }

  const baseY = gY(principal);
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = chartFg(0.18);
  ctx.lineWidth   = 1;
  ctx.beginPath(); ctx.moveTo(pL, baseY); ctx.lineTo(W - pR, baseY); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

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

  const fmt    = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const pctFmt = v => (v * 100).toFixed(1).replace('.', ',') + '%';
  const gross  = last.gross;
  const ir     = exempt ? 0 : gross - last.net;
  const net    = last.net;
  const total  = principal + net;
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
    { name: 'Poupança',         rate: mr(poupancaAnnual), exempt: true,  tag: cdi > 8.5 ? '0,5%/mês' : '70% CDI' },
    { name: 'CDB 90% CDI',      rate: mr(cdi * 0.9),      exempt: false, tag: '90% CDI' },
    { name: 'CDB 100% CDI',     rate: mr(cdi),            exempt: false, tag: '100% CDI' },
    { name: 'LCI/LCA 87% CDI',  rate: mr(cdi * 0.87),     exempt: true,  tag: '87% CDI · isento de IR' },
    { name: 'LCI/LCA 100% CDI', rate: mr(cdi),            exempt: true,  tag: '100% CDI · isento de IR' },
    { name: 'Tesouro IPCA+6%',  rate: mr(ipca + 6),       exempt: false, tag: `IPCA (${fmtRate(ipca)}%) + 6% a.a.` },
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
window.addEventListener('resize', () => {
  const tab = document.getElementById('tab-investments');
  if (!tab?.classList.contains('active')) return;
  if (_cachedRates) {
    drawBanksChart(_cachedRates.cdi.value);
    runSimulator();
  }
  if (_portfolio.length) {
    drawEvolutionChart();
    drawAllocationDonut();
  }
});
