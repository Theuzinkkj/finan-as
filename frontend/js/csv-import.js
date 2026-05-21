'use strict';

// =============================================
//  CSV IMPORT
// =============================================

let _csvRows     = [];
let _csvHeaders  = [];
let _csvColMap   = { date: -1, desc: -1, amount: -1 };

function openImportCSV() {
  _csvRows    = [];
  _csvHeaders = [];
  _csvColMap  = { date: -1, desc: -1, amount: -1 };
  document.getElementById('csv-preview-area').classList.add('hidden');
  document.getElementById('csv-upload-area').classList.remove('hidden');
  document.getElementById('csv-format-help').classList.remove('hidden');
  document.getElementById('btn-csv-import-confirm').disabled = true;
  document.getElementById('csv-file-input').value = '';
  openModal('modal-import-csv');
}

function _parseCSVLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; continue; }
    if (!inQ && (ch === ';' || ch === ',')) { result.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  result.push(cur.trim());
  return result;
}

function _detectSep(raw) {
  const firstLine = raw.split('\n')[0] || '';
  const semis = (firstLine.match(/;/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  return semis >= commas ? ';' : ',';
}

function _parseBRNumber(str) {
  if (!str) return NaN;
  str = str.trim().replace(/"/g, '');
  // Remove currency symbols
  str = str.replace(/[R$\s]/g, '');
  // Handle BR format: 1.234,56 -> 1234.56
  if (/^\-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(str)) {
    str = str.replace(/\./g, '').replace(',', '.');
  } else {
    str = str.replace(',', '.');
  }
  return parseFloat(str);
}

function _parseDate(str) {
  if (!str) return '';
  str = str.trim().replace(/"/g, '');
  // DD/MM/YYYY or DD-MM-YYYY
  const m1 = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m1) {
    const [, d, mo, y] = m1;
    const year = y.length === 2 ? '20' + y : y;
    return `${year}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // YYYY-MM-DD (ISO)
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  return '';
}

function _guessColumns(headers) {
  const map = { date: -1, desc: -1, amount: -1 };
  headers.forEach((h, i) => {
    const hl = h.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (map.date < 0 && /data|date|lancamento|competencia/.test(hl))  map.date   = i;
    if (map.desc < 0 && /desc|hist|memo|detalhe|titulo|lancamento|estabelecimento/.test(hl)) map.desc = i;
    if (map.amount < 0 && /valor|value|amount|credito|debito|credit|debit/.test(hl)) map.amount = i;
  });
  // Fallback: first 3 columns
  if (map.date < 0)   map.date   = 0;
  if (map.desc < 0)   map.desc   = headers.length > 1 ? 1 : 0;
  if (map.amount < 0) map.amount = headers.length > 2 ? 2 : 1;
  return map;
}

function _processCSVFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    const raw = e.target.result;
    const lines = raw.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) { toast('Arquivo vazio ou inválido.', 'err'); return; }

    _csvHeaders = _parseCSVLine(lines[0]);
    _csvColMap  = _guessColumns(_csvHeaders);
    _csvRows    = lines.slice(1)
      .map(l => _parseCSVLine(l))
      .filter(r => r.length >= 2 && r.some(c => c));

    _renderCSVPreview();
  };
  reader.readAsText(file, 'UTF-8');
}

function _renderCSVPreview() {
  if (!_csvRows.length) { toast('Nenhuma linha encontrada no arquivo.', 'err'); return; }

  document.getElementById('csv-upload-area').classList.add('hidden');
  document.getElementById('csv-format-help').classList.add('hidden');
  document.getElementById('csv-preview-area').classList.remove('hidden');

  const validRows = _csvRows.filter(r => {
    const dateStr   = r[_csvColMap.date]   || '';
    const amountStr = r[_csvColMap.amount] || '';
    return _parseDate(dateStr) && !isNaN(_parseBRNumber(amountStr));
  });

  document.getElementById('csv-preview-count').textContent =
    `${validRows.length} de ${_csvRows.length} linhas válidas`;
  document.getElementById('btn-csv-import-confirm').disabled = validRows.length === 0;

  // Column mapping UI
  const colMap = document.getElementById('csv-col-map');
  colMap.innerHTML = `
    <div class="csv-map-row">
      <label>Data:</label>
      <select id="csv-map-date" class="filter-select">${_csvHeaders.map((h, i) => `<option value="${i}" ${i === _csvColMap.date ? 'selected' : ''}>${h || 'Coluna ' + (i+1)}</option>`).join('')}</select>
    </div>
    <div class="csv-map-row">
      <label>Descrição:</label>
      <select id="csv-map-desc" class="filter-select">${_csvHeaders.map((h, i) => `<option value="${i}" ${i === _csvColMap.desc ? 'selected' : ''}>${h || 'Coluna ' + (i+1)}</option>`).join('')}</select>
    </div>
    <div class="csv-map-row">
      <label>Valor:</label>
      <select id="csv-map-amount" class="filter-select">${_csvHeaders.map((h, i) => `<option value="${i}" ${i === _csvColMap.amount ? 'selected' : ''}>${h || 'Coluna ' + (i+1)}</option>`).join('')}</select>
    </div>`;

  ['date', 'desc', 'amount'].forEach(key => {
    document.getElementById(`csv-map-${key}`).addEventListener('change', e => {
      _csvColMap[key] = +e.target.value;
      _renderCSVPreviewTable();
    });
  });

  _renderCSVPreviewTable();
}

function _renderCSVPreviewTable() {
  const thead = document.getElementById('csv-preview-thead');
  const tbody = document.getElementById('csv-preview-tbody');

  thead.innerHTML = '<th>Data</th><th>Descrição</th><th>Tipo</th><th>Valor</th>';
  tbody.innerHTML = '';

  const preview = _csvRows.slice(0, 8);
  preview.forEach(row => {
    const rawDate   = row[_csvColMap.date]   || '';
    const rawDesc   = row[_csvColMap.desc]   || '';
    const rawAmount = row[_csvColMap.amount] || '';

    const date   = _parseDate(rawDate);
    const amount = _parseBRNumber(rawAmount);
    const valid  = date && !isNaN(amount);
    const type   = amount >= 0 ? 'receita' : 'despesa';
    const display = Math.abs(amount);

    const tr = document.createElement('tr');
    tr.className = valid ? '' : 'csv-row-invalid';
    tr.innerHTML = `
      <td>${date || rawDate || '—'}</td>
      <td>${escHtml(rawDesc) || '—'}</td>
      <td><span class="badge ${valid ? (type === 'receita' ? 'badge-income' : 'badge-expense') : ''}">${valid ? (type === 'receita' ? 'Receita' : 'Despesa') : 'Inválido'}</span></td>
      <td style="color:${type === 'receita' ? 'var(--green)' : 'var(--red)'}">${valid ? (type === 'receita' ? '+' : '−') + fmt(display) : rawAmount || '—'}</td>`;
    tbody.appendChild(tr);
  });

  if (_csvRows.length > 8) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="4" style="text-align:center;color:var(--text-muted);font-size:.8rem">... e mais ${_csvRows.length - 8} linhas</td>`;
    tbody.appendChild(tr);
  }
}

async function confirmCSVImport() {
  const btn    = document.getElementById('btn-csv-import-confirm');
  const text   = document.getElementById('csv-import-text');
  const loader = document.getElementById('csv-import-loader');
  btn.disabled = true;
  text.classList.add('hidden');
  loader.classList.remove('hidden');

  const validRows = _csvRows.filter(r => {
    const date   = _parseDate(r[_csvColMap.date] || '');
    const amount = _parseBRNumber(r[_csvColMap.amount] || '');
    return date && !isNaN(amount);
  });

  let imported = 0, failed = 0;

  for (const row of validRows) {
    const date        = _parseDate(row[_csvColMap.date] || '');
    const rawAmount   = _parseBRNumber(row[_csvColMap.amount] || '');
    const description = (row[_csvColMap.desc] || 'Importado').trim() || 'Importado';
    const type        = rawAmount >= 0 ? 'receita' : 'despesa';
    const amount      = Math.abs(rawAmount);

    try {
      if (Demo.active) {
        const tx = { id: Date.now() + imported, date, description, type, amount, category: 'outros', payment: 'outro', fixed: false };
        transactions.push(tx);
        imported++;
      } else {
        await API.post('/api/transactions', { date, description, type, amount, category: 'outros', payment: 'outro', fixed: false });
        imported++;
      }
    } catch { failed++; }
  }

  if (!Demo.active && imported > 0) {
    await loadTransactions();
  } else if (Demo.active) {
    renderDashboard();
    renderTransactions();
  }

  btn.disabled = false;
  text.classList.remove('hidden');
  loader.classList.add('hidden');
  closeModal('modal-import-csv');

  const msg = failed > 0
    ? `${imported} transações importadas, ${failed} com erro.`
    : `${imported} transações importadas com sucesso!`;
  toast(msg, failed > 0 ? 'warn' : undefined);

  if (imported > 0) {
    localStorage.setItem('atlas_csv_imported', '1');
    if (typeof checkAchievements === 'function') checkAchievements();
  }
}

// Setup drag & drop e file input
function initCSVImport() {
  const area  = document.getElementById('csv-upload-area');
  const input = document.getElementById('csv-file-input');
  if (!area || !input) return;

  input.addEventListener('change', e => {
    if (e.target.files[0]) _processCSVFile(e.target.files[0]);
  });

  area.addEventListener('dragover', e => { e.preventDefault(); area.classList.add('csv-drag'); });
  area.addEventListener('dragleave', () => area.classList.remove('csv-drag'));
  area.addEventListener('drop', e => {
    e.preventDefault();
    area.classList.remove('csv-drag');
    const file = e.dataTransfer.files[0];
    if (file) _processCSVFile(file);
  });

  document.getElementById('btn-import-csv')?.addEventListener('click', openImportCSV);
  document.getElementById('btn-csv-import-confirm')?.addEventListener('click', confirmCSVImport);
  document.getElementById('csv-clear-btn')?.addEventListener('click', () => {
    _csvRows = []; _csvHeaders = [];
    document.getElementById('csv-preview-area').classList.add('hidden');
    document.getElementById('csv-upload-area').classList.remove('hidden');
    document.getElementById('csv-format-help').classList.remove('hidden');
    document.getElementById('btn-csv-import-confirm').disabled = true;
    document.getElementById('csv-file-input').value = '';
  });
}
