'use strict';

// =============================================
//  STATE
// =============================================
let currentDate    = new Date();
let selectedType    = 'despesa';
let selectedCat     = '';
let selectedPayment = '';
let selectedFixed   = false;
let invoiceItems    = [];
let transactions   = [];
let selectedTxIds  = new Set();
let chatHistory    = [];
let appInitialized = false;
let activeTxId     = null;
let activeChangeCat = null;

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
function loadCustomCategories() {
  const saved = JSON.parse(localStorage.getItem('atlas_custom_cats') || '{}');
  Object.assign(CATEGORIES, saved);
}

function saveCustomCategory(key, cat) {
  CATEGORIES[key] = cat;
  const saved = JSON.parse(localStorage.getItem('atlas_custom_cats') || '{}');
  saved[key] = cat;
  localStorage.setItem('atlas_custom_cats', JSON.stringify(saved));
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
          .replace(/^\w/, c => c.toUpperCase());
}

function txOfMonth(d = currentDate) {
  const key = mkKey(d);
  const [ty, tm] = key.split('-').map(Number);
  const daysInMonth = new Date(ty, tm, 0).getDate();

  const regular = transactions.filter(t => !t.fixed && t.date.startsWith(key));

  const fixed = transactions
    .filter(t => t.fixed && t.date.slice(0, 7) <= key)
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

function toast(msg, type = 'ok') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.borderColor = type === 'err' ? 'rgba(239,68,68,.4)' : 'rgba(255,255,255,.15)';
  el.classList.add('show');
  clearTimeout(el._tid);
  el._tid = setTimeout(() => el.classList.remove('show'), 2800);
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
    dot.title     = label || '';
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
    for (const tx of local.filter(t => !remoteIds.has(t.id))) await DB.remove(t.id);
    transactions = remote;
    renderAll();
    setCloudStatus('connected', `${remote.length} transações sincronizadas`);
  } catch (err) {
    console.warn('Cloud sync error:', err.message);
    setCloudStatus('error', 'Erro ao sincronizar: ' + err.message);
  }
}

// =============================================
//  RENDER — MONTH LABEL
// =============================================
function renderMonthLabel() {
  document.getElementById('current-month-label').textContent = monthLabel(currentDate);
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
  document.getElementById('balance-sub').textContent   = income > 0
    ? `${((expense / income) * 100).toFixed(0)}% da receita gasto`
    : 'Sem receitas no mês';
}

// =============================================
//  RENDER — TRANSACTION ITEM
// =============================================
function txHTML(t) {
  const isIncome    = t.type === 'receita';
  const cat         = CATEGORIES[t.category] || CATEGORIES.outros;
  const note        = t.notes ? `<div class="tx-note">📝 ${escHtml(t.notes)}</div>` : '';
  const fixedBadge  = t.fixed ? '<span class="badge-fixed">🔄 Fixo</span>' : '';
  const isSel       = selectedTxIds.has(t.id);
  const faturaBtn   = (t.invoiceItems && t.invoiceItems.length > 0)
    ? `<button class="tx-fatura-btn" onclick="openViewFaturaModal('${t.id}', event)" title="Ver fatura">📄</button>`
    : '';
  return `
    <div class="tx-item${isSel ? ' tx-selected' : ''}" data-id="${t.id}" onclick="toggleTxSelection('${t.id}', event)">
      <div class="tx-select-check${isSel ? ' checked' : ''}"></div>
      <div class="tx-icon">${isIncome ? '💰' : cat.icon}</div>
      <div class="tx-info">
        <div class="tx-desc">${escHtml(t.description)}${fixedBadge}${faturaBtn}</div>
        <div class="tx-meta">${isIncome ? 'Receita' : cat.label} &bull; ${fmtDate(t.date)}</div>
        ${note}
      </div>
      <div class="tx-amount ${isIncome ? 'income' : 'expense'}">
        ${isIncome ? '+' : '−'}${fmt(t.amount)}
      </div>
      <button class="tx-menu-btn" onclick="openTxMenu('${t.id}', event)" title="Opções">⋮</button>
    </div>`;
}

function toggleTxSelection(id, event) {
  if (event.target.closest('.tx-menu-btn')) return;
  if (event.currentTarget.closest('#tab-dashboard')) return;
  if (selectedTxIds.has(id)) selectedTxIds.delete(id);
  else selectedTxIds.add(id);
  document.querySelectorAll(`.tx-item[data-id="${id}"]`).forEach(el => {
    el.classList.toggle('tx-selected', selectedTxIds.has(id));
    el.querySelector('.tx-select-check')?.classList.toggle('checked', selectedTxIds.has(id));
  });
  renderSelectionBar();
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
  const catF  = document.getElementById('filter-category').value;
  const typeF = document.getElementById('filter-type').value;
  const list  = txOfMonth()
    .filter(t => !catF  || t.category === catF)
    .filter(t => !typeF || t.type === typeF)
    .sort((a, b) => b.date.localeCompare(a.date));

  document.getElementById('all-transactions').innerHTML =
    list.length ? list.map(txHTML).join('') : emptyHTML('Nenhuma transação encontrada.');
  document.getElementById('filter-count').textContent =
    `${list.length} transaç${list.length === 1 ? 'ão' : 'ões'}`;
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
  renderRecent(txs);
  renderAllTxs();
  renderAnalysisStats(txs);
  drawDonut(txs);
  drawLine(txs);
  drawBars(txs);
}

// (AI analysis, chat and export moved to js/ai.js and js/export.js)

// =============================================
//  TRANSACTIONS — ADD / DELETE
// =============================================
function resetTransactionModal() {
  selectedCat     = '';
  selectedType    = 'despesa';
  selectedPayment = '';
  selectedFixed   = false;
  invoiceItems    = [];

  document.getElementById('transaction-form').reset();
  document.getElementById('btn-fixed').setAttribute('aria-pressed', 'false');
  document.querySelectorAll('.type-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.type === 'despesa'));
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('selected'));
  document.querySelectorAll('.payment-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('cat-error').classList.add('hidden');
  document.getElementById('invoice-group').classList.add('hidden');
  document.getElementById('invoice-items-list').innerHTML = '';
  document.getElementById('invoice-total').classList.add('hidden');
  document.getElementById('amount-group').style.display   = '';
  document.getElementById('category-group').style.display = '';
  document.getElementById('desc-group').style.display     = '';
  document.getElementById('payment-group').style.display  = '';
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
  if (selectedType === 'despesa' && !selectedCat && !hasInvoiceItems) {
    catErr.classList.remove('hidden'); return;
  }
  catErr.classList.add('hidden');

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
    paymentMethod: selectedPayment || null,
    invoiceItems:  selectedPayment === 'credito' && invoiceItems.length > 0 ? [...invoiceItems] : null,
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
  if (Demo.active) {
    transactions = transactions.filter(t => t.id !== id);
    resetAIResult();
    renderAll();
    toast('Transação removida. (modo demo — não salva)');
    return;
  }
  try {
    await DB.remove(id);
    transactions = transactions.filter(t => t.id !== id);
    resetAIResult();
    renderAll();
    toast('Transação removida.');

    CloudDB.remove(id)
      .then(() => setCloudStatus('connected', `${transactions.length} transações sincronizadas`))
      .catch(err => toast('Nuvem: ' + err.message, 'err'));
  } catch (err) {
    toast('Erro ao remover transação.', 'err');
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
  grid.innerHTML = Object.entries(CATEGORIES).map(([key, cat]) => `
    <button type="button" class="cat-btn${tx.category === key ? ' selected' : ''}" data-cat="${key}">
      <span class="cat-icon">${cat.icon}</span>
      <span>${cat.label}</span>
    </button>`).join('');

  grid.onclick = e => {
    const btn = e.target.closest('.cat-btn');
    if (!btn) return;
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
      document.getElementById('btn-cat-icon').textContent = '🏷️';
      document.getElementById('btn-cat-icon').dataset.emoji = '';
      document.getElementById('input-cat-label').value = '';
      document.getElementById('cat-label-error').classList.add('hidden');
      document.getElementById('emoji-picker-panel').classList.add('hidden');
      openModal('modal-custom-cat');
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
  const fab       = document.getElementById('btn-add');
  const inlineAdd = document.getElementById('btn-add-inline');
  if (tabName === 'transactions') {
    fab.style.display       = 'none';
    inlineAdd.style.display = 'flex';
    const ft = document.getElementById('filter-type');
    const fc = document.getElementById('filter-category');
    if (ft) ft.value = '';
    if (fc) fc.value = '';
    renderAllTxs();
  } else {
    fab.style.display       = '';
    inlineAdd.style.display = 'none';
  }
  if (tabName === 'analysis')  setTimeout(() => drawBars(txOfMonth()), 40);
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
//  AUTH SCREEN
// =============================================
function showAuthScreen() {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('auth-email').value    = '';
  document.getElementById('auth-password').value = '';
  document.getElementById('auth-confirm').value  = '';
  clearAuthFeedback();
  bindAuthEvents();
}

function hideAuthScreen() {
  document.getElementById('auth-screen').classList.add('hidden');
}

function bindAuthEvents() {
  document.getElementById('tab-signin').addEventListener('click', () => setAuthMode('signin'));
  document.getElementById('tab-signup').addEventListener('click', () => setAuthMode('signup'));

  document.getElementById('btn-demo').addEventListener('click', () => {
    Demo.enter();
    startApp();
  });

  document.getElementById('auth-form').addEventListener('submit', async e => {
    e.preventDefault();
    const email    = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const confirm  = document.getElementById('auth-confirm').value;
    const isSignup = document.getElementById('tab-signup').classList.contains('active');

    clearAuthFeedback();

    if (!email || !password) { showAuthError('Preencha email e senha.'); return; }
    if (isSignup && password.length < 6) { showAuthError('A senha deve ter pelo menos 6 caracteres.'); return; }
    if (isSignup && password !== confirm) { showAuthError('As senhas não coincidem.'); return; }

    setAuthLoading(true);
    try {
      if (isSignup) {
        const result = await Auth.signUp(email, password);
        if (result.confirmEmail) {
          showAuthSuccess('Cadastro realizado! Verifique seu email para confirmar, depois faça login.');
          setAuthMode('signin');
          return;
        }
      } else {
        await Auth.signIn(email, password);
      }
      await startApp();
    } catch (err) {
      showAuthError(authErrorMsg(err.message));
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
  document.getElementById('btn-demo').classList.toggle('hidden', isSignup);
  document.querySelector('.auth-demo-divider').classList.toggle('hidden', isSignup);
  clearAuthFeedback();
}

function authErrorMsg(raw) {
  const m = (raw || '').toLowerCase();
  if (m.includes('invalid login credentials') || m.includes('invalid_grant'))
    return 'Email ou senha incorretos.';
  if (m.includes('email not confirmed'))
    return 'Email não confirmado. Verifique sua caixa de entrada.';
  if (m.includes('user already registered') || m.includes('user_already_exists'))
    return 'Este email já está cadastrado. Tente fazer login.';
  if (m.includes('password should be at least') || m.includes('weak_password'))
    return 'Senha muito fraca. Use pelo menos 6 caracteres.';
  if (m.includes('unable to validate email') || m.includes('invalid format') || m.includes('email_address_invalid'))
    return 'Formato de email inválido.';
  if (m.includes('over_email_send_rate_limit') || m.includes('rate limit'))
    return 'Muitas tentativas. Aguarde um momento e tente novamente.';
  if (m.includes('signup_disabled'))
    return 'Cadastro desabilitado. Entre em contato com o suporte.';
  if (m.includes('network') || m.includes('fetch'))
    return 'Erro de conexão. Verifique sua internet.';
  return raw;
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg; el.classList.remove('hidden');
}

function showAuthSuccess(msg) {
  const el = document.getElementById('auth-success');
  el.textContent = msg; el.classList.remove('hidden');
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

// =============================================
//  EVENT BINDING
// =============================================
function updateNotesFieldForType(type) {
  const label    = document.querySelector('label[for="input-notes"] .optional');
  const textarea = document.getElementById('input-notes');
  if (type === 'receita') {
    if (label) label.textContent = '(de onde veio?)';
    textarea.placeholder = 'Ex: Salário, hora extra, freelance, rendimento de investimento...';
  } else {
    if (label) label.textContent = '(por que gastou isso?)';
    textarea.placeholder = 'Ex: Comemoração de aniversário, compra por impulso, mensalidade obrigatória...';
  }
}

function bindEvents() {
  // FAB — nova transação
  document.getElementById('btn-add').addEventListener('click', () => {
    resetTransactionModal();
    openModal('modal-transaction');
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
    renderCategoryGrid();
    const grid = document.getElementById('category-grid');
    grid.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('selected'));
    const newBtn = grid.querySelector(`[data-cat="${key}"]`);
    if (newBtn) { newBtn.classList.add('selected'); selectedCat = key; }
    document.getElementById('cat-error').classList.add('hidden');
    buildCategoryFilter();
    closeModal('modal-custom-cat');
    toast(`Categoria "${label}" criada!`);
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
      const isDespesa = selectedType === 'despesa';
      document.getElementById('category-group').style.display = isDespesa ? '' : 'none';
      document.getElementById('payment-group').style.display  = isDespesa ? '' : 'none';
      if (!isDespesa) {
        document.getElementById('invoice-group').classList.add('hidden');
        invoiceItems    = [];
        selectedPayment = '';
        document.querySelectorAll('.payment-btn').forEach(b => b.classList.remove('selected'));
        document.getElementById('invoice-items-list').innerHTML = '';
        document.getElementById('invoice-total').classList.add('hidden');
      }
      document.getElementById('amount-group').style.display   = '';
      document.getElementById('category-group').style.display = isDespesa ? '' : 'none';
      document.getElementById('desc-group').style.display     = '';
      updateNotesFieldForType(selectedType);
    });
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
    document.getElementById('amount-group').style.display   = isCredito ? 'none' : '';
    document.getElementById('category-group').style.display = isCredito ? 'none' : '';
    document.getElementById('desc-group').style.display     = isCredito ? 'none' : '';
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
    const value   = parseFloat(valueEl.value);
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
    const value   = parseFloat(valueEl.value);
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
    renderMonthLabel(); renderAll(); resetAIResult(); renderSelectionBar();
  });
  document.getElementById('next-month').addEventListener('click', () => {
    currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    selectedTxIds.clear();
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

  // Filtros
  document.getElementById('filter-category').addEventListener('change', renderAllTxs);
  document.getElementById('filter-type').addEventListener('change', renderAllTxs);

  // Abrir configurações
  document.getElementById('btn-settings').addEventListener('click', () => {
    const userBar = document.getElementById('auth-user-bar');
    const authDiv = document.getElementById('auth-divider');
    document.getElementById('auth-user-email').textContent = Demo.active ? 'Modo Demo' : Auth.email;
    userBar.classList.remove('hidden');
    authDiv.classList.remove('hidden');
    openModal('modal-settings');
  });

  // Logout
  document.getElementById('btn-logout').addEventListener('click', async () => {
    if (!Demo.active) await Auth.signOut();
    else Demo.exit();
    window.location.reload();
  });

  // Tema
  document.getElementById('theme-btn-dark').addEventListener('click',  () => { applyTheme('dark');  renderAll(); });
  document.getElementById('theme-btn-light').addEventListener('click', () => { applyTheme('light'); renderAll(); });

  // Análise IA
  document.getElementById('btn-analyze').addEventListener('click', runAI);

  // Exportar
  document.getElementById('btn-export-excel').addEventListener('click', () => { closeModal('modal-settings'); exportExcel(); });
  document.getElementById('btn-export-pdf').addEventListener('click',   () => { closeModal('modal-settings'); exportPDF(); });

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

  // Redimensionar — redesenhar gráficos
  window.addEventListener('resize', () => {
    const active = document.querySelector('.tab-content.active');
    if (!active) return;
    const txs = txOfMonth();
    if (active.id === 'tab-dashboard') drawLine(txs);
    if (active.id === 'tab-analysis')  drawBars(txs);
  });
}

// =============================================
//  INIT
// =============================================

// Quando o usuário confirma o email, o Supabase redireciona com o token na URL.
// Enviamos o token ao backend para que ele defina o cookie httpOnly e
// limpamos o hash imediatamente — o token nunca fica exposto no JS.
async function handleAuthRedirect() {
  const hash = window.location.hash.slice(1);
  if (!hash) return false;

  const params      = new URLSearchParams(hash);
  const accessToken = params.get('access_token');
  if (!accessToken) return false;

  history.replaceState(null, '', window.location.pathname);

  try {
    await API.req('POST', '/api/auth/confirm', { access_token: accessToken });
    return true;
  } catch {
    return false;
  }
}

async function init() {
  initTheme();
  bindEvents();

  if (Demo.active) { await startApp(); return; }

  const redirected = await handleAuthRedirect();
  const loggedIn   = redirected || await Auth.check();

  if (!loggedIn) { showAuthScreen(); return; }
  await startApp();
}

function showDemoBanner() {
  document.getElementById('demo-banner').classList.remove('hidden');
  document.body.classList.add('demo-mode');

  document.getElementById('btn-demo-signup').addEventListener('click', () => {
    exitDemoMode();
    showAuthScreen();
    setAuthMode('signup');
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

  hideAuthScreen();
  renderMonthLabel();
  loadCustomCategories();
  buildCategoryGrid();
  buildCategoryFilter();
  setTodayDate();

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
  syncFromCloud();
}

init();

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
