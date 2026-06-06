'use strict';

// =============================================
//  UTILS
// =============================================
function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

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

  const regular = uniqueTxs(transactions.filter(t => !t.fixed && t.date.startsWith(key)));

  const generatedTemplateIds = new Set(regular.map(recurringTemplateId).filter(Boolean));
  const fixed = transactions
    .filter(t => t.fixed && t.date.slice(0, 7) <= key && !generatedTemplateIds.has(t.id))
    .map(t => {
      const day = Math.min(parseInt(t.date.slice(8, 10), 10), daysInMonth);
      return {
        ...t,
        id: `${t.id}__${key}`,
        date: `${key}-${pad2(day)}`,
        // O pagamento pertence à competência mensal, não ao modelo recorrente.
        // Mantém compatibilidade com lançamentos antigos apenas no mês original.
        paid: t.date.slice(0, 7) === key ? !!t.paid : false,
        recurringId: t.id,
        _virtualFixed: true,
        _templateId: t.id,
      };
    })
    .filter(t => !regular.some(r => sameRecurringOccurrence(r, t)));

  return [...regular, ...fixed];
}

function recurringTemplateId(tx) {
  if (tx?.recurringId) return tx.recurringId;
  const month = tx?.date?.slice(0, 7);
  const suffix = month ? `__${month}` : '';
  if (suffix && tx?.id?.endsWith(suffix)) return tx.id.slice(0, -suffix.length);
  return null;
}

function sameRecurringOccurrence(a, b) {
  return a.date === b.date &&
    a.type === b.type &&
    Number(a.amount) === Number(b.amount) &&
    (a.category || '') === (b.category || '') &&
    (a.description || '').trim().toLowerCase() === (b.description || '').trim().toLowerCase();
}

function uniqueTxs(txs) {
  const seen = new Set();
  return txs.filter(t => {
    if (!t?.id) return true;
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });
}

function findDisplayTx(id) {
  return transactions.find(t => t.id === id) || txOfMonth().find(t => t.id === id);
}

async function materializeDisplayTx(id, { sync = true } = {}) {
  const direct = transactions.find(t => t.id === id);
  if (direct) return direct;

  const virtual = txOfMonth().find(t => t.id === id);
  if (!virtual?._virtualFixed) return null;

  const { _virtualFixed, _templateId, recurringId: _recurringId, ...copy } = virtual;
  const tx = {
    ...copy,
    id: virtual.id,
    fixed: false,
  };

  await DB.put(tx);
  transactions.push(tx);
  _cachedMonths.add(tx.date.slice(0, 7));

  if (sync && !Demo.active) {
    const result = await CloudDB.add(tx);
    if (result?.queued) await _updatePendingBadge();
  }

  return tx;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getCategoryMeta(key, tx = null) {
  if (CATEGORIES[key]) return CATEGORIES[key];
  if (String(key || '').startsWith('custom_')) {
    const currentSaved = Storage.getJSON(Storage.catsKey(), {});
    const anonymousSaved = Storage.getJSON('atlas_custom_cats_anon', {});
    const recovered = currentSaved?.[key] || anonymousSaved?.[key];
    if (recovered) {
      CATEGORIES[key] = recovered;
      return recovered;
    }
  }
  if (tx?.categoryLabel) {
    return {
      label: tx.categoryLabel,
      icon: tx.categoryIcon || '<i class="bi bi-tag-fill"></i>',
      color: tx.categoryColor || '#94a3b8',
    };
  }
  if (String(key || '').startsWith('custom_')) {
    return {
      label: 'Categoria personalizada',
      icon: '<i class="bi bi-tag-fill"></i>',
      color: '#94a3b8',
    };
  }
  return CATEGORIES.outros;
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
