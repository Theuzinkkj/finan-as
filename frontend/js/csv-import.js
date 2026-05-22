'use strict';

// =============================================
//  CSV IMPORT — detecção automática de banco,
//  encoding, categorização e preview rico
// =============================================

let _csvRows     = [];
let _csvHeaders  = [];
let _csvColMap   = { date: -1, desc: -1, amount: -1, credit: -1, debit: -1, type: -1 };
let _detectedBank = null;

// ── Definições de bancos brasileiros ────────────────────────────────────────

const BANK_PROFILES = [
  {
    name: 'Nubank',
    detect: h => h.some(v => /Data|Valor|Identificador|Descrição/i.test(v)),
    cols:   { date: 'data', desc: 'descrição', amount: 'valor' },
    dateFormat: 'YYYY-MM-DD',
    amountSign: 'signed', // negativo = despesa, positivo = receita
  },
  {
    name: 'Itaú',
    detect: h => h.some(v => /Lançamentos|Agência|Conta/i.test(v)) || h.join('').toLowerCase().includes('itau'),
    cols:   { date: 'data', desc: 'histórico', amount: 'valor' },
    dateFormat: 'DD/MM/YYYY',
    amountSign: 'signed',
  },
  {
    name: 'Bradesco',
    detect: h => h.some(v => /Histórico|Docto|CRED|DEB/i.test(v)) && h.length >= 4,
    cols:   { date: 'data', desc: 'histórico', credit: 'cred', debit: 'deb' },
    dateFormat: 'DD/MM/YYYY',
    amountSign: 'split', // colunas separadas para crédito e débito
  },
  {
    name: 'Banco do Brasil',
    detect: h => h.some(v => /Número do Lançamento|Débito|Crédito/i.test(v)),
    cols:   { date: 'data', desc: 'dependência origem', credit: 'crédito (r$)', debit: 'débito (r$)' },
    dateFormat: 'DD/MM/YYYY',
    amountSign: 'split',
  },
  {
    name: 'Inter',
    detect: h => h.some(v => /Tipo Transação|Valor|Entrada|Saída/i.test(v)) && h.some(v => /entrada|saída/i.test(v)),
    cols:   { date: 'data lançamento', desc: 'título', credit: 'entrada', debit: 'saída' },
    dateFormat: 'DD/MM/YYYY',
    amountSign: 'split',
  },
  {
    name: 'C6 Bank',
    detect: h => h.some(v => /Título|Categoria/i.test(v)) && h.some(v => /valor/i.test(v)),
    cols:   { date: 'data', desc: 'título', amount: 'valor' },
    dateFormat: 'DD/MM/YYYY',
    amountSign: 'signed',
  },
  {
    name: 'Santander',
    detect: h => h.some(v => /Dependência|Complemento/i.test(v)),
    cols:   { date: 'data', desc: 'complemento', amount: 'valor' },
    dateFormat: 'DD/MM/YYYY',
    amountSign: 'signed',
  },
  {
    name: 'XP / BTG',
    detect: h => h.some(v => /Movimentação|Lançamento/i.test(v)) && h.some(v => /valor líquido/i.test(v)),
    cols:   { date: 'data', desc: 'movimentação', amount: 'valor líquido' },
    dateFormat: 'DD/MM/YYYY',
    amountSign: 'signed',
  },
];

// ── Auto-categorização por palavras-chave ────────────────────────────────────

const KEYWORD_CATS = [
  { cat: 'alimentacao', rx: /restaurante|lanchonete|burger|mc.?donald|subway|ifood|rappi|uber.?eat|padaria|pizz|sushi|hamburguer|supermercado|mercado|hortifruti|atacad|carrefour|assai|extra|pao.?de.?acucar|walmart|atacarejo|feira|acougue|sorveteria|cafe|confeitaria/i },
  { cat: 'transporte',  rx: /uber|99.?taxi|taxi|onibus|metrô|metro|combustivel|gasolina|etanol|posto|estacionamento|pedagio|correio|sedex|loggi|ifood.?entrega|uber.?moto/i },
  { cat: 'saude',       rx: /farmacia|drogaria|hospital|clinica|medic|dentist|academia|gym|smart.?fit|bio.?ritmo|laboratorio|exame|plano.?saude|unimed|amil|bradesco.?saude/i },
  { cat: 'moradia',     rx: /aluguel|condominio|agua|luz|energia|enel|cemig|sabesp|gas|internet|vivo|claro|tim|oi|net|sky|gfl|telecom|telefone/i },
  { cat: 'lazer',       rx: /netflix|spotify|amazon.?prime|disney|hbo|globoplay|apple.?tv|youtube|cinema|teatro|show|ingresso|steam|playstation|xbox|nintendo|parque|viagem|hotel|airbnb/i },
  { cat: 'educacao',    rx: /escola|faculdade|universidade|curso|duolingo|udemy|alura|coursera|livro|apostila|papelaria|mensalidade.?escolar/i },
  { cat: 'compras',     rx: /amazon|mercado.?livre|shopee|americanas|magazine|magazine.?luiza|casas.?bahia|renner|zara|hm|h&m|c&a|riachuelo|lojas|roupas|calcados/i },
  { cat: 'contas',      rx: /cartao|fatura|boleto|imposto|iptu|ipva|ir |inss|pis |cofins|seguro|taxa/i },
];

function _autoCategorize(desc) {
  const d = (desc || '').toLowerCase();
  for (const { cat, rx } of KEYWORD_CATS) {
    if (rx.test(d)) return cat;
  }
  return 'outros';
}

// ── Parsing ──────────────────────────────────────────────────────────────────

function _parseCSVLine(line, sep) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; continue; }
      inQ = !inQ;
      continue;
    }
    if (!inQ && ch === sep) { result.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  result.push(cur.trim());
  return result;
}

function _detectSep(raw) {
  const lines = raw.split('\n').slice(0, 3);
  let semis = 0, commas = 0;
  lines.forEach(l => {
    semis  += (l.match(/;/g)  || []).length;
    commas += (l.match(/,/g)  || []).length;
  });
  return semis >= commas ? ';' : ',';
}

function _parseBRNumber(str) {
  if (!str && str !== 0) return NaN;
  str = String(str).trim().replace(/"/g, '').replace(/[R$\s]/g, '').replace(/ /g, '');
  if (!str) return NaN;
  // 1.234,56 → 1234.56
  if (/^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(str)) {
    str = str.replace(/\./g, '').replace(',', '.');
  } else {
    // Tenta trocar vírgula decimal
    str = str.replace(',', '.');
  }
  return parseFloat(str);
}

function _parseDate(str) {
  if (!str) return '';
  str = String(str).trim().replace(/"/g, '');
  // DD/MM/YYYY ou DD-MM-YYYY (incluindo D/M/YYYY)
  const m1 = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m1) {
    const [, d, mo, y] = m1;
    const year = y.length === 2 ? '20' + y : y;
    return `${year}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // ISO YYYY-MM-DD (pode ter hora depois)
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  // YYYYMMDD
  const m2 = str.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
  return '';
}

function _normalizeKey(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

// Tenta encontrar a coluna pelo nome normalizado
function _findCol(headers, ...names) {
  const norm = headers.map(_normalizeKey);
  for (const name of names) {
    const n = _normalizeKey(name);
    const idx = norm.findIndex(h => h === n || h.includes(n));
    if (idx >= 0) return idx;
  }
  return -1;
}

function _detectBank(headers) {
  for (const profile of BANK_PROFILES) {
    if (profile.detect(headers)) return profile;
  }
  return null;
}

function _guessColumns(headers, bankProfile) {
  const map = { date: -1, desc: -1, amount: -1, credit: -1, debit: -1, type: -1 };

  if (bankProfile) {
    const c = bankProfile.cols;
    if (c.date)   map.date   = _findCol(headers, c.date,   'data', 'date');
    if (c.desc)   map.desc   = _findCol(headers, c.desc,   'descricao', 'historico', 'titulo', 'memo');
    if (c.amount) map.amount = _findCol(headers, c.amount, 'valor', 'value', 'amount');
    if (c.credit) map.credit = _findCol(headers, c.credit, 'credito', 'entrada', 'cred');
    if (c.debit)  map.debit  = _findCol(headers, c.debit,  'debito',  'saida',   'deb');
    return map;
  }

  // Detecção genérica
  map.date   = _findCol(headers, 'data', 'date', 'lancamento', 'competencia', 'dt');
  map.desc   = _findCol(headers, 'descricao', 'historico', 'desc', 'memo', 'detalhe', 'titulo', 'estabelecimento', 'lancamento');
  map.amount = _findCol(headers, 'valor', 'value', 'amount', 'vlr', 'vl');
  map.credit = _findCol(headers, 'credito', 'entrada', 'cred', 'credit');
  map.debit  = _findCol(headers, 'debito',  'saida',   'deb',  'debit');
  map.type   = _findCol(headers, 'tipo', 'type', 'natureza');

  // Fallback posicional
  if (map.date   < 0) map.date   = 0;
  if (map.desc   < 0) map.desc   = headers.length > 1 ? 1 : 0;
  if (map.amount < 0 && map.credit < 0 && map.debit < 0) {
    map.amount = headers.length > 2 ? 2 : 1;
  }

  return map;
}

// Retorna { amount: number, type: 'receita'|'despesa' } de uma linha
function _resolveAmount(row, bankProfile) {
  const hasSplit = _csvColMap.credit >= 0 || _csvColMap.debit >= 0;

  if (hasSplit) {
    const cr  = _parseBRNumber(row[_csvColMap.credit] || '');
    const db  = _parseBRNumber(row[_csvColMap.debit]  || '');
    const cOk = !isNaN(cr) && cr > 0;
    const dOk = !isNaN(db) && db > 0;
    if (cOk && !dOk) return { amount: cr, type: 'receita' };
    if (dOk && !cOk) return { amount: db, type: 'despesa' };
    if (cOk && dOk)  return { amount: Math.max(cr, db), type: cr >= db ? 'receita' : 'despesa' };
    return { amount: NaN, type: 'despesa' };
  }

  const raw = _parseBRNumber(row[_csvColMap.amount] || '');
  if (isNaN(raw)) return { amount: NaN, type: 'despesa' };
  return { amount: Math.abs(raw), type: raw >= 0 ? 'receita' : 'despesa' };
}

// ── Leitura do arquivo com fallback de encoding ──────────────────────────────

function _readFile(file) {
  return new Promise(resolve => {
    const tryRead = enc => new Promise(res => {
      const reader = new FileReader();
      reader.onload = e => res(e.target.result);
      reader.readAsText(file, enc);
    });

    tryRead('UTF-8').then(utf8 => {
      // Heurística: se há muitos caracteres de substituição, tenta latin-1
      const replacements = (utf8.match(/�/g) || []).length;
      if (replacements > 3) {
        tryRead('ISO-8859-1').then(resolve);
      } else {
        resolve(utf8);
      }
    });
  });
}

// ── UI ───────────────────────────────────────────────────────────────────────

function openImportCSV() {
  _csvRows     = [];
  _csvHeaders  = [];
  _csvColMap   = { date: -1, desc: -1, amount: -1, credit: -1, debit: -1, type: -1 };
  _detectedBank = null;

  document.getElementById('csv-preview-area').classList.add('hidden');
  document.getElementById('csv-upload-area').classList.remove('hidden');
  document.getElementById('csv-format-help').classList.remove('hidden');
  document.getElementById('csv-bank-detected').classList.add('hidden');
  document.getElementById('btn-csv-import-confirm').disabled = true;
  document.getElementById('csv-file-input').value = '';
  openModal('modal-import-csv');
}

async function _processCSVFile(file) {
  const raw    = await _readFile(file);
  const sep    = _detectSep(raw);
  // Remove BOM se existir
  const clean  = raw.replace(/^﻿/, '');
  const lines  = clean.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  if (lines.length < 2) { toast('Arquivo vazio ou inválido.', 'err'); return; }

  // Tenta detectar onde começa o cabeçalho (alguns bancos têm linhas de metadados antes)
  let headerIdx = 0;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const cols = _parseCSVLine(lines[i], sep);
    // Se a linha tem pelo menos 3 colunas e parece um cabeçalho
    if (cols.length >= 3 && cols.some(c => /data|date|valor|desc|hist/i.test(c))) {
      headerIdx = i;
      break;
    }
  }

  _csvHeaders  = _parseCSVLine(lines[headerIdx], sep).map(h => h.replace(/^"|"$/g, ''));
  _detectedBank = _detectBank(_csvHeaders);
  _csvColMap   = _guessColumns(_csvHeaders, _detectedBank);
  _csvRows     = lines.slice(headerIdx + 1)
    .map(l => _parseCSVLine(l, sep))
    .filter(r => r.length >= 2 && r.some(c => c));

  _renderCSVPreview();
}

function _renderCSVPreview() {
  if (!_csvRows.length) { toast('Nenhuma linha encontrada no arquivo.', 'err'); return; }

  document.getElementById('csv-upload-area').classList.add('hidden');
  document.getElementById('csv-format-help').classList.add('hidden');
  document.getElementById('csv-preview-area').classList.remove('hidden');

  // Banner de banco detectado
  const bankEl = document.getElementById('csv-bank-detected');
  if (bankEl) {
    if (_detectedBank) {
      bankEl.textContent = `✓ Formato ${_detectedBank.name} detectado automaticamente`;
      bankEl.classList.remove('hidden');
    } else {
      bankEl.classList.add('hidden');
    }
  }

  const validRows = _csvRows.filter(r => {
    const date   = _parseDate((r[_csvColMap.date]   || ''));
    const { amount } = _resolveAmount(r, _detectedBank);
    return date && !isNaN(amount) && amount > 0;
  });

  document.getElementById('csv-preview-count').textContent =
    `${validRows.length} de ${_csvRows.length} linhas válidas`;
  document.getElementById('btn-csv-import-confirm').disabled = validRows.length === 0;

  // Mapa de colunas (só mostra colunas relevantes)
  const colMap = document.getElementById('csv-col-map');
  const makeSelect = (key, label, currentIdx) => {
    if (currentIdx < 0 && ['credit','debit','type'].includes(key)) return ''; // opcional
    return `
      <div class="csv-map-row">
        <label>${label}:</label>
        <select id="csv-map-${key}" class="filter-select">
          ${key !== 'date' && key !== 'desc' ? '<option value="-1">(nenhuma)</option>' : ''}
          ${_csvHeaders.map((h, i) => `<option value="${i}" ${i === currentIdx ? 'selected' : ''}>${h || 'Coluna ' + (i+1)}</option>`).join('')}
        </select>
      </div>`;
  };

  colMap.innerHTML = [
    makeSelect('date',   'Data',        _csvColMap.date),
    makeSelect('desc',   'Descrição',   _csvColMap.desc),
    makeSelect('amount', 'Valor',       _csvColMap.amount),
    makeSelect('credit', 'Entrada (+)', _csvColMap.credit),
    makeSelect('debit',  'Saída (−)',   _csvColMap.debit),
  ].join('');

  ['date','desc','amount','credit','debit'].forEach(key => {
    const sel = document.getElementById(`csv-map-${key}`);
    if (!sel) return;
    sel.addEventListener('change', e => {
      _csvColMap[key] = +e.target.value;
      _renderCSVPreviewTable();
    });
  });

  _renderCSVPreviewTable();
}

function _renderCSVPreviewTable() {
  const thead = document.getElementById('csv-preview-thead');
  const tbody = document.getElementById('csv-preview-tbody');

  thead.innerHTML = '<th>Data</th><th>Descrição</th><th>Tipo</th><th>Valor</th><th>Categoria</th>';
  tbody.innerHTML = '';

  const preview = _csvRows.slice(0, 20);
  preview.forEach(row => {
    const rawDate = row[_csvColMap.date] || '';
    const rawDesc = row[_csvColMap.desc] || '';
    const date    = _parseDate(rawDate);
    const { amount, type } = _resolveAmount(row, _detectedBank);
    const valid   = !!(date && !isNaN(amount) && amount > 0);
    const cat     = valid ? _autoCategorize(rawDesc) : '';
    const catObj  = cat ? (CATEGORIES?.[cat] || {}) : {};

    const tr = document.createElement('tr');
    tr.className = valid ? '' : 'csv-row-invalid';
    tr.innerHTML = `
      <td>${date || rawDate || '—'}</td>
      <td title="${escHtml(rawDesc)}">${escHtml(rawDesc.slice(0, 28)) || '—'}${rawDesc.length > 28 ? '…' : ''}</td>
      <td><span class="badge ${valid ? (type === 'receita' ? 'badge-income' : 'badge-expense') : ''}">${valid ? (type === 'receita' ? 'Receita' : 'Despesa') : 'Inválido'}</span></td>
      <td style="color:${type === 'receita' ? 'var(--green)' : 'var(--red)'}">${valid ? (type === 'receita' ? '+' : '−') + fmt(amount) : (row[_csvColMap.amount] || '—')}</td>
      <td>${catObj.icon || ''} ${catObj.label || cat || '—'}</td>`;
    tbody.appendChild(tr);
  });

  if (_csvRows.length > 20) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="5" style="text-align:center;color:var(--text-muted);font-size:.8rem">... e mais ${_csvRows.length - 20} linhas</td>`;
    tbody.appendChild(tr);
  }

  // Atualiza contagem de válidas
  const validCount = _csvRows.filter(r => {
    const date = _parseDate(r[_csvColMap.date] || '');
    const { amount } = _resolveAmount(r, _detectedBank);
    return date && !isNaN(amount) && amount > 0;
  }).length;
  const countEl = document.getElementById('csv-preview-count');
  if (countEl) countEl.textContent = `${validCount} de ${_csvRows.length} linhas válidas`;
  const confirmBtn = document.getElementById('btn-csv-import-confirm');
  if (confirmBtn) confirmBtn.disabled = validCount === 0;
}

async function confirmCSVImport() {
  const btn    = document.getElementById('btn-csv-import-confirm');
  const text   = document.getElementById('csv-import-text');
  const loader = document.getElementById('csv-import-loader');
  btn.disabled = true;
  text?.classList.add('hidden');
  loader?.classList.remove('hidden');

  const validRows = _csvRows.filter(r => {
    const date = _parseDate(r[_csvColMap.date] || '');
    const { amount } = _resolveAmount(r, _detectedBank);
    return date && !isNaN(amount) && amount > 0;
  });

  let imported = 0, failed = 0, skipped = 0;

  for (const row of validRows) {
    const date        = _parseDate(row[_csvColMap.date] || '');
    const rawDesc     = (row[_csvColMap.desc] || '').trim();
    const description = rawDesc || 'Importado';
    const { amount, type } = _resolveAmount(row, _detectedBank);
    const category    = _autoCategorize(description);

    // Verifica duplicata antes de inserir
    const isDup = typeof transactions !== 'undefined' && transactions.some(t =>
      t.date === date &&
      Math.abs(t.amount - amount) < 0.01 &&
      t.description.toLowerCase() === description.toLowerCase()
    );
    if (isDup) { skipped++; continue; }

    const tx = {
      id: genId(),
      date,
      description,
      type,
      amount,
      category,
      paymentMethod: null,
      fixed: false,
      notes: '',
    };

    try {
      if (Demo.active) {
        if (typeof transactions !== 'undefined') transactions.push(tx);
        imported++;
      } else {
        await DB.put(tx);
        if (typeof transactions !== 'undefined') transactions.push(tx);
        const result = await CloudDB.add(tx).catch(() => ({ queued: true }));
        if (result?.queued) await _updatePendingBadge?.();
        imported++;
      }
    } catch { failed++; }
  }

  if (!Demo.active && imported > 0) {
    if (typeof renderAll === 'function') renderAll();
  } else if (Demo.active && imported > 0) {
    if (typeof renderAll === 'function') { renderDashboard?.(); renderTransactions?.(); renderAll?.(); }
  }

  btn.disabled = false;
  text?.classList.remove('hidden');
  loader?.classList.add('hidden');
  closeModal('modal-import-csv');

  const parts = [`${imported} transações importadas`];
  if (skipped > 0) parts.push(`${skipped} já existentes ignoradas`);
  if (failed  > 0) parts.push(`${failed} com erro`);
  toast(parts.join(', ') + '.', failed > 0 ? 'warn' : undefined);

  if (imported > 0) {
    Storage.setFlag(Storage.CSV_IMPORTED);
    if (typeof checkAchievements === 'function') checkAchievements();
  }
}

// ── Setup ────────────────────────────────────────────────────────────────────

function initCSVImport() {
  const area  = document.getElementById('csv-upload-area');
  const input = document.getElementById('csv-file-input');
  if (!area || !input) return;

  input.addEventListener('change', e => {
    if (e.target.files[0]) _processCSVFile(e.target.files[0]);
  });

  area.addEventListener('dragover',  e => { e.preventDefault(); area.classList.add('csv-drag'); });
  area.addEventListener('dragleave', ()  => area.classList.remove('csv-drag'));
  area.addEventListener('drop', e => {
    e.preventDefault();
    area.classList.remove('csv-drag');
    const file = e.dataTransfer.files[0];
    if (file) _processCSVFile(file);
  });

  document.getElementById('btn-import-csv')?.addEventListener('click', openImportCSV);
  document.getElementById('btn-csv-import-confirm')?.addEventListener('click', confirmCSVImport);
  document.getElementById('csv-clear-btn')?.addEventListener('click', () => {
    _csvRows = []; _csvHeaders = []; _detectedBank = null;
    _csvColMap = { date: -1, desc: -1, amount: -1, credit: -1, debit: -1, type: -1 };
    document.getElementById('csv-preview-area').classList.add('hidden');
    document.getElementById('csv-upload-area').classList.remove('hidden');
    document.getElementById('csv-format-help').classList.remove('hidden');
    document.getElementById('btn-csv-import-confirm').disabled = true;
    document.getElementById('csv-file-input').value = '';
  });
}
