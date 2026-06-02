'use strict';

// =============================================
//  TRANSACTIONS — RESET MODAL
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

// =============================================
//  TRANSACTIONS — ADD
// =============================================
async function handleFormSubmit(e) {
  e.preventDefault();

  const amount = parseFloat(document.getElementById('input-amount').value);
  let   desc   = document.getElementById('input-description').value.trim();
  const notes  = document.getElementById('input-notes').value.trim();
  const date   = document.getElementById('input-date').value;

  const hasInvoiceItems = selectedPayment === 'credito' && invoiceItems.length > 0;

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

  const catErr  = document.getElementById('cat-error');
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

// =============================================
//  TRANSACTIONS — DELETE
// =============================================
async function deleteTx(id) {
  const tx = await materializeDisplayTx(id, { sync: false });
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

  const tx = findDisplayTx(id);
  const fixedBtn = document.getElementById('btn-menu-fixed');
  if (fixedBtn) fixedBtn.innerHTML = tx?.fixed ? '<i class="bi bi-stop-fill"></i> Parar de repetir' : '<i class="bi bi-arrow-repeat"></i> Repetir todo mês';
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
  const tx = findDisplayTx(id);
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
      <div style="width:52px;height:52px;border-radius:12px;background:${cat.color}22;border:1px solid ${cat.color}55;display:flex;align-items:center;justify-content:center;font-size:24px;">${isIncome ? '<i class="bi bi-cash-stack"></i>' : cat.icon}</div>
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
    <div class="mob-tx-field"><span>Categoria</span><span>${isIncome ? '<i class="bi bi-cash-stack"></i>' : cat.icon} ${isIncome ? 'Receita' : cat.label}</span></div>
    ${tx.notes ? `<div class="mob-tx-field"><span>Nota</span><span>${escHtml(tx.notes)}</span></div>` : ''}
    ${tx.fixed ? `<div class="mob-tx-field"><span>Recorrência</span><span><i class="bi bi-arrow-repeat"></i> Fixo mensal</span></div>` : ''}
    <div style="display:flex;gap:8px;margin-top:18px;">
      <button onclick="closeMobTxSheet();activeTxId='${tx.id}';openRenameModal()" style="flex:1;padding:12px;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:12px;font-size:14px;font-weight:500;cursor:pointer;font-family:inherit;"><i class="bi bi-pencil"></i> Editar</button>
      <button onclick="closeMobTxSheet();deleteTx('${tx.id}')" style="flex:1;padding:12px;background:var(--surface);color:var(--coral);border:1px solid var(--border);border-radius:12px;font-size:14px;font-weight:500;cursor:pointer;font-family:inherit;"><i class="bi bi-trash"></i> Excluir</button>
    </div>
    ${tx.type === 'despesa' ? `
    <button onclick="togglePaid('${tx.id}')" style="width:100%;margin-top:8px;padding:12px;background:${tx.paid ? 'rgba(20,195,142,.15)' : 'var(--surface)'};color:${tx.paid ? 'var(--emerald)' : 'var(--text)'};border:1px solid ${tx.paid ? 'rgba(20,195,142,.4)' : 'var(--border)'};border-radius:12px;font-size:14px;font-weight:500;cursor:pointer;font-family:inherit;">
      <i class="bi bi-${tx.paid ? 'check-circle-fill' : 'check-circle'}"></i> ${tx.paid ? 'Pago ✓ — Desmarcar' : 'Marcar como pago'}
    </button>` : ''}`;

  document.getElementById('mob-tx-overlay').classList.add('open');
  document.getElementById('mob-tx-sheet').classList.add('open');
}

function closeMobTxSheet() {
  document.getElementById('mob-tx-overlay')?.classList.remove('open');
  document.getElementById('mob-tx-sheet')?.classList.remove('open');
}

// =============================================
//  TRANSACTIONS — TOGGLE PAID
// =============================================
async function togglePaid(id) {
  const tx = await materializeDisplayTx(id);
  if (!tx || tx.type !== 'despesa') return;

  const newPaid = !tx.paid;
  tx.paid = newPaid;
  renderAll();

  // Reabre o painel para refletir o novo estado
  if (window.innerWidth <= 900) {
    openMobTxSheet(id);
  } else {
    openTxDetailPanel(id);
  }

  if (Demo.active) {
    toast(newPaid ? 'Marcado como pago! (modo demo)' : 'Desmarcado. (modo demo)');
    return;
  }

  try {
    await DB.put(tx);

    // PATCH mínimo: só envia o campo alterado, evita conflito com colunas
    // que podem não existir ainda no Supabase (ex.: primeira vez rodando migration)
    const result = await CloudDB.update({ id: tx.id, paid: newPaid }).catch(err => {
      toast('Nuvem: ' + err.message, 'err');
      return null;
    });
    if (result?.queued) {
      await _updatePendingBadge();
    } else if (result !== null) {
      setCloudStatus('connected', `${transactions.length} transações sincronizadas`);
    }

    toast(newPaid ? 'Marcado como pago!' : 'Desmarcado.');
  } catch {
    tx.paid = !newPaid;
    renderAll();
    toast('Erro ao atualizar transação.', 'err');
  }
}

function hideTxMenu() {
  document.getElementById('tx-context-menu').classList.add('hidden');
}

// =============================================
//  TRANSACTIONS — EDIT MODALS
// =============================================
function openRenameModal() {
  if (!activeTxId) return;
  const tx = findDisplayTx(activeTxId);
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
  const tx = await materializeDisplayTx(txId);
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
  const tx = findDisplayTx(activeTxId);
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
  const tx = await materializeDisplayTx(txId);
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
  const tx = findDisplayTx(activeTxId);
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
  const tx = await materializeDisplayTx(txId);
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
  const tx = findDisplayTx(activeTxId);
  if (!tx) return;
  const realId = tx._templateId || tx.recurringId || tx.id;
  const realTx = transactions.find(t => t.id === realId) || tx;
  tx.fixed = !tx.fixed;
  realTx.fixed = tx.fixed;
  closeTxMenu();

  if (Demo.active) { renderAll(); toast(tx.fixed ? 'Marcado como fixo. (modo demo)' : 'Removido recorrência. (modo demo)'); return; }
  try {
    await DB.put(realTx);
    renderAll();
    toast(tx.fixed ? 'Transação marcada como fixa.' : 'Recorrência removida.');
    _cloudUpdate(realTx);
  } catch (err) { toast('Erro ao atualizar transação.', 'err'); }
}

// =============================================
//  FATURA (invoice) MODALS
// =============================================
let faturaEditItems = [];

function openAddToFaturaModal() {
  if (!activeTxId) return;
  const tx = findDisplayTx(activeTxId);
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
  const tx = await materializeDisplayTx(txId);
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
  const tx = findDisplayTx(id);
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
