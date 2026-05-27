'use strict';

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
  document.getElementById('balance-sub').textContent = income > 0
    ? `${((expense / income) * 100).toFixed(0)}% da receita gasto`
    : 'Sem receitas no mês';

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

  _renderDashAiCard(txs);
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
    <div class="dash-goal-footer">${pct >= 100 ? 'Meta atingida! <i class="bi bi-trophy-fill"></i>' : `Faltam ${fmt(remaining)}`}<span class="dash-goal-date">Concluída em ~${dateLabel}</span></div>`;
}

// =============================================
//  RENDER — TRANSACTION ITEM
// =============================================
const PAYMENT_LABELS = {
  dinheiro: '<i class="bi bi-cash"></i> Dinheiro',
  pix:      '<i class="bi bi-lightning-fill"></i> PIX',
  debito:   '<i class="bi bi-credit-card-fill"></i> Cartão de débito',
  credito:  '<i class="bi bi-credit-card-2-front-fill"></i> Cartão de crédito',
};

function txHTML(t) {
  const isIncome    = t.type === 'receita';
  const isBenefit   = t.type === 'beneficio';
  const cat         = CATEGORIES[t.category] || CATEGORIES.outros;
  const bt          = isBenefit && t.benefitType ? BENEFIT_TYPES[t.benefitType] : null;
  const note        = t.notes ? `<div class="tx-note"><i class="bi bi-pencil-square"></i> ${escHtml(t.notes)}</div>` : '';
  const fixedBadge  = t.fixed ? '<span class="badge-fixed"><i class="bi bi-arrow-repeat"></i> Fixo</span>' : '';
  const benefitBadge = bt ? `<span class="badge-benefit">${bt.label}</span>` : '';
  const isSel       = selectedTxIds.has(t.id);
  const hasFatura   = t.invoiceItems && t.invoiceItems.length > 0;
  const faturaBtn   = hasFatura
    ? `<button class="tx-fatura-btn tx-fatura-inline" onclick="openViewFaturaModal('${t.id}', event)" title="Ver fatura"><i class="bi bi-file-text"></i></button>`
    : '';
  const faturaMobBtn = hasFatura
    ? `<button class="tx-fatura-btn tx-fatura-mob" onclick="openViewFaturaModal('${t.id}', event)" title="Ver fatura"><i class="bi bi-file-text"></i></button>`
    : '';
  const amtClass  = isIncome ? 'income' : isBenefit ? 'benefit' : 'expense';
  const amtPrefix = isIncome ? '+' : '−';
  const metaLabel = isIncome ? 'Receita' : cat.label;
  const icon      = isIncome ? '<i class="bi bi-cash-stack"></i>' : cat.icon;
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
      ${faturaMobBtn}
      <button class="tx-menu-btn" onclick="openTxMenu('${t.id}', event)" title="Opções">⋮</button>
    </div>`;
}

function toggleTxSelection(id, event) {
  if (event.target.closest('.tx-menu-btn, .tx-fatura-btn')) return;
  if (event.currentTarget.closest('#tab-dashboard')) return;
  if (window.innerWidth <= 900) { openMobTxSheet(id); return; }
  openTxDetailPanel(id);
}

// =============================================
//  DESKTOP — TRANSACTION DETAIL PANEL
// =============================================
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
  const icon      = isIncome ? '<i class="bi bi-cash-stack"></i>' : cat.icon;
  const payLabel  = PAYMENT_LABELS[tx.paymentMethod] || '—';
  const recLabel  = tx.fixed ? '<i class="bi bi-arrow-repeat"></i> Fixo mensal' : 'Não recorrente';

  const bt = isBenefit && tx.benefitType ? BENEFIT_TYPES[tx.benefitType] : null;
  const catLabel = isIncome ? 'Receita' : bt ? bt.label : cat.label;
  const catIcon  = isIncome ? '<i class="bi bi-cash-stack"></i>' : bt ? bt.icon : cat.icon;

  document.getElementById('tx-detail-content').innerHTML = `
    <div class="tx-detail-body">
      <div class="tx-detail-icon-row">
        <div class="tx-detail-icon" style="background:${cat.color}22;border:1px solid ${cat.color}44">${icon}</div>
        <div>
          <div class="tx-detail-name">${escHtml(tx.description)}</div>
          <div class="tx-detail-date">${fmtDate(tx.date)}${tx.notes ? ' · <i class="bi bi-pencil-square"></i>' : ''}</div>
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
  deleteBtn.onclick = () => { closeTxDetailPanel(); deleteTx(id); };

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

  const all      = txOfMonth();
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
    <span class="empty-icon"><i class="bi bi-cash-coin"></i></span>
    <p>${msg}</p>
    <p class="empty-sub">Clique em + para adicionar.</p>
  </div>`;
}

function welcomeEmptyHTML() {
  return `<div class="empty-state empty-state-welcome">
    <span class="empty-icon"><i class="bi bi-hand-wave"></i></span>
    <p><strong>Bem-vindo ao Atlas!</strong></p>
    <p class="empty-sub">Comece registrando sua primeira receita ou despesa.<br>Seus gráficos e resumos aparecerão aqui automaticamente.</p>
    <button class="btn-primary empty-state-cta" onclick="openModal('modal-add-tx')">+ Adicionar primeira transação</button>
  </div>`;
}

function renderRecent(txs) {
  const recent = [...txs].sort((a, b) => b.date.localeCompare(a.date));
  const el = document.getElementById('recent-transactions');
  if (!el) return;
  if (recent.length) {
    el.innerHTML = recent.map(txHTML).join('');
  } else if (transactions.length === 0) {
    el.innerHTML = welcomeEmptyHTML();
  } else {
    el.innerHTML = emptyHTML('Nenhuma transação neste mês.');
  }
}

// =============================================
//  RENDER — TRANSACTIONS LIST (paginada)
// =============================================
const TX_DAYS_PER_PAGE = 10;
let _txDayPage = 1;

function resetTxPagination() { _txDayPage = 1; }

function _updateAdvancedBadge(catCount, dateFrom, dateTo, amtMin, amtMax) {
  let count = 0;
  if (dateFrom || dateTo) count++;
  if (amtMin !== null || amtMax !== null) count++;
  count += catCount;
  const badge = document.getElementById('fadv-badge');
  const btn   = document.getElementById('btn-filters-toggle');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count;
    badge.hidden = false;
    btn?.classList.add('active');
  } else {
    badge.hidden = true;
    btn?.classList.remove('active');
  }
}

function buildAdvancedCategoryFilter() {
  const container = document.getElementById('fadv-cats');
  if (!container) return;
  const checkedBefore = new Set(
    Array.from(container.querySelectorAll('.fadv-cat-chip.checked')).map(c => c.dataset.cat)
  );
  container.innerHTML = '';
  Object.entries(CATEGORIES).forEach(([key, cat]) => {
    const chip = document.createElement('label');
    chip.className = 'fadv-cat-chip' + (checkedBefore.has(key) ? ' checked' : '');
    chip.dataset.cat = key;
    chip.innerHTML = `<input type="checkbox" value="${key}"${checkedBefore.has(key) ? ' checked' : ''}><span>${cat.icon}</span><span>${cat.label}</span>`;
    chip.addEventListener('click', e => {
      e.preventDefault();
      chip.classList.toggle('checked');
      resetTxPagination();
      renderAllTxs();
    });
    container.appendChild(chip);
  });
}

function toggleAdvancedFilters() {
  const panel = document.getElementById('filters-advanced');
  const btn   = document.getElementById('btn-filters-toggle');
  if (!panel) return;
  panel.hidden = !panel.hidden;
  btn?.classList.toggle('open', !panel.hidden);
  if (!panel.hidden) buildAdvancedCategoryFilter();
}

function clearAdvancedFilters() {
  ['filter-date-from', 'filter-date-to', 'filter-amount-min', 'filter-amount-max'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.querySelectorAll('#fadv-cats .fadv-cat-chip.checked').forEach(c => c.classList.remove('checked'));
  resetTxPagination();
  renderAllTxs();
}

function renderAllTxs() {
  const catF      = document.getElementById('filter-category').value;
  const typeF     = document.getElementById('filter-type').value;
  const search    = (document.getElementById('filter-search')?.value || '').trim().toLowerCase();
  const dateFrom  = document.getElementById('filter-date-from')?.value || '';
  const dateTo    = document.getElementById('filter-date-to')?.value   || '';
  const amtMinRaw = document.getElementById('filter-amount-min')?.value;
  const amtMaxRaw = document.getElementById('filter-amount-max')?.value;
  const amountMin = amtMinRaw !== '' && amtMinRaw != null ? parseFloat(amtMinRaw) : null;
  const amountMax = amtMaxRaw !== '' && amtMaxRaw != null ? parseFloat(amtMaxRaw) : null;
  const checkedCats = Array.from(document.querySelectorAll('#fadv-cats .fadv-cat-chip.checked')).map(c => c.dataset.cat);

  const baseList = (dateFrom || dateTo) ? [...transactions] : txOfMonth();

  const list = baseList
    .filter(t => !dateFrom || t.date >= dateFrom)
    .filter(t => !dateTo   || t.date <= dateTo)
    .filter(t => checkedCats.length > 0 ? checkedCats.includes(t.category) : (!catF || t.category === catF))
    .filter(t => !typeF  || t.type === typeF)
    .filter(t => amountMin === null || t.amount >= amountMin)
    .filter(t => amountMax === null || t.amount <= amountMax)
    .filter(t => !search || t.description.toLowerCase().includes(search) || (t.notes || '').toLowerCase().includes(search))
    .sort((a, b) => b.date.localeCompare(a.date));

  _updateAdvancedBadge(checkedCats.length, dateFrom, dateTo, amountMin, amountMax);

  const countText = `${list.length} transaç${list.length === 1 ? 'ão' : 'ões'}`;
  const countEl = document.getElementById('filter-count');
  if (countEl) countEl.textContent = countText;

  const txSub = document.getElementById('tx-page-sub');
  if (txSub) {
    const txs    = txOfMonth();
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

  const groups = {};
  list.forEach(t => { (groups[t.date] = groups[t.date] || []).push(t); });
  const sortedDays = Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));

  const visibleDays   = sortedDays.slice(0, _txDayPage * TX_DAYS_PER_PAGE);
  const remainingDays = sortedDays.length - visibleDays.length;

  const DIAS = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
  let html = '';
  for (const [date, txs] of visibleDays) {
    const d        = new Date(date + 'T12:00:00');
    const [,mo,dy] = date.split('-');
    const total    = txs.reduce((s, t) => s + (t.type === 'receita' ? t.amount : t.type === 'despesa' ? -t.amount : 0), 0);
    const totCls   = total > 0 ? 'income' : total < 0 ? 'expense' : 'neutral';
    const totStr   = (total >= 0 ? '+' : '−') + fmt(Math.abs(total));
    html += `<div class="tx-day-group">
      <div class="tx-day-header">
        <div><span class="tx-day-name">${DIAS[d.getDay()]}</span><span class="tx-day-date"> · ${dy}/${mo}</span><span class="tx-day-count">${txs.length} ${txs.length === 1 ? 'item' : 'itens'}</span></div>
        <span class="tx-day-total ${totCls}">${totStr}</span>
      </div>
      <div class="tx-day-items">${txs.map(txHTML).join('')}</div>
    </div>`;
  }

  if (remainingDays > 0) {
    const remainingTxCount = sortedDays.slice(_txDayPage * TX_DAYS_PER_PAGE).reduce((s, [, txs]) => s + txs.length, 0);
    html += `<div class="tx-load-more-wrap">
      <button class="tx-load-more-btn" onclick="_txDayPage++;renderAllTxs()">
        Carregar mais <span class="tx-load-more-count">(+${remainingTxCount} transaç${remainingTxCount === 1 ? 'ão' : 'ões'})</span>
      </button>
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
  document.getElementById('stat-top-cat').innerHTML   = topCat ? `${topCat.icon} ${topCat.label}` : '—';
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
  drawLine(transactions, _lineRange);
  drawAnalysisChart(txs);
  if (typeof renderProjection === 'function')  renderProjection();
  if (typeof checkAchievements === 'function') checkAchievements();
  document.dispatchEvent(new CustomEvent('atlas:rendered'));
}
