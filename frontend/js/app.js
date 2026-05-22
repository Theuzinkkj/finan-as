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

// =============================================
//  THEME
// =============================================
function initTheme() {
  applyTheme(Storage.get(Storage.THEME, 'dark'));
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  Storage.set(Storage.THEME, theme);
  document.querySelectorAll('.theme-opt').forEach(b => {
    b.classList.toggle('active', b.id === `theme-btn-${theme}`);
  });
}

// =============================================
//  RECURRING — AUTO-GENERATION
// =============================================
async function autoGenerateRecurring() {
  if (Demo.active) return;
  const now        = new Date();
  const currentKey = mkKey(now);

  const templates = transactions.filter(t => t.fixed && t.date.slice(0, 7) < currentKey);
  if (!templates.length) return;

  // Calcula todos os meses desde a criação do template até o mês atual
  function monthsBetween(startKey, endKey) {
    const [sy, sm] = startKey.split('-').map(Number);
    const [ey, em] = endKey.split('-').map(Number);
    const months = [];
    let y = sy, m = sm + 1; // começa no mês seguinte ao template
    while (y < ey || (y === ey && m <= em)) {
      months.push(`${y}-${pad2(m)}`);
      m++;
      if (m > 12) { m = 1; y++; }
    }
    return months;
  }

  const created = [];

  for (const tpl of templates) {
    const tplKey  = tpl.date.slice(0, 7);
    const pending = monthsBetween(tplKey, currentKey);

    for (const key of pending) {
      const exists = transactions.some(t => t.recurringId === tpl.id && t.date.startsWith(key));
      if (exists) continue;

      const [ty, tm]    = key.split('-').map(Number);
      const daysInMonth = new Date(ty, tm, 0).getDate();
      const day         = Math.min(parseInt(tpl.date.slice(8, 10), 10), daysInMonth);
      const newTx = {
        ...tpl,
        id:          genId(),
        date:        `${key}-${pad2(day)}`,
        fixed:       false,
        recurringId: tpl.id,
      };
      try {
        await DB.put(newTx);
        transactions.push(newTx);
        created.push(newTx);
      } catch { /* ignore */ }
    }
  }

  if (created.length) {
    Promise.all(created.map(tx => CloudDB.add(tx))).catch(() => {});
    const n = created.length;
    toast(`🔄 ${n} transaç${n === 1 ? 'ão fixa criada' : 'ões fixas criadas'} automaticamente!`);
    renderAll();
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

function welcomeEmptyHTML() {
  return `<div class="empty-state empty-state-welcome">
    <span class="empty-icon">👋</span>
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

  // Agrupa por data e ordena
  const groups = {};
  list.forEach(t => { (groups[t.date] = groups[t.date] || []).push(t); });
  const sortedDays = Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));

  const visibleDays  = sortedDays.slice(0, _txDayPage * TX_DAYS_PER_PAGE);
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
  document.getElementById('stat-top-cat').textContent = topCat ? `${topCat.icon} ${topCat.label}` : '—';
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
  drawEvolutionChart();
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

  // ── Validação inline com mensagens de erro visíveis ──────────────────
  let _hasError = false;
  function _fieldErr(inputId, errId, condition) {
    const inp = document.getElementById(inputId);
    const err = document.getElementById(errId);
    if (!inp || !err) return;
    if (condition) {
      err.classList.remove('hidden');
      inp.classList.add('input-invalid');
      _hasError = true;
    } else {
      err.classList.add('hidden');
      inp.classList.remove('input-invalid');
    }
  }

  _fieldErr('input-amount', 'amount-error',
    !hasInvoiceItems && (!amount || amount <= 0 || !isFinite(amount)));
  _fieldErr('input-description', 'desc-error',
    !hasInvoiceItems && !desc);
  _fieldErr('input-date', 'date-error',
    !date);

  const catErr = document.getElementById('cat-error');
  const needsCat = (selectedType === 'despesa' || selectedType === 'beneficio') && !selectedCat && !hasInvoiceItems;
  catErr.classList.toggle('hidden', !needsCat);
  if (needsCat) _hasError = true;

  const benefitTypeErr = document.getElementById('benefit-type-error');
  const needsBt = selectedType === 'beneficio' && !selectedBenefitType;
  benefitTypeErr?.classList.toggle('hidden', !needsBt);
  if (needsBt) _hasError = true;

  if (_hasError) {
    const first = document.querySelector('#modal-transaction .input-invalid');
    first?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }

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

  // Detecta duplicata: mesma descrição + valor + data + tipo nos últimos 30s ou mesmo dia
  const isDuplicate = transactions.some(t =>
    t.type === tx.type &&
    t.amount === tx.amount &&
    t.date === tx.date &&
    t.description.trim().toLowerCase() === tx.description.trim().toLowerCase()
  );

  if (isDuplicate) {
    const confirmed = await _confirmDuplicate();
    if (!confirmed) return;
  }

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
    _cachedMonths.add(tx.date.slice(0, 7));
    renderAll();

    const result = await CloudDB.add(tx).catch(async err => {
      if (!navigator.onLine) return { queued: true };
      toast('Nuvem: ' + err.message, 'err');
      return null;
    });

    if (result?.queued) {
      toast('Salvo localmente — sincronizará quando voltar online.');
      await _updatePendingBadge();
    } else if (result !== null) {
      toast('Transação adicionada!');
      setCloudStatus('connected', `${transactions.length} transações sincronizadas`);
    }
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
        const r = await CloudDB.add(tx).catch(() => null);
        if (r) setCloudStatus('connected', `${transactions.length} transações sincronizadas`);
        await _updatePendingBadge();
      } catch {
        toast('Erro ao desfazer exclusão.', 'err');
      }
    });

    const result = await CloudDB.remove(id).catch(async err => {
      if (!navigator.onLine) return { queued: true };
      toast('Nuvem: ' + err.message, 'err');
      return null;
    });

    if (result?.queued) {
      await _updatePendingBadge();
    } else if (result !== null) {
      setCloudStatus('connected', `${transactions.length} transações sincronizadas`);
    }
  } catch (err) {
    toast('Erro ao remover transação.', 'err');
    transactions.push(tx);
    renderAll();
  }
}

// Helper: executa CloudDB.update e trata queue offline / status
async function _cloudUpdate(tx) {
  const result = await CloudDB.update(tx).catch(err => {
    toast('Nuvem: ' + err.message, 'err');
    return null;
  });
  if (result?.queued) await _updatePendingBadge();
  else if (result !== null) setCloudStatus('connected', `${transactions.length} transações sincronizadas`);
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
      <button onclick="closeMobTxSheet();deleteTx('${tx.id}')" style="flex:1;padding:12px;background:var(--surface);color:var(--coral);border:1px solid var(--border);border-radius:12px;font-size:14px;font-weight:500;cursor:pointer;font-family:inherit;">🗑 Excluir</button>
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
    _cloudUpdate(tx);
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
    _cloudUpdate(tx);
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
    _cloudUpdate(tx);
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
    _cloudUpdate(tx);
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
    _cloudUpdate(tx);
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
  if (!document.getElementById('filters-advanced')?.hidden) buildAdvancedCategoryFilter();
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
  document.querySelectorAll('#fadv-cats .fadv-cat-chip.checked').forEach(c => c.classList.remove('checked'));
  resetTxPagination();
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
  document.getElementById('btn-benefits-toggle')?.addEventListener('click', toggleBenefitsSection);

  // Toggle seção de Meta de Gastos
  document.getElementById('btn-budget-toggle')?.addEventListener('click', toggleBudgetSection);
  document.getElementById('btn-budget-setup')?.addEventListener('click', openBudgetConfig);

  // Configurar benefícios
  document.getElementById('btn-benefits-setup')?.addEventListener('click', () => {
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

  // Navegação de mês com lazy loading — busca o mês se ainda não está em cache
  async function _navigateMonth(delta) {
    currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + delta, 1);
    selectedTxIds.clear();
    closeTxDetailPanel();
    resetTxPagination();
    renderMonthLabel();
    resetAIResult();
    renderSelectionBar();

    const monthKey = mkKey(currentDate);
    if (!Demo.active && !_cachedMonths.has(monthKey)) {
      await syncFromCloud(monthKey);
    } else {
      renderAll();
    }
  }

  document.getElementById('prev-month').addEventListener('click', () => _navigateMonth(-1));
  document.getElementById('next-month').addEventListener('click', () => _navigateMonth(+1));

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

  // Goal modal — listeners aqui para funcionar mesmo antes de visitar a aba Investimentos
  document.getElementById('btn-goal-cancel')?.addEventListener('click', () => closeModal('modal-goal'));
  document.getElementById('btn-goal-save')?.addEventListener('click', saveGoalModal);
  document.getElementById('btn-goal-clear')?.addEventListener('click', clearGoalModal);

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

  // Filtros — reseta paginação ao filtrar
  const _debouncedFilter = debounce(() => { resetTxPagination(); renderAllTxs(); }, 300);
  document.getElementById('filter-category').addEventListener('change', () => { resetTxPagination(); renderAllTxs(); });
  document.getElementById('filter-type').addEventListener('change', () => { resetTxPagination(); renderAllTxs(); });
  document.getElementById('filter-search').addEventListener('input', _debouncedFilter);

  // Filtros avançados
  document.getElementById('btn-filters-toggle').addEventListener('click', toggleAdvancedFilters);
  document.getElementById('fadv-clear').addEventListener('click', clearAdvancedFilters);
  ['filter-date-from', 'filter-date-to', 'filter-amount-min', 'filter-amount-max'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', _debouncedFilter);
  });

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
      Storage.setJSON(Storage.profileKey(), localProfile);
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
    if (active.id === 'tab-dashboard') { drawLine(txs); drawEvolutionChart(); }
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
    if (val > 0) {
      document.getElementById('amount-error')?.classList.add('hidden');
      e.target.classList.remove('input-invalid');
    }
  });

  // Limpa erro de descricao ao digitar
  document.getElementById('input-description').addEventListener('input', e => {
    if (e.target.value.trim()) {
      document.getElementById('desc-error')?.classList.add('hidden');
      e.target.classList.remove('input-invalid');
    }
  });

  // Data: limpa erro e avisa sobre data futura
  document.getElementById('input-date').addEventListener('change', e => {
    const val = e.target.value;
    if (val) {
      document.getElementById('date-error')?.classList.add('hidden');
      e.target.classList.remove('input-invalid');
    }
    const fw = document.getElementById('date-future-warn');
    if (fw) fw.classList.toggle('hidden', !val || val <= todayLocal());
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

async function shareMonthlyReport() {
  const txs     = txOfMonth();
  const income  = txs.filter(t => t.type === 'receita').reduce((s, t) => s + t.amount, 0);
  const expense = txs.filter(t => t.type === 'despesa').reduce((s, t) => s + t.amount, 0);
  const balance = income - expense;
  const mes     = currentDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
  const sign    = balance >= 0 ? '+' : '';

  const catTotals = {};
  txs.filter(t => t.type === 'despesa').forEach(t => {
    catTotals[t.category] = (catTotals[t.category] || 0) + t.amount;
  });
  const topCat = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0];
  const topCatLine = topCat
    ? `\n🏷 Maior gasto: ${CATEGORIES[topCat[0]]?.label || topCat[0]} (${fmt(topCat[1])})`
    : '';

  const text = [
    `📊 Resumo financeiro — ${mes}`,
    ``,
    `💰 Receitas:  ${fmt(income)}`,
    `💸 Despesas:  ${fmt(expense)}`,
    `📈 Saldo:     ${sign}${fmt(balance)}${topCatLine}`,
    ``,
    `Gerado pelo Atlas Finance`,
  ].join('\n');

  if (navigator.share) {
    try {
      await navigator.share({ title: `Resumo ${mes}`, text });
    } catch (err) {
      if (err.name !== 'AbortError') toast('Erro ao compartilhar.', 'err');
    }
  } else {
    await navigator.clipboard.writeText(text);
    toast('Resumo copiado para a área de transferência!');
  }
}

function _confirmDuplicate() {
  return new Promise(resolve => {
    const overlay = document.getElementById('modal-duplicate-confirm');
    if (!overlay) { resolve(true); return; }
    overlay.classList.remove('hidden');
    const yes = overlay.querySelector('#btn-dup-yes');
    const no  = overlay.querySelector('#btn-dup-no');
    const close = val => { overlay.classList.add('hidden'); resolve(val); };
    yes.onclick = () => close(true);
    no.onclick  = () => close(false);
  });
}

function initOfflineBanner() {
  const banner = document.getElementById('offline-banner');
  if (!banner) return;
  const show = () => banner.classList.remove('hidden');
  const hide = () => banner.classList.add('hidden');
  window.addEventListener('offline', show);
  window.addEventListener('online',  hide);
  if (!navigator.onLine) show();
}

async function init() {
  try {
    initTheme();
    initOfflineBanner();
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
    sessionStorage.setItem('atlas_app_error', err.message || 'Erro desconhecido');
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
  sessionStorage.removeItem('atlas_app_error');
  document.body.style.visibility = '';
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

    const legacy = Storage.getJSON(Storage.LEGACY_TXS, []);
    if (legacy.length) {
      for (const tx of legacy) await DB.put(tx);
      Storage.remove(Storage.LEGACY_TXS);
      toast(`${legacy.length} transações migradas.`);
    }

    DB.purgeOld().catch(() => {});
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

  // Reconexão: flush da fila offline e re-sync
  window.addEventListener('online', async () => {
    const count = await PendingQueue.count().catch(() => 0);
    if (count > 0) {
      toast(`Conexão restaurada — sincronizando ${count} item${count > 1 ? 's' : ''}...`);
      const synced = await PendingQueue.flush().catch(() => 0);
      if (synced > 0) await syncFromCloud();
      else await _updatePendingBadge();
    } else {
      setCloudStatus('connected', 'Online');
    }
  });

  window.addEventListener('offline', () => {
    setCloudStatus('error', 'Sem conexão — mudanças salvas localmente');
  });

  const dot = document.getElementById('db-status-dot-header');
  if (dot) {
    dot.style.cursor = 'pointer';
    dot.addEventListener('click', () => {
      if (!Demo.active) syncFromCloud();
    });
  }

  // Badge inicial de pendentes (pode haver da sessão anterior)
  _updatePendingBadge();
}

init();

// Corner widget toggle
(function () {
  const widget  = document.getElementById('corner-widget');
  const toggleBtn = document.getElementById('corner-widget-toggle');
  if (!widget || !toggleBtn) return;

  const isOpen = Storage.get(Storage.CORNER_WIDGET) === 'true';
  if (isOpen) widget.classList.add('open');

  toggleBtn.addEventListener('click', () => {
    const open = widget.classList.toggle('open');
    Storage.set(Storage.CORNER_WIDGET, open);
  });
})();
