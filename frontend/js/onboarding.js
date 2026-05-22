'use strict';

// =============================================
//  ONBOARDING
// =============================================
let obExpenses = [];

function shouldShowOnboarding() {
  if (Demo.active) return false;
  return !loadProfile().onboarded;
}

function showOnboarding() {
  document.getElementById('onboarding-screen').classList.remove('hidden');
  obGoTo(1);
}

function obGoTo(step) {
  document.querySelectorAll('.onboarding-step').forEach((el, i) => {
    el.classList.toggle('hidden', i + 1 !== step);
  });
  document.querySelectorAll('.ob-dot').forEach((dot, i) => {
    dot.classList.toggle('ob-dot-active', i + 1 === step);
    dot.classList.toggle('ob-dot-done',   i + 1 < step);
  });
}

function obSkip() { completeOnboarding(); }
function obBack(step) { obGoTo(step); }

function obStep1Next() {
  const nameInput = document.getElementById('ob-name');
  const name = nameInput ? nameInput.value.trim() : '';
  if (name) { saveProfile({ name }); updateProfileUI(); }
  obGoTo(2);
}

function obStep2Next() {
  obGoTo(3);
  obExpenses = [];
  renderObExpenses();
}

function obAddExpenseRow() {
  obExpenses.push({ desc: '', amount: 0, category: 'moradia' });
  renderObExpenses();
}

function obRemoveExpense(i) {
  obExpenses.splice(i, 1);
  renderObExpenses();
}

function renderObExpenses() {
  const list = document.getElementById('ob-recurring-list');
  if (!list) return;
  if (!obExpenses.length) {
    list.innerHTML = '<p class="ob-no-expenses">Nenhuma adicionada. Pode pular!</p>';
    return;
  }
  list.innerHTML = obExpenses.map((exp, i) => `
    <div class="ob-expense-row">
      <input type="text" class="ob-expense-desc" placeholder="Ex: Aluguel"
             value="${escHtml(exp.desc)}"
             onchange="obExpenses[${i}].desc=this.value">
      <select class="ob-expense-cat" onchange="obExpenses[${i}].category=this.value">
        ${Object.entries(CATEGORIES).map(([k, c]) =>
          `<option value="${k}"${k === exp.category ? ' selected' : ''}>${c.icon} ${c.label}</option>`
        ).join('')}
      </select>
      <input type="number" class="ob-expense-amount" placeholder="R$"
             value="${exp.amount || ''}"
             onchange="obExpenses[${i}].amount=parseFloat(this.value)||0">
      <button class="ob-expense-remove" onclick="obRemoveExpense(${i})">✕</button>
    </div>`).join('');
}

async function obFinish() {
  const btn = document.getElementById('ob-finish-btn');
  if (btn) btn.disabled = true;

  const today      = todayLocal();
  const [y, m]     = today.split('-');
  const incomeDate = `${y}-${m}-05`;
  const created    = [];

  const incomeVal  = parseFloat(document.getElementById('ob-income')?.value) || 0;
  const incomeDesc = (document.getElementById('ob-income-desc')?.value || 'Salário').trim();

  if (incomeVal > 0) {
    const tx = {
      id: genId(), type: 'receita', amount: incomeVal,
      category: 'outros', description: incomeDesc,
      notes: '', date: incomeDate, fixed: true,
      paymentMethod: null, invoiceItems: null, benefitType: null,
    };
    try { await DB.put(tx); transactions.push(tx); created.push(tx); } catch { /* ignore */ }
  }

  for (const exp of obExpenses.filter(e => e.desc && e.amount > 0)) {
    const tx = {
      id: genId(), type: 'despesa', amount: exp.amount,
      category: exp.category || 'outros', description: exp.desc,
      notes: '', date: incomeDate, fixed: true,
      paymentMethod: null, invoiceItems: null, benefitType: null,
    };
    try { await DB.put(tx); transactions.push(tx); created.push(tx); } catch { /* ignore */ }
  }

  if (created.length && !Demo.active) {
    Promise.all(created.map(tx => CloudDB.add(tx))).catch(() => {});
  }

  completeOnboarding();
  renderAll();
  if (created.length) {
    const n = created.length;
    toast(`Perfeito! ${n} transaç${n === 1 ? 'ão adicionada' : 'ões adicionadas'}! 🎉`);
  }
}

function completeOnboarding() {
  saveProfile({ onboarded: true });
  const screen = document.getElementById('onboarding-screen');
  if (screen) screen.classList.add('hidden');
}
