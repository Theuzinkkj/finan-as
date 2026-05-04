// ================================================================
//  Atlas Finance — Google Apps Script
//  Cole este código em: Extensões → Apps Script (na sua planilha)
//  Depois: Implantar → Nova implantação → App da Web
//    - Executar como: Eu
//    - Quem tem acesso: Qualquer pessoa
//  Copie a URL gerada e cole nas configurações do app (⚙️)
// ================================================================

const SHEET_NAME = 'Transações';
const HEADERS    = ['id', 'type', 'amount', 'category', 'description', 'notes', 'date'];

// ── Ponto de entrada único (GET) ─────────────────────────────────
function doGet(e) {
  try {
    const action = e.parameter.action;
    let result;

    if      (action === 'getAll') result = getAllTransactions();
    else if (action === 'add')    result = addTransaction(JSON.parse(e.parameter.data));
    else if (action === 'delete') result = deleteTransaction(e.parameter.id);
    else                          result = { error: 'Ação desconhecida: ' + action };

    return respond(result);
  } catch (err) {
    return respond({ error: err.message });
  }
}

// ── Helpers ───────────────────────────────────────────────────────
function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  let   sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
    headerRange.setValues([HEADERS]);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#1e1b4b');
    headerRange.setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1, HEADERS.length, 160);
  }
  return sheet;
}

// ── CRUD ──────────────────────────────────────────────────────────
function getAllTransactions() {
  const sheet = getSheet();
  const data  = sheet.getDataRange().getValues();
  if (data.length <= 1) return { data: [] };

  const headers = data[0];
  const rows    = data.slice(1)
    .filter(row => row[0])
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = h === 'amount'
          ? (parseFloat(row[i]) || 0)
          : String(row[i] !== undefined ? row[i] : '');
      });
      return obj;
    });

  return { data: rows };
}

function addTransaction(tx) {
  const sheet = getSheet();
  sheet.appendRow(HEADERS.map(h => tx[h] !== undefined ? tx[h] : ''));
  SpreadsheetApp.flush();
  return { success: true };
}

function deleteTransaction(id) {
  const sheet = getSheet();
  const data  = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      sheet.deleteRow(i + 1);
      SpreadsheetApp.flush();
      return { success: true };
    }
  }
  return { error: 'Transação não encontrada (id: ' + id + ')' };
}
