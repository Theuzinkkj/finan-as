'use strict';

// =============================================
//  EXPORT
// =============================================
function exportExcel() {
  if (!transactions.length) { toast('Nenhuma transação para exportar.', 'err'); return; }

  const wb = XLSX.utils.book_new();

  const txRows = [...transactions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(t => ({
      'Data':       fmtDate(t.date),
      'Tipo':       t.type === 'receita' ? 'Receita' : 'Despesa',
      'Categoria':  t.type === 'receita' ? '—' : (CATEGORIES[t.category]?.label || 'Outros'),
      'Descrição':  t.description,
      'Anotação':   t.notes || '',
      'Valor (R$)': t.type === 'receita' ? t.amount : -t.amount,
    }));

  const ws1 = XLSX.utils.json_to_sheet(txRows);
  ws1['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 32 }, { wch: 42 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'Transações');

  const months = [...new Set(transactions.map(t => t.date.slice(0, 7)))].sort();
  const summaryRows = months.map(month => {
    const mTxs    = transactions.filter(t => t.date.startsWith(month));
    const income  = mTxs.filter(t => t.type === 'receita').reduce((s, t) => s + t.amount, 0);
    const expense = mTxs.filter(t => t.type === 'despesa').reduce((s, t) => s + t.amount, 0);
    const [y, m]  = month.split('-');
    const label   = new Date(+y, +m - 1, 1)
      .toLocaleString('pt-BR', { month: 'long', year: 'numeric' })
      .replace(/^\w/, c => c.toUpperCase());
    return { 'Mês': label, 'Receitas (R$)': income, 'Despesas (R$)': expense, 'Saldo (R$)': income - expense, 'Nº transações': mTxs.length };
  });

  const ws2 = XLSX.utils.json_to_sheet(summaryRows);
  ws2['!cols'] = [{ wch: 20 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Resumo Mensal');

  XLSX.writeFile(wb, `atlas-finance-${todayLocal()}.xlsx`);
  toast('Excel exportado com sucesso!');
}

function exportPDF() {
  if (!transactions.length) { toast('Nenhuma transação para exportar.', 'err'); return; }

  const txs     = [...transactions].sort((a, b) => b.date.localeCompare(a.date));
  const income  = txs.filter(t => t.type === 'receita').reduce((s, t) => s + t.amount, 0);
  const expense = txs.filter(t => t.type === 'despesa').reduce((s, t) => s + t.amount, 0);
  const balance = income - expense;

  const catTotals = {};
  txs.filter(t => t.type === 'despesa')
     .forEach(t => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount; });

  const catRows = Object.entries(catTotals).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `<tr>
      <td>${CATEGORIES[k]?.icon || ''} ${CATEGORIES[k]?.label || 'Outros'}</td>
      <td style="text-align:right;color:#dc2626;font-weight:600">${fmt(v)}</td>
      <td style="text-align:right">${((v / expense) * 100).toFixed(1)}%</td>
    </tr>`).join('');

  const txRows = txs.map(t => {
    const isIncome = t.type === 'receita';
    return `<tr>
      <td>${fmtDate(t.date)}</td>
      <td><span class="badge ${isIncome ? 'badge-income' : 'badge-expense'}">${isIncome ? 'Receita' : 'Despesa'}</span></td>
      <td>${isIncome ? '—' : (CATEGORIES[t.category]?.label || 'Outros')}</td>
      <td>${escHtml(t.description)}</td>
      <td style="color:#888;font-size:.8em">${t.notes ? escHtml(t.notes) : '—'}</td>
      <td style="text-align:right;font-weight:700;color:${isIncome ? '#059669' : '#dc2626'}">
        ${isIncome ? '+' : '−'}${fmt(t.amount)}
      </td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Atlas Finance — Extrato</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,sans-serif;color:#1e1b4b;padding:32px;font-size:13px}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:16px;border-bottom:2px solid #1e1b4b}
.logo{font-size:1.6rem;font-weight:800;color:#7c3aed}
.meta{font-size:.8rem;color:#888;margin-top:6px}
.summary{display:flex;gap:14px;margin-bottom:28px}
.sum-card{flex:1;padding:14px 18px;border-radius:10px}
.s-balance{background:#f3f0ff;border:1.5px solid #7c3aed}
.s-income{background:#f0fdf4;border:1.5px solid #10b981}
.s-expense{background:#fef2f2;border:1.5px solid #ef4444}
.sum-label{font-size:.68rem;text-transform:uppercase;letter-spacing:.06em;color:#888;margin-bottom:4px}
.sum-value{font-size:1.3rem;font-weight:800}
.s-balance .sum-value{color:#7c3aed}.s-income .sum-value{color:#059669}.s-expense .sum-value{color:#dc2626}
h3{font-size:.85rem;text-transform:uppercase;letter-spacing:.06em;color:#888;margin:24px 0 10px}
table{width:100%;border-collapse:collapse}
th{background:#1e1b4b;color:#fff;padding:9px 12px;text-align:left;font-size:.72rem;text-transform:uppercase;letter-spacing:.05em}
td{padding:8px 12px;border-bottom:1px solid #e5e7eb;vertical-align:top}
tr:nth-child(even) td{background:#f9f9fb}
.badge{padding:2px 8px;border-radius:100px;font-size:.72rem;font-weight:600}
.badge-income{background:#dcfce7;color:#15803d}.badge-expense{background:#fee2e2;color:#b91c1c}
.footer{margin-top:28px;font-size:.72rem;color:#bbb;text-align:center;border-top:1px solid #e5e7eb;padding-top:14px}
@media print{body{padding:16px}.no-print{display:none}}
</style></head><body>
<div class="header">
  <div><div class="logo">💎 Atlas Finance</div>
  <div class="meta">Extrato · Gerado em ${fmtDate(todayLocal())} · ${txs.length} transações</div></div>
  <button class="no-print" onclick="window.print()" style="padding:8px 18px;background:#7c3aed;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:.85rem;font-weight:600">🖨 Imprimir / PDF</button>
</div>
<div class="summary">
  <div class="sum-card s-balance"><div class="sum-label">Saldo</div><div class="sum-value">${fmt(balance)}</div></div>
  <div class="sum-card s-income"><div class="sum-label">Receitas</div><div class="sum-value">${fmt(income)}</div></div>
  <div class="sum-card s-expense"><div class="sum-label">Despesas</div><div class="sum-value">${fmt(expense)}</div></div>
</div>
${catRows ? `<h3>Gastos por Categoria</h3><table><thead><tr><th>Categoria</th><th style="text-align:right">Total</th><th style="text-align:right">%</th></tr></thead><tbody>${catRows}</tbody></table>` : ''}
<h3>Todas as Transações</h3>
<table><thead><tr><th>Data</th><th>Tipo</th><th>Categoria</th><th>Descrição</th><th>Anotação</th><th style="text-align:right">Valor</th></tr></thead>
<tbody>${txRows}</tbody></table>
<div class="footer">Atlas Finance · ${new Date().toLocaleString('pt-BR')}</div>
</body></html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
}
