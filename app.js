'use strict';

// =============================================
//  CATEGORIES
// =============================================
const CATEGORIES = {
  alimentacao: { label: 'Alimentação', icon: '🍔', color: '#f59e0b' },
  transporte:  { label: 'Transporte',  icon: '🚗', color: '#3b82f6' },
  moradia:     { label: 'Moradia',     icon: '🏠', color: '#8b5cf6' },
  saude:       { label: 'Saúde',       icon: '💊', color: '#10b981' },
  lazer:       { label: 'Lazer',       icon: '🎮', color: '#ec4899' },
  vestuario:   { label: 'Vestuário',   icon: '👕', color: '#06b6d4' },
  educacao:    { label: 'Educação',    icon: '📚', color: '#84cc16' },
  contas:      { label: 'Contas',      icon: '💡', color: '#f97316' },
  compras:     { label: 'Compras',     icon: '🛒', color: '#6366f1' },
  outros:      { label: 'Outros',      icon: '💰', color: '#94a3b8' },
};

// =============================================
//  DATABASE (IndexedDB)
// =============================================
const DB = {
  _db: null,
  DB_NAME: 'atlasfinance',
  DB_VERSION: 1,
  STORE: 'transactions',

  open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      req.onupgradeneeded = ({ target: { result: db } }) => {
        if (!db.objectStoreNames.contains(this.STORE)) {
          const store = db.createObjectStore(this.STORE, { keyPath: 'id' });
          store.createIndex('date',     'date',     { unique: false });
          store.createIndex('type',     'type',     { unique: false });
          store.createIndex('category', 'category', { unique: false });
        }
      };

      req.onsuccess = ({ target: { result } }) => {
        this._db = result;
        resolve();
      };

      req.onerror = ({ target: { error } }) => reject(error);
    });
  },

  getAll() {
    return new Promise((resolve, reject) => {
      const req = this._db
        .transaction(this.STORE, 'readonly')
        .objectStore(this.STORE)
        .getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror   = ({ target: { error } }) => reject(error);
    });
  },

  put(record) {
    return new Promise((resolve, reject) => {
      const req = this._db
        .transaction(this.STORE, 'readwrite')
        .objectStore(this.STORE)
        .put(record);
      req.onsuccess = () => resolve();
      req.onerror   = ({ target: { error } }) => reject(error);
    });
  },

  remove(id) {
    return new Promise((resolve, reject) => {
      const req = this._db
        .transaction(this.STORE, 'readwrite')
        .objectStore(this.STORE)
        .delete(id);
      req.onsuccess = () => resolve();
      req.onerror   = ({ target: { error } }) => reject(error);
    });
  },
};

// =============================================
//  SUPABASE DB
// =============================================
const SupabaseDB = {
  get url() { return (localStorage.getItem('financeai_supabase_url') || '').replace(/\/+$/, ''); },
  get key() { return localStorage.getItem('financeai_supabase_key') || ''; },
  get active() { return !!(this.url && this.key); },

  _headers() {
    const bearer = SupabaseAuth.isLoggedIn ? SupabaseAuth.token : this.key;
    return {
      'Content-Type':  'application/json',
      'apikey':        this.key,
      'Authorization': `Bearer ${bearer}`,
      'Prefer':        'return=minimal',
    };
  },

  async getAll() {
    const res = await fetch(`${this.url}/rest/v1/transactions?select=*&order=date.desc`, {
      headers: this._headers(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.map(r => ({ ...r, amount: parseFloat(r.amount) }));
  },

  async add(tx) {
    const record = SupabaseAuth.isLoggedIn
      ? { ...tx, user_id: SupabaseAuth.userId }
      : tx;
    const res = await fetch(`${this.url}/rest/v1/transactions`, {
      method:  'POST',
      headers: this._headers(),
      body:    JSON.stringify(record),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${res.status}`);
    }
  },

  async remove(id) {
    const res = await fetch(`${this.url}/rest/v1/transactions?id=eq.${encodeURIComponent(id)}`, {
      method:  'DELETE',
      headers: this._headers(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  },
};

// =============================================
//  SUPABASE AUTH
// =============================================
const SupabaseAuth = {
  get token()  { return localStorage.getItem('financeai_auth_token')  || ''; },
  get email()  { return localStorage.getItem('financeai_auth_email')  || ''; },
  get userId() { return localStorage.getItem('financeai_auth_uid')    || ''; },
  get expiry() { return parseInt(localStorage.getItem('financeai_auth_expiry') || '0', 10); },
  get isLoggedIn() { return !!(this.token && Date.now() < this.expiry); },

  _saveSession(data) {
    localStorage.setItem('financeai_auth_token',  data.access_token);
    localStorage.setItem('financeai_auth_email',  data.user?.email || '');
    localStorage.setItem('financeai_auth_uid',    data.user?.id    || '');
    localStorage.setItem('financeai_auth_expiry', String(Date.now() + (data.expires_in || 3600) * 1000));
  },

  async _parseRes(res) {
    const text = await res.text();
    try { return text ? JSON.parse(text) : {}; } catch { return {}; }
  },

  async signIn(email, password) {
    const res  = await fetch(`${SupabaseDB.url}/auth/v1/token?grant_type=password`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SupabaseDB.key },
      body:    JSON.stringify({ email, password }),
    });
    const data = await this._parseRes(res);
    if (!res.ok) throw new Error(data.error_description || data.message || data.error || data.msg || `Erro ao entrar (${res.status}).`);
    this._saveSession(data);
  },

  async signUp(email, password) {
    const endpoint = `${SupabaseDB.url}/auth/v1/signup`;
    console.log('[Atlas Auth] signup URL:', endpoint);
    const res  = await fetch(endpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SupabaseDB.key },
      body:    JSON.stringify({ email, password }),
    });
    const data = await this._parseRes(res);
    if (!res.ok) {
      if (res.status === 405) throw new Error(`Erro 405: verifique se a URL do Supabase está correta (${endpoint}). Deve ser apenas https://xxxx.supabase.co`);
      throw new Error(data.error_description || data.message || data.error || data.msg || `Erro ao cadastrar (${res.status}).`);
    }
    return data;
  },

  signOut() {
    ['financeai_auth_token', 'financeai_auth_email', 'financeai_auth_uid', 'financeai_auth_expiry']
      .forEach(k => localStorage.removeItem(k));
  },
};

// =============================================
//  STATE
// =============================================
let currentDate      = new Date();
let selectedType     = 'despesa';
let selectedCat      = '';
let transactions     = [];
let apiKey           = localStorage.getItem('financeai_key') || '';
let appInitialized   = false;

// =============================================
//  THEME
// =============================================
function chartBg() {
  return document.documentElement.dataset.theme === 'light' ? '#ffffff' : '#080812';
}

function chartFg(alpha) {
  if (alpha === undefined) {
    return document.documentElement.dataset.theme === 'light' ? '#1e1b4b' : '#f1f5f9';
  }
  return document.documentElement.dataset.theme === 'light'
    ? `rgba(30,27,75,${alpha})`
    : `rgba(255,255,255,${alpha})`;
}

function initTheme() {
  applyTheme(localStorage.getItem('financeai_theme') || 'dark');
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('financeai_theme', theme);
  document.querySelectorAll('.theme-opt').forEach(b => {
    b.classList.toggle('active', b.id === `theme-btn-${theme}`);
  });
}

// =============================================
//  UTILITIES
// =============================================
const fmt   = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
const pad2  = (n) => String(n).padStart(2, '0');
const mkKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function fmtDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function monthLabel(d) {
  return d.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })
          .replace(/^\w/, c => c.toUpperCase());
}

function txOfMonth(d = currentDate) {
  const key = mkKey(d);
  return transactions.filter(t => t.date.startsWith(key));
}

function toast(msg, type = 'ok') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.borderColor = type === 'err' ? 'rgba(239,68,68,.4)' : 'rgba(255,255,255,.15)';
  el.classList.add('show');
  clearTimeout(el._tid);
  el._tid = setTimeout(() => el.classList.remove('show'), 2600);
}

async function syncFromSupabase() {
  setCloudStatus('loading', 'Sincronizando com Supabase...');
  try {
    const remote = await SupabaseDB.getAll();
    for (const tx of transactions) await DB.remove(tx.id);
    for (const tx of remote)       await DB.put(tx);
    transactions = remote;
    renderAll();
    setCloudStatus('connected', `Supabase ativo · ${remote.length} transações`);
  } catch (err) {
    console.warn('Supabase sync error:', err.message);
    setCloudStatus('error', 'Erro ao conectar: ' + err.message);
  }
}

function setCloudStatus(status, label) {
  const dot = document.getElementById('supabase-status-dot');
  const lbl = document.getElementById('supabase-status-label');
  if (dot) dot.className = `db-dot db-${status}`;
  if (lbl) lbl.textContent = label || '';
}

function setDbStatus(status) {
  ['db-status-dot', 'db-status-dot-header'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = `db-dot db-${status}`;
    el.title = { connected: 'Banco local conectado', error: 'Erro no banco', loading: 'Abrindo banco...' }[status] || '';
  });
}

// =============================================
//  INIT
// =============================================
async function init() {
  initTheme();
  bindEvents();
  if (SupabaseDB.active && !SupabaseAuth.isLoggedIn) {
    showAuthScreen();
    return;
  }
  await startApp();
}

async function startApp() {
  if (appInitialized) return;
  appInitialized = true;

  hideAuthScreen();
  renderMonthLabel();
  buildCategoryGrid();
  buildCategoryFilter();
  setTodayDate();
  setDbStatus('loading');

  try {
    await DB.open();

    const legacy = JSON.parse(localStorage.getItem('financeai_txs') || '[]');
    if (legacy.length) {
      for (const tx of legacy) await DB.put(tx);
      localStorage.removeItem('financeai_txs');
      toast(`${legacy.length} transações migradas para o banco local.`);
    }

    transactions = await DB.getAll();
    setDbStatus('connected');
  } catch (err) {
    console.error('IndexedDB error:', err);
    setDbStatus('error');
    toast('Erro ao abrir banco de dados local.', 'err');
  }

  renderAll();

  if (SupabaseDB.active) syncFromSupabase();
}

function showAuthScreen() {
  document.getElementById('auth-screen').classList.remove('hidden');
  bindAuthEvents();
}

function hideAuthScreen() {
  document.getElementById('auth-screen').classList.add('hidden');
}

// =============================================
//  AUTH UI HELPERS
// =============================================
function bindAuthEvents() {
  document.getElementById('auth-btn-settings').addEventListener('click', () => {
    document.getElementById('input-apikey').value        = apiKey;
    document.getElementById('input-supabase-url').value  = localStorage.getItem('financeai_supabase_url') || '';
    document.getElementById('input-supabase-key').value  = localStorage.getItem('financeai_supabase_key') || '';
    document.getElementById('auth-user-bar').classList.add('hidden');
    document.getElementById('auth-divider').classList.add('hidden');
    openModal('modal-settings');
  });

  document.getElementById('tab-signin').addEventListener('click', () => setAuthMode('signin'));
  document.getElementById('tab-signup').addEventListener('click', () => setAuthMode('signup'));

  document.getElementById('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email    = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const confirm  = document.getElementById('auth-confirm').value;
    const isSignup = document.getElementById('tab-signup').classList.contains('active');

    clearAuthFeedback();

    if (!email || !password) { showAuthError('Preencha email e senha.'); return; }

    if (isSignup) {
      if (password.length < 6) { showAuthError('A senha deve ter pelo menos 6 caracteres.'); return; }
      if (password !== confirm) { showAuthError('As senhas não coincidem.'); return; }
    }

    setAuthLoading(true);
    try {
      if (isSignup) {
        const result = await SupabaseAuth.signUp(email, password);
        if (result.user && !result.access_token && !result.session) {
          showAuthSuccess('Cadastro realizado! Verifique seu email para confirmar a conta, depois faça login.');
          setAuthMode('signin');
          setAuthLoading(false);
          return;
        }
        if (result.session) SupabaseAuth._saveSession(result.session);
        else if (result.access_token) SupabaseAuth._saveSession(result);
      } else {
        await SupabaseAuth.signIn(email, password);
      }
      await startApp();
    } catch (err) {
      showAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  });
}

function setAuthMode(mode) {
  const isSignup = mode === 'signup';
  document.getElementById('tab-signin').classList.toggle('active', !isSignup);
  document.getElementById('tab-signup').classList.toggle('active', isSignup);
  document.getElementById('auth-confirm-group').classList.toggle('hidden', !isSignup);
  document.getElementById('auth-submit-text').textContent = isSignup ? 'Cadastrar' : 'Entrar';
  clearAuthFeedback();
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function showAuthSuccess(msg) {
  const el = document.getElementById('auth-success');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function clearAuthFeedback() {
  document.getElementById('auth-error').classList.add('hidden');
  document.getElementById('auth-success').classList.add('hidden');
}

function setAuthLoading(on) {
  const btn    = document.getElementById('auth-submit');
  const text   = document.getElementById('auth-submit-text');
  const loader = document.getElementById('auth-submit-loader');
  btn.disabled = on;
  text.classList.toggle('hidden', on);
  loader.classList.toggle('hidden', !on);
}

function renderAll() {
  const txs = txOfMonth();
  renderCards(txs);
  renderRecent(txs);
  renderAllTxs();
  renderAnalysisStats(txs);
  drawDonut(txs);
  drawLine(txs);
  drawBars(txs);
}

// =============================================
//  MONTH NAV
// =============================================
function renderMonthLabel() {
  document.getElementById('current-month-label').textContent = monthLabel(currentDate);
}

// =============================================
//  SUMMARY CARDS
// =============================================
function renderCards(txs) {
  const income  = txs.filter(t => t.type === 'receita').reduce((s, t) => s + t.amount, 0);
  const expense = txs.filter(t => t.type === 'despesa').reduce((s, t) => s + t.amount, 0);
  const balance = income - expense;

  document.getElementById('income-value').textContent  = fmt(income);
  document.getElementById('expense-value').textContent = fmt(expense);
  document.getElementById('balance-value').textContent  = fmt(balance);
  document.getElementById('balance-value').style.color  =
    balance >= 0 ? 'var(--green-l)' : '#f87171';

  document.getElementById('balance-sub').textContent = income > 0
    ? `${((expense / income) * 100).toFixed(0)}% da receita gasto`
    : 'Sem receitas no mês';
}

// =============================================
//  TRANSACTIONS LIST
// =============================================
function txHTML(t) {
  const isIncome = t.type === 'receita';
  const cat  = CATEGORIES[t.category] || CATEGORIES.outros;
  const note = t.notes ? `<div class="tx-note">📝 ${escHtml(t.notes)}</div>` : '';
  return `
    <div class="tx-item" data-id="${t.id}">
      <div class="tx-icon">${isIncome ? '💰' : cat.icon}</div>
      <div class="tx-info">
        <div class="tx-desc">${escHtml(t.description)}</div>
        <div class="tx-meta">${isIncome ? 'Receita' : cat.label} &bull; ${fmtDate(t.date)}</div>
        ${note}
      </div>
      <div class="tx-amount ${isIncome ? 'income' : 'expense'}">
        ${isIncome ? '+' : '−'}${fmt(t.amount)}
      </div>
      <button class="tx-del" onclick="deleteTx('${t.id}')" title="Remover">✕</button>
    </div>`;
}

function emptyHTML(msg = 'Nenhuma transação ainda.') {
  return `<div class="empty-state">
    <span class="empty-icon">💸</span>
    <p>${msg}</p>
    <p class="empty-sub">Clique em + para adicionar.</p>
  </div>`;
}

function renderRecent(txs) {
  const recent = [...txs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  document.getElementById('recent-transactions').innerHTML =
    recent.length ? recent.map(txHTML).join('') : emptyHTML();
}

function renderAllTxs() {
  const catF  = document.getElementById('filter-category').value;
  const typeF = document.getElementById('filter-type').value;

  const list = txOfMonth()
    .filter(t => !catF  || t.category === catF)
    .filter(t => !typeF || t.type === typeF)
    .sort((a, b) => b.date.localeCompare(a.date));

  document.getElementById('all-transactions').innerHTML =
    list.length ? list.map(txHTML).join('') : emptyHTML('Nenhuma transação encontrada.');
  document.getElementById('filter-count').textContent =
    `${list.length} transaç${list.length === 1 ? 'ão' : 'ões'}`;
}

// =============================================
//  ANALYSIS STATS
// =============================================
function renderAnalysisStats(txs) {
  const exp   = txs.filter(t => t.type === 'despesa');
  const total = exp.reduce((s, t) => s + t.amount, 0);
  const maxTx = exp.reduce((a, t) => t.amount > a.amount ? t : a, { amount: 0 });
  const days  = new Set(exp.map(t => t.date)).size || 1;

  const catTotals = {};
  exp.forEach(t => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount; });
  const topEntry = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0];
  const topCat   = topEntry ? CATEGORIES[topEntry[0]] : null;

  document.getElementById('stat-count').textContent   = exp.length;
  document.getElementById('stat-max').textContent     = maxTx.amount ? fmt(maxTx.amount) : '—';
  document.getElementById('stat-avg').textContent     = total ? fmt(total / days) : '—';
  document.getElementById('stat-top-cat').textContent = topCat ? `${topCat.icon} ${topCat.label}` : '—';
}

// =============================================
//  CHART: DONUT
// =============================================
function drawDonut(txs) {
  const canvas = document.getElementById('donut-chart');
  const ctx    = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const catTotals = {};
  txs.filter(t => t.type === 'despesa')
     .forEach(t => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount; });
  const total  = Object.values(catTotals).reduce((s, v) => s + v, 0);
  const legend = document.getElementById('donut-legend');
  legend.innerHTML = '';

  if (total === 0) {
    ctx.fillStyle = chartFg(0.07);
    ctx.beginPath(); ctx.arc(W / 2, H / 2, 72, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = chartFg(0.4);
    ctx.font = '12px Inter'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Sem dados', W / 2, H / 2);
    return;
  }

  const cx = W / 2, cy = H / 2, OR = 80, IR = 52;
  let angle = -Math.PI / 2;
  const sorted = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);

  sorted.forEach(([key, val]) => {
    const cat   = CATEGORIES[key] || CATEGORIES.outros;
    const sweep = (val / total) * Math.PI * 2;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, OR, angle, angle + sweep);
    ctx.closePath();
    ctx.fillStyle   = cat.color;
    ctx.fill();
    ctx.strokeStyle = chartBg();
    ctx.lineWidth   = 2;
    ctx.stroke();

    angle += sweep;

    const pct = ((val / total) * 100).toFixed(1);
    legend.innerHTML += `
      <div class="legend-item">
        <div class="legend-dot" style="background:${cat.color}"></div>
        <span class="legend-label">${cat.icon} ${cat.label}</span>
        <span class="legend-pct">${pct}%</span>
      </div>`;
  });

  ctx.beginPath();
  ctx.arc(cx, cy, IR, 0, Math.PI * 2);
  ctx.fillStyle = chartBg();
  ctx.fill();

  ctx.fillStyle    = chartFg();
  ctx.font         = 'bold 11px Inter';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(total >= 1000 ? `R$${(total / 1000).toFixed(1)}k` : fmt(total), cx, cy);
}

// =============================================
//  CHART: LINE
// =============================================
function drawLine(txs) {
  const canvas = document.getElementById('line-chart');
  if (!canvas) return;

  const W = canvas.parentElement.clientWidth || 500;
  canvas.width  = W;
  canvas.height = 200;
  const H   = 200;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  const year        = currentDate.getFullYear();
  const month       = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const now         = new Date();
  const maxDay      = (now.getMonth() === month && now.getFullYear() === year)
                        ? now.getDate() : daysInMonth;

  const daily = Array(daysInMonth + 1).fill(0);
  txs.filter(t => t.type === 'despesa').forEach(t => {
    const d = parseInt(t.date.split('-')[2], 10);
    daily[d] += t.amount;
  });

  const maxVal = Math.max(...daily, 1);
  const pL = 52, pR = 16, pT = 18, pB = 30;
  const cW = W - pL - pR, cH = H - pT - pB;

  ctx.strokeStyle  = chartFg(0.07);
  ctx.lineWidth    = 1;
  ctx.font         = '10px Inter';
  ctx.fillStyle    = chartFg(0.45);
  ctx.textAlign    = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 4; i++) {
    const y = pT + (cH / 4) * i;
    ctx.beginPath(); ctx.moveTo(pL, y); ctx.lineTo(W - pR, y); ctx.stroke();
    const v = maxVal * (1 - i / 4);
    ctx.fillText(v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0), pL - 5, y);
  }

  const pts = [];
  for (let d = 1; d <= maxDay; d++) {
    pts.push({
      x: pL + ((d - 1) / Math.max(daysInMonth - 1, 1)) * cW,
      y: pT + cH - (daily[d] / maxVal) * cH,
      v: daily[d],
    });
  }
  if (pts.length < 2) return;

  const grad = ctx.createLinearGradient(0, pT, 0, pT + cH);
  grad.addColorStop(0, 'rgba(124,58,237,.28)');
  grad.addColorStop(1, 'rgba(124,58,237,.01)');

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pT + cH);
  pts.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(pts[pts.length - 1].x, pT + cH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1], curr = pts[i];
    const cpx  = (prev.x + curr.x) / 2;
    ctx.bezierCurveTo(cpx, prev.y, cpx, curr.y, curr.x, curr.y);
  }
  ctx.strokeStyle = '#7c3aed';
  ctx.lineWidth   = 2.5;
  ctx.stroke();

  pts.forEach(p => {
    if (p.v === 0) return;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fillStyle   = '#a78bfa';
    ctx.fill();
    ctx.strokeStyle = chartBg();
    ctx.lineWidth   = 2;
    ctx.stroke();
  });

  ctx.fillStyle    = chartFg(0.4);
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'alphabetic';
  const step = Math.ceil(daysInMonth / 8);
  for (let d = 1; d <= daysInMonth; d += step) {
    const x = pL + ((d - 1) / Math.max(daysInMonth - 1, 1)) * cW;
    ctx.fillText(d, x, H - pB + 18);
  }
}

// =============================================
//  CHART: BAR (HORIZONTAL)
// =============================================
function drawBars(txs) {
  const canvas = document.getElementById('bar-chart');
  if (!canvas) return;

  const W = canvas.parentElement.clientWidth || 600;
  canvas.width  = W;
  canvas.height = 260;
  const H   = 260;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  const catTotals = {};
  txs.filter(t => t.type === 'despesa')
     .forEach(t => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount; });
  const sorted = Object.entries(catTotals).sort((a, b) => b[1] - a[1]).slice(0, 8);

  if (!sorted.length) {
    ctx.fillStyle    = chartFg(0.4);
    ctx.font         = '14px Inter';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Sem dados para exibir', W / 2, H / 2);
    return;
  }

  const maxVal = sorted[0][1];
  const pL = 114, pR = 90, pT = 10, pB = 10;
  const barH   = Math.floor((H - pT - pB) / sorted.length) - 7;
  const trackW = W - pL - pR;

  sorted.forEach(([key, val], i) => {
    const cat = CATEGORIES[key] || CATEGORIES.outros;
    const bW  = (val / maxVal) * trackW;
    const y   = pT + i * (barH + 7);

    ctx.fillStyle    = chartFg(0.7);
    ctx.font         = '12px Inter';
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${cat.icon} ${cat.label}`, pL - 9, y + barH / 2);

    ctx.fillStyle = chartFg(0.05);
    ctx.beginPath();
    rrect(ctx, pL, y, trackW, barH, 5);
    ctx.fill();

    const g = ctx.createLinearGradient(pL, 0, pL + bW, 0);
    g.addColorStop(0, cat.color);
    g.addColorStop(1, cat.color + 'aa');
    ctx.fillStyle = g;
    ctx.beginPath();
    rrect(ctx, pL, y, Math.max(bW, 5), barH, 5);
    ctx.fill();

    ctx.fillStyle    = chartFg(0.8);
    ctx.font         = 'bold 11px Inter';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(fmt(val), pL + bW + 8, y + barH / 2);
  });
}

function rrect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// =============================================
//  EXPORT
// =============================================
function exportExcel() {
  if (!transactions.length) { toast('Nenhuma transação para exportar.', 'err'); return; }

  const wb = XLSX.utils.book_new();

  // ── Aba 1: Todas as transações ──
  const txRows = [...transactions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(t => ({
      'Data':        fmtDate(t.date),
      'Tipo':        t.type === 'receita' ? 'Receita' : 'Despesa',
      'Categoria':   t.type === 'receita' ? '—' : (CATEGORIES[t.category]?.label || 'Outros'),
      'Descrição':   t.description,
      'Anotação':    t.notes || '',
      'Valor (R$)':  t.type === 'receita' ? t.amount : -t.amount,
    }));

  const ws1 = XLSX.utils.json_to_sheet(txRows);
  ws1['!cols'] = [
    { wch: 12 }, { wch: 10 }, { wch: 16 },
    { wch: 32 }, { wch: 42 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, ws1, 'Transações');

  // ── Aba 2: Resumo mensal ──
  const months = [...new Set(transactions.map(t => t.date.slice(0, 7)))].sort();
  const summaryRows = months.map(month => {
    const mTxs    = transactions.filter(t => t.date.startsWith(month));
    const income  = mTxs.filter(t => t.type === 'receita').reduce((s, t) => s + t.amount, 0);
    const expense = mTxs.filter(t => t.type === 'despesa').reduce((s, t) => s + t.amount, 0);
    const [y, m]  = month.split('-');
    const label   = new Date(+y, +m - 1, 1)
                      .toLocaleString('pt-BR', { month: 'long', year: 'numeric' })
                      .replace(/^\w/, c => c.toUpperCase());
    return {
      'Mês':              label,
      'Receitas (R$)':    income,
      'Despesas (R$)':    expense,
      'Saldo (R$)':       income - expense,
      'Nº transações':    mTxs.length,
    };
  });

  const ws2 = XLSX.utils.json_to_sheet(summaryRows);
  ws2['!cols'] = [{ wch: 20 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Resumo Mensal');

  // ── Aba 3: Por categoria (mês atual) ──
  const txsCurrent = txOfMonth().filter(t => t.type === 'despesa');
  const catTotals  = {};
  txsCurrent.forEach(t => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount; });
  const catRows = Object.entries(catTotals)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => ({
      'Categoria':     CATEGORIES[k]?.label || 'Outros',
      'Total (R$)':    v,
      'Nº transações': txsCurrent.filter(t => t.category === k).length,
    }));

  if (catRows.length) {
    const ws3 = XLSX.utils.json_to_sheet(catRows);
    ws3['!cols'] = [{ wch: 16 }, { wch: 14 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws3, 'Categorias (mês atual)');
  }

  XLSX.writeFile(wb, `atlas-finance-${todayLocal()}.xlsx`);
  toast('Excel exportado com sucesso!');
}

function exportPDF() {
  if (!transactions.length) { toast('Nenhuma transação para exportar.', 'err'); return; }

  const txs     = [...transactions].sort((a, b) => b.date.localeCompare(a.date));
  const income  = txs.filter(t => t.type === 'receita').reduce((s, t) => s + t.amount, 0);
  const expense = txs.filter(t => t.type === 'despesa').reduce((s, t) => s + t.amount, 0);
  const balance = income - expense;

  const catTotals = {};
  txs.filter(t => t.type === 'despesa')
     .forEach(t => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount; });

  const catRows = Object.entries(catTotals)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `<tr>
      <td>${CATEGORIES[k]?.icon || ''} ${CATEGORIES[k]?.label || 'Outros'}</td>
      <td style="text-align:right;color:#dc2626;font-weight:600">${fmt(v)}</td>
      <td style="text-align:right">${((v / expense) * 100).toFixed(1)}%</td>
    </tr>`).join('');

  const txRows = txs.map(t => {
    const isIncome = t.type === 'receita';
    const cat = CATEGORIES[t.category]?.label || 'Outros';
    return `<tr>
      <td>${fmtDate(t.date)}</td>
      <td><span class="badge ${isIncome ? 'badge-income' : 'badge-expense'}">${isIncome ? 'Receita' : 'Despesa'}</span></td>
      <td>${isIncome ? '—' : cat}</td>
      <td>${escHtml(t.description)}</td>
      <td style="color:#888;font-size:.8em">${t.notes ? escHtml(t.notes) : '—'}</td>
      <td style="text-align:right;font-weight:700;color:${isIncome ? '#059669' : '#dc2626'}">
        ${isIncome ? '+' : '−'}${fmt(t.amount)}
      </td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Atlas Finance — Extrato</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e1b4b; padding: 32px; font-size: 13px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; padding-bottom: 16px; border-bottom: 2px solid #1e1b4b; }
  .logo { font-size: 1.6rem; font-weight: 800; color: #7c3aed; }
  .logo span { font-size: 1rem; }
  .meta { font-size: .8rem; color: #888; margin-top: 6px; }
  .summary { display: flex; gap: 14px; margin-bottom: 28px; }
  .sum-card { flex: 1; padding: 14px 18px; border-radius: 10px; }
  .sum-card.s-balance { background: #f3f0ff; border: 1.5px solid #7c3aed; }
  .sum-card.s-income  { background: #f0fdf4; border: 1.5px solid #10b981; }
  .sum-card.s-expense { background: #fef2f2; border: 1.5px solid #ef4444; }
  .sum-label { font-size: .68rem; text-transform: uppercase; letter-spacing: .06em; color: #888; margin-bottom: 4px; }
  .sum-value { font-size: 1.3rem; font-weight: 800; }
  .s-balance .sum-value { color: #7c3aed; }
  .s-income  .sum-value { color: #059669; }
  .s-expense .sum-value { color: #dc2626; }
  h3 { font-size: .85rem; text-transform: uppercase; letter-spacing: .06em; color: #888; margin: 24px 0 10px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #1e1b4b; color: #fff; padding: 9px 12px; text-align: left; font-size: .72rem; text-transform: uppercase; letter-spacing: .05em; }
  td { padding: 8px 12px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  tr:nth-child(even) td { background: #f9f9fb; }
  .badge { padding: 2px 8px; border-radius: 100px; font-size: .72rem; font-weight: 600; }
  .badge-income  { background: #dcfce7; color: #15803d; }
  .badge-expense { background: #fee2e2; color: #b91c1c; }
  .footer { margin-top: 28px; font-size: .72rem; color: #bbb; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 14px; }
  @media print {
    body { padding: 16px; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">💎 Atlas Finance</div>
      <div class="meta">Extrato completo · Gerado em ${fmtDate(todayLocal())} · ${txs.length} transações</div>
    </div>
    <button class="no-print" onclick="window.print()" style="padding:8px 18px;background:#7c3aed;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:.85rem;font-weight:600">🖨 Imprimir / Salvar PDF</button>
  </div>

  <div class="summary">
    <div class="sum-card s-balance"><div class="sum-label">Saldo Total</div><div class="sum-value">${fmt(balance)}</div></div>
    <div class="sum-card s-income"><div class="sum-label">Total Receitas</div><div class="sum-value">${fmt(income)}</div></div>
    <div class="sum-card s-expense"><div class="sum-label">Total Despesas</div><div class="sum-value">${fmt(expense)}</div></div>
  </div>

  ${catRows ? `<h3>Gastos por Categoria</h3>
  <table>
    <thead><tr><th>Categoria</th><th style="text-align:right">Total</th><th style="text-align:right">%</th></tr></thead>
    <tbody>${catRows}</tbody>
  </table>` : ''}

  <h3>Todas as Transações</h3>
  <table>
    <thead><tr><th>Data</th><th>Tipo</th><th>Categoria</th><th>Descrição</th><th>Anotação</th><th style="text-align:right">Valor</th></tr></thead>
    <tbody>${txRows}</tbody>
  </table>

  <div class="footer">Atlas Finance · Exportado em ${new Date().toLocaleString('pt-BR')}</div>
</body>
</html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
}

// =============================================
//  CHAT
// =============================================
let chatHistory = [];

function buildChatContext() {
  const txs     = txOfMonth();
  const exp     = txs.filter(t => t.type === 'despesa');
  const totalExp = exp.reduce((s, t) => s + t.amount, 0);
  const totalInc = txs.filter(t => t.type === 'receita').reduce((s, t) => s + t.amount, 0);

  const catTotals = {};
  exp.forEach(t => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount; });
  const catSummary = Object.entries(catTotals)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${CATEGORIES[k]?.label}: R$${v.toFixed(2)}`)
    .join(', ') || 'nenhum dado';

  return `Você é um assistente financeiro pessoal simpático, direto e prestativo. Responda sempre em português brasileiro de forma clara e objetiva. Seja específico usando os dados abaixo quando relevante.

CONTEXTO FINANCEIRO DO USUÁRIO — ${monthLabel(currentDate)}:
- Receitas: R$${totalInc.toFixed(2)}
- Despesas: R$${totalExp.toFixed(2)}
- Saldo: R$${(totalInc - totalExp).toFixed(2)}
- Por categoria: ${catSummary}
- Total de transações: ${txs.length}

Responda perguntas sobre finanças pessoais, análise de gastos, dicas de economia e planejamento. Se o usuário perguntar sobre dados específicos que não estão disponíveis, diga isso claramente.`;
}

async function sendChatMessage() {
  if (!apiKey) {
    openModal('modal-settings');
    toast('Configure sua API Key primeiro.', 'err');
    return;
  }

  const input = document.getElementById('chat-input');
  const msg   = input.value.trim();
  if (!msg) return;

  input.value = '';
  appendChatMsg('user', msg);
  chatHistory.push({ role: 'user', content: msg });

  // Keep max 10 messages in context (5 exchanges)
  if (chatHistory.length > 10) chatHistory = chatHistory.slice(-10);

  showTyping();

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 600,
        temperature: 0.7,
        messages: [
          { role: 'system', content: buildChatContext() },
          ...chatHistory,
        ],
      }),
    });

    removeTyping();

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 429) throw new Error('Limite de requisições atingido. Aguarde 1 minuto.');
      throw new Error(err.error?.message || `Erro HTTP ${res.status}`);
    }

    const data  = await res.json();
    const reply = data.choices?.[0]?.message?.content?.trim() ?? '';
    chatHistory.push({ role: 'assistant', content: reply });
    appendChatMsg('assistant', reply);
  } catch (err) {
    removeTyping();
    appendChatMsg('error', err.message);
    chatHistory.pop();
  }
}

function appendChatMsg(role, content) {
  const container = document.getElementById('chat-messages');

  const wrapper = document.createElement('div');
  wrapper.className = `chat-msg chat-msg-${role}`;

  const bubble = document.createElement('div');
  if (role === 'user') {
    bubble.className = 'chat-bubble user-bubble';
    bubble.textContent = content;
  } else if (role === 'assistant') {
    bubble.className = 'chat-bubble ai-bubble';
    bubble.innerHTML = formatChatText(content);
  } else {
    bubble.className = 'chat-bubble error-bubble';
    bubble.textContent = '❌ ' + content;
  }

  wrapper.appendChild(bubble);
  container.appendChild(wrapper);
  container.scrollTop = container.scrollHeight;
}

function formatChatText(text) {
  return escHtml(text)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}

function showTyping() {
  const container = document.getElementById('chat-messages');
  const el = document.createElement('div');
  el.className = 'chat-msg chat-msg-assistant';
  el.id = 'chat-typing';
  el.innerHTML = `<div class="chat-typing">
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
    <div class="typing-dot"></div>
  </div>`;
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
  document.getElementById('btn-send').disabled = true;
}

function removeTyping() {
  document.getElementById('chat-typing')?.remove();
  document.getElementById('btn-send').disabled = false;
}

function clearChat() {
  chatHistory = [];
  document.getElementById('chat-messages').innerHTML = `
    <div class="chat-welcome">
      <div class="chat-welcome-icon">🤖</div>
      <p>Conversa reiniciada. Como posso te ajudar?</p>
    </div>`;
}

// =============================================
//  AI ANALYSIS
// =============================================
async function runAI() {
  if (!apiKey) {
    document.getElementById('input-apikey').focus();
    openModal('modal-settings');
    toast('Configure sua API Key primeiro.', 'err');
    return;
  }

  const txs = txOfMonth();
  const exp = txs.filter(t => t.type === 'despesa');
  if (exp.length === 0) {
    toast('Adicione despesas para analisar.', 'err');
    return;
  }

  setBtnLoading(true);

  const catTotals = {};
  exp.forEach(t => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount; });
  const totalExp    = Object.values(catTotals).reduce((s, v) => s + v, 0);
  const totalIncome = txs.filter(t => t.type === 'receita').reduce((s, t) => s + t.amount, 0);

  const txLines = exp.map(t => {
    const cat   = CATEGORIES[t.category]?.label || 'Outros';
    const notes = t.notes ? ` | Anotação: "${t.notes}"` : '';
    return `• ${fmtDate(t.date)} | ${cat} | R$ ${t.amount.toFixed(2)} | ${t.description}${notes}`;
  }).join('\n');

  const catLines = Object.entries(catTotals)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `  ${CATEGORIES[k]?.label}: R$ ${v.toFixed(2)} (${((v / totalExp) * 100).toFixed(1)}%)`)
    .join('\n');

  const prompt = `Você é um consultor financeiro pessoal. Analise com cuidado os gastos de ${monthLabel(currentDate)}.

RESUMO DO MÊS:
- Receita total: R$ ${totalIncome.toFixed(2)}
- Despesa total: R$ ${totalExp.toFixed(2)}
- Saldo: R$ ${(totalIncome - totalExp).toFixed(2)}
- Total de transações: ${exp.length}

GASTOS POR CATEGORIA:
${catLines}

TODAS AS TRANSAÇÕES (com anotações do usuário):
${txLines}

INSTRUÇÕES: Responda APENAS com JSON válido, sem markdown, sem texto extra. Use as anotações das transações para entender o contexto real de cada gasto e fazer sugestões específicas.

{
  "score": <inteiro 0-100 representando saúde financeira>,
  "score_label": "<Crítico | Preocupante | Regular | Bom | Excelente>",
  "summary": "<análise geral em 2-3 frases, mencione valores reais>",
  "waste": ["<gasto desnecessário específico com valor>", "<...>"],
  "alerts": ["<alerta específico com percentual ou valor>", "<...>"],
  "tips": ["<dica prática baseada nos dados reais>", "<...>", "<...>"],
  "positive": ["<ponto positivo real>", "<...>"]
}`;

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 1600,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 429) {
        throw new Error('Limite de requisições atingido. Aguarde 1 minuto e tente novamente.');
      }
      throw new Error(err.error?.message || `Erro HTTP ${res.status}`);
    }

    const data   = await res.json();
    const raw    = data.choices?.[0]?.message?.content?.trim() ?? '';
    const match  = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : raw);
    renderAIResult(parsed);
    toast('Análise concluída!');
  } catch (err) {
    document.getElementById('ai-result').innerHTML = `
      <div class="ai-section red">
        <div class="ai-section-title">❌ Erro</div>
        <p>${escHtml(err.message)}</p>
      </div>`;
    toast(err.message, 'err');
  } finally {
    setBtnLoading(false);
  }
}

function setBtnLoading(on) {
  const btn  = document.getElementById('btn-analyze');
  const text = document.getElementById('analyze-text');
  const spin = document.getElementById('analyze-loader');
  btn.disabled = on;
  text.classList.toggle('hidden', on);
  spin.classList.toggle('hidden', !on);
}

function renderAIResult(a) {
  const score      = Math.max(0, Math.min(100, a.score || 0));
  const scoreColor = score >= 75 ? 'var(--green)' : score >= 50 ? 'var(--yellow)' : 'var(--red)';
  const scoreBg    = score >= 75 ? 'rgba(16,185,129,.18)' : score >= 50 ? 'rgba(245,158,11,.18)' : 'rgba(239,68,68,.18)';
  const ul = (arr) => arr?.length
    ? `<ul>${arr.map(i => `<li>${escHtml(i)}</li>`).join('')}</ul>` : '';

  document.getElementById('ai-result').innerHTML = `
    <div class="ai-score">
      <div class="score-circle" style="background:${scoreBg};color:${scoreColor};border-color:${scoreColor}">
        ${score}
      </div>
      <div class="score-info">
        <h4>Saúde Financeira: <span style="color:${scoreColor}">${escHtml(a.score_label || '')}</span></h4>
        <p>${escHtml(a.summary || '')}</p>
      </div>
    </div>
    ${a.waste?.length ? `<div class="ai-section red"><div class="ai-section-title">⚠️ Gastos Potencialmente Desnecessários</div>${ul(a.waste)}</div>` : ''}
    ${a.alerts?.length ? `<div class="ai-section yellow"><div class="ai-section-title">🔔 Alertas</div>${ul(a.alerts)}</div>` : ''}
    ${a.tips?.length ? `<div class="ai-section purple"><div class="ai-section-title">💡 Dicas Para Economizar</div>${ul(a.tips)}</div>` : ''}
    ${a.positive?.length ? `<div class="ai-section green"><div class="ai-section-title">✅ Pontos Positivos</div>${ul(a.positive)}</div>` : ''}`;
}

function resetAIResult() {
  document.getElementById('ai-result').innerHTML = `
    <div class="ai-placeholder">
      <span class="ai-placeholder-icon">🤖</span>
      <p>Os dados foram alterados. Clique em <strong>"Analisar com IA"</strong> para uma nova análise.</p>
    </div>`;
}

// =============================================
//  ADD / DELETE TRANSACTION
// =============================================
async function handleFormSubmit(e) {
  e.preventDefault();

  const amount = parseFloat(document.getElementById('input-amount').value);
  const desc   = document.getElementById('input-description').value.trim();
  const notes  = document.getElementById('input-notes').value.trim();
  const date   = document.getElementById('input-date').value;

  if (!amount || amount <= 0 || !desc || !date) return;

  const catErr = document.getElementById('cat-error');
  if (selectedType === 'despesa' && !selectedCat) {
    catErr.classList.remove('hidden');
    return;
  }
  catErr.classList.add('hidden');

  const tx = {
    id:          genId(),
    type:        selectedType,
    amount,
    category:    selectedType === 'receita' ? 'outros' : selectedCat,
    description: desc,
    notes,
    date,
  };

  closeModal('modal-transaction');
  e.target.reset();
  selectedCat = '';
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('selected'));
  resetAIResult();

  try {
    await DB.put(tx);
    transactions.push(tx);
    renderAll();
    toast('Transação adicionada!');

    if (SupabaseDB.active) {
      SupabaseDB.add(tx)
        .then(() => setCloudStatus('connected', `Supabase ativo · ${transactions.length} transações`))
        .catch(err => toast('Supabase: ' + err.message, 'err'));
    }
  } catch (err) {
    toast('Erro ao salvar transação.', 'err');
  }
}

async function deleteTx(id) {
  try {
    await DB.remove(id);
    transactions = transactions.filter(t => t.id !== id);
    resetAIResult();
    renderAll();
    toast('Transação removida.');

    if (SupabaseDB.active) {
      SupabaseDB.remove(id)
        .then(() => setCloudStatus('connected', `Supabase ativo · ${transactions.length} transações`))
        .catch(err => toast('Supabase: ' + err.message, 'err'));
    }
  } catch (err) {
    toast('Erro ao remover transação.', 'err');
  }
}

// =============================================
//  UI BUILDERS
// =============================================
function buildCategoryGrid() {
  const grid = document.getElementById('category-grid');
  grid.innerHTML = Object.entries(CATEGORIES).map(([key, cat]) => `
    <button type="button" class="cat-btn" data-cat="${key}">
      <span class="cat-icon">${cat.icon}</span>
      <span>${cat.label}</span>
    </button>`).join('');

  grid.addEventListener('click', e => {
    const btn = e.target.closest('.cat-btn');
    if (!btn) return;
    grid.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedCat = btn.dataset.cat;
    document.getElementById('cat-error').classList.add('hidden');
  });
}

function buildCategoryFilter() {
  const sel = document.getElementById('filter-category');
  Object.entries(CATEGORIES).forEach(([key, cat]) => {
    sel.insertAdjacentHTML('beforeend',
      `<option value="${key}">${cat.icon} ${cat.label}</option>`);
  });
}

function setTodayDate() {
  document.getElementById('input-date').value = todayLocal();
}

// =============================================
//  MODAL
// =============================================
function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
  document.body.style.overflow = '';
}

// =============================================
//  TAB SWITCHING
// =============================================
function switchTab(tabName) {
  document.querySelectorAll('.nav-tab, .mobile-nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  document.querySelectorAll('.tab-content').forEach(s => {
    s.classList.toggle('active', s.id === `tab-${tabName}`);
  });
  if (tabName === 'analysis') setTimeout(() => drawBars(txOfMonth()), 40);
  if (tabName === 'dashboard') setTimeout(() => { drawLine(txOfMonth()); drawDonut(txOfMonth()); }, 40);
}

// =============================================
//  SECURITY HELPER
// =============================================
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// =============================================
//  EVENT BINDING
// =============================================
function bindEvents() {
  // FAB
  document.getElementById('btn-add').addEventListener('click', () => {
    setTodayDate();
    selectedCat  = '';
    selectedType = 'despesa';
    document.querySelectorAll('.type-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.type === 'despesa');
    });
    document.getElementById('category-group').style.display = '';
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('selected'));
    document.getElementById('cat-error').classList.add('hidden');
    document.getElementById('transaction-form').reset();
    openModal('modal-transaction');
  });

  // Close modals via [data-close]
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-close]');
    if (t) closeModal(t.dataset.close);
  });

  // Click outside modal
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });

  // Form submit
  document.getElementById('transaction-form').addEventListener('submit', handleFormSubmit);

  // Type toggle
  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedType = btn.dataset.type;
      document.getElementById('category-group').style.display =
        selectedType === 'despesa' ? '' : 'none';
    });
  });

  // Month navigation
  document.getElementById('prev-month').addEventListener('click', () => {
    currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    renderMonthLabel();
    renderAll();
    resetAIResult();
  });
  document.getElementById('next-month').addEventListener('click', () => {
    currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    renderMonthLabel();
    renderAll();
    resetAIResult();
  });

  // Desktop tabs
  document.getElementById('nav-tabs').addEventListener('click', e => {
    const btn = e.target.closest('.nav-tab');
    if (btn) switchTab(btn.dataset.tab);
  });

  // Mobile tabs
  document.querySelector('.mobile-nav').addEventListener('click', e => {
    const btn = e.target.closest('.mobile-nav-btn');
    if (btn) switchTab(btn.dataset.tab);
  });

  // View all shortcut
  document.getElementById('view-all-btn').addEventListener('click', () => switchTab('transactions'));

  // Filters
  document.getElementById('filter-category').addEventListener('change', renderAllTxs);
  document.getElementById('filter-type').addEventListener('change', renderAllTxs);

  // Settings open
  document.getElementById('btn-settings').addEventListener('click', () => {
    document.getElementById('input-apikey').value        = apiKey;
    document.getElementById('input-supabase-url').value  = localStorage.getItem('financeai_supabase_url') || '';
    document.getElementById('input-supabase-key').value  = localStorage.getItem('financeai_supabase_key') || '';

    const userBar = document.getElementById('auth-user-bar');
    const authDiv = document.getElementById('auth-divider');
    if (SupabaseAuth.isLoggedIn) {
      document.getElementById('auth-user-email').textContent = SupabaseAuth.email;
      userBar.classList.remove('hidden');
      authDiv.classList.remove('hidden');
    } else {
      userBar.classList.add('hidden');
      authDiv.classList.add('hidden');
    }

    openModal('modal-settings');
  });

  // Logout
  document.getElementById('btn-logout').addEventListener('click', () => {
    SupabaseAuth.signOut();
    appInitialized = false;
    transactions   = [];
    closeModal('modal-settings');
    showAuthScreen();
    toast('Sessão encerrada.');
  });

  // Settings save
  document.getElementById('save-settings').addEventListener('click', async () => {
    apiKey = document.getElementById('input-apikey').value.trim();
    localStorage.setItem('financeai_key', apiKey);

    const sbUrl = document.getElementById('input-supabase-url').value.trim();
    const sbKey = document.getElementById('input-supabase-key').value.trim();

    if (sbUrl)  localStorage.setItem('financeai_supabase_url', sbUrl);
    else        localStorage.removeItem('financeai_supabase_url');

    if (sbKey)  localStorage.setItem('financeai_supabase_key', sbKey);
    else        localStorage.removeItem('financeai_supabase_key');

    if (!sbUrl || !sbKey) setCloudStatus('offline', 'Não configurado (usando banco local)');

    closeModal('modal-settings');
    toast('Configurações salvas!');

    if (SupabaseDB.active) await syncFromSupabase();
  });

  // Toggle setup instructions
  document.getElementById('btn-toggle-instructions').addEventListener('click', function () {
    const box = document.getElementById('setup-instructions');
    const hidden = box.classList.toggle('hidden');
    this.textContent = hidden ? 'Como configurar ▾' : 'Como configurar ▴';
  });

  // Theme toggle (inside settings)
  document.getElementById('theme-btn-dark').addEventListener('click', () => {
    applyTheme('dark');
    renderAll();
  });
  document.getElementById('theme-btn-light').addEventListener('click', () => {
    applyTheme('light');
    renderAll();
  });

  // AI analysis button
  document.getElementById('btn-analyze').addEventListener('click', runAI);

  // Export (inside settings modal)
  document.getElementById('btn-export-excel').addEventListener('click', () => {
    closeModal('modal-settings');
    exportExcel();
  });
  document.getElementById('btn-export-pdf').addEventListener('click', () => {
    closeModal('modal-settings');
    exportPDF();
  });

  // Chat
  document.getElementById('btn-chat').addEventListener('click', () => {
    document.getElementById('chat-panel').classList.toggle('hidden');
  });
  document.getElementById('btn-chat-close').addEventListener('click', () => {
    document.getElementById('chat-panel').classList.add('hidden');
  });
  document.getElementById('btn-chat-clear').addEventListener('click', clearChat);
  document.getElementById('btn-send').addEventListener('click', sendChatMessage);
  document.getElementById('chat-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
  });

  // Resize: redraw responsive charts
  window.addEventListener('resize', () => {
    const active = document.querySelector('.tab-content.active');
    if (!active) return;
    const txs = txOfMonth();
    if (active.id === 'tab-dashboard') drawLine(txs);
    if (active.id === 'tab-analysis')  drawBars(txs);
  });
}

// =============================================
//  START
// =============================================
init();
