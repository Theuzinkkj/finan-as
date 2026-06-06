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
  toast('Limites de gastos salvos!');
}

function removeBudget(key) {
  delete budgets[key];
  saveProfile({ budgets });
  renderBudgets(txOfMonth());
  toast('Limite removido!');
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

  document.getElementById('bd-icon').innerHTML         = icon;
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
          ${overBudget ? '<span class="budget-alert-icon"><i class="bi bi-exclamation-triangle-fill"></i></span>' : ''}
          <button class="card-dots-btn" onclick="event.stopPropagation();openBudgetMenu(this,'${key}')" title="Opções"><i class="bi bi-three-dots"></i></button>
        </div>
        <div class="budget-amounts">
          <span class="budget-spent">${fmt(spent)}</span>
          <span class="budget-limit-label"> / ${fmt(limit)}</span>
        </div>
        <div class="budget-progress-track">
          <div class="budget-progress-fill" style="--progress:${pct.toFixed(1)}%;background:${barColor}"></div>
        </div>
        <div class="budget-footer">
          <span class="budget-pct" style="color:${overBudget?'var(--red)':warning?'var(--yellow)':'var(--text-2)'}"><strong>${pct.toFixed(0)}%</strong> utilizado</span>
          <span class="budget-remaining ${remClass}">${overBudget ? remLabel : `${fmt(remaining)} livres`}</span>
        </div>
        <div class="budget-forecast"><i class="bi bi-calendar3"></i> Ciclo encerra em ${new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</div>
      </div>`;
  }).filter(Boolean).join('');

  const quickAdd = `
    <button class="budget-card budget-card-add" onclick="openBudgetConfig()" title="Definir limite por categoria">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      <span>Novo limite</span>
    </button>`;

  grid.innerHTML = cards ? cards + quickAdd : '';
  if (emptyEl) emptyEl.classList.toggle('hidden', !!cards);
  renderGoalsBenefitsOverview(txs);

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
    { label: 'Remover limite', action: () => removeBudget(key), danger: true }
  ]);
}

function renderGoalsBenefitsOverview(txs = txOfMonth()) {
  const income = txs.filter(t => t.type === 'receita').reduce((sum, tx) => sum + tx.amount, 0);
  const expenses = txs.filter(t => t.type === 'despesa').reduce((sum, tx) => sum + tx.amount, 0);
  const saved = Math.max(0, income - expenses);
  const benefitTxs = txs.filter(t => t.type === 'beneficio');
  const benefitLimit = Object.values(benefitAllocations || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const benefitUsed = benefitTxs.reduce((sum, tx) => sum + tx.amount, 0);
  const benefitAvailable = Math.max(0, benefitLimit - benefitUsed);
  const budgetEntries = Object.entries(budgets || {}).filter(([, limit]) => limit > 0);
  const portfolioData = typeof getPortfolioGoalData === 'function'
    ? getPortfolioGoalData()
    : { goal: null, totalSaved: 0 };
  const goal = portfolioData.goal;
  const goalPct = goal?.amount > 0 ? Math.min(100, portfolioData.totalSaved / goal.amount * 100) : 0;
  const activeGoals = goal ? 1 : 0;

  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = value;
    el.classList.remove('value-updated');
    void el.offsetWidth;
    el.classList.add('value-updated');
  };
  setText('goals-saved-month', fmt(saved));
  setText('goals-active-count', activeGoals);
  setText('benefits-available-total', fmt(benefitAvailable));
  setText('goals-average-progress', `${goalPct.toFixed(0)}%`);
  setText('goals-hero-message', saved > 0
    ? `Você economizou ${fmt(saved)} neste mês. Continue assim.`
    : 'Organize seus objetivos e acompanhe cada avanço em um só lugar.');

  const goalGrid = document.getElementById('financial-goal-grid');
  if (goalGrid) {
    if (goal) {
      const remaining = Math.max(0, goal.amount - portfolioData.totalSaved);
      const dateLabel = goal.date
        ? new Date(`${goal.date}T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
        : 'Sem prazo definido';
      goalGrid.innerHTML = `
        <article class="financial-goal-card ${goalPct >= 100 ? 'is-complete' : ''}" onclick="openGoalModal()">
          <div class="financial-goal-top">
            <span class="financial-goal-icon"><i class="bi bi-rocket-takeoff-fill"></i></span>
            <div class="financial-goal-name"><small>META PRINCIPAL</small><strong>${escHtml(goal.name)}</strong></div>
            <span class="financial-goal-percent">${goalPct.toFixed(0)}%</span>
          </div>
          <div class="financial-goal-values"><strong>${fmt(portfolioData.totalSaved)}</strong><span>de ${fmt(goal.amount)}</span></div>
          <div class="financial-goal-track"><div class="financial-goal-fill" style="--progress:${goalPct.toFixed(1)}%"></div></div>
          <div class="financial-goal-meta"><span><i class="bi bi-wallet2"></i> ${goalPct >= 100 ? 'Meta concluída' : `Faltam ${fmt(remaining)}`}</span><span><i class="bi bi-calendar-check"></i> ${dateLabel}</span></div>
        </article>`;
    } else {
      goalGrid.innerHTML = `
        <button class="financial-goal-empty" type="button" onclick="openGoalModal()">
          <span><i class="bi bi-bullseye"></i></span>
          <div><strong>Defina uma meta financeira</strong><small>Escolha um valor, prazo e acompanhe sua evolução.</small></div>
          <i class="bi bi-arrow-right"></i>
        </button>`;
    }
  }

  const insights = [];
  if (benefitLimit > 0) {
    const usagePct = benefitUsed / benefitLimit * 100;
    insights.push({
      icon: 'bi-credit-card-2-front',
      text: usagePct < 35
        ? `Você utilizou apenas <strong>${usagePct.toFixed(0)}%</strong> dos benefícios neste mês.`
        : `Você ainda tem <strong>${fmt(benefitAvailable)}</strong> em benefícios disponíveis.`
    });
  }
  if (goal) {
    insights.push({
      icon: 'bi-graph-up-arrow',
      text: goalPct >= 100
        ? `Sua meta <strong>${escHtml(goal.name)}</strong> foi concluída. Hora de celebrar e criar a próxima.`
        : `Sua meta <strong>${escHtml(goal.name)}</strong> já chegou a ${goalPct.toFixed(0)}%.`
    });
  }
  if (income > 0) {
    const rate = saved / income * 100;
    insights.push({
      icon: rate >= 20 ? 'bi-stars' : 'bi-lightbulb-fill',
      text: rate >= 20
        ? `Sua taxa de economia está em <strong>${rate.toFixed(0)}%</strong>, acima da referência de 20%.`
        : `Separar mais <strong>${fmt(Math.max(0, income * .2 - saved))}</strong> levaria sua economia mensal à referência de 20%.`
    });
  }
  if (!insights.length) {
    insights.push({ icon: 'bi-lightbulb-fill', text: 'Cadastre uma meta ou benefício para receber insights personalizados.' });
  }
  const insightsEl = document.getElementById('goals-insights-list');
  if (insightsEl) {
    insightsEl.innerHTML = insights.slice(0, 3)
      .map(item => `<div class="atlas-insight-item"><i class="bi ${item.icon}"></i><p>${item.text}</p></div>`)
      .join('');
  }

  const unlocked = new Set(Storage.getJSON(Storage.achievKey(), []));
  const monthlyBalances = {};
  (typeof transactions !== 'undefined' ? transactions : []).forEach(tx => {
    if (tx.type !== 'receita' && tx.type !== 'despesa') return;
    const month = String(tx.date || '').slice(0, 7);
    if (!month) return;
    monthlyBalances[month] = (monthlyBalances[month] || 0) + (tx.type === 'receita' ? tx.amount : -tx.amount);
  });
  let savingStreak = 0;
  const cursor = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  while (savingStreak < 120) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    if ((monthlyBalances[key] || 0) <= 0) break;
    savingStreak++;
    cursor.setMonth(cursor.getMonth() - 1);
  }
  const achievementsEl = document.getElementById('goals-achievements-grid');
  if (achievementsEl) {
    achievementsEl.innerHTML = `
      <div class="goal-achievement"><i class="bi bi-fire"></i><strong>${savingStreak}</strong><span>${savingStreak === 1 ? 'mês economizando' : 'meses economizando'}</span></div>
      <div class="goal-achievement"><i class="bi bi-trophy-fill"></i><strong>${goalPct >= 100 ? 1 : 0}</strong><span>meta concluída</span></div>
      <div class="goal-achievement"><i class="bi bi-award-fill"></i><strong>${unlocked.size}</strong><span>conquistas Atlas</span></div>
      <div class="goal-achievement"><i class="bi bi-cash-stack"></i><strong>${fmt(saved)}</strong><span>economizado</span></div>`;
  }

  const commandGoalsEl = document.getElementById('command-goals-list');
  if (commandGoalsEl) {
    if (goal) {
      const remaining = Math.max(0, goal.amount - portfolioData.totalSaved);
      const forecast = goal.date
        ? new Date(`${goal.date}T12:00:00`).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
        : 'Sem previsão';
      commandGoalsEl.innerHTML = `
        <article class="command-goal-item" onclick="openGoalModal()">
          <div class="command-item-top"><span class="command-item-name">${escHtml(goal.name)}</span><span class="command-item-pct">${goalPct.toFixed(0)}% concluído</span></div>
          <div class="command-progress"><span style="--progress:${goalPct.toFixed(1)}%"></span></div>
          <div class="command-item-values"><strong>${fmt(portfolioData.totalSaved)} acumulados</strong><span>de ${fmt(goal.amount)}</span></div>
          <div class="command-goal-footer"><span>Faltam ${fmt(remaining)}</span><span><i class="bi bi-calendar3"></i>${forecast}</span></div>
        </article>`;
    } else {
      commandGoalsEl.innerHTML = '<div class="command-empty">Crie um objetivo para guardar dinheiro e acompanhar sua evolução.</div>';
    }
  }

  const commandSpendingEl = document.getElementById('command-spending-list');
  if (commandSpendingEl) {
    commandSpendingEl.innerHTML = budgetEntries.length
      ? budgetEntries.slice(0, 4).map(([key, limit]) => {
          const category = CATEGORIES[key];
          const spent = txs
            .filter(tx => tx.type === 'despesa' && tx.category === key)
            .reduce((sum, tx) => sum + tx.amount, 0);
          const remaining = limit - spent;
          const usagePct = limit > 0 ? spent / limit * 100 : 0;
          const displayPct = Math.min(100, usagePct);
          const state = usagePct > 100 ? 'danger' : usagePct >= 80 ? 'warning' : '';
          return `
            <article class="command-spending-item ${state}" onclick="openBudgetDetail('${key}')">
              <div class="command-item-top">
                <div class="command-spending-heading"><span class="command-spending-icon">${category?.icon || '<i class="bi bi-tag"></i>'}</span><span class="command-item-name">${category?.label || key}</span></div>
                <span class="command-item-pct">${usagePct.toFixed(0)}% utilizado</span>
              </div>
              <div class="command-progress"><span style="--progress:${displayPct.toFixed(1)}%"></span></div>
              <div class="command-item-values"><strong>${fmt(spent)} gastos</strong><span>limite ${fmt(limit)}</span></div>
              <div class="command-spending-status">${remaining >= 0 ? `Restam ${fmt(remaining)}` : `${fmt(Math.abs(remaining))} acima do limite`}</div>
            </article>`;
        }).join('')
      : '<div class="command-empty">Defina limites mensais para gastar menos por categoria.</div>';
  }

  const commandAchievementsEl = document.getElementById('command-achievements');
  if (commandAchievementsEl) {
    commandAchievementsEl.innerHTML = `
      <div class="command-achievement-row"><i class="bi bi-trophy-fill"></i><span>Metas concluídas</span><strong>${goalPct >= 100 ? 1 : 0}</strong></div>
      <div class="command-achievement-row"><i class="bi bi-piggy-bank-fill"></i><span>Total economizado</span><strong>${fmt(saved)}</strong></div>
      <div class="command-achievement-row"><i class="bi bi-fire"></i><span>Sequência positiva</span><strong>${savingStreak}m</strong></div>`;
  }

  const commandBenefitsEl = document.getElementById('command-benefits-list');
  if (commandBenefitsEl) {
    const benefitItems = Object.entries(BENEFIT_TYPES).map(([key, bt]) => {
      const limit = benefitAllocations[key] || 0;
      const used = benefitTxs.filter(tx => tx.benefitType === key).reduce((sum, tx) => sum + tx.amount, 0);
      if (!limit && !used) return '';
      const pct = limit > 0 ? Math.min(100, used / limit * 100) : 0;
      return `
        <article class="command-benefit-item" style="--item-color:${bt.color}" onclick="openBenefitDetail('${key}')">
          <div class="command-item-top">
            <div class="command-benefit-heading">
              <span class="command-benefit-icon">${getBenefitSVG(key, 15)}</span>
              <div class="command-benefit-copy"><span class="command-item-name">${bt.label}</span><small>${fmt(Math.max(0, limit - used))} disponíveis</small></div>
            </div>
            <span class="command-item-pct">${pct.toFixed(0)}%</span>
          </div>
          <div class="command-progress"><span style="--progress:${pct.toFixed(1)}%"></span></div>
          <div class="command-item-values"><strong>${fmt(used)} utilizados</strong><span>de ${fmt(limit)}</span></div>
        </article>`;
    }).filter(Boolean);
    commandBenefitsEl.innerHTML = benefitItems.length
      ? benefitItems.join('')
      : '<div class="command-empty">Cadastre VR ou VT para acompanhar saldo e consumo.</div>';
  }

  const commandAiEl = document.getElementById('command-ai-list');
  if (commandAiEl) {
    const categoryTotals = {};
    txs.filter(tx => tx.type === 'despesa').forEach(tx => {
      categoryTotals[tx.category] = (categoryTotals[tx.category] || 0) + tx.amount;
    });
    const totalExpenses = Object.values(categoryTotals).reduce((sum, value) => sum + value, 0);
    const topCategory = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0];
    const quickInsights = [];
    if (topCategory && totalExpenses > 0) {
      quickInsights.push(`<strong>${CATEGORIES[topCategory[0]]?.label || topCategory[0]}</strong> representa ${(topCategory[1] / totalExpenses * 100).toFixed(0)}% dos gastos.`);
    }
    if (goal) {
      quickInsights.push(`Seu objetivo <strong>${escHtml(goal.name)}</strong> está ${goalPct.toFixed(0)}% concluído${goal.date ? `, com previsão para ${new Date(`${goal.date}T12:00:00`).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}` : ''}.`);
    }
    if (benefitLimit > 0) {
      quickInsights.push(`Você possui <strong>${fmt(benefitAvailable)}</strong> disponíveis em benefícios.`);
    }
    if (!quickInsights.length) quickInsights.push('Adicione dados financeiros para receber análises rápidas.');
    commandAiEl.innerHTML = quickInsights.slice(0, 3)
      .map((text, index) => `<div class="command-insight"><i class="bi ${index === 0 ? 'bi-graph-up-arrow' : index === 1 ? 'bi-bullseye' : 'bi-wallet2'}"></i><p>${text}</p></div>`)
      .join('');
  }

  const commandAlertsEl = document.getElementById('command-alerts-list');
  if (commandAlertsEl) {
    const alerts = [];
    const overBudget = budgetEntries.find(([key, limit]) => {
      const spent = txs.filter(tx => tx.type === 'despesa' && tx.category === key).reduce((sum, tx) => sum + tx.amount, 0);
      return spent > limit;
    });
    if (overBudget) {
      alerts.push({ type: 'danger', icon: 'bi-exclamation-octagon-fill', text: `<strong>${CATEGORIES[overBudget[0]]?.label || overBudget[0]}</strong> ultrapassou o limite mensal.` });
    }
    const nowDay = new Date().getDate();
    const upcomingFixed = txs.find(tx => tx.type === 'despesa' && tx.fixed && Number(String(tx.date).slice(8, 10)) >= nowDay && Number(String(tx.date).slice(8, 10)) <= nowDay + 7);
    if (upcomingFixed) {
      alerts.push({ type: 'warning', icon: 'bi-calendar-event', text: `<strong>${escHtml(upcomingFixed.description)}</strong> vence nos próximos dias (${fmt(upcomingFixed.amount)}).` });
    }
    if (goal?.date && goalPct < 100 && new Date(`${goal.date}T23:59:59`) < new Date()) {
      alerts.push({ type: 'danger', icon: 'bi-clock-history', text: `A meta <strong>${escHtml(goal.name)}</strong> está fora do prazo definido.` });
    }
    const expenseTxs = txs.filter(tx => tx.type === 'despesa');
    const avgExpense = expenseTxs.length ? expenseTxs.reduce((sum, tx) => sum + tx.amount, 0) / expenseTxs.length : 0;
    const unusualExpense = expenseTxs.find(tx => avgExpense > 0 && tx.amount >= avgExpense * 2.5 && tx.amount >= 100);
    if (unusualExpense) {
      alerts.push({ type: 'warning', icon: 'bi-activity', text: `Gasto acima do padrão: <strong>${escHtml(unusualExpense.description)}</strong> (${fmt(unusualExpense.amount)}).` });
    }
    if (!alerts.length) {
      alerts.push({ type: 'success', icon: 'bi-check-circle-fill', text: 'Nenhum alerta crítico detectado neste mês.' });
    }
    commandAlertsEl.innerHTML = alerts.slice(0, 3)
      .map(alert => `<div class="command-alert ${alert.type}"><i class="bi ${alert.icon}"></i><p>${alert.text}</p></div>`)
      .join('');
  }
}
