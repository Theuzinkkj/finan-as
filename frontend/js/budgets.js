'use strict';

// =============================================
//  BUDGETS
// =============================================
let budgets = {};
let _bdCtx  = { type: '', key: '' };

function loadBudgets() {
  // Source of truth is the server profile (synced to localStorage by syncProfileFromServer)
  budgets = loadProfile().budgets || {};
}

function initBudgetToggle() {
  const open   = Storage.get(Storage.budgetOpenKey()) !== 'false';
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
  Storage.set(Storage.budgetOpenKey(), isOpen ? 'true' : 'false');
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
      Storage.setJSON(Storage.benefitKey(), benefitAllocations);
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
    const alertKey = Storage.budgetAlertKey();
    const alerted  = Storage.getJSON(alertKey, {});
    const monthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
    entries.forEach(([key, limit]) => {
      const spent = catTotals[key] || 0;
      const pct   = limit > 0 ? (spent / limit) * 100 : 0;
      const k     = `${monthKey}_${key}`;
      if (pct >= 80 && !alerted[k]) {
        alerted[k] = true;
        Storage.setJSON(alertKey, alerted);
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

function openBudgetMenu(btn, key) {
  openCardMenu(btn, [
    { label: 'Alterar limite', action: () => openBudgetConfig() },
    { label: 'Remover meta', action: () => removeBudget(key), danger: true }
  ]);
}
