'use strict';

// =============================================
//  STATE
// =============================================
let currentDate       = new Date();
let selectedType       = 'despesa';
let selectedCat        = '';
let selectedPayment    = '';
let selectedBenefitType = '';
let selectedFixed      = false;
let invoiceItems       = [];
let transactions      = [];
let selectedTxIds     = new Set();
let chatHistory       = [];
let appInitialized    = false;
let activeTxId        = null;
let activeChangeCat   = null;
let customCatSource   = 'add';
let _refreshChangeCatGrid = null;
let benefitAllocations = {};
let budgets           = {};
let obExpenses        = [];

// =============================================
//  FOCUS MANAGEMENT
// =============================================
const _focusStack = [];
const _FOCUSABLE  = 'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function trapFocus(modalEl) {
  const getEls = () => [...modalEl.querySelectorAll(_FOCUSABLE)].filter(el => el.offsetParent !== null);
  function handler(e) {
    if (e.key !== 'Tab') return;
    const els = getEls();
    if (!els.length) return;
    const first = els[0], last = els[els.length - 1];
    if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
    else            { if (document.activeElement === last)  { e.preventDefault(); first.focus(); } }
  }
  modalEl._trapHandler = handler;
  modalEl.addEventListener('keydown', handler);
  const els = getEls();
  if (els.length) els[0].focus();
}

function releaseFocus(modalEl) {
  if (modalEl._trapHandler) {
    modalEl.removeEventListener('keydown', modalEl._trapHandler);
    delete modalEl._trapHandler;
  }
}

// =============================================
//  THEME
// =============================================
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
//  CUSTOM CATEGORIES
// =============================================
function _catsKey() { return `atlas_custom_cats_${Auth.userId || 'anon'}`; }

function loadCustomCategories() {
  const saved = JSON.parse(localStorage.getItem(_catsKey()) || '{}');
  Object.assign(CATEGORIES, saved);
}

function saveCustomCategory(key, cat) {
  CATEGORIES[key] = cat;
  const saved = JSON.parse(localStorage.getItem(_catsKey()) || '{}');
  saved[key] = cat;
  localStorage.setItem(_catsKey(), JSON.stringify(saved));
}

function deleteCustomCategory(key) {
  delete CATEGORIES[key];
  const saved = JSON.parse(localStorage.getItem(_catsKey()) || '{}');
  delete saved[key];
  localStorage.setItem(_catsKey(), JSON.stringify(saved));
}

// =============================================
//  BENEFIT ALLOCATIONS
// =============================================
function getBenefitSVG(key, size = 18) {
  if (key === 'vr') return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><line x1="7" y1="2" x2="7" y2="22"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h1v8"/></svg>`;
  if (key === 'vt') return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`;
  return '';
}

function _benefitKey()     { return `atlas_benefits_${Auth.userId || 'anon'}`; }
function _benefitOpenKey() { return `atlas_benefits_open_${Auth.userId || 'anon'}`; }

function loadBenefitAllocations() {
  benefitAllocations = JSON.parse(localStorage.getItem(_benefitKey()) || '{}');
}

function initBenefitsToggle() {
  const open = localStorage.getItem(_benefitOpenKey()) === 'true';
  const body   = document.getElementById('benefits-body');
  const toggle = document.getElementById('btn-benefits-toggle');
  if (!body || !toggle) return;
  body.classList.toggle('open', open);
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function toggleBenefitsSection() {
  const body   = document.getElementById('benefits-body');
  const toggle = document.getElementById('btn-benefits-toggle');
  if (!body || !toggle) return;
  const isOpen = body.classList.toggle('open');
  toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  localStorage.setItem(_benefitOpenKey(), isOpen ? 'true' : 'false');
}

function saveBenefitsConfig() {
  const vr = parseFloat(document.getElementById('input-vr-amount').value) || 0;
  const vt = parseFloat(document.getElementById('input-vt-amount').value) || 0;
  benefitAllocations.vr = vr;
  benefitAllocations.vt = vt;
  localStorage.setItem(_benefitKey(), JSON.stringify(benefitAllocations));
  closeModal('modal-benefits-config');
  renderBenefits(txOfMonth());
  toast('Benefícios configurados!');
}

// =============================================
//  BUDGETS
// =============================================
function _budgetOpenKey() { return `atlas_budget_open_${Auth.userId || 'anon'}`; }

function loadBudgets() {
  // Source of truth is the server profile (synced to localStorage by syncProfileFromServer)
  budgets = loadProfile().budgets || {};
}

function initBudgetToggle() {
  const open   = localStorage.getItem(_budgetOpenKey()) === 'true';
  const body   = document.getElementById('budget-body');
  const toggle = document.getElementById('btn-budget-toggle');
  if (!body || !toggle) return;
  body.classList.toggle('open', open);
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function toggleBudgetSection() {
  const body   = document.getElementById('budget-body');
  const toggle = document.getElementById('btn-budget-toggle');
  if (!body || !toggle) return;
  const isOpen = body.classList.toggle('open');
  toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  localStorage.setItem(_budgetOpenKey(), isOpen ? 'true' : 'false');
}

function openBudgetConfig() {
  const body = document.getElementById('budget-config-body');
  if (!body) return;
  body.innerHTML = Object.entries(CATEGORIES).map(([key, cat]) => `
    <div class="budget-config-row">
      <label class="budget-config-label">
        <span class="budget-config-icon">${cat.icon}</span>
        <span>${cat.label}</span>
      </label>
      <div class="budget-config-input-wrap">
        <span class="budget-config-currency">R$</span>
        <input type="number" class="budget-config-input" id="budget-input-${key}"
               step="10" min="0" placeholder="Sem limite"
               value="${budgets[key] || ''}">
      </div>
    </div>`).join('');
  openModal('modal-budget-config');
}

function saveBudgetConfig() {
  const newBudgets = {};
  Object.keys(CATEGORIES).forEach(key => {
    const input = document.getElementById(`budget-input-${key}`);
    if (!input) return;
    const val = parseFloat(input.value);
    if (val > 0) newBudgets[key] = val;
  });
  budgets = newBudgets;
  saveProfile({ budgets });
  closeModal('modal-budget-config');
  renderBudgets(txOfMonth());
  toast('Metas salvas!');
}

function removeBudget(key) {
  delete budgets[key];
  saveProfile({ budgets });
  renderBudgets(txOfMonth());
  toast('Meta removida!');
}

// =============================================
//  BUDGET / BENEFIT DETAIL MODAL (shared)
// =============================================
let _bdCtx = { type: '', key: '' };

function _bdRenderMiniStats(spent, limit, daysElapsed, daysInMonth, prevSpent) {
  const el = document.getElementById('bd-mini-stats');
  if (!el) return;
  const chips = [];
  const dailyAvg = daysElapsed > 0 && spent > 0 ? spent / daysElapsed : 0;
  if (dailyAvg > 0) chips.push(`<span class="bd-chip">${fmt(dailyAvg)}/dia</span>`);
  if (dailyAvg > 0 && limit > 0) {
    const proj    = dailyAvg * daysInMonth;
    const projOver = proj > limit;
    chips.push(`<span class="bd-chip${projOver ? ' bd-chip-warn' : ''}">Projeção: ${fmt(proj)}</span>`);
  }
  if (prevSpent > 0) {
    const diff    = spent - prevSpent;
    const diffPct = Math.abs(diff / prevSpent * 100).toFixed(0);
    const up      = diff > 0;
    chips.push(`<span class="bd-chip ${up ? 'bd-chip-warn' : 'bd-chip-good'}">${up ? '↑' : '↓'} ${diffPct}% vs anterior</span>`);
  } else if (spent > 0) {
    chips.push(`<span class="bd-chip bd-chip-neutral">Primeiro registro</span>`);
  }
  el.innerHTML = chips.join('');
}

function _bdPopulate(type, key) {
  _bdCtx = { type, key };
  const today      = new Date(currentDate);
  const daysElapsed = today.getDate();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const prevDate   = new Date(currentDate);
  prevDate.setMonth(prevDate.getMonth() - 1);
  const prevAll    = txOfMonth(prevDate);
  const curAll     = txOfMonth();

  let icon, name, spent, limit, barColor, overBudget, catTxs, prevSpent, limitDisplay, txsTitle, emptyMsg;

  if (type === 'budget') {
    const cat = CATEGORIES[key];
    limit     = budgets[key] || 0;
    catTxs    = curAll.filter(t => t.type === 'despesa' && t.category === key)
                      .sort((a, b) => b.date.localeCompare(a.date));
    spent     = catTxs.reduce((s, t) => s + t.amount, 0);
    overBudget = spent > limit;
    const warn = !overBudget && limit > 0 && spent / limit >= 0.8;
    barColor   = overBudget ? 'var(--red)' : warn ? 'var(--yellow)' : 'var(--purple)';
    prevSpent  = prevAll.filter(t => t.type === 'despesa' && t.category === key)
                        .reduce((s, t) => s + t.amount, 0);
    icon         = cat.icon;
    name         = cat.label;
    limitDisplay = fmt(limit);
    txsTitle     = 'Gastos este mês';
    emptyMsg     = 'Nenhum gasto nesta categoria este mês.';
  } else {
    const bt  = BENEFIT_TYPES[key];
    limit     = benefitAllocations[key] || 0;
    catTxs    = curAll.filter(t => t.type === 'beneficio' && t.benefitType === key)
                      .sort((a, b) => b.date.localeCompare(a.date));
    spent     = catTxs.reduce((s, t) => s + t.amount, 0);
    overBudget = spent > limit;
    barColor   = overBudget ? 'var(--red)' : bt.color;
    prevSpent  = prevAll.filter(t => t.type === 'beneficio' && t.benefitType === key)
                        .reduce((s, t) => s + t.amount, 0);
    icon         = bt.icon;
    name         = bt.label;
    limitDisplay = `${fmt(limit)}/mês`;
    txsTitle     = 'Usos este mês';
    emptyMsg     = 'Nenhum uso registrado este mês.';
  }

  const pct       = limit > 0 ? Math.min((spent / limit) * 100, 100) : 0;
  const remaining = limit - spent;
  const warn      = !overBudget && pct >= 80;

  document.getElementById('bd-icon').textContent      = icon;
  document.getElementById('bd-name').textContent      = name;
  document.getElementById('bd-spent').textContent     = fmt(spent);
  document.getElementById('bd-limit').textContent     = limitDisplay;
  document.getElementById('bd-pct').textContent       = `${pct.toFixed(0)}%`;
  document.getElementById('bd-txs-title').textContent = txsTitle;
  document.getElementById('bd-limit').classList.remove('hidden');
  document.getElementById('bd-limit-input').classList.add('hidden');

  const fill = document.getElementById('bd-progress-fill');
  fill.style.width      = `${pct.toFixed(1)}%`;
  fill.style.background = barColor;

  const msgEl = document.getElementById('bd-remaining-msg');
  if (overBudget) {
    msgEl.textContent = `⚠ ${fmt(spent - limit)} acima${type === 'benefit' ? ' do saldo' : ' do limite'}`;
    msgEl.style.color = 'var(--red)';
  } else {
    msgEl.textContent = type === 'benefit'
      ? `Saldo restante: ${fmt(remaining)}`
      : `Faltam ${fmt(remaining)} para atingir o limite`;
    msgEl.style.color = warn ? 'var(--yellow)' : 'var(--text-2)';
  }

  _bdRenderMiniStats(spent, limit, daysElapsed, daysInMonth, prevSpent);

  const listEl = document.getElementById('bd-txs-list');
  listEl.innerHTML = catTxs.length
    ? catTxs.map(t => `
        <div class="bd-tx-row">
          <span class="bd-tx-date">${fmtDate(t.date)}</span>
          <span class="bd-tx-desc">${t.description || name}</span>
          <span class="bd-tx-amount">-${fmt(t.amount)}</span>
        </div>`).join('')
    : `<p class="bd-empty">${emptyMsg}</p>`;

  document.getElementById('bd-view-all-btn').onclick = type === 'budget'
    ? () => { closeModal('modal-budget-detail'); goToTransactions('despesa', key); }
    : () => { closeModal('modal-budget-detail'); goToTransactions('beneficio', ''); };
}

function openBudgetDetail(key) {
  if (!CATEGORIES[key] || !budgets[key]) return;
  _bdPopulate('budget', key);
  openModal('modal-budget-detail');
}

function bd_quickRegister() {
  closeModal('modal-budget-detail');
  if (_bdCtx.type === 'benefit') {
    openBenefitQuickAdd();
    const k = _bdCtx.key;
    setTimeout(() => {
      selectedBenefitType = k;
      document.querySelectorAll('.benefit-type-btn').forEach(b => b.classList.remove('selected'));
      const btn = document.querySelector(`.benefit-type-btn[data-benefit="${k}"]`);
      if (btn) btn.classList.add('selected');
    }, 80);
  } else {
    resetTransactionModal();
    selectedType = 'despesa';
    document.querySelectorAll('.type-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.type === 'despesa'));
    openModal('modal-transaction');
    const k = _bdCtx.key;
    setTimeout(() => {
      renderCategoryGrid();
      const grid = document.getElementById('category-grid');
      grid.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('selected'));
      const btn = grid.querySelector(`[data-cat="${k}"]`);
      if (btn) { btn.classList.add('selected'); selectedCat = k; }
      document.getElementById('cat-error').classList.add('hidden');
    }, 80);
  }
}

function bd_startEditLimit() {
  const raw = _bdCtx.type === 'budget'
    ? (budgets[_bdCtx.key] || 0)
    : (benefitAllocations[_bdCtx.key] || 0);
  const inputEl = document.getElementById('bd-limit-input');
  inputEl.value = raw;
  document.getElementById('bd-limit').classList.add('hidden');
  inputEl.classList.remove('hidden');
  inputEl.focus();
  inputEl.select();
}

function bd_cancelEditLimit() {
  document.getElementById('bd-limit').classList.remove('hidden');
  document.getElementById('bd-limit-input').classList.add('hidden');
}

function bd_saveEditLimit() {
  const val = parseFloat(document.getElementById('bd-limit-input').value);
  if (!isNaN(val) && val > 0) {
    if (_bdCtx.type === 'budget') {
      budgets[_bdCtx.key] = val;
      saveProfile({ budgets });
      renderBudgets(txOfMonth());
    } else {
      benefitAllocations[_bdCtx.key] = val;
      localStorage.setItem(_benefitKey(), JSON.stringify(benefitAllocations));
      renderBenefits(txOfMonth());
    }
    _bdPopulate(_bdCtx.type, _bdCtx.key);
  } else {
    bd_cancelEditLimit();
  }
}

function renderBudgets(txs) {
  const grid    = document.getElementById('budget-grid');
  const emptyEl = document.getElementById('budget-empty');
  const summaryEl = document.getElementById('budget-summary');
  if (!grid) return;

  const expTxs    = txs.filter(t => t.type === 'despesa');
  const catTotals = {};
  expTxs.forEach(t => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount; });

  const entries = Object.entries(budgets).filter(([, limit]) => limit > 0);

  if (summaryEl) {
    const over = entries.filter(([key]) => (catTotals[key] || 0) > (budgets[key] || Infinity)).length;
    summaryEl.textContent = over > 0 ? `⚠ ${over} estourado${over > 1 ? 's' : ''}` : '';
    summaryEl.style.color = over > 0 ? 'var(--red)' : '';
  }

  const cards = entries.map(([key, limit]) => {
    const cat = CATEGORIES[key];
    if (!cat) return '';
    const spent      = catTotals[key] || 0;
    const pct        = limit > 0 ? Math.min((spent / limit) * 100, 100) : 0;
    const overBudget = spent > limit;
    const warning    = !overBudget && spent / limit >= 0.8;
    const barColor   = overBudget ? 'var(--red)' : warning ? 'var(--yellow)' : 'var(--purple)';
    const remaining  = limit - spent;
    const remClass   = overBudget ? 'over-budget' : '';
    const remLabel   = overBudget ? `+${fmt(spent - limit)} acima` : fmt(remaining);
    return `
      <div class="budget-card" onclick="openBudgetDetail('${key}')" title="Ver detalhes de ${cat.label}">
        <div class="budget-card-header">
          <span class="budget-cat-icon">${cat.icon}</span>
          <span class="budget-cat-name">${cat.label}</span>
          ${overBudget ? '<span class="budget-alert-icon">⚠</span>' : ''}
          <button class="card-dots-btn" onclick="event.stopPropagation();openBudgetMenu(this,'${key}')" title="Opções">⋯</button>
        </div>
        <div class="budget-amounts">
          <span class="budget-spent">${fmt(spent)}</span>
          <span class="budget-limit-label"> / ${fmt(limit)}</span>
        </div>
        <div class="budget-progress-track">
          <div class="budget-progress-fill" style="width:${pct.toFixed(1)}%;background:${barColor}"></div>
        </div>
        <div class="budget-footer">
          <span class="budget-pct" style="color:${overBudget?'var(--red)':warning?'var(--yellow)':'var(--text-2)'}">${pct.toFixed(0)}% usado</span>
          <span class="budget-remaining ${remClass}">${remLabel}</span>
        </div>
      </div>`;
  }).filter(Boolean).join('');

  const quickAdd = `
    <button class="budget-card budget-card-add" onclick="openBudgetConfig()" title="Definir limite por categoria">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      <span>Definir limite</span>
    </button>`;

  grid.innerHTML = cards ? cards + quickAdd : '';
  if (emptyEl) emptyEl.classList.toggle('hidden', !!cards);

  // Disparar alerta de email quando >= 80% (máximo 1x por categoria por mês)
  if (!Demo.active) {
    const alertKey = `atlas_budget_alerted_${Auth.userId || 'anon'}`;
    const alerted  = JSON.parse(localStorage.getItem(alertKey) || '{}');
    const monthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
    entries.forEach(([key, limit]) => {
      const spent = catTotals[key] || 0;
      const pct   = limit > 0 ? (spent / limit) * 100 : 0;
      const k     = `${monthKey}_${key}`;
      if (pct >= 80 && !alerted[k]) {
        alerted[k] = true;
        localStorage.setItem(alertKey, JSON.stringify(alerted));
        const catLabel = CATEGORIES[key]?.label || key;
        API.post('/api/notify/budget-alert', {
          category: catLabel,
          spent:    spent.toFixed(2),
          limit:    limit.toFixed(2),
          pct:      pct.toFixed(0),
        }).catch(() => {});
      }
    });
  }
}

// =============================================
//  RECURRING — AUTO-GENERATION
// =============================================
async function autoGenerateRecurring() {
  if (Demo.active) return;
  const currentKey = mkKey(new Date());

  const templates = transactions.filter(t => t.fixed && t.date.slice(0, 7) < currentKey);
  if (!templates.length) return;

  const [ty, tm] = currentKey.split('-').map(Number);
  const daysInMonth = new Date(ty, tm, 0).getDate();
  const created = [];

  for (const tpl of templates) {
    const exists = transactions.some(t => t.recurringId === tpl.id && t.date.startsWith(currentKey));
    if (exists) continue;

    const day   = Math.min(parseInt(tpl.date.slice(8, 10), 10), daysInMonth);
    const newTx = {
      ...tpl,
      id:          genId(),
      date:        `${currentKey}-${pad2(day)}`,
      fixed:       false,
      recurringId: tpl.id,
    };
    try {
      await DB.put(newTx);
      transactions.push(newTx);
      created.push(newTx);
    } catch { /* ignore */ }
  }

  if (created.length) {
    Promise.all(created.map(tx => CloudDB.add(tx))).catch(() => {});
    const n = created.length;
    toast(`🔄 ${n} transaç${n === 1 ? 'ão fixa criada' : 'ões fixas criadas'} automaticamente para ${monthLabel(new Date())}!`);
    renderAll();
  }
}

// =============================================
//  ONBOARDING
// =============================================
function shouldShowOnboarding() {
  if (Demo.active) return false;
  return !loadProfile().onboarded;
}

function showOnboarding() {
  document.getElementById('onboarding-screen').classList.remove('hidden');
  obGoTo(1);
}

function obGoTo(step) {
  document.querySelectorAll('.onboarding-step').forEach((el, i) => {
    el.classList.toggle('hidden', i + 1 !== step);
  });
  document.querySelectorAll('.ob-dot').forEach((dot, i) => {
    dot.classList.toggle('ob-dot-active', i + 1 === step);
    dot.classList.toggle('ob-dot-done',   i + 1 < step);
  });
}

function obSkip() { completeOnboarding(); }
function obBack(step) { obGoTo(step); }

function obStep1Next() {
  const nameInput = document.getElementById('ob-name');
  const name = nameInput ? nameInput.value.trim() : '';
  if (name) { saveProfile({ name }); updateProfileUI(); }
  obGoTo(2);
}

function obStep2Next() {
  obGoTo(3);
  obExpenses = [];
  renderObExpenses();
}

function obAddExpenseRow() {
  obExpenses.push({ desc: '', amount: 0, category: 'moradia' });
  renderObExpenses();
}

function obRemoveExpense(i) {
  obExpenses.splice(i, 1);
  renderObExpenses();
}

function renderObExpenses() {
  const list = document.getElementById('ob-recurring-list');
  if (!list) return;
  if (!obExpenses.length) {
    list.innerHTML = '<p class="ob-no-expenses">Nenhuma adicionada. Pode pular!</p>';
    return;
  }
  list.innerHTML = obExpenses.map((exp, i) => `
    <div class="ob-expense-row">
      <input type="text" class="ob-expense-desc" placeholder="Ex: Aluguel"
             value="${escHtml(exp.desc)}"
             onchange="obExpenses[${i}].desc=this.value">
      <select class="ob-expense-cat" onchange="obExpenses[${i}].category=this.value">
        ${Object.entries(CATEGORIES).map(([k, c]) =>
          `<option value="${k}"${k === exp.category ? ' selected' : ''}>${c.icon} ${c.label}</option>`
        ).join('')}
      </select>
      <input type="number" class="ob-expense-amount" placeholder="R$"
             value="${exp.amount || ''}"
             onchange="obExpenses[${i}].amount=parseFloat(this.value)||0">
      <button class="ob-expense-remove" onclick="obRemoveExpense(${i})">✕</button>
    </div>`).join('');
}

async function obFinish() {
  const btn = document.getElementById('ob-finish-btn');
  if (btn) btn.disabled = true;

  const today      = todayLocal();
  const [y, m]     = today.split('-');
  const incomeDate = `${y}-${m}-05`;
  const created    = [];

  const incomeVal  = parseFloat(document.getElementById('ob-income')?.value) || 0;
  const incomeDesc = (document.getElementById('ob-income-desc')?.value || 'Salário').trim();

  if (incomeVal > 0) {
    const tx = {
      id: genId(), type: 'receita', amount: incomeVal,
      category: 'outros', description: incomeDesc,
      notes: '', date: incomeDate, fixed: true,
      paymentMethod: null, invoiceItems: null, benefitType: null,
    };
    try { await DB.put(tx); transactions.push(tx); created.push(tx); } catch { /* ignore */ }
  }

  for (const exp of obExpenses.filter(e => e.desc && e.amount > 0)) {
    const tx = {
      id: genId(), type: 'despesa', amount: exp.amount,
      category: exp.category || 'outros', description: exp.desc,
      notes: '', date: incomeDate, fixed: true,
      paymentMethod: null, invoiceItems: null, benefitType: null,
    };
    try { await DB.put(tx); transactions.push(tx); created.push(tx); } catch { /* ignore */ }
  }

  if (created.length && !Demo.active) {
    Promise.all(created.map(tx => CloudDB.add(tx))).catch(() => {});
  }

  completeOnboarding();
  renderAll();
  if (created.length) {
    const n = created.length;
    toast(`Perfeito! ${n} transaç${n === 1 ? 'ão adicionada' : 'ões adicionadas'}! 🎉`);
  }
}

function completeOnboarding() {
  saveProfile({ onboarded: true });
  const screen = document.getElementById('onboarding-screen');
  if (screen) screen.classList.add('hidden');
}

// =============================================
//  PROFILE
// =============================================
function _profileKey() { return `atlas_profile_${Auth.userId || 'anon'}`; }

function loadProfile() {
  return JSON.parse(localStorage.getItem(_profileKey()) || '{}');
}

function saveProfile(data) {
  localStorage.setItem(_profileKey(), JSON.stringify({ ...loadProfile(), ...data }));
  if (!Demo.active) {
    const { photo, ...serverData } = data;
    // Sincroniza URL da foto (curta) mas nunca base64 (enorme → quebra o JWT)
    if (photo && photo.startsWith('http')) serverData.photo = photo;
    if (Object.keys(serverData).length > 0) {
      API.req('PATCH', '/api/profile', serverData).catch(() => {});
    }
  }
}

async function syncProfileFromServer() {
  if (Demo.active) return;
  try {
    const remote = await API.req('GET', '/api/profile');
    if (remote && typeof remote === 'object' && Object.keys(remote).length) {
      localStorage.setItem(_profileKey(), JSON.stringify({ ...loadProfile(), ...remote }));
    }
  } catch { /* offline ou sem sessão — mantém cache local */ }
}

function updateProfileUI() {
  const profile  = loadProfile();
  const email    = Demo.active ? 'Modo Demo' : (Auth.email || '');
  const rawName  = profile.name || (email ? email.split('@')[0] : '');
  const name     = rawName || '—';
  const initial  = name !== '—' ? name[0].toUpperCase() : '?';

  // Header mini avatar
  const miniEl = document.getElementById('profile-avatar-mini');
  if (miniEl) {
    if (profile.photo) {
      miniEl.innerHTML = `<img src="${profile.photo}" alt="Foto" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    } else {
      miniEl.innerHTML = `<span class="profile-initial-mini">${initial}</span>`;
    }
  }

  // Header greeting
  const greetEl   = document.getElementById('header-greeting');
  const greetName = document.getElementById('header-greeting-name');
  if (greetEl && greetName) {
    greetName.textContent = name !== '—' ? name : '';
    greetEl.classList.toggle('hidden', name === '—');
  }

  const h = new Date().getHours();
  const saudacao = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';

  // Dashboard hero title (desktop)
  const heroTitle = document.getElementById('dash-hero-title');
  if (heroTitle) {
    heroTitle.textContent = name !== '—' ? `${saudacao}, ${name}.` : `${saudacao}.`;
  }

  // Mobile greeting
  const mobGreetName = document.getElementById('mob-greeting-name');
  const mobGreetSub  = document.getElementById('mob-greeting-sub');
  const mobAvatar    = document.getElementById('mob-avatar');
  if (mobGreetName) mobGreetName.textContent = name !== '—' ? name + ' 👋' : '👋';
  if (mobAvatar)    mobAvatar.textContent    = initial;
  // Avatares extras (IA e Invest.)
  const mobIaAvatar  = document.getElementById('mob-ia-avatar');
  const mobInvAvatar = document.getElementById('mob-inv-avatar');
  if (mobIaAvatar)  mobIaAvatar.textContent  = initial;
  if (mobInvAvatar) mobInvAvatar.textContent = initial;
  // Mês na tela de investimentos
  const mobInvMonth = document.getElementById('mob-inv-month');
  if (mobInvMonth) mobInvMonth.textContent = currentDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase());
  if (mobGreetSub) mobGreetSub.textContent = `${saudacao},`;

  // Panel avatar
  const panelImg = document.getElementById('profile-avatar-img');
  if (panelImg) {
    panelImg.innerHTML = profile.photo
      ? `<img src="${profile.photo}" alt="Foto">`
      : `<span class="profile-avatar-initial">${initial}</span>`;
  }

  // Panel name + email
  const nameEl  = document.getElementById('profile-name-display');
  const emailEl = document.getElementById('profile-email-display');
  if (nameEl)  nameEl.textContent  = name;
  if (emailEl) emailEl.textContent = email || '—';
}

async function openProfilePanel() {
  if (!Demo.active && !Auth.email) {
    await Auth.check().catch(() => {});
  }
  updateProfileUI();
  document.getElementById('profile-panel-overlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeProfilePanel() {
  document.getElementById('profile-panel-overlay').classList.add('hidden');
  document.body.style.overflow = '';
}

function openSettingsModal() {
  const accountSection = document.getElementById('auth-user-bar');
  if (accountSection) accountSection.classList.toggle('hidden', Demo.active);
  openModal('modal-settings');
}

async function resetPassword() {
  const email = Auth.email;
  if (!email) { toast('Nenhum email encontrado.', 'err'); return; }
  const btn = document.getElementById('btn-reset-password');
  if (btn) btn.disabled = true;
  try {
    await API.req('POST', '/api/auth/reset-password', { email });
    toast(`Email enviado para ${email}. Verifique sua caixa de entrada.`);
  } catch (err) {
    toast('Erro ao enviar email: ' + err.message, 'err');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function deleteAccount() {
  const textEl   = document.getElementById('delete-account-text');
  const loaderEl = document.getElementById('delete-account-loader');
  const btn      = document.getElementById('btn-confirm-delete');
  if (btn)      btn.disabled    = true;
  if (textEl)   textEl.classList.add('hidden');
  if (loaderEl) loaderEl.classList.remove('hidden');
  try {
    await API.req('DELETE', '/api/auth/account');
    Auth._clearDisplay();
    localStorage.clear();
    window.location.reload();
  } catch (err) {
    toast('Erro ao excluir conta: ' + err.message, 'err');
    if (btn)      btn.disabled    = false;
    if (textEl)   textEl.classList.remove('hidden');
    if (loaderEl) loaderEl.classList.add('hidden');
    closeModal('modal-confirm-delete');
  }
}

function saveProfileName() {
  const input = document.getElementById('edit-name-input');
  const name  = input.value.trim();
  if (!name) return;
  saveProfile({ name });
  closeModal('modal-edit-name');
  updateProfileUI();
  toast('Nome atualizado!');
}

// =============================================
//  UTILITIES
// =============================================
const fmt   = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
const pad2  = n  => String(n).padStart(2, '0');
const mkKey = d  => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

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
          .replace(/^\w/, c => c.toUpperCase())
          .replace(' de ', ' · ');
}

function txOfMonth(d = currentDate) {
  const key = mkKey(d);
  const [ty, tm] = key.split('-').map(Number);
  const daysInMonth = new Date(ty, tm, 0).getDate();

  // Non-fixed transactions for this month (includes auto-generated recurring copies)
  const regular = transactions.filter(t => !t.fixed && t.date.startsWith(key));

  // Project fixed templates only for those without real generated copies this month
  const generatedTemplateIds = new Set(regular.filter(t => t.recurringId).map(t => t.recurringId));
  const fixed = transactions
    .filter(t => t.fixed && t.date.slice(0, 7) <= key && !generatedTemplateIds.has(t.id))
    .map(t => {
      const day = Math.min(parseInt(t.date.slice(8, 10), 10), daysInMonth);
      return { ...t, date: `${key}-${pad2(day)}` };
    });

  return [...regular, ...fixed];
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function toast(msg, type = 'ok', undoFn = null) {
  const el = document.getElementById('toast');
  el.style.borderColor = type === 'err' ? 'rgba(239,68,68,.4)' : 'rgba(255,255,255,.15)';
  if (undoFn) {
    el.innerHTML = `<span>${escHtml(msg)}</span><button class="toast-undo" type="button">Desfazer</button>`;
    el.querySelector('.toast-undo').onclick = () => {
      clearTimeout(el._tid);
      el.classList.remove('show');
      undoFn();
    };
  } else {
    el.textContent = msg;
  }
  el.classList.add('show');
  clearTimeout(el._tid);
  el._tid = setTimeout(() => el.classList.remove('show'), undoFn ? 5000 : 2800);
}

// =============================================
//  STATUS INDICATORS
// =============================================
function setDbStatus(status) {
  const titles = {
    connected: 'Banco local conectado',
    error:     'Erro no banco',
    loading:   'Carregando...',
  };
  ['db-status-dot', 'db-status-dot-header'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = `db-dot db-${status}`;
    el.title     = titles[status] || '';
  });
}

function setCloudStatus(status, label) {
  const dot = document.getElementById('db-status-dot-header');
  if (dot) {
    dot.className = `db-dot db-${status}`;
    dot.title     = (label ? label + '\n' : '') + 'Toque para sincronizar';
  }
}

// =============================================
//  CLOUD SYNC
// =============================================
async function syncFromCloud() {
  setCloudStatus('loading', 'Sincronizando...');
  try {
    const remote    = await CloudDB.getAll();
    const remoteIds = new Set(remote.map(t => t.id));
    const local     = await DB.getAll();
    for (const tx of remote)                                   await DB.put(tx);
    for (const tx of local.filter(t => !remoteIds.has(t.id))) await DB.remove(tx.id);
    transactions = remote;
    renderAll();
    setCloudStatus('connected', `${remote.length} transações sincronizadas`);
  } catch (err) {
    console.warn('Cloud sync error:', err.message);
    setCloudStatus('error', 'Erro ao sincronizar: ' + err.message);
    toast('Erro ao sincronizar com a nuvem: ' + err.message, 'err');
  }
}

// =============================================
//  RENDER — MONTH LABEL
// =============================================
function renderMonthLabel() {
  const label = monthLabel(currentDate);
  document.getElementById('current-month-label').textContent = label;
  const heroLabel = document.getElementById('dash-hero-month-label');
  if (heroLabel) heroLabel.textContent = label;
  const txLabel = document.getElementById('tx-month-label');
  if (txLabel) txLabel.textContent = label;
}

// =============================================
//  RENDER — SUMMARY CARDS
// =============================================
function renderCards(txs) {
  const income  = txs.filter(t => t.type === 'receita').reduce((s, t) => s + t.amount, 0);
  const expense = txs.filter(t => t.type === 'despesa').reduce((s, t) => s + t.amount, 0);
  const balance = income - expense;

  document.getElementById('income-value').textContent  = fmt(income);
  document.getElementById('expense-value').textContent = fmt(expense);
  document.getElementById('balance-value').textContent = fmt(balance);
  document.getElementById('balance-value').style.color = balance >= 0 ? 'var(--green-l)' : '#f87171';

  const mobInc = document.getElementById('mob-income-val');
  const mobExp = document.getElementById('mob-expense-val');
  if (mobInc) mobInc.textContent = fmt(income);
  if (mobExp) mobExp.textContent = fmt(expense);

  // Dashboard hero sub (contexto de economia)
  const heroSub = document.getElementById('dash-hero-sub');
  if (heroSub) {
    const mes = currentDate.toLocaleString('pt-BR', { month: 'long' });
    if (income > 0) {
      heroSub.innerHTML = balance >= 0
        ? `Você está economizando <span class="hero-amount">${fmt(balance)}</span> em ${mes}.`
        : `Suas despesas superaram as receitas em ${mes}.`;
    } else {
      heroSub.textContent = `Sem receitas registradas em ${mes}.`;
    }
  }

  // Mobile IA projection
  const projMonth = document.getElementById('mob-proj-month');
  const proj6m    = document.getElementById('mob-proj-6m');
  const proj12m   = document.getElementById('mob-proj-12m');
  const projRate  = document.getElementById('mob-proj-rate');
  const projNote  = document.getElementById('mob-ia-proj-note');
  if (projMonth) projMonth.textContent = (balance >= 0 ? '+' : '−') + fmt(Math.abs(balance));
  if (proj6m)    proj6m.textContent    = (balance >= 0 ? '+' : '−') + fmt(Math.abs(balance * 6));
  if (proj12m)   proj12m.textContent   = (balance >= 0 ? '+' : '−') + fmt(Math.abs(balance * 12));
  if (projRate && income > 0) projRate.textContent = ((balance / income) * 100).toFixed(1) + '%';
  if (projNote)  projNote.textContent  = balance >= 0
    ? '✓ Atualmente suas receitas superam suas despesas — você está no verde.'
    : '⚠ Suas despesas superaram as receitas neste mês.';

  // Transactions page sub header
  const txSub = document.getElementById('tx-page-sub');
  if (txSub) {
    const count = document.getElementById('filter-count')?.textContent || '';
    txSub.innerHTML = [
      count ? `<span>${count}</span>` : '',
      `<span class="sep">·</span><span class="inc">+${fmt(income)} receitas</span>`,
      `<span class="sep">·</span><span class="exp">−${fmt(expense)} despesas</span>`,
    ].join('');
  }
  const txMonthTitle = document.getElementById('tx-page-month-title');
  if (txMonthTitle) {
    txMonthTitle.textContent = monthLabel(currentDate);
  }
  document.getElementById('balance-sub').textContent   = income > 0
    ? `${((expense / income) * 100).toFixed(0)}% da receita gasto`
    : 'Sem receitas no mês';

  // Card Investido (usa dados do portfólio, se disponíveis)
  const invValueEl = document.getElementById('invested-value');
  const invSubEl   = document.getElementById('invested-sub');
  if (invValueEl && typeof _portfolioStats === 'function') {
    try {
      const { patrimonio, cdi_gain } = _portfolioStats();
      invValueEl.textContent = fmt(patrimonio);
      if (invSubEl) {
        invSubEl.textContent = cdi_gain > 0
          ? `+${fmt(cdi_gain)} este mês`
          : patrimonio > 0 ? 'ver detalhes →' : 'Nenhum investimento';
        invSubEl.style.color = cdi_gain > 0 ? 'var(--green-l)' : '';
      }
    } catch (_) {}
  }

  // Card IA: insight calculado com base nas despesas do mês
  _renderDashAiCard(txs);

  // Card Meta: reserva de emergência / meta de poupança
  _renderDashGoalCard();
}

function _renderDashAiCard(txs) {
  const el = document.getElementById('dash-ai-content');
  const timeEl = document.getElementById('dash-ai-time');
  if (!el) return;

  const expTxs = txs.filter(t => t.type === 'despesa');
  if (!expTxs.length) {
    el.textContent = 'Sem despesas registradas neste mês para analisar.';
    return;
  }

  const catTotals = {};
  expTxs.forEach(t => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount; });
  const totalExp = expTxs.reduce((s, t) => s + t.amount, 0);
  const topEntry = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0];
  if (!topEntry) return;

  const cat = CATEGORIES[topEntry[0]];
  const pct = ((topEntry[1] / totalExp) * 100).toFixed(1);
  const catLabel = cat ? cat.label : topEntry[0];
  el.innerHTML = `<strong>${catLabel}</strong> representa <strong>${pct}%</strong> dos seus gastos no mês (${fmt(topEntry[1])}). Você tem ${expTxs.length} despesa${expTxs.length > 1 ? 's' : ''} registrada${expTxs.length > 1 ? 's' : ''}.`;
  if (timeEl) {
    const h = new Date().getHours();
    timeEl.textContent = `${h}:${String(new Date().getMinutes()).padStart(2,'0')}`;
  }
}

function _renderDashGoalCard() {
  const contentEl = document.getElementById('dash-goal-content');
  const labelEl   = document.getElementById('dash-goal-label-text');
  const pctEl     = document.getElementById('dash-goal-pct');
  if (!contentEl) return;

  if (typeof getPortfolioGoalData !== 'function') return;
  const { goal, totalSaved } = getPortfolioGoalData();
  if (!goal) {
    contentEl.innerHTML = `<div class="dash-goal-empty"><span>Nenhuma meta de reserva definida</span><button class="btn-link" id="btn-budget-setup-dash" onclick="openGoalModal()">Configurar →</button></div>`;
    if (labelEl) labelEl.textContent = 'META';
    if (pctEl)   pctEl.textContent   = '';
    return;
  }

  const { name, amount, date } = goal;
  const pct       = Math.min((totalSaved / amount) * 100, 100);
  const remaining = Math.max(amount - totalSaved, 0);
  const barColor  = pct >= 100 ? 'var(--green-l)' : pct >= 80 ? 'var(--yellow,#fbbf24)' : 'var(--violet,var(--purple))';
  const target    = new Date(date + 'T12:00:00');
  const dateLabel = target.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });

  if (labelEl) labelEl.textContent = `META · ${name.toUpperCase()}`;
  if (pctEl)   pctEl.textContent   = `${pct.toFixed(0)}%`;

  contentEl.innerHTML = `
    <div class="dash-goal-amounts">${fmt(totalSaved)}<span class="dash-goal-limit"> / ${fmt(amount)}</span></div>
    <div class="dash-goal-track"><div class="dash-goal-fill" style="width:${pct.toFixed(1)}%;background:${barColor}"></div></div>
    <div class="dash-goal-footer">${pct >= 100 ? 'Meta atingida! 🎉' : `Faltam ${fmt(remaining)}`}<span class="dash-goal-date">Concluída em ~${dateLabel}</span></div>`;
}

// =============================================
//  RENDER — TRANSACTION ITEM
// =============================================
function txHTML(t) {
  const isIncome    = t.type === 'receita';
  const isBenefit   = t.type === 'beneficio';
  const cat         = CATEGORIES[t.category] || CATEGORIES.outros;
  const bt          = isBenefit && t.benefitType ? BENEFIT_TYPES[t.benefitType] : null;
  const note        = t.notes ? `<div class="tx-note">📝 ${escHtml(t.notes)}</div>` : '';
  const fixedBadge  = t.fixed ? '<span class="badge-fixed">🔄 Fixo</span>' : '';
  const benefitBadge = bt ? `<span class="badge-benefit">${bt.label}</span>` : '';
  const isSel       = selectedTxIds.has(t.id);
  const faturaBtn   = (t.invoiceItems && t.invoiceItems.length > 0)
    ? `<button class="tx-fatura-btn" onclick="openViewFaturaModal('${t.id}', event)" title="Ver fatura">📄</button>`
    : '';
  const amtClass  = isIncome ? 'income' : isBenefit ? 'benefit' : 'expense';
  const amtPrefix = isIncome ? '+' : '−';
  const metaLabel = isIncome ? 'Receita' : cat.label;
  const icon      = isIncome ? '💰' : cat.icon;
  return `
    <div class="tx-item${isSel ? ' tx-selected' : ''}" role="button" tabindex="0" data-id="${t.id}" onclick="toggleTxSelection('${t.id}', event)">
      <div class="tx-select-check${isSel ? ' checked' : ''}"></div>
      <div class="tx-icon">${icon}</div>
      <div class="tx-info">
        <div class="tx-desc">${escHtml(t.description)}${fixedBadge}${benefitBadge}${faturaBtn}</div>
        <div class="tx-meta">${metaLabel} &bull; ${fmtDate(t.date)}</div>
        ${note}
      </div>
      <div class="tx-amount ${amtClass}">
        ${amtPrefix}${fmt(t.amount)}
      </div>
      <button class="tx-menu-btn" onclick="openTxMenu('${t.id}', event)" title="Opções">⋮</button>
    </div>`;
}

function toggleTxSelection(id, event) {
  if (event.target.closest('.tx-menu-btn')) return;
  if (event.currentTarget.closest('#tab-dashboard')) return;
  if (window.innerWidth <= 900) { openMobTxSheet(id); return; }
  openTxDetailPanel(id);
}

// =============================================
//  DESKTOP — TRANSACTION DETAIL PANEL
// =============================================
const PAYMENT_LABELS = {
  dinheiro:    '💵 Dinheiro',
  pix:         '⚡ PIX',
  debito:      '💳 Cartão de débito',
  credito:     '💳 Cartão de crédito',
};

function openTxDetailPanel(id) {
  const tx = transactions.find(t => t.id === id);
  if (!tx) return;

  const cat       = CATEGORIES[tx.category] || CATEGORIES.outros;
  const isIncome  = tx.type === 'receita';
  const isBenefit = tx.type === 'beneficio';
  const amtSign   = isIncome ? '+' : '−';
  const amtColor  = isIncome ? 'var(--emerald)' : isBenefit ? '#a78bfa' : 'var(--coral)';
  const amtBg     = isIncome ? 'rgba(20,195,142,.12)' : isBenefit ? 'rgba(124,92,255,.12)' : 'rgba(255,90,106,.12)';
  const amtBorder = isIncome ? 'rgba(20,195,142,.25)' : isBenefit ? 'rgba(124,92,255,.25)' : 'rgba(255,90,106,.25)';
  const typeLabel = isIncome ? 'Receita' : isBenefit ? 'Benefício' : 'Despesa';
  const icon      = isIncome ? '💰' : cat.icon;
  const payLabel  = PAYMENT_LABELS[tx.paymentMethod] || '—';
  const recLabel  = tx.fixed ? '🔄 Fixo mensal' : 'Não recorrente';

  const bt = isBenefit && tx.benefitType ? BENEFIT_TYPES[tx.benefitType] : null;
  const catLabel = isIncome ? 'Receita' : bt ? bt.label : cat.label;
  const catIcon  = isIncome ? '💰' : bt ? bt.icon : cat.icon;

  document.getElementById('tx-detail-content').innerHTML = `
    <div class="tx-detail-body">
      <div class="tx-detail-icon-row">
        <div class="tx-detail-icon" style="background:${cat.color}22;border:1px solid ${cat.color}44">${icon}</div>
        <div>
          <div class="tx-detail-name">${escHtml(tx.description)}</div>
          <div class="tx-detail-date">${fmtDate(tx.date)}${tx.notes ? ' · 📝' : ''}</div>
        </div>
      </div>
      <div class="tx-detail-value-box" style="background:${amtBg};border-color:${amtBorder}">
        <div class="tx-detail-value-label" style="color:${amtColor}88">Valor</div>
        <div class="tx-detail-value-amount" style="color:${amtColor}">${amtSign}${fmt(tx.amount)}</div>
      </div>
      <div class="tx-detail-fields">
        <div class="tx-detail-field">
          <span class="tx-detail-field-key">Tipo</span>
          <span class="tx-detail-field-val">${typeLabel}</span>
        </div>
        <div class="tx-detail-field">
          <span class="tx-detail-field-key">Categoria</span>
          <span class="tx-detail-field-val">${catIcon} ${catLabel}</span>
        </div>
        ${tx.paymentMethod ? `
        <div class="tx-detail-field">
          <span class="tx-detail-field-key">Forma</span>
          <span class="tx-detail-field-val">${payLabel}</span>
        </div>` : ''}
        <div class="tx-detail-field">
          <span class="tx-detail-field-key">Recorrência</span>
          <span class="tx-detail-field-val">${recLabel}</span>
        </div>
        <div class="tx-detail-field">
          <span class="tx-detail-field-key">Notas</span>
          <span class="tx-detail-field-val">${tx.notes ? escHtml(tx.notes) : '—'}</span>
        </div>
      </div>
      ${_buildTxInsight(tx, cat)}
    </div>`;

  const editBtn   = document.getElementById('tx-detail-edit-btn');
  const deleteBtn = document.getElementById('tx-detail-delete-btn');
  editBtn.onclick   = () => { closeTxDetailPanel(); activeTxId = id; openRenameModal(); };
  deleteBtn.onclick = () => { if (confirm('Excluir esta transação?')) { closeTxDetailPanel(); deleteTx(id); } };

  document.getElementById('tx-detail-overlay').classList.add('open');
  document.getElementById('tx-detail-panel').classList.add('open');
}

function closeTxDetailPanel() {
  document.getElementById('tx-detail-overlay')?.classList.remove('open');
  document.getElementById('tx-detail-panel')?.classList.remove('open');
}

function _buildTxInsight(tx, cat) {
  if (tx.type !== 'despesa') return '';
  const catTxs = transactions.filter(t =>
    t.type === 'despesa' && t.category === tx.category &&
    t.date.slice(0, 7) === tx.date.slice(0, 7)
  );
  const totalMonth = catTxs.reduce((s, t) => s + t.amount, 0);
  const allMonthExp = transactions.filter(t =>
    t.type === 'despesa' && t.date.slice(0, 7) === tx.date.slice(0, 7)
  ).reduce((s, t) => s + t.amount, 0);
  const pct = allMonthExp > 0 ? ((totalMonth / allMonthExp) * 100).toFixed(1) : 0;
  const weeks = catTxs.length > 0 ? (totalMonth / 4).toFixed(0) : 0;

  return `
    <div class="tx-detail-insight">
      <div class="tx-detail-insight-label">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        Insight IA
      </div>
      <div class="tx-detail-insight-text">
        <strong>${cat.label}</strong> representa <strong>${pct}%</strong> dos seus gastos no mês.
        ${weeks > 0 ? `Você gastou em média <strong>${fmt(Number(weeks))}</strong> por semana nessa categoria.` : ''}
      </div>
    </div>`;
}

function clearTxSelection() {
  selectedTxIds.clear();
  document.querySelectorAll('.tx-item.tx-selected').forEach(el => {
    el.classList.remove('tx-selected');
    el.querySelector('.tx-select-check')?.classList.remove('checked');
  });
  renderSelectionBar();
}

function renderSelectionBar() {
  const bar = document.getElementById('selection-bar');
  if (!bar) return;
  if (selectedTxIds.size === 0) { bar.classList.add('hidden'); return; }

  const all     = txOfMonth();
  const selected = all.filter(t => selectedTxIds.has(t.id));
  if (selected.length === 0) { bar.classList.add('hidden'); return; }

  bar.classList.remove('hidden');

  const income  = selected.filter(t => t.type === 'receita').reduce((s, t) => s + t.amount, 0);
  const expense = selected.filter(t => t.type === 'despesa').reduce((s, t) => s + t.amount, 0);
  const n       = selected.length;
  const net     = income - expense;

  const parts = [];
  if (expense > 0) parts.push(`<span class="sel-expense">−${fmt(expense)}</span>`);
  if (income  > 0) parts.push(`<span class="sel-income">+${fmt(income)}</span>`);

  document.getElementById('sel-count').textContent   = `${n} selecionada${n !== 1 ? 's' : ''}`;
  document.getElementById('sel-amounts').innerHTML   = parts.join('<span class="sel-dot">·</span>');
  document.getElementById('sel-net').innerHTML       =
    parts.length > 1
      ? `= <span class="${net >= 0 ? 'sel-income' : 'sel-expense'}">${net >= 0 ? '+' : '−'}${fmt(Math.abs(net))}</span>`
      : '';
}

function emptyHTML(msg = 'Nenhuma transação ainda.') {
  return `<div class="empty-state">
    <span class="empty-icon">💸</span>
    <p>${msg}</p>
    <p class="empty-sub">Clique em + para adicionar.</p>
  </div>`;
}

function renderRecent(txs) {
  const recent = [...txs].sort((a, b) => b.date.localeCompare(a.date));
  document.getElementById('recent-transactions').innerHTML =
    recent.length ? recent.map(txHTML).join('') : emptyHTML();
}

function renderAllTxs() {
  const catF   = document.getElementById('filter-category').value;
  const typeF  = document.getElementById('filter-type').value;
  const search = (document.getElementById('filter-search')?.value || '').trim().toLowerCase();
  const list   = txOfMonth()
    .filter(t => !catF   || t.category === catF)
    .filter(t => !typeF  || t.type === typeF)
    .filter(t => !search || t.description.toLowerCase().includes(search) || (t.notes || '').toLowerCase().includes(search))
    .sort((a, b) => b.date.localeCompare(a.date));

  const countText = `${list.length} transaç${list.length === 1 ? 'ão' : 'ões'}`;
  const countEl = document.getElementById('filter-count');
  if (countEl) countEl.textContent = countText;

  // Atualiza subtítulo da aba com contagem + receitas + despesas
  const txSub = document.getElementById('tx-page-sub');
  if (txSub) {
    const txs   = txOfMonth();
    const income  = txs.filter(t => t.type === 'receita').reduce((s, t) => s + t.amount, 0);
    const expense = txs.filter(t => t.type === 'despesa').reduce((s, t) => s + t.amount, 0);
    txSub.innerHTML = [
      `<span>${countText}</span>`,
      `<span class="sep">·</span><span class="inc">+${fmt(income)} receitas</span>`,
      `<span class="sep">·</span><span class="exp">−${fmt(expense)} despesas</span>`,
    ].join('');
  }

  if (!list.length) {
    document.getElementById('all-transactions').innerHTML = emptyHTML('Nenhuma transação encontrada.');
    return;
  }

  // Agrupa por data
  const groups = {};
  list.forEach(t => { (groups[t.date] = groups[t.date] || []).push(t); });

  const DIAS = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
  let html = '';
  for (const [date, txs] of Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]))) {
    const d       = new Date(date + 'T12:00:00');
    const [,mo,dy]= date.split('-');
    const total   = txs.reduce((s, t) => s + (t.type === 'receita' ? t.amount : t.type === 'despesa' ? -t.amount : 0), 0);
    const totCls  = total > 0 ? 'income' : total < 0 ? 'expense' : 'neutral';
    const totStr  = (total >= 0 ? '+' : '−') + fmt(Math.abs(total));
    html += `<div class="tx-day-group">
      <div class="tx-day-header">
        <div><span class="tx-day-name">${DIAS[d.getDay()]}</span><span class="tx-day-date"> · ${dy}/${mo}</span><span class="tx-day-count">${txs.length} ${txs.length === 1 ? 'item' : 'itens'}</span></div>
        <span class="tx-day-total ${totCls}">${totStr}</span>
      </div>
      <div class="tx-day-items">${txs.map(txHTML).join('')}</div>
    </div>`;
  }

  document.getElementById('all-transactions').innerHTML = html;
}

// =============================================
//  RENDER — ANALYSIS STATS
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
//  RENDER — BENEFITS
// =============================================
function openBenefitDetail(key) {
  if (!BENEFIT_TYPES[key] || !benefitAllocations[key]) return;
  _bdPopulate('benefit', key);
  openModal('modal-budget-detail');
}

function renderBenefits(txs) {
  const grid     = document.getElementById('benefits-grid');
  const emptyEl  = document.getElementById('benefits-empty');
  const summaryEl = document.getElementById('benefits-summary');
  if (!grid) return;

  const benefitTxs = txs.filter(t => t.type === 'beneficio');

  if (summaryEl) summaryEl.textContent = '';

  const cards = Object.entries(BENEFIT_TYPES).map(([key, bt]) => {
    const allocated = benefitAllocations[key] || 0;
    const used      = benefitTxs.filter(t => t.benefitType === key).reduce((s, t) => s + t.amount, 0);
    if (allocated === 0 && used === 0) return '';
    const remaining  = allocated - used;
    const pct        = allocated > 0 ? Math.min((used / allocated) * 100, 100) : 0;
    const overBudget = allocated > 0 && used > allocated;
    const barColor   = overBudget ? 'var(--red)' : bt.color;
    const remClass   = overBudget ? 'over-budget' : '';
    const remLabel   = overBudget ? 'Estourado' : fmt(remaining);
    return `
      <div class="benefit-card" onclick="openBenefitDetail('${key}')" title="Ver detalhes de ${bt.label}">
        <div class="benefit-card-header">
          <span class="benefit-icon">${getBenefitSVG(key)}</span>
          <span class="benefit-name">${bt.label}</span>
          <button class="card-dots-btn" onclick="event.stopPropagation();openBenefitMenu(this,'${key}')" title="Opções">⋯</button>
        </div>
        <span class="benefit-allocated">${fmt(allocated)}<span class="benefit-period"> / mês</span></span>
        <div class="benefit-progress-track">
          <div class="benefit-progress-fill" style="width:${pct.toFixed(1)}%;background:${barColor}"></div>
        </div>
        <div class="benefit-footer">
          <span class="benefit-used">Usado: ${fmt(used)}</span>
          <span class="benefit-remaining ${remClass}">${remLabel}</span>
        </div>
      </div>`;
  }).filter(Boolean).join('');

  const quickAdd = `
    <button class="benefit-card benefit-card-add" onclick="openBenefitQuickAdd()" title="Registrar uso de benefício">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      <span>Registrar uso</span>
    </button>`;

  grid.innerHTML = cards ? cards + quickAdd : '';
  if (emptyEl) emptyEl.classList.toggle('hidden', !!cards);
}

function editBenefit(key) {
  document.getElementById('input-vr-amount').value = benefitAllocations.vr || '';
  document.getElementById('input-vt-amount').value = benefitAllocations.vt || '';
  openModal('modal-benefits-config');
  const inputId = key === 'vr' ? 'input-vr-amount' : 'input-vt-amount';
  setTimeout(() => { const el = document.getElementById(inputId); if (el) { el.focus(); el.select(); } }, 120);
}

function removeBenefit(key) {
  benefitAllocations[key] = 0;
  localStorage.setItem(_benefitKey(), JSON.stringify(benefitAllocations));
  renderBenefits(txOfMonth());
  toast(`${BENEFIT_TYPES[key]?.label || 'Benefício'} removido`);
}

function openCardMenu(btn, items) {
  closeCardMenu();
  const menu = document.createElement('div');
  menu.className = 'card-menu-dropdown';
  menu.id = 'active-card-menu';
  items.forEach(({ label, action, danger }) => {
    const item = document.createElement('button');
    item.className = 'card-menu-item' + (danger ? ' danger' : '');
    item.textContent = label;
    item.onclick = () => { closeCardMenu(); action(); };
    menu.appendChild(item);
  });
  document.body.appendChild(menu);
  const rect = btn.getBoundingClientRect();
  menu.style.position = 'fixed';
  menu.style.top  = (rect.bottom + 4) + 'px';
  menu.style.left = Math.max(4, rect.right - 160) + 'px';
  setTimeout(() => document.addEventListener('click', closeCardMenu, { once: true }), 0);
}

function closeCardMenu() {
  const m = document.getElementById('active-card-menu');
  if (m) m.remove();
}

function openBenefitMenu(btn, key) {
  openCardMenu(btn, [
    { label: 'Alterar valor', action: () => editBenefit(key) },
    { label: 'Remover', action: () => removeBenefit(key), danger: true }
  ]);
}

function openBudgetMenu(btn, key) {
  openCardMenu(btn, [
    { label: 'Alterar limite', action: () => openBudgetConfig() },
    { label: 'Remover meta', action: () => removeBudget(key), danger: true }
  ]);
}

function openBenefitQuickAdd() {
  resetTransactionModal();
  selectedType = 'beneficio';
  document.querySelectorAll('.type-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.type === 'beneficio'));
  document.getElementById('benefit-type-group').classList.remove('hidden');
  document.getElementById('category-group').style.display = '';
  document.getElementById('payment-group').style.display  = 'none';
  updateNotesFieldForType('beneficio');
  openModal('modal-transaction');
}

// =============================================
//  RENDER — ALL
// =============================================
function renderAll() {
  const txs = txOfMonth();
  renderCards(txs);
  renderBenefits(txs);
  renderBudgets(txs);
  renderRecent(txs);
  renderAllTxs();
  renderAnalysisStats(txs);
  drawDonut(txs);
  drawLine(txs);
  drawAnalysisChart(txs);
  if (typeof renderProjection === 'function')  renderProjection();
  if (typeof checkAchievements === 'function') checkAchievements();
  document.dispatchEvent(new CustomEvent('atlas:rendered'));
}

// (AI analysis, chat and export moved to js/ai.js and js/export.js)

// =============================================
//  TRANSACTIONS — ADD / DELETE
// =============================================
function resetTransactionModal() {
  selectedCat          = '';
  selectedType         = 'despesa';
  selectedPayment      = '';
  selectedBenefitType  = '';
  selectedFixed        = false;
  invoiceItems         = [];

  document.getElementById('transaction-form').reset();
  document.getElementById('btn-fixed').setAttribute('aria-pressed', 'false');
  document.querySelectorAll('.type-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.type === 'despesa'));
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('selected'));
  document.querySelectorAll('.payment-btn').forEach(b => b.classList.remove('selected'));
  document.querySelectorAll('.benefit-type-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('cat-error').classList.add('hidden');
  document.getElementById('benefit-type-error').classList.add('hidden');
  const amtPreview = document.getElementById('amount-preview');
  if (amtPreview) amtPreview.textContent = '';
  document.getElementById('invoice-group').classList.add('hidden');
  document.getElementById('invoice-items-list').innerHTML = '';
  document.getElementById('invoice-total').classList.add('hidden');
  document.getElementById('amount-group').style.display      = '';
  document.getElementById('category-group').style.display    = '';
  document.getElementById('desc-group').style.display        = '';
  document.getElementById('payment-group').style.display     = '';
  document.getElementById('benefit-type-group').classList.add('hidden');
  updateNotesFieldForType('despesa');
  setTodayDate();
}

async function handleFormSubmit(e) {
  e.preventDefault();

  const amount = parseFloat(document.getElementById('input-amount').value);
  let   desc   = document.getElementById('input-description').value.trim();
  const notes  = document.getElementById('input-notes').value.trim();
  const date   = document.getElementById('input-date').value;

  const hasInvoiceItems = selectedPayment === 'credito' && invoiceItems.length > 0;
  if ((!amount || amount <= 0) && !hasInvoiceItems) return;
  if (!hasInvoiceItems && !desc) return;
  if (!date) return;

  const catErr = document.getElementById('cat-error');
  if ((selectedType === 'despesa' || selectedType === 'beneficio') && !selectedCat && !hasInvoiceItems) {
    catErr.classList.remove('hidden'); return;
  }
  catErr.classList.add('hidden');

  const benefitTypeErr = document.getElementById('benefit-type-error');
  if (selectedType === 'beneficio' && !selectedBenefitType) {
    if (benefitTypeErr) benefitTypeErr.classList.remove('hidden');
    return;
  }
  if (benefitTypeErr) benefitTypeErr.classList.add('hidden');

  if (hasInvoiceItems) {
    if (!selectedCat) selectedCat = 'compras';
    if (!desc) desc = 'Cartão';
  }

  const finalAmount = (selectedPayment === 'credito' && invoiceItems.length > 0)
    ? invoiceItems.reduce((s, it) => s + it.value, 0)
    : amount;

  if (!finalAmount || finalAmount <= 0) return;

  const tx = {
    id:            genId(),
    type:          selectedType,
    amount:        finalAmount,
    category:      selectedType === 'receita' ? 'outros' : selectedCat,
    description:   desc,
    notes,
    date,
    fixed:         selectedFixed,
    paymentMethod: selectedType === 'despesa' ? (selectedPayment || null) : null,
    invoiceItems:  selectedPayment === 'credito' && invoiceItems.length > 0 ? [...invoiceItems] : null,
    benefitType:   selectedType === 'beneficio' ? selectedBenefitType : null,
  };

  closeModal('modal-transaction');
  resetTransactionModal();
  resetAIResult();

  if (Demo.active) {
    transactions.push(tx);
    renderAll();
    toast('Transação adicionada! (modo demo — não salva)');
    return;
  }

  try {
    await DB.put(tx);
    transactions.push(tx);
    renderAll();
    toast('Transação adicionada!');

    CloudDB.add(tx)
      .then(() => setCloudStatus('connected', `${transactions.length} transações sincronizadas`))
      .catch(err => toast('Nuvem: ' + err.message, 'err'));
  } catch (err) {
    toast('Erro ao salvar transação.', 'err');
  }
}

async function deleteTx(id) {
  const tx = transactions.find(t => t.id === id);
  if (!tx) return;

  transactions = transactions.filter(t => t.id !== id);
  resetAIResult();
  renderAll();

  if (Demo.active) {
    toast('Transação removida.', 'ok', () => {
      transactions.push(tx);
      renderAll();
      toast('Exclusão desfeita. (modo demo)');
    });
    return;
  }

  try {
    await DB.remove(id);
    toast('Transação removida.', 'ok', async () => {
      try {
        await DB.put(tx);
        transactions.push(tx);
        renderAll();
        toast('Exclusão desfeita.');
        CloudDB.add(tx)
          .then(() => setCloudStatus('connected', `${transactions.length} transações sincronizadas`))
          .catch(() => {});
      } catch {
        toast('Erro ao desfazer exclusão.', 'err');
      }
    });
    CloudDB.remove(id)
      .then(() => setCloudStatus('connected', `${transactions.length} transações sincronizadas`))
      .catch(err => toast('Nuvem: ' + err.message, 'err'));
  } catch (err) {
    toast('Erro ao remover transação.', 'err');
    transactions.push(tx);
    renderAll();
  }
}

// =============================================
//  TRANSACTION CONTEXT MENU
// =============================================
function openTxMenu(id, event) {
  event.stopPropagation();
  const menu = document.getElementById('tx-context-menu');

  if (activeTxId === id && !menu.classList.contains('hidden')) {
    closeTxMenu();
    return;
  }

  activeTxId = id;
  menu.classList.remove('hidden');

  const inDashboard = !!event.currentTarget.closest('#tab-dashboard');
  const deleteBtn = menu.querySelector('.tx-menu-danger');
  if (deleteBtn) deleteBtn.classList.toggle('hidden', inDashboard);

  const tx = transactions.find(t => t.id === id);
  const fixedBtn = document.getElementById('btn-menu-fixed');
  if (fixedBtn) fixedBtn.textContent = tx?.fixed ? '⏹️ Parar de repetir' : '🔄 Repetir todo mês';
  const btn  = event.currentTarget;
  const rect = btn.getBoundingClientRect();
  const mw   = 190;
  const mh   = 200;
  let left   = rect.right - mw;
  let top    = rect.bottom + 4;

  if (left < 8) left = 8;
  if (left + mw > window.innerWidth - 8) left = window.innerWidth - mw - 8;
  if (top + mh > window.innerHeight - 8) top = rect.top - mh - 4;

  menu.style.left = left + 'px';
  menu.style.top  = top  + 'px';
}

function closeTxMenu() {
  document.getElementById('tx-context-menu').classList.add('hidden');
  activeTxId = null;
}

// =============================================
//  MOBILE — TRANSACTION BOTTOM SHEET
// =============================================
function openMobTxSheet(id) {
  const tx = transactions.find(t => t.id === id);
  if (!tx) return;
  const cat       = CATEGORIES[tx.category] || CATEGORIES.outros;
  const isIncome  = tx.type === 'receita';
  const isBenefit = tx.type === 'beneficio';
  const amtSign   = isIncome ? '+' : '−';
  const amtColor  = isIncome ? 'var(--emerald)' : 'var(--coral)';
  const amtBg     = isIncome ? 'rgba(20,195,142,.15)' : 'rgba(255,90,106,.15)';
  const amtBorder = isIncome ? 'rgba(20,195,142,.25)' : 'rgba(255,90,106,.25)';
  const typeLabel = isIncome ? 'Receita' : isBenefit ? 'Benefício' : 'Despesa';

  document.getElementById('mob-tx-content').innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px;">
      <div style="width:52px;height:52px;border-radius:12px;background:${cat.color}22;border:1px solid ${cat.color}55;display:flex;align-items:center;justify-content:center;font-size:24px;">${isIncome ? '💰' : cat.icon}</div>
      <div style="flex:1">
        <div style="font-size:18px;font-weight:600;letter-spacing:-0.3px;">${escHtml(tx.description)}</div>
        <div style="font-size:12px;color:var(--text-dim);">${fmtDate(tx.date)}</div>
      </div>
    </div>
    <div style="background:linear-gradient(135deg,${amtBg},transparent);border:1px solid ${amtBorder};border-radius:14px;padding:18px;margin-bottom:16px;">
      <div style="font-size:10px;letter-spacing:1.2px;color:var(--text-mute);text-transform:uppercase;font-family:monospace;font-weight:600;">Valor</div>
      <div style="font-size:32px;font-weight:700;color:${amtColor};letter-spacing:-1px;">${amtSign}${fmt(tx.amount)}</div>
    </div>
    <div class="mob-tx-field"><span>Tipo</span><span>${typeLabel}</span></div>
    <div class="mob-tx-field"><span>Categoria</span><span>${isIncome ? '💰' : cat.icon} ${isIncome ? 'Receita' : cat.label}</span></div>
    ${tx.notes ? `<div class="mob-tx-field"><span>Nota</span><span>${escHtml(tx.notes)}</span></div>` : ''}
    ${tx.fixed ? `<div class="mob-tx-field"><span>Recorrência</span><span>🔄 Fixo mensal</span></div>` : ''}
    <div style="display:flex;gap:8px;margin-top:18px;">
      <button onclick="closeMobTxSheet();activeTxId='${tx.id}';openRenameModal()" style="flex:1;padding:12px;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:12px;font-size:14px;font-weight:500;cursor:pointer;font-family:inherit;">✎ Editar</button>
      <button onclick="closeMobTxSheet();if(confirm('Excluir esta transação?'))deleteTx('${tx.id}')" style="flex:1;padding:12px;background:var(--surface);color:var(--coral);border:1px solid var(--border);border-radius:12px;font-size:14px;font-weight:500;cursor:pointer;font-family:inherit;">🗑 Excluir</button>
    </div>`;

  document.getElementById('mob-tx-overlay').classList.add('open');
  document.getElementById('mob-tx-sheet').classList.add('open');
}

function closeMobTxSheet() {
  document.getElementById('mob-tx-overlay')?.classList.remove('open');
  document.getElementById('mob-tx-sheet')?.classList.remove('open');
}

function hideTxMenu() {
  document.getElementById('tx-context-menu').classList.add('hidden');
}

function openRenameModal() {
  if (!activeTxId) return;
  const tx = transactions.find(t => t.id === activeTxId);
  if (!tx) return;
  const modal = document.getElementById('modal-rename-tx');
  modal.dataset.txId = activeTxId;
  hideTxMenu();
  activeTxId = null;
  document.getElementById('rename-input').value = tx.description;
  openModal('modal-rename-tx');
}

async function saveRenameTx() {
  const txId = document.getElementById('modal-rename-tx').dataset.txId;
  if (!txId) return;
  const newDesc = document.getElementById('rename-input').value.trim();
  if (!newDesc) return;
  const tx = transactions.find(t => t.id === txId);
  if (!tx) return;
  tx.description = newDesc;
  closeModal('modal-rename-tx');

  if (Demo.active) { renderAll(); toast('Descrição atualizada. (modo demo — não salva)'); return; }
  try {
    await DB.put(tx);
    renderAll();
    toast('Descrição atualizada.');
    CloudDB.update(tx)
      .then(() => setCloudStatus('connected', `${transactions.length} transações sincronizadas`))
      .catch(err => toast('Nuvem: ' + err.message, 'err'));
  } catch (err) { toast('Erro ao atualizar transação.', 'err'); }
}

function openEditAmountModal() {
  if (!activeTxId) return;
  const tx = transactions.find(t => t.id === activeTxId);
  if (!tx) return;
  const modal = document.getElementById('modal-edit-amount');
  modal.dataset.txId = activeTxId;
  hideTxMenu();
  activeTxId = null;
  document.getElementById('edit-amount-input').value = tx.amount.toFixed(2);
  openModal('modal-edit-amount');
}

async function saveEditAmount() {
  const txId = document.getElementById('modal-edit-amount').dataset.txId;
  if (!txId) return;
  const newAmount = parseFloat(document.getElementById('edit-amount-input').value);
  if (!newAmount || newAmount <= 0) return;
  const tx = transactions.find(t => t.id === txId);
  if (!tx) return;
  tx.amount = newAmount;
  closeModal('modal-edit-amount');

  if (Demo.active) { renderAll(); toast('Valor atualizado. (modo demo — não salva)'); return; }
  try {
    await DB.put(tx);
    renderAll();
    toast('Valor atualizado.');
    CloudDB.update(tx)
      .then(() => setCloudStatus('connected', `${transactions.length} transações sincronizadas`))
      .catch(err => toast('Nuvem: ' + err.message, 'err'));
  } catch (err) { toast('Erro ao atualizar transação.', 'err'); }
}

function openChangeCatModal() {
  if (!activeTxId) return;
  const tx = transactions.find(t => t.id === activeTxId);
  if (!tx) return;
  const modal = document.getElementById('modal-change-cat');
  modal.dataset.txId = activeTxId;
  hideTxMenu();
  activeTxId      = null;
  activeChangeCat = tx.category;

  const grid = document.getElementById('change-cat-grid');
  const renderChangeCatGrid = () => {
    grid.innerHTML = Object.entries(CATEGORIES).map(([key, cat]) => `
      <button type="button" class="cat-btn${activeChangeCat === key ? ' selected' : ''}" data-cat="${key}">
        ${key.startsWith('custom_') ? `<span class="cat-btn-delete" data-delete-cat="${key}" title="Apagar categoria">✕</span>` : ''}
        <span class="cat-icon">${cat.icon}</span>
        <span>${cat.label}</span>
      </button>`).join('') + `
    <button type="button" class="cat-btn cat-btn-add" id="btn-add-cat-change">
      <span class="cat-icon">+</span>
      <span>Nova</span>
    </button>`;
  };
  _refreshChangeCatGrid = renderChangeCatGrid;
  renderChangeCatGrid();

  grid.onclick = e => {
    if (e.target.closest('#btn-add-cat-change')) {
      customCatSource = 'change';
      document.getElementById('btn-cat-icon').textContent = '🏷️';
      document.getElementById('btn-cat-icon').dataset.emoji = '';
      document.getElementById('input-cat-label').value = '';
      document.getElementById('cat-label-error').classList.add('hidden');
      document.getElementById('emoji-picker-panel').classList.add('hidden');
      openModal('modal-custom-cat');
      return;
    }
    const delBtn = e.target.closest('.cat-btn-delete');
    if (delBtn) {
      e.stopPropagation();
      const key = delBtn.dataset.deleteCat;
      deleteCustomCategory(key);
      if (activeChangeCat === key) activeChangeCat = null;
      renderChangeCatGrid();
      return;
    }
    const btn = e.target.closest('.cat-btn');
    if (!btn || btn.id === 'btn-add-cat-change') return;
    grid.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    activeChangeCat = btn.dataset.cat;
  };

  openModal('modal-change-cat');
}

async function saveChangeCat() {
  const txId = document.getElementById('modal-change-cat').dataset.txId;
  if (!txId || !activeChangeCat) return;
  const tx = transactions.find(t => t.id === txId);
  if (!tx) return;
  tx.category     = activeChangeCat;
  activeChangeCat = null;
  closeModal('modal-change-cat');

  if (Demo.active) { renderAll(); toast('Categoria atualizada. (modo demo — não salva)'); return; }
  try {
    await DB.put(tx);
    renderAll();
    toast('Categoria atualizada.');
    CloudDB.update(tx)
      .then(() => setCloudStatus('connected', `${transactions.length} transações sincronizadas`))
      .catch(err => toast('Nuvem: ' + err.message, 'err'));
  } catch (err) { toast('Erro ao atualizar transação.', 'err'); }
}

async function toggleFixedTx() {
  if (!activeTxId) return;
  const tx = transactions.find(t => t.id === activeTxId);
  if (!tx) return;
  tx.fixed = !tx.fixed;
  closeTxMenu();

  if (Demo.active) { renderAll(); toast(tx.fixed ? 'Marcado como fixo. (modo demo)' : 'Removido recorrência. (modo demo)'); return; }
  try {
    await DB.put(tx);
    renderAll();
    toast(tx.fixed ? '🔄 Transação marcada como fixa.' : 'Recorrência removida.');
    CloudDB.update(tx)
      .then(() => setCloudStatus('connected', `${transactions.length} transações sincronizadas`))
      .catch(err => toast('Nuvem: ' + err.message, 'err'));
  } catch (err) { toast('Erro ao atualizar transação.', 'err'); }
}

let faturaEditItems = [];

function openAddToFaturaModal() {
  if (!activeTxId) return;
  const tx = transactions.find(t => t.id === activeTxId);
  if (!tx) return;
  const modal = document.getElementById('modal-add-fatura');
  modal.dataset.txId = activeTxId;
  faturaEditItems = tx.invoiceItems ? [...tx.invoiceItems] : [];
  hideTxMenu();
  activeTxId = null;
  document.getElementById('fatura-edit-desc').value  = '';
  document.getElementById('fatura-edit-value').value = '';
  renderFaturaEditItems();
  openModal('modal-add-fatura');
}

function renderFaturaEditItems() {
  renderItemList(
    faturaEditItems,
    document.getElementById('fatura-edit-list'),
    document.getElementById('fatura-edit-total-value'),
    'fatura-index'
  );
}

async function saveAddToFatura() {
  const txId = document.getElementById('modal-add-fatura').dataset.txId;
  if (!txId || faturaEditItems.length === 0) { toast('Adicione pelo menos um item.', 'err'); return; }
  const tx = transactions.find(t => t.id === txId);
  if (!tx) return;

  tx.invoiceItems = [...faturaEditItems];
  tx.amount       = faturaEditItems.reduce((s, it) => s + it.value, 0);
  tx.description  = tx.description || 'Cartão';
  closeModal('modal-add-fatura');

  if (Demo.active) { renderAll(); toast('Fatura atualizada. (modo demo — não salva)'); return; }
  try {
    await DB.put(tx);
    renderAll();
    toast('Fatura atualizada!');
    CloudDB.update(tx)
      .then(() => setCloudStatus('connected', `${transactions.length} transações sincronizadas`))
      .catch(err => toast('Nuvem: ' + err.message, 'err'));
  } catch (err) { toast('Erro ao atualizar fatura.', 'err'); }
}

function openViewFaturaModal(id, event) {
  event.stopPropagation();
  const tx = transactions.find(t => t.id === id);
  if (!tx || !tx.invoiceItems || tx.invoiceItems.length === 0) return;

  document.getElementById('modal-view-fatura').dataset.txId = id;
  document.getElementById('view-fatura-title').textContent  = tx.description || 'Fatura';
  document.getElementById('view-fatura-date').textContent   = fmtDate(tx.date);

  const list = document.getElementById('view-fatura-list');
  list.innerHTML = tx.invoiceItems.map(it => `
    <div class="view-fatura-item">
      <span class="view-fatura-desc">${escHtml(it.desc)}</span>
      <span class="view-fatura-value">${fmt(it.value)}</span>
    </div>`).join('');

  document.getElementById('view-fatura-total').textContent =
    fmt(tx.invoiceItems.reduce((s, it) => s + it.value, 0));

  openModal('modal-view-fatura');
}

function openAddFaturaFromView() {
  const id = document.getElementById('modal-view-fatura').dataset.txId;
  if (!id) return;
  closeModal('modal-view-fatura');
  activeTxId = id;
  openAddToFaturaModal();
}

function txMenuDelete() {
  const id = activeTxId;
  closeTxMenu();
  deleteTx(id);
}

// =============================================
//  UI BUILDERS
// =============================================
function renderCategoryGrid() {
  const grid = document.getElementById('category-grid');
  grid.innerHTML = Object.entries(CATEGORIES).map(([key, cat]) => `
    <button type="button" class="cat-btn" data-cat="${key}">
      ${key.startsWith('custom_') ? `<span class="cat-btn-delete" data-delete-cat="${key}" title="Apagar categoria">✕</span>` : ''}
      <span class="cat-icon">${cat.icon}</span>
      <span>${cat.label}</span>
    </button>`).join('') + `
    <button type="button" class="cat-btn cat-btn-add" id="btn-add-cat">
      <span class="cat-icon">+</span>
      <span>Nova</span>
    </button>`;
}

function buildCategoryGrid() {
  renderCategoryGrid();
  const grid = document.getElementById('category-grid');
  grid.addEventListener('click', e => {
    if (e.target.closest('#btn-add-cat')) {
      customCatSource = 'add';
      document.getElementById('btn-cat-icon').textContent = '🏷️';
      document.getElementById('btn-cat-icon').dataset.emoji = '';
      document.getElementById('input-cat-label').value = '';
      document.getElementById('cat-label-error').classList.add('hidden');
      document.getElementById('emoji-picker-panel').classList.add('hidden');
      openModal('modal-custom-cat');
      return;
    }
    const delBtn = e.target.closest('.cat-btn-delete');
    if (delBtn) {
      e.stopPropagation();
      const key = delBtn.dataset.deleteCat;
      deleteCustomCategory(key);
      if (selectedCat === key) selectedCat = null;
      renderCategoryGrid();
      return;
    }
    const btn = e.target.closest('.cat-btn');
    if (!btn || !btn.dataset.cat) return;
    grid.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedCat = btn.dataset.cat;
    document.getElementById('cat-error').classList.add('hidden');
  });
}

function renderItemList(items, listEl, totalValueEl, btnDataAttr) {
  const total = items.reduce((s, it) => s + it.value, 0);
  listEl.innerHTML = items.map((it, i) => `
    <div class="invoice-item" data-index="${i}">
      <span class="invoice-item-desc">${escHtml(it.desc)}</span>
      <span class="invoice-item-value">${fmt(it.value)}</span>
      <button type="button" class="invoice-item-remove" data-${btnDataAttr}="${i}">✕</button>
    </div>`).join('') || '<p style="font-size:.8rem;color:var(--text-3);text-align:center;padding:8px 0">Nenhum item ainda</p>';
  totalValueEl.textContent = fmt(total);
  return total;
}

function renderInvoiceItems() {
  const totalEl = document.getElementById('invoice-total');
  const total   = renderItemList(
    invoiceItems,
    document.getElementById('invoice-items-list'),
    document.getElementById('invoice-total-value'),
    'index'
  );
  if (invoiceItems.length > 0) {
    totalEl.classList.remove('hidden');
    document.getElementById('input-amount').value = total.toFixed(2);
  } else {
    totalEl.classList.add('hidden');
    document.getElementById('input-amount').value = '';
  }
}

function buildCategoryFilter() {
  const sel  = document.getElementById('filter-category');
  const prev = sel.value;
  while (sel.options.length > 1) sel.remove(1);
  Object.entries(CATEGORIES).forEach(([key, cat]) => {
    sel.insertAdjacentHTML('beforeend',
      `<option value="${key}">${cat.icon} ${cat.label}</option>`);
  });
  if (prev) sel.value = prev;
}

function initCustomSelects() {
  document.querySelectorAll('.filter-select').forEach(sel => {
    if (sel._customInit) return;
    sel._customInit = true;
    sel.style.display = 'none';

    const wrap = document.createElement('div');
    wrap.className = 'custom-select';
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel);

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'cs-trigger';
    trigger.innerHTML = '<span class="cs-label"></span><span class="cs-arrow">▼</span>';
    wrap.insertBefore(trigger, sel);

    const dropdown = document.createElement('div');
    dropdown.className = 'cs-dropdown';
    dropdown.style.display = 'none';
    wrap.appendChild(dropdown);

    const labelEl = trigger.querySelector('.cs-label');

    function syncLabel() {
      const prefix = sel.dataset.prefix ? sel.dataset.prefix + ' ' : '';
      labelEl.textContent = prefix + (sel.options[sel.selectedIndex]?.text || '');
    }

    function buildOptions() {
      dropdown.innerHTML = '';
      Array.from(sel.options).forEach(opt => {
        const item = document.createElement('div');
        item.className = 'cs-option' + (opt.value === sel.value ? ' cs-selected' : '');
        item.dataset.value = opt.value;
        item.textContent = opt.text;
        item.addEventListener('click', () => {
          sel.value = opt.value;
          syncLabel();
          dropdown.querySelectorAll('.cs-option').forEach(o =>
            o.classList.toggle('cs-selected', o.dataset.value === opt.value));
          close();
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        });
        dropdown.appendChild(item);
      });
    }

    function open() {
      buildOptions();
      dropdown.style.display = 'block';
      wrap.classList.add('open');
    }

    function close() {
      dropdown.style.display = 'none';
      wrap.classList.remove('open');
    }

    trigger.addEventListener('click', e => {
      e.stopPropagation();
      if (wrap.classList.contains('open')) {
        close();
      } else {
        document.querySelectorAll('.custom-select.open').forEach(w => {
          w.classList.remove('open');
          w.querySelector('.cs-dropdown').style.display = 'none';
        });
        open();
      }
    });

    document.addEventListener('click', close);

    const nativeDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
    Object.defineProperty(sel, 'value', {
      get() { return nativeDesc.get.call(this); },
      set(v) { nativeDesc.set.call(this, v); syncLabel(); },
      configurable: true
    });

    new MutationObserver(syncLabel).observe(sel, { childList: true });
    syncLabel();
  });
}

function setTodayDate() {
  document.getElementById('input-date').value = todayLocal();
}

// =============================================
//  MODAL
// =============================================
function openModal(id) {
  _focusStack.push(document.activeElement);
  const overlay = document.getElementById(id);
  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  const inner = overlay.querySelector('.modal') || overlay;
  requestAnimationFrame(() => trapFocus(inner));
}
function closeModal(id) {
  const overlay = document.getElementById(id);
  overlay.classList.add('hidden');
  document.body.style.overflow = '';
  const inner = overlay.querySelector('.modal') || overlay;
  releaseFocus(inner);
  const prev = _focusStack.pop();
  if (prev && typeof prev.focus === 'function') prev.focus();
}

// =============================================
//  TAB SWITCHING
// =============================================
function switchTab(tabName) {
  document.body.dataset.tab = tabName;
  document.body.classList.toggle('tab-dashboard',    tabName === 'dashboard');
  document.body.classList.toggle('tab-transactions', tabName === 'transactions');
  document.querySelectorAll('.nav-tab, .mobile-nav-btn').forEach(btn => {
    const isActive = btn.dataset.tab === tabName;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
  document.querySelectorAll('.tab-content').forEach(s => {
    s.classList.toggle('active', s.id === `tab-${tabName}`);
  });
  const fab        = document.getElementById('btn-add');
  const inlineAdd  = document.getElementById('btn-add-inline');
  const dock       = document.querySelector('.floating-dock');
  const inlineChat = document.getElementById('btn-chat-inline');
  if (tabName === 'transactions') {
    fab.style.display        = 'none';
    inlineAdd.style.display  = 'flex';
    dock.style.display       = '';
    inlineChat.classList.add('hidden');
    const ft = document.getElementById('filter-type');
    const fc = document.getElementById('filter-category');
    if (ft) ft.value = '';
    if (fc) fc.value = '';
    renderAllTxs();
  } else if (tabName === 'analysis') {
    fab.style.display        = 'none';
    inlineAdd.style.display  = 'none';
    dock.style.display       = 'none';
    inlineChat.classList.remove('hidden');
  } else if (tabName === 'investments') {
    fab.style.display        = 'none';
    inlineAdd.style.display  = 'none';
    dock.style.display       = 'none';
    inlineChat.classList.add('hidden');
    setTimeout(() => initInvestments(), 40);
  } else {
    fab.style.display        = '';
    inlineAdd.style.display  = 'none';
    dock.style.display       = '';
    inlineChat.classList.add('hidden');
  }
  if (tabName === 'analysis')  setTimeout(() => { drawAnalysisChart(txOfMonth()); drawAnnualChart(); _setupAnnualYearNav(); autoRunAIOnce(); }, 40);
  if (tabName === 'dashboard') setTimeout(() => { drawLine(txOfMonth()); drawDonut(txOfMonth()); }, 40);
}

function goToTransactions(type, category) {
  switchTab('transactions');
  const selType = document.getElementById('filter-type');
  const selCat  = document.getElementById('filter-category');
  if (selType) selType.value = type || '';
  if (selCat)  selCat.value  = category || '';
  renderAllTxs();
}


// =============================================
//  EVENT BINDING
// =============================================
function updateNotesFieldForType(type) {
  const label    = document.querySelector('label[for="input-notes"] .optional');
  const textarea = document.getElementById('input-notes');
  if (type === 'receita') {
    if (label) label.textContent = '(de onde veio?)';
    textarea.placeholder = 'Ex: Salário, hora extra, freelance, rendimento de investimento...';
  } else if (type === 'beneficio') {
    if (label) label.textContent = '(onde usou?)';
    textarea.placeholder = 'Ex: Almoço no restaurante, compra no mercado...';
  } else {
    if (label) label.textContent = '(por que gastou isso?)';
    textarea.placeholder = 'Ex: Comemoração de aniversário, compra por impulso, mensalidade obrigatória...';
  }
}

function bindEvents() {
  // FAB — nova transação (desktop floating dock)
  document.getElementById('btn-add').addEventListener('click', () => {
    resetTransactionModal();
    openModal('modal-transaction');
  });

  // FAB mobile — menu expandível
  const mobFabBtn     = document.getElementById('mob-fab-btn');
  const mobFabMenu    = document.getElementById('mob-fab-menu');
  const mobFabOverlay = document.getElementById('mob-fab-overlay');
  const mobFabIcon    = document.getElementById('mob-fab-icon');

  function toggleMobFab(open) {
    mobFabMenu?.classList.toggle('open', open);
    mobFabOverlay?.classList.toggle('open', open);
    if (mobFabIcon) mobFabIcon.classList.toggle('open', open);
  }

  mobFabBtn?.addEventListener('click', () => {
    toggleMobFab(!mobFabMenu.classList.contains('open'));
  });
  mobFabOverlay?.addEventListener('click', () => toggleMobFab(false));

  document.getElementById('mob-opt-expense')?.addEventListener('click', () => {
    toggleMobFab(false);
    selectedType = 'despesa';
    document.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === 'despesa'));
    resetTransactionModal();
    openModal('modal-transaction');
  });
  document.getElementById('mob-opt-income')?.addEventListener('click', () => {
    toggleMobFab(false);
    selectedType = 'receita';
    document.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === 'receita'));
    resetTransactionModal();
    openModal('modal-transaction');
  });
  document.getElementById('mob-opt-transfer')?.addEventListener('click', () => {
    toggleMobFab(false);
    resetTransactionModal();
    openModal('modal-transaction');
  });
  document.getElementById('mob-opt-invest')?.addEventListener('click', () => {
    toggleMobFab(false);
    switchTab('investments');
  });

  // Mobile bottom sheet close
  document.getElementById('mob-tx-close')?.addEventListener('click', closeMobTxSheet);
  document.getElementById('mob-tx-overlay')?.addEventListener('click', closeMobTxSheet);

  // Mobile IA — botão analisar e perguntas comuns
  document.getElementById('mob-ia-analyze')?.addEventListener('click', () => {
    document.getElementById('btn-chat').click();
  });
  document.querySelectorAll('.mob-ia-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const q = btn.dataset.q;
      document.getElementById('btn-chat').click();
      setTimeout(() => {
        const inp = document.querySelector('.chat-input-area input, #chat-input');
        if (inp) { inp.value = q; inp.dispatchEvent(new Event('input', { bubbles: true })); }
      }, 300);
    });
  });

  // Botão inline na aba de transações
  document.getElementById('btn-add-inline').addEventListener('click', () => {
    resetTransactionModal();
    openModal('modal-transaction');
  });
  document.getElementById('btn-add-inline').style.display = 'none';

  // Fechar modais via [data-close]
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-close]');
    if (t) closeModal(t.dataset.close);
    if (!e.target.closest('#tx-context-menu') && !e.target.closest('.tx-menu-btn')) {
      closeTxMenu();
    }
  });

  // Clique fora do modal
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });

  // Formulário de transação
  document.getElementById('transaction-form').addEventListener('submit', handleFormSubmit);

  // Formulário de categoria customizada
  document.getElementById('form-custom-cat').addEventListener('submit', e => {
    e.preventDefault();
    const label = document.getElementById('input-cat-label').value.trim();
    if (!label) {
      document.getElementById('cat-label-error').classList.remove('hidden');
      return;
    }
    const icon   = document.getElementById('btn-cat-icon').dataset.emoji || '🏷️';
    const colors = ['#f59e0b','#3b82f6','#8b5cf6','#10b981','#ec4899','#84cc16','#f97316','#6366f1','#94a3b8'];
    const color  = colors[Object.keys(CATEGORIES).length % colors.length];
    const key    = 'custom_' + Date.now();
    saveCustomCategory(key, { label, icon, color });
    buildCategoryFilter();
    closeModal('modal-custom-cat');
    toast(`Categoria "${label}" criada!`);
    if (customCatSource === 'change') {
      activeChangeCat = key;
      if (_refreshChangeCatGrid) _refreshChangeCatGrid();
    } else {
      renderCategoryGrid();
      const grid = document.getElementById('category-grid');
      grid.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('selected'));
      const newBtn = grid.querySelector(`[data-cat="${key}"]`);
      if (newBtn) { newBtn.classList.add('selected'); selectedCat = key; }
      document.getElementById('cat-error').classList.add('hidden');
    }
  });

  // Emoji picker
  (function setupEmojiPicker() {
    const EMOJIS = [
      '🏷️','🍕','🍔','🍣','🍺','☕','🛒','🚗','🚌','✈️','🏠','🏥','🎓',
      '📚','💊','💡','🔧','💻','📱','🎮','🎵','🎬','🏋️','⚽','🏊','🐶',
      '🐱','🌱','🌍','♻️','💰','💳','💸','🏦','🎁','🎉','❤️','👔','👗',
      '💄','🧴','🛁','🧹','⚡','💧','🔑','📦','🚀','🌟','🔔','📅',
    ];
    const btn   = document.getElementById('btn-cat-icon');
    const panel = document.getElementById('emoji-picker-panel');

    EMOJIS.forEach(em => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'ep-emoji'; b.textContent = em;
      b.addEventListener('click', () => {
        btn.textContent  = em;
        btn.dataset.emoji = em;
        panel.classList.add('hidden');
      });
      panel.appendChild(b);
    });

    btn.addEventListener('click', e => {
      e.stopPropagation();
      const isHidden = panel.classList.contains('hidden');
      panel.classList.toggle('hidden');
      if (isHidden) {
        const modal    = document.querySelector('#modal-custom-cat .modal');
        const modalRect = modal.getBoundingClientRect();
        const panelW   = 252;
        const panelH   = panel.offsetHeight || 220;
        const gap      = 14;

        let left = modalRect.right + gap;
        if (left + panelW > window.innerWidth - 8) {
          left = modalRect.left - panelW - gap;
        }

        const btnRect = btn.getBoundingClientRect();
        let top = btnRect.top;
        if (top + panelH > window.innerHeight - 8) {
          top = window.innerHeight - panelH - 8;
        }
        if (top < 8) top = 8;

        panel.style.left = left + 'px';
        panel.style.top  = top  + 'px';
      }
    });

    document.addEventListener('click', e => {
      if (!panel.contains(e.target) && e.target !== btn) {
        panel.classList.add('hidden');
      }
    });
  })();

  // Tipo de transação
  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedType = btn.dataset.type;
      const isDespesa   = selectedType === 'despesa';
      const isBeneficio = selectedType === 'beneficio';
      document.getElementById('category-group').style.display     = (isDespesa || isBeneficio) ? '' : 'none';
      document.getElementById('payment-group').style.display      = isDespesa ? '' : 'none';
      document.getElementById('benefit-type-group').classList.toggle('hidden', !isBeneficio);
      if (!isDespesa) {
        document.getElementById('invoice-group').classList.add('hidden');
        invoiceItems    = [];
        selectedPayment = '';
        document.querySelectorAll('.payment-btn').forEach(b => b.classList.remove('selected'));
        document.getElementById('invoice-items-list').innerHTML = '';
        document.getElementById('invoice-total').classList.add('hidden');
      }
      if (!isBeneficio) {
        selectedBenefitType = '';
        document.querySelectorAll('.benefit-type-btn').forEach(b => b.classList.remove('selected'));
        document.getElementById('benefit-type-error').classList.add('hidden');
      }
      document.getElementById('amount-group').style.display = '';
      document.getElementById('desc-group').style.display   = '';
      updateNotesFieldForType(selectedType);
    });
  });

  // Tipo de benefício
  document.getElementById('benefit-type-grid').addEventListener('click', e => {
    const btn = e.target.closest('.benefit-type-btn');
    if (!btn) return;
    document.querySelectorAll('.benefit-type-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedBenefitType = btn.dataset.benefit;
    document.getElementById('benefit-type-error').classList.add('hidden');
  });

  // Toggle seção de benefícios
  document.getElementById('btn-benefits-toggle').addEventListener('click', toggleBenefitsSection);

  // Toggle seção de Meta de Gastos
  document.getElementById('btn-budget-toggle')?.addEventListener('click', toggleBudgetSection);
  document.getElementById('btn-budget-setup')?.addEventListener('click', openBudgetConfig);

  // Configurar benefícios
  document.getElementById('btn-benefits-setup').addEventListener('click', () => {
    document.getElementById('input-vr-amount').value = benefitAllocations.vr || '';
    document.getElementById('input-vt-amount').value = benefitAllocations.vt || '';
    openModal('modal-benefits-config');
  });

  // Toggle Fixo
  document.getElementById('btn-fixed').addEventListener('click', () => {
    selectedFixed = !selectedFixed;
    document.getElementById('btn-fixed').setAttribute('aria-pressed', selectedFixed);
  });

  // Forma de pagamento
  document.getElementById('payment-grid').addEventListener('click', e => {
    const btn = e.target.closest('.payment-btn');
    if (!btn) return;
    const wasSelected = btn.classList.contains('selected');
    document.querySelectorAll('.payment-btn').forEach(b => b.classList.remove('selected'));
    if (!wasSelected) {
      btn.classList.add('selected');
      selectedPayment = btn.dataset.payment;
    } else {
      selectedPayment = '';
    }
    const isCredito = selectedPayment === 'credito';
    document.getElementById('invoice-group').classList.toggle('hidden', !isCredito);
    if (!isCredito) {
      invoiceItems = [];
      document.getElementById('invoice-items-list').innerHTML = '';
      document.getElementById('invoice-total').classList.add('hidden');
    }
  });

  // Adicionar item de fatura
  document.getElementById('btn-add-invoice-item').addEventListener('click', () => {
    const descEl  = document.getElementById('invoice-item-desc');
    const valueEl = document.getElementById('invoice-item-value');
    const desc    = descEl.value.trim();
    const value   = parseFloat(valueEl.value.replace(',', '.'));
    if (!desc || !value || value <= 0) return;
    invoiceItems.push({ desc, value });
    descEl.value  = '';
    valueEl.value = '';
    descEl.focus();
    renderInvoiceItems();
  });

  document.getElementById('invoice-item-desc').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('invoice-item-value').focus(); }
  });

  document.getElementById('invoice-item-value').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('btn-add-invoice-item').click(); }
  });

  // Remover item de fatura (delegado)
  document.getElementById('invoice-items-list').addEventListener('click', e => {
    const btn = e.target.closest('.invoice-item-remove');
    if (!btn) return;
    invoiceItems.splice(parseInt(btn.dataset.index), 1);
    renderInvoiceItems();
  });

  // Modal editar fatura — adicionar item
  document.getElementById('btn-fatura-edit-add').addEventListener('click', () => {
    const descEl  = document.getElementById('fatura-edit-desc');
    const valueEl = document.getElementById('fatura-edit-value');
    const desc    = descEl.value.trim();
    const value   = parseFloat(valueEl.value.replace(',', '.'));
    if (!desc || !value || value <= 0) return;
    faturaEditItems.push({ desc, value });
    descEl.value  = '';
    valueEl.value = '';
    descEl.focus();
    renderFaturaEditItems();
  });

  document.getElementById('fatura-edit-desc').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('fatura-edit-value').focus(); }
  });
  document.getElementById('fatura-edit-value').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('btn-fatura-edit-add').click(); }
  });

  // Modal editar fatura — remover item (delegado)
  document.getElementById('fatura-edit-list').addEventListener('click', e => {
    const btn = e.target.closest('.invoice-item-remove');
    if (!btn) return;
    faturaEditItems.splice(parseInt(btn.dataset.faturaIndex), 1);
    renderFaturaEditItems();
  });

  // Navegação de mês
  document.getElementById('prev-month').addEventListener('click', () => {
    currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    selectedTxIds.clear();
    closeTxDetailPanel();
    renderMonthLabel(); renderAll(); resetAIResult(); renderSelectionBar();
  });
  document.getElementById('next-month').addEventListener('click', () => {
    currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    selectedTxIds.clear();
    closeTxDetailPanel();
    renderMonthLabel(); renderAll(); resetAIResult(); renderSelectionBar();
  });

  // Abas desktop / mobile
  document.getElementById('nav-tabs').addEventListener('click', e => {
    const btn = e.target.closest('.nav-tab');
    if (btn) switchTab(btn.dataset.tab);
  });
  document.querySelector('.mobile-nav').addEventListener('click', e => {
    const btn = e.target.closest('.mobile-nav-btn');
    if (btn) switchTab(btn.dataset.tab);
  });

  document.getElementById('view-all-btn').addEventListener('click', () => switchTab('transactions'));

  // Botão de configurar meta no card do dashboard
  document.getElementById('btn-budget-setup-dash')?.addEventListener('click', openGoalModal);

  // Botões de filtro de período no gráfico de evolução (visual)
  document.querySelectorAll('.dash-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.dash-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const labels = { '7': '7 dias', '30': '30 dias', '90': '90 dias', '365': 'Ano' };
      const periodEl = document.getElementById('dash-line-period');
      if (periodEl) periodEl.textContent = labels[btn.dataset.range] || '30 dias';
    });
  });

  // Filtros
  document.getElementById('filter-category').addEventListener('change', renderAllTxs);
  document.getElementById('filter-type').addEventListener('change', renderAllTxs);
  document.getElementById('filter-search').addEventListener('input', renderAllTxs);

  // Abrir painel de perfil (desktop e avatares mobile)
  document.getElementById('btn-profile').addEventListener('click', openProfilePanel);
  ['mob-avatar', 'mob-ia-avatar', 'mob-inv-avatar'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', openProfilePanel);
  });

  // Fechar painel de perfil
  document.getElementById('btn-profile-close').addEventListener('click', closeProfilePanel);

  // Clique no overlay fecha o painel
  document.getElementById('profile-panel-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('profile-panel-overlay')) closeProfilePanel();
  });

  // Botão engrenagem no topo do painel → configurações
  document.getElementById('btn-profile-to-settings').addEventListener('click', () => {
    closeProfilePanel();
    openSettingsModal();
  });

  // Abrir modal de conquistas
  document.getElementById('btn-open-achievements').addEventListener('click', () => {
    closeProfilePanel();
    if (typeof openAchievementsModal === 'function') openAchievementsModal();
  });

  // Fechar modal de conquistas
  document.getElementById('btn-achievements-close').addEventListener('click', () => {
    if (typeof closeAchievementsModal === 'function') closeAchievementsModal();
  });
  document.getElementById('achievements-modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('achievements-modal-overlay')) {
      if (typeof closeAchievementsModal === 'function') closeAchievementsModal();
    }
  });

  // Logout do painel de perfil
  document.getElementById('btn-profile-logout').addEventListener('click', async () => {
    closeProfilePanel();
    if (!Demo.active) await Auth.signOut();
    else Demo.exit();
    window.location.reload();
  });

  // Editar nome
  document.getElementById('btn-edit-name').addEventListener('click', () => {
    const profile = loadProfile();
    const email   = Demo.active ? 'Modo Demo' : (Auth.email || '');
    const current = profile.name || (email ? email.split('@')[0] : '');
    document.getElementById('edit-name-input').value = current;
    openModal('modal-edit-name');
  });

  // Menu de foto de perfil
  const avatarWrap   = document.getElementById('profile-avatar-wrap');
  const avatarMenu   = document.getElementById('avatar-menu');
  const menuChange   = document.getElementById('avatar-menu-change');
  const menuRemove   = document.getElementById('avatar-menu-remove');
  const photoInput   = document.getElementById('profile-photo-input');

  function closeAvatarMenu() { avatarMenu.classList.remove('open'); }

  avatarWrap.addEventListener('click', e => {
    e.stopPropagation();
    const hasPhoto = !!loadProfile().photo;
    menuRemove.style.display = hasPhoto ? '' : 'none';
    avatarMenu.classList.toggle('open');
  });

  document.addEventListener('click', e => {
    if (!avatarMenu.contains(e.target)) closeAvatarMenu();
  });

  menuChange.addEventListener('click', () => { closeAvatarMenu(); photoInput.click(); });

  menuRemove.addEventListener('click', async () => {
    closeAvatarMenu();
    saveProfile({ photo: null });
    updateProfileUI();
    if (Demo.active) { toast('Foto removida!'); return; }
    try {
      await API.req('DELETE', '/api/profile/photo');
      toast('Foto removida!');
    } catch (err) {
      toast('Foto removida localmente. ' + err.message, 'err');
    }
  });

  photoInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      const base64 = ev.target.result;
      const localProfile = { ...loadProfile(), photo: base64 };
      localStorage.setItem(_profileKey(), JSON.stringify(localProfile));
      updateProfileUI();

      if (Demo.active) { toast('Foto atualizada!'); return; }

      try {
        toast('Enviando foto...');
        const result = await API.req('POST', '/api/profile/photo', { base64 });
        saveProfile({ photo: result.url });
        updateProfileUI();
        toast('Foto atualizada!');
      } catch (err) {
        toast('Foto salva só neste dispositivo. ' + err.message, 'err');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  });

  // Voltar ao perfil a partir das configurações
  document.getElementById('btn-settings-back').addEventListener('click', () => {
    closeModal('modal-settings');
    openProfilePanel();
  });

  // Redefinir senha
  document.getElementById('btn-reset-password').addEventListener('click', resetPassword);

  // Excluir conta → abre confirmação
  document.getElementById('btn-delete-account').addEventListener('click', () => {
    openModal('modal-confirm-delete');
  });

  // Confirmar exclusão
  document.getElementById('btn-confirm-delete').addEventListener('click', deleteAccount);

  // Logout (elemento oculto mantido por compatibilidade)
  document.getElementById('btn-logout').addEventListener('click', async () => {
    if (!Demo.active) await Auth.signOut();
    else Demo.exit();
    window.location.reload();
  });

  // Tema
  document.getElementById('theme-btn-dark').addEventListener('click',  () => { applyTheme('dark');  renderAll(); });
  document.getElementById('theme-btn-light').addEventListener('click', () => { applyTheme('light'); renderAll(); });

  // Tipo de gráfico de análise
  document.querySelectorAll('.chart-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.chart-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      drawAnalysisChart(txOfMonth(), btn.dataset.type);
    });
  });

  // Análise IA
  document.getElementById('btn-analyze').addEventListener('click', runAI);

  // Investimentos — atualizar taxas
  document.getElementById('btn-rates-refresh')?.addEventListener('click', () => {
    _cachedRates = null;
    loadMarketRates();
  });

  // Investimentos — atualizar mercado
  document.getElementById('btn-market-refresh')?.addEventListener('click', () => {
    loadMarketData();
  });

  // Investimentos — carteira
  document.getElementById('btn-portfolio-add')?.addEventListener('click', () => openPortfolioModal());
  document.getElementById('btn-pf-close')?.addEventListener('click',  () => closePortfolioModal());
  document.getElementById('btn-pf-cancel')?.addEventListener('click', () => closePortfolioModal());
  document.getElementById('btn-pf-save')?.addEventListener('click',   () => savePortfolioEntry());

  // Exportar
  document.getElementById('btn-export-excel').addEventListener('click', () => { closeModal('modal-settings'); exportExcel(); });
  document.getElementById('btn-export-pdf').addEventListener('click',   () => { closeModal('modal-settings'); exportPDF(); });

  // Chat
  const toggleChat = () => document.getElementById('chat-panel').classList.toggle('hidden');
  document.getElementById('btn-chat').addEventListener('click', toggleChat);
  document.getElementById('btn-chat-inline').addEventListener('click', toggleChat);
  document.getElementById('btn-chat-close').addEventListener('click', () => {
    document.getElementById('chat-panel').classList.add('hidden');
  });
  document.getElementById('btn-chat-clear').addEventListener('click', clearChat);
  document.getElementById('btn-send').addEventListener('click', sendChatMessage);
  document.getElementById('chat-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
  });

  // Redimensionar — redesenhar gráficos
  window.addEventListener('resize', () => {
    const active = document.querySelector('.tab-content.active');
    if (!active) return;
    const txs = txOfMonth();
    if (active.id === 'tab-dashboard') drawLine(txs);
    if (active.id === 'tab-analysis')  { drawAnalysisChart(txs); drawAnnualChart(); _setupAnnualYearNav(); }
  });

  // Escape — fecha modal, painel de perfil, chat ou menu de contexto (nessa ordem)
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const achievementsOverlay = document.getElementById('achievements-modal-overlay');
    if (achievementsOverlay && !achievementsOverlay.classList.contains('hidden')) {
      if (typeof closeAchievementsModal === 'function') closeAchievementsModal();
      return;
    }
    const visible = [...document.querySelectorAll('.modal-overlay:not(.hidden)')];
    if (visible.length) { closeModal(visible[visible.length - 1].id); return; }
    const profileOverlay = document.getElementById('profile-panel-overlay');
    if (profileOverlay && !profileOverlay.classList.contains('hidden')) { closeProfilePanel(); return; }
    const chat = document.getElementById('chat-panel');
    if (chat && !chat.classList.contains('hidden')) { chat.classList.add('hidden'); return; }
    const detailPanel = document.getElementById('tx-detail-panel');
    if (detailPanel && detailPanel.classList.contains('open')) { closeTxDetailPanel(); return; }
    const menu = document.getElementById('tx-context-menu');
    if (menu && !menu.classList.contains('hidden')) closeTxMenu();
  });

  // Setas para navegar entre abas desktop
  document.getElementById('nav-tabs').addEventListener('keydown', e => {
    const tabs = [...document.querySelectorAll('#nav-tabs .nav-tab')];
    const idx  = tabs.indexOf(document.activeElement);
    if (idx === -1) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); tabs[(idx + 1) % tabs.length].focus(); }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); tabs[(idx - 1 + tabs.length) % tabs.length].focus(); }
  });

  // Enter / Space ativam itens de transação focados via teclado
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const txItem = e.target.closest('.tx-item[role="button"]');
    if (!txItem) return;
    if (e.target.closest('.tx-menu-btn, .tx-fatura-btn')) return;
    e.preventDefault();
    txItem.click();
  });

  // Atalho N — nova transação (apenas fora de inputs e modais)
  document.addEventListener('keydown', e => {
    if (e.target.matches('input, textarea, select, [contenteditable]')) return;
    if (document.querySelector('.modal-overlay:not(.hidden)')) return;
    if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      resetTransactionModal();
      openModal('modal-transaction');
    }
  });

  // Preview de valor em tempo real
  document.getElementById('input-amount').addEventListener('input', e => {
    const preview = document.getElementById('amount-preview');
    if (!preview) return;
    const val = parseFloat(e.target.value);
    preview.textContent = val > 0 ? fmt(val) : '';
  });

  // Swipe para deletar no mobile
  initSwipeToDelete();

  // Mouse spotlight nos cards de receita/despesa
  document.querySelectorAll('.card-clickable').forEach(card => {
    card.addEventListener('mousemove', e => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
    card.addEventListener('mouseleave', () => {
      card.style.removeProperty('--mx');
      card.style.removeProperty('--my');
    });
  });
}

// =============================================
//  SWIPE TO DELETE (mobile)
// =============================================
function initSwipeToDelete() {
  const container = document.getElementById('tab-transactions');
  if (!container) return;

  let startX = 0, startY = 0, txEl = null, axisLocked = null;

  container.addEventListener('touchstart', e => {
    const tx = e.target.closest('.tx-item[role="button"]');
    if (!tx) { txEl = null; return; }
    txEl = tx; axisLocked = null;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    tx.style.transition = 'none';
  }, { passive: true });

  container.addEventListener('touchmove', e => {
    if (!txEl) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (!axisLocked) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      axisLocked = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    }
    if (axisLocked === 'v' || dx > 0) { txEl.style.transform = ''; txEl = null; return; }
    e.preventDefault();
    const clamped = Math.max(dx, -88);
    txEl.style.transform   = `translateX(${clamped}px)`;
    const ratio = Math.min(Math.abs(dx) / 120, 1);
    txEl.style.borderColor = `rgba(239,68,68,${(ratio * 0.6).toFixed(2)})`;
    txEl.style.background  = `rgba(239,68,68,${(ratio * 0.15).toFixed(2)})`;
  }, { passive: false });

  container.addEventListener('touchend', e => {
    if (!txEl) return;
    const dx = e.changedTouches[0].clientX - startX;
    const el = txEl; txEl = null;
    if (dx < -65) {
      el.style.transition = 'transform .22s ease-in, opacity .22s ease-in';
      el.style.transform  = 'translateX(-110%)';
      el.style.opacity    = '0';
      setTimeout(() => deleteTx(el.dataset.id), 200);
    } else {
      el.style.transition  = 'transform .3s ease, border-color .3s, background .3s';
      el.style.transform   = '';
      el.style.borderColor = '';
      el.style.background  = '';
      setTimeout(() => { el.style.transition = ''; }, 300);
    }
  }, { passive: true });
}

// =============================================
//  INIT
// =============================================

async function init() {
  try {
    initTheme();
    bindEvents();
    initCustomSelects();
    initCSVImport();

    if (new URLSearchParams(window.location.search).get('demo') === '1') Demo.enter();
    if (Demo.active) {
      await startApp();
      const tabParam = new URLSearchParams(window.location.search).get('tab');
      if (tabParam) switchTab(tabParam);
      return;
    }

    const loggedIn = await Auth.check();
    if (!loggedIn) {
      window.location.href = '/login';
      return;
    }
    await startApp();
  } catch (err) {
    console.error('[init] erro inesperado:', err);
    window.location.href = '/login';
  }
}

function showDemoBanner() {
  if (window.self !== window.top) return; // skip when embedded in iframe
  document.getElementById('demo-banner').classList.remove('hidden');
  document.body.classList.add('demo-mode');

  document.getElementById('btn-demo-signup').addEventListener('click', () => {
    Demo.exit();
    window.location.href = '/login?signup=1';
  });

  document.getElementById('btn-demo-exit').addEventListener('click', () => {
    document.getElementById('demo-banner').classList.add('hidden');
    document.body.classList.remove('demo-mode');
  });
}

function exitDemoMode() {
  Demo.exit();
  window.location.reload();
}

async function startApp() {
  if (appInitialized) return;
  appInitialized = true;
  document.body.classList.add('tab-dashboard');
  document.body.dataset.tab = 'dashboard';
  renderMonthLabel();
  loadCustomCategories();
  loadBenefitAllocations();
  loadBudgets();
  initBenefitsToggle();
  initBudgetToggle();
  buildCategoryGrid();
  buildCategoryFilter();
  initCustomSelects();
  setTodayDate();
  updateProfileUI();
  // After server profile syncs, refresh profile-dependent state with authoritative data
  syncProfileFromServer().then(() => {
    updateProfileUI();
    loadBudgets();
    renderBudgets(txOfMonth());
    if (shouldShowOnboarding()) showOnboarding();
  });

  if (Demo.active) {
    transactions = Demo.transactions();
    renderAll();
    showDemoBanner();
    setCloudStatus('connected', 'Modo demo');
    return;
  }

  setDbStatus('loading');

  try {
    await DB.open();

    const legacy = JSON.parse(localStorage.getItem('financeai_txs') || '[]');
    if (legacy.length) {
      for (const tx of legacy) await DB.put(tx);
      localStorage.removeItem('financeai_txs');
      toast(`${legacy.length} transações migradas.`);
    }

    transactions = await DB.getAll();
    setDbStatus('connected');
  } catch (err) {
    console.error('IndexedDB error:', err);
    setDbStatus('error');
    toast('Erro ao abrir banco de dados local.', 'err');
  }

  renderAll();
  if (typeof initEnhancements === 'function') initEnhancements();
  setTimeout(() => { if (typeof startTour === 'function') startTour(); }, 1200);

  syncFromCloud().then(async () => {
    await autoGenerateRecurring();
  });

  const dot = document.getElementById('db-status-dot-header');
  if (dot) {
    dot.style.cursor = 'pointer';
    dot.addEventListener('click', () => {
      if (!Demo.active) syncFromCloud();
    });
  }
}

init();
