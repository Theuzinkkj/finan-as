'use strict';

// =============================================
//  BENEFIT ALLOCATIONS
// =============================================
let benefitAllocations = {};

function getBenefitSVG(key, size = 18) {
  if (key === 'vr') return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><line x1="7" y1="2" x2="7" y2="22"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h1v8"/></svg>`;
  if (key === 'vt') return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`;
  return '';
}

function loadBenefitAllocations() {
  benefitAllocations = Storage.getJSON(Storage.benefitKey(), {});
}

function initBenefitsToggle() {
  const open = Storage.get(Storage.benefitOpenKey()) !== 'false';
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
  Storage.set(Storage.benefitOpenKey(), isOpen ? 'true' : 'false');
}

function saveBenefitsConfig() {
  const vr = parseFloat(document.getElementById('input-vr-amount').value) || 0;
  const vt = parseFloat(document.getElementById('input-vt-amount').value) || 0;
  benefitAllocations.vr = vr;
  benefitAllocations.vt = vt;
  Storage.setJSON(Storage.benefitKey(), benefitAllocations);
  closeModal('modal-benefits-config');
  renderBenefits(txOfMonth());
  toast('Benefícios configurados!');
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
  Storage.setJSON(Storage.benefitKey(), benefitAllocations);
  renderBenefits(txOfMonth());
  toast(`${BENEFIT_TYPES[key]?.label || 'Benefício'} removido`);
}

// =============================================
//  CARD MENU (compartilhado com budgets)
// =============================================
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
