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
//  RECURRING â€” AUTO-GENERATION
// =============================================
async function autoGenerateRecurring() {
  if (Demo.active) return;
  const now        = new Date();
  const currentKey = mkKey(now);

  const templates = transactions.filter(t => t.fixed && t.date.slice(0, 7) < currentKey);
  if (!templates.length) return;

  // Calcula todos os meses desde a criaÃ§Ã£o do template atÃ© o mÃªs atual
  function monthsBetween(startKey, endKey) {
    const [sy, sm] = startKey.split('-').map(Number);
    const [ey, em] = endKey.split('-').map(Number);
    const months = [];
    let y = sy, m = sm + 1; // comeÃ§a no mÃªs seguinte ao template
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
    toast(`ðŸ”„ ${n} transaÃ§${n === 1 ? 'Ã£o fixa criada' : 'Ãµes fixas criadas'} automaticamente!`);
    renderAll();
  }
}

// =============================================
//  UI BUILDERS
// =============================================
function renderCategoryGrid() {
  const grid = document.getElementById('category-grid');
  grid.innerHTML = Object.entries(CATEGORIES).map(([key, cat]) => `
    <button type="button" class="cat-btn" data-cat="${key}">
      ${key.startsWith('custom_') ? `<span class="cat-btn-delete" data-delete-cat="${key}" title="Apagar categoria">âœ•</span>` : ''}
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
      document.getElementById('btn-cat-icon').textContent = 'ðŸ·ï¸';
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
      <button type="button" class="invoice-item-remove" data-${btnDataAttr}="${i}">âœ•</button>
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
    trigger.innerHTML = '<span class="cs-label"></span><span class="cs-arrow">â–¼</span>';
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
    textarea.placeholder = 'Ex: SalÃ¡rio, hora extra, freelance, rendimento de investimento...';
  } else if (type === 'beneficio') {
    if (label) label.textContent = '(onde usou?)';
    textarea.placeholder = 'Ex: AlmoÃ§o no restaurante, compra no mercado...';
  } else {
    if (label) label.textContent = '(por que gastou isso?)';
    textarea.placeholder = 'Ex: ComemoraÃ§Ã£o de aniversÃ¡rio, compra por impulso, mensalidade obrigatÃ³ria...';
  }
}

function bindEvents() {
  // FAB â€” nova transaÃ§Ã£o (desktop floating dock)
  document.getElementById('btn-add').addEventListener('click', () => {
    resetTransactionModal();
    openModal('modal-transaction');
  });

  // FAB mobile â€” menu expandÃ­vel
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

  // Mobile IA â€” botÃ£o analisar e perguntas comuns
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

  // BotÃ£o inline na aba de transaÃ§Ãµes
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

  // FormulÃ¡rio de transaÃ§Ã£o
  document.getElementById('transaction-form').addEventListener('submit', handleFormSubmit);

  // FormulÃ¡rio de categoria customizada
  document.getElementById('form-custom-cat').addEventListener('submit', e => {
    e.preventDefault();
    const label = document.getElementById('input-cat-label').value.trim();
    if (!label) {
      document.getElementById('cat-label-error').classList.remove('hidden');
      return;
    }
    const icon   = document.getElementById('btn-cat-icon').dataset.emoji || 'ðŸ·ï¸';
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
      'ðŸ·ï¸','ðŸ•','ðŸ”','ðŸ£','ðŸº','â˜•','ðŸ›’','ðŸš—','ðŸšŒ','âœˆï¸','ðŸ ','ðŸ¥','ðŸŽ“',
      'ðŸ“š','ðŸ’Š','ðŸ’¡','ðŸ”§','ðŸ’»','ðŸ“±','ðŸŽ®','ðŸŽµ','ðŸŽ¬','ðŸ‹ï¸','âš½','ðŸŠ','ðŸ¶',
      'ðŸ±','ðŸŒ±','ðŸŒ','â™»ï¸','ðŸ’°','ðŸ’³','ðŸ’¸','ðŸ¦','ðŸŽ','ðŸŽ‰','â¤ï¸','ðŸ‘”','ðŸ‘—',
      'ðŸ’„','ðŸ§´','ðŸ›','ðŸ§¹','âš¡','ðŸ’§','ðŸ”‘','ðŸ“¦','ðŸš€','ðŸŒŸ','ðŸ””','ðŸ“…',
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

  // Tipo de transaÃ§Ã£o
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
        document.getElementById('amount-group').style.display = '';
        document.getElementById('desc-group').style.display   = '';
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

  // Tipo de benefÃ­cio
  document.getElementById('benefit-type-grid').addEventListener('click', e => {
    const btn = e.target.closest('.benefit-type-btn');
    if (!btn) return;
    document.querySelectorAll('.benefit-type-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedBenefitType = btn.dataset.benefit;
    document.getElementById('benefit-type-error').classList.add('hidden');
  });

  // Toggle seÃ§Ã£o de benefÃ­cios
  document.getElementById('btn-benefits-toggle')?.addEventListener('click', toggleBenefitsSection);

  // Toggle seÃ§Ã£o de Meta de Gastos
  document.getElementById('btn-budget-toggle')?.addEventListener('click', toggleBudgetSection);
  document.getElementById('btn-budget-setup')?.addEventListener('click', openBudgetConfig);

  // Configurar benefÃ­cios
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
    document.getElementById('amount-group').style.display = isCredito ? 'none' : '';
    document.getElementById('desc-group').style.display   = isCredito ? 'none' : '';
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

  // Modal editar fatura â€” adicionar item
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

  // Modal editar fatura â€” remover item (delegado)
  document.getElementById('fatura-edit-list').addEventListener('click', e => {
    const btn = e.target.closest('.invoice-item-remove');
    if (!btn) return;
    faturaEditItems.splice(parseInt(btn.dataset.faturaIndex), 1);
    renderFaturaEditItems();
  });

  // NavegaÃ§Ã£o de mÃªs com lazy loading â€” busca o mÃªs se ainda nÃ£o estÃ¡ em cache
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

  // Goal modal â€” listeners aqui para funcionar mesmo antes de visitar a aba Investimentos
  document.getElementById('btn-goal-cancel')?.addEventListener('click', () => closeModal('modal-goal'));
  document.getElementById('btn-goal-save')?.addEventListener('click', saveGoalModal);
  document.getElementById('btn-goal-clear')?.addEventListener('click', clearGoalModal);

  // BotÃ£o de configurar meta no card do dashboard
  document.getElementById('btn-budget-setup-dash')?.addEventListener('click', openGoalModal);

  // BotÃµes de filtro de perÃ­odo no grÃ¡fico de evoluÃ§Ã£o (visual)
  document.querySelectorAll('.dash-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.dash-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const labels = { '7': '7 dias', '30': '30 dias', '90': '90 dias', '365': 'Ano' };
      const periodEl = document.getElementById('dash-line-period');
      if (periodEl) periodEl.textContent = labels[btn.dataset.range] || '30 dias';
    });
  });

  // Filtros â€” reseta paginaÃ§Ã£o ao filtrar
  const _debouncedFilter = debounce(() => { resetTxPagination(); renderAllTxs(); }, 300);
  document.getElementById('filter-category').addEventListener('change', () => { resetTxPagination(); renderAllTxs(); });
  document.getElementById('filter-type').addEventListener('change', () => { resetTxPagination(); renderAllTxs(); });
  document.getElementById('filter-search').addEventListener('input', _debouncedFilter);

  // Filtros avanÃ§ados
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

  // BotÃ£o engrenagem no topo do painel â†’ configuraÃ§Ãµes
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
        toast('Foto salva sÃ³ neste dispositivo. ' + err.message, 'err');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  });

  // Voltar ao perfil a partir das configuraÃ§Ãµes
  document.getElementById('btn-settings-back').addEventListener('click', () => {
    closeModal('modal-settings');
    openProfilePanel();
  });

  // Redefinir senha
  document.getElementById('btn-reset-password').addEventListener('click', resetPassword);

  // Excluir conta â†’ abre confirmaÃ§Ã£o
  document.getElementById('btn-delete-account').addEventListener('click', () => {
    openModal('modal-confirm-delete');
  });

  // Confirmar exclusÃ£o
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

  // Tipo de grÃ¡fico de anÃ¡lise
  document.querySelectorAll('.chart-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.chart-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      drawAnalysisChart(txOfMonth(), btn.dataset.type);
    });
  });

  // AnÃ¡lise IA
  document.getElementById('btn-analyze').addEventListener('click', runAI);

  // Investimentos â€” atualizar taxas
  document.getElementById('btn-rates-refresh')?.addEventListener('click', () => {
    _cachedRates = null;
    loadMarketRates();
  });

  // Investimentos â€” atualizar mercado
  document.getElementById('btn-market-refresh')?.addEventListener('click', () => {
    loadMarketData();
  });

  // Investimentos â€” carteira
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

  // Redimensionar â€” redesenhar grÃ¡ficos
  window.addEventListener('resize', () => {
    const active = document.querySelector('.tab-content.active');
    if (!active) return;
    const txs = txOfMonth();
    if (active.id === 'tab-dashboard') { drawLine(txs); drawEvolutionChart(); }
    if (active.id === 'tab-analysis')  { drawAnalysisChart(txs); drawAnnualChart(); _setupAnnualYearNav(); }
  });

  // Escape â€” fecha modal, painel de perfil, chat ou menu de contexto (nessa ordem)
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

  // Enter / Space ativam itens de transaÃ§Ã£o focados via teclado
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const txItem = e.target.closest('.tx-item[role="button"]');
    if (!txItem) return;
    if (e.target.closest('.tx-menu-btn, .tx-fatura-btn')) return;
    e.preventDefault();
    txItem.click();
  });

  // Atalho N â€” nova transaÃ§Ã£o (apenas fora de inputs e modais)
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
    ? `\nðŸ· Maior gasto: ${CATEGORIES[topCat[0]]?.label || topCat[0]} (${fmt(topCat[1])})`
    : '';

  const text = [
    `ðŸ“Š Resumo financeiro â€” ${mes}`,
    ``,
    `ðŸ’° Receitas:  ${fmt(income)}`,
    `ðŸ’¸ Despesas:  ${fmt(expense)}`,
    `ðŸ“ˆ Saldo:     ${sign}${fmt(balance)}${topCatLine}`,
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
    toast('Resumo copiado para a Ã¡rea de transferÃªncia!');
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
  document.body.classList.add('app-loaded');
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
      toast(`${legacy.length} transaÃ§Ãµes migradas.`);
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

  // ReconexÃ£o: flush da fila offline e re-sync
  window.addEventListener('online', async () => {
    const count = await PendingQueue.count().catch(() => 0);
    if (count > 0) {
      toast(`ConexÃ£o restaurada â€” sincronizando ${count} item${count > 1 ? 's' : ''}...`);
      const synced = await PendingQueue.flush().catch(() => 0);
      if (synced > 0) await syncFromCloud();
      else await _updatePendingBadge();
    } else {
      setCloudStatus('connected', 'Online');
    }
  });

  window.addEventListener('offline', () => {
    setCloudStatus('error', 'Sem conexÃ£o â€” mudanÃ§as salvas localmente');
  });

  const dot = document.getElementById('db-status-dot-header');
  if (dot) {
    dot.style.cursor = 'pointer';
    dot.addEventListener('click', () => {
      if (!Demo.active) syncFromCloud();
    });
  }

  // Badge inicial de pendentes (pode haver da sessÃ£o anterior)
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
