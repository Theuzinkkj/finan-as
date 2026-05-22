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
  if (!window.jspdf) { toast('Biblioteca PDF não carregada. Recarregue a página.', 'err'); return; }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const txs     = [...transactions].sort((a, b) => b.date.localeCompare(a.date));
  const income  = txs.filter(t => t.type === 'receita').reduce((s, t) => s + t.amount, 0);
  const expense = txs.filter(t => t.type === 'despesa').reduce((s, t) => s + t.amount, 0);
  const balance = income - expense;

  const M  = 15;   // margin
  const PW = 210;  // page width mm
  const CW = PW - M * 2; // content width
  const PH = 297;
  const BOTTOM = PH - 12;
  let y = M;

  // helpers
  const newPageIfNeeded = (need) => {
    if (y + need > BOTTOM) { doc.addPage(); y = M; }
  };
  const sectionHeader = (label) => {
    newPageIfNeeded(12);
    doc.setFillColor(30, 27, 75);
    doc.rect(M, y, CW, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text(label, M + 3, y + 5);
    y += 9;
  };
  const tableHeader = (cols) => {
    doc.setFillColor(243, 244, 246);
    doc.rect(M, y, CW, 6, 'F');
    doc.setTextColor(100, 100, 120);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    cols.forEach(([text, x, align]) => doc.text(text, x, y + 4.5, { align: align || 'left' }));
    y += 7;
  };
  const addChartImg = (id, x, imgY, w, h, label) => {
    const canvas = document.getElementById(id);
    if (!canvas || canvas.width === 0 || canvas.height === 0) return false;
    doc.setTextColor(100, 100, 120);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.text(label.toUpperCase(), x, imgY - 1);
    try {
      doc.addImage(canvas.toDataURL('image/png'), 'PNG', x, imgY + 1, w, h);
    } catch (_) { return false; }
    return true;
  };

  // ── HEADER ──────────────────────────────────────────────
  doc.setFillColor(30, 27, 75);
  doc.rect(0, 0, PW, 30, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Atlas Finance', M, 13);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.text('Extrato Financeiro', M, 20);
  doc.setTextColor(180, 170, 220);
  doc.setFontSize(7);
  doc.text(`Gerado em ${fmtDate(todayLocal())}  ·  ${txs.length} transações`, M, 26);
  y = 38;

  // ── RESUMO ───────────────────────────────────────────────
  const cardW = (CW - 8) / 3;
  const cardDefs = [
    { label: 'SALDO',    value: balance, bg: [243, 240, 255], border: [124, 58, 237], color: [124, 58, 237] },
    { label: 'RECEITAS', value: income,  bg: [240, 253, 244], border: [16, 185, 129], color: [5, 150, 105]  },
    { label: 'DESPESAS', value: expense, bg: [254, 242, 242], border: [239, 68, 68],  color: [220, 38, 38]  },
  ];
  cardDefs.forEach((card, i) => {
    const cx = M + i * (cardW + 4);
    doc.setFillColor(...card.bg);
    doc.setDrawColor(...card.border);
    doc.setLineWidth(0.4);
    doc.roundedRect(cx, y, cardW, 18, 2.5, 2.5, 'FD');
    doc.setTextColor(130, 130, 150);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.text(card.label, cx + 4, y + 6);
    doc.setTextColor(...card.color);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(fmt(card.value), cx + 4, y + 14);
  });
  y += 24;

  // ── GRÁFICOS ─────────────────────────────────────────────
  // Linha 1: donut (esquerda) + evolução 6 meses (direita)
  const donutW = 52, donutH = 52;
  const evolW  = CW - donutW - 6, evolH = 52;
  const chartY1 = y;
  const hasDonut = addChartImg('donut-chart', M,              chartY1, donutW, donutH, 'Gastos por Categoria');
  const hasEvol  = addChartImg('evol-chart',  M + donutW + 6, chartY1, evolW,  evolH,  'Evolução 6 Meses');
  if (hasDonut || hasEvol) y = chartY1 + donutH + 10;

  // Linha 2: top categorias (barra horizontal, largura total)
  newPageIfNeeded(52);
  const barH = 48;
  const barY = y;
  if (addChartImg('bar-chart', M, barY, CW, barH, 'Top Categorias')) y = barY + barH + 10;

  // Linha 3: despesas diárias (largura total)
  newPageIfNeeded(42);
  const lineH = 38;
  const lineY = y;
  if (addChartImg('line-chart', M, lineY, CW, lineH, 'Despesas Diárias')) y = lineY + lineH + 10;

  // ── TABELA DE CATEGORIAS ─────────────────────────────────
  const catTotals = {};
  txs.filter(t => t.type === 'despesa')
     .forEach(t => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount; });
  const catEntries = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);

  if (catEntries.length && expense > 0) {
    sectionHeader('GASTOS POR CATEGORIA');
    tableHeader([
      ['Categoria',  M + 3,        'left'],
      ['Total',      M + CW - 35,  'left'],
      ['%',          M + CW - 3,   'right'],
    ]);
    catEntries.forEach(([k, v], i) => {
      newPageIfNeeded(8);
      if (i % 2 === 0) { doc.setFillColor(249, 249, 251); doc.rect(M, y - 1, CW, 6.5, 'F'); }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(30, 27, 75);
      doc.text(CATEGORIES[k]?.label || 'Outros', M + 3, y + 4);
      doc.setTextColor(220, 38, 38);
      doc.text(fmt(v), M + CW - 35, y + 4);
      doc.setTextColor(100, 100, 120);
      doc.text(`${((v / expense) * 100).toFixed(1)}%`, M + CW - 3, y + 4, { align: 'right' });
      y += 6.5;
    });
    y += 6;
  }

  // ── TABELA DE TRANSAÇÕES ─────────────────────────────────
  sectionHeader('TRANSAÇÕES');
  tableHeader([
    ['Data',       M + 3,        'left'],
    ['Tipo',       M + 24,       'left'],
    ['Categoria',  M + 44,       'left'],
    ['Descrição',  M + 82,       'left'],
    ['Valor',      M + CW - 3,   'right'],
  ]);

  txs.forEach((t, i) => {
    newPageIfNeeded(8);
    const isIncome = t.type === 'receita';
    if (i % 2 === 0) { doc.setFillColor(249, 249, 251); doc.rect(M, y - 1, CW, 6.5, 'F'); }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(80, 80, 100);
    doc.text(fmtDate(t.date), M + 3, y + 4);
    doc.setTextColor(isIncome ? 5 : 185, isIncome ? 150 : 28, isIncome ? 105 : 28);
    doc.text(isIncome ? 'Receita' : 'Despesa', M + 24, y + 4);
    doc.setTextColor(80, 80, 100);
    doc.text((isIncome ? '—' : (CATEGORIES[t.category]?.label || 'Outros')).substring(0, 20), M + 44, y + 4);
    doc.setTextColor(30, 27, 75);
    doc.text(t.description.substring(0, 38), M + 82, y + 4);
    doc.setTextColor(isIncome ? 5 : 220, isIncome ? 150 : 38, isIncome ? 105 : 38);
    doc.setFont('helvetica', 'bold');
    doc.text(`${isIncome ? '+' : '−'}${fmt(t.amount)}`, M + CW - 3, y + 4, { align: 'right' });
    y += 6.5;
  });

  // ── RODAPÉ EM TODAS AS PÁGINAS ───────────────────────────
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setDrawColor(220, 220, 230);
    doc.setLineWidth(0.3);
    doc.line(M, PH - 10, PW - M, PH - 10);
    doc.setTextColor(180, 180, 190);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.text(`Atlas Finance · ${new Date().toLocaleString('pt-BR')}`, M, PH - 6);
    doc.text(`Página ${p} de ${total}`, PW - M, PH - 6, { align: 'right' });
  }

  doc.save(`atlas-finance-extrato-${todayLocal()}.pdf`);
  toast('PDF exportado com sucesso!');
}
