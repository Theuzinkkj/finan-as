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
    <div class="tx-item${isSel ? ' tx-selected' : ''}" role="button" tabindex="0" data-id="${t.id}" onclick="toggleTxSelection('${t.id}', event)">
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
  const catF   = document.getElementById('filter-category').value;
  const typeF  = document.getElementById('filter-type').value;
  const search = (document.getElementById('filter-search')?.value || '').trim().toLowerCase();
  const list   = txOfMonth()
    .filter(t => !catF   || t.category === catF)
    .filter(t => !typeF  || t.type === typeF)
    .filter(t => !search || t.description.toLowerCase().includes(search) || (t.notes || '').toLowerCase().includes(search))
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
  drawAnalysisChart(txs);
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
  const amtPreview = document.getElementById('amount-preview');
  if (amtPreview) amtPreview.textContent = '';
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
      </button>`).join('');
  };
  renderChangeCatGrid();

  grid.onclick = e => {
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
      labelEl.textContent = sel.options[sel.selectedIndex]?.text || '';
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
  } else {
    fab.style.display        = '';
    inlineAdd.style.display  = 'none';
    dock.style.display       = '';
    inlineChat.classList.add('hidden');
  }
  if (tabName === 'analysis')  setTimeout(() => drawAnalysisChart(txOfMonth()), 40);
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
function initPasswordToggles() {
  document.querySelectorAll('.toggle-pw').forEach(btn => {
    btn.addEventListener('click', () => {
      const input   = document.getElementById(btn.dataset.target);
      const visible = input.type === 'text';
      input.type    = visible ? 'password' : 'text';
      btn.querySelector('.eye-open').classList.toggle('hidden', !visible);
      btn.querySelector('.eye-closed').classList.toggle('hidden', visible);
      btn.setAttribute('aria-label', visible ? 'Mostrar senha' : 'Esconder senha');
    });
  });
}

function resetPasswordToggles() {
  document.querySelectorAll('.toggle-pw').forEach(btn => {
    const input = document.getElementById(btn.dataset.target);
    if (input) input.type = 'password';
    btn.querySelector('.eye-open').classList.remove('hidden');
    btn.querySelector('.eye-closed').classList.add('hidden');
    btn.setAttribute('aria-label', 'Mostrar senha');
  });
}

function showAuthScreen() {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('auth-email').value    = '';
  document.getElementById('auth-password').value = '';
  document.getElementById('auth-confirm').value  = '';
  resetPasswordToggles();
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
  if (m.includes('network') || m.includes('fetch') || m.includes('load failed') || m.includes('failed to load'))
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
  document.getElementById('filter-search').addEventListener('input', renderAllTxs);

  // Abrir painel de perfil
  document.getElementById('btn-profile').addEventListener('click', openProfilePanel);

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
    if (active.id === 'tab-analysis')  drawAnalysisChart(txs);
  });

  // Escape — fecha modal, painel de perfil, chat ou menu de contexto (nessa ordem)
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const visible = [...document.querySelectorAll('.modal-overlay:not(.hidden)')];
    if (visible.length) { closeModal(visible[visible.length - 1].id); return; }
    const profileOverlay = document.getElementById('profile-panel-overlay');
    if (profileOverlay && !profileOverlay.classList.contains('hidden')) { closeProfilePanel(); return; }
    const chat = document.getElementById('chat-panel');
    if (chat && !chat.classList.contains('hidden')) { chat.classList.add('hidden'); return; }
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

// Quando o usuário confirma o email, o Supabase redireciona com o token na URL.
// Enviamos o token ao backend para que ele defina o cookie httpOnly e
// limpamos o hash imediatamente — o token nunca fica exposto no JS.
async function handleAuthRedirect() {
  const hash = window.location.hash.slice(1);
  if (!hash) return { ok: false, recovery: false };

  const params      = new URLSearchParams(hash);
  const accessToken = params.get('access_token');
  if (!accessToken) return { ok: false, recovery: false };

  const isRecovery = params.get('type') === 'recovery';
  history.replaceState(null, '', window.location.pathname);

  try {
    await API.req('POST', '/api/auth/confirm', { access_token: accessToken });
    return { ok: true, recovery: isRecovery };
  } catch {
    return { ok: false, recovery: false, expiredRecovery: isRecovery };
  }
}

function showResetPasswordForm() {
  return new Promise((resolve, reject) => {
    const screen = document.getElementById('reset-password-screen');
    if (!screen) { reject(new Error('reset-password-screen not found')); return; }
    screen.classList.remove('hidden');
    const form      = document.getElementById('reset-pw-form');
    const errEl     = document.getElementById('reset-pw-error');
    const btn       = document.getElementById('reset-pw-submit');
    const btnText   = document.getElementById('reset-pw-submit-text');
    const btnLoader = document.getElementById('reset-pw-submit-loader');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errEl.classList.add('hidden');
      const password = document.getElementById('reset-pw-new').value;
      const confirm  = document.getElementById('reset-pw-confirm').value;

      if (password.length < 6) {
        errEl.textContent = 'A senha deve ter pelo menos 6 caracteres.';
        errEl.classList.remove('hidden');
        return;
      }
      if (password !== confirm) {
        errEl.textContent = 'As senhas não coincidem.';
        errEl.classList.remove('hidden');
        return;
      }

      btn.disabled = true;
      btnText.classList.add('hidden');
      btnLoader.classList.remove('hidden');

      try {
        await API.req('POST', '/api/auth/update-password', { password });
        screen.classList.add('hidden');
        toast('Senha atualizada com sucesso!');
        resolve();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
        btn.disabled = false;
        btnText.classList.remove('hidden');
        btnLoader.classList.add('hidden');
      }
    });
  });
}

async function init() {
  try {
    initTheme();
    bindEvents();
    initCustomSelects();
    initPasswordToggles();

    if (Demo.active) { await startApp(); return; }

    const redirect = await handleAuthRedirect();

    if (redirect.recovery) {
      await showResetPasswordForm();
      await Auth.signOut().catch(() => {});
      showAuthScreen();
      showAuthSuccess('Senha redefinida com sucesso! Faça login com a nova senha.');
      return;
    }

    if (redirect.expiredRecovery) {
      showAuthScreen();
      showAuthError('O link de redefinição expirou. Clique em "Esqueci minha senha" para receber um novo.');
      return;
    }

    const loggedIn = await Auth.check();
    if (!loggedIn) { showAuthScreen(); return; }
    await startApp();
  } catch (err) {
    console.error('[init] erro inesperado:', err);
    try { showAuthScreen(); } catch {}
  }
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
  initCustomSelects();
  setTodayDate();
  updateProfileUI();
  syncProfileFromServer().then(() => updateProfileUI());

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
