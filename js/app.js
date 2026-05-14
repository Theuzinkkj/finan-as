'use strict';

// =============================================
//  STATE
// =============================================
let currentDate    = new Date();
let selectedType    = 'despesa';
let selectedCat     = '';
let selectedPayment = '';
let selectedFixed   = false;
let invoiceItems    = [];
let transactions   = [];
let chatHistory    = [];
let appInitialized = false;
let activeTxId     = null;
let activeChangeCat = null;

// =============================================
//  THEME
// =============================================
function initTheme() {
  applyTheme(localStorage.getItem('financeai_theme') || 'dark');
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('financeai_theme', theme);
  document.querySelectorAll('.theme-opt').forEach(b => {
    b.classList.toggle('active', b.id === `theme-btn-${theme}`);
  });
}

// =============================================
//  UTILITIES
// =============================================
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
          .replace(/^\w/, c => c.toUpperCase());
}

function txOfMonth(d = currentDate) {
  const key = mkKey(d);
  const [ty, tm] = key.split('-').map(Number);
  const daysInMonth = new Date(ty, tm, 0).getDate();

  const regular = transactions.filter(t => !t.fixed && t.date.startsWith(key));

  const fixed = transactions
    .filter(t => t.fixed && t.date.slice(0, 7) <= key)
    .map(t => {
      const day = Math.min(parseInt(t.date.slice(8, 10), 10), daysInMonth);
      return { ...t, date: `${key}-${pad2(day)}` };
    });

  return [...regular, ...fixed];
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function toast(msg, type = 'ok') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.borderColor = type === 'err' ? 'rgba(239,68,68,.4)' : 'rgba(255,255,255,.15)';
  el.classList.add('show');
  clearTimeout(el._tid);
  el._tid = setTimeout(() => el.classList.remove('show'), 2800);
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
    dot.title     = label || '';
  }
}

// =============================================
//  CLOUD SYNC
// =============================================
async function syncFromCloud() {
  setCloudStatus('loading', 'Sincronizando...');
  try {
    const remote = await CloudDB.getAll();
    for (const tx of transactions) await DB.remove(tx.id);
    for (const tx of remote)       await DB.put(tx);
    transactions = remote;
    renderAll();
    setCloudStatus('connected', `${remote.length} transações sincronizadas`);
  } catch (err) {
    console.warn('Cloud sync error:', err.message);
    setCloudStatus('error', 'Erro ao sincronizar: ' + err.message);
  }
}

// =============================================
//  RENDER — MONTH LABEL
// =============================================
function renderMonthLabel() {
  document.getElementById('current-month-label').textContent = monthLabel(currentDate);
}

// =============================================
//  RENDER — SUMMARY CARDS
// =============================================
function renderCards(txs) {
  const income  = txs.filter(t => t.type === 'receita').reduce((s, t) => s + t.amount, 0);
  const expense = txs.filter(t => t.type === 'despesa').reduce((s, t) => s + t.amount, 0);
  const balance = income - expense;

  document.getElementById('income-value').textContent  = fmt(income);
  document.getElementById('expense-value').textContent = fmt(expense);
  document.getElementById('balance-value').textContent = fmt(balance);
  document.getElementById('balance-value').style.color = balance >= 0 ? 'var(--green-l)' : '#f87171';
  document.getElementById('balance-sub').textContent   = income > 0
    ? `${((expense / income) * 100).toFixed(0)}% da receita gasto`
    : 'Sem receitas no mês';
}

// =============================================
//  RENDER — TRANSACTION ITEM
// =============================================
function txHTML(t) {
  const isIncome   = t.type === 'receita';
  const cat        = CATEGORIES[t.category] || CATEGORIES.outros;
  const note       = t.notes ? `<div class="tx-note">📝 ${escHtml(t.notes)}</div>` : '';
  const fixedBadge = t.fixed ? '<span class="badge-fixed">🔄 Fixo</span>' : '';
  return `
    <div class="tx-item" data-id="${t.id}">
      <div class="tx-icon">${isIncome ? '💰' : cat.icon}</div>
      <div class="tx-info">
        <div class="tx-desc">${escHtml(t.description)}${fixedBadge}</div>
        <div class="tx-meta">${isIncome ? 'Receita' : cat.label} &bull; ${fmtDate(t.date)}</div>
        ${note}
      </div>
      <div class="tx-amount ${isIncome ? 'income' : 'expense'}">
        ${isIncome ? '+' : '−'}${fmt(t.amount)}
      </div>
      <button class="tx-menu-btn" onclick="openTxMenu('${t.id}', event)" title="Opções">⋮</button>
    </div>`;
}

function emptyHTML(msg = 'Nenhuma transação ainda.') {
  return `<div class="empty-state">
    <span class="empty-icon">💸</span>
    <p>${msg}</p>
    <p class="empty-sub">Clique em + para adicionar.</p>
  </div>`;
}

function renderRecent(txs) {
  const recent = [...txs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  document.getElementById('recent-transactions').innerHTML =
    recent.length ? recent.map(txHTML).join('') : emptyHTML();
}

function renderAllTxs() {
  const catF  = document.getElementById('filter-category').value;
  const typeF = document.getElementById('filter-type').value;
  const list  = txOfMonth()
    .filter(t => !catF  || t.category === catF)
    .filter(t => !typeF || t.type === typeF)
    .sort((a, b) => b.date.localeCompare(a.date));

  document.getElementById('all-transactions').innerHTML =
    list.length ? list.map(txHTML).join('') : emptyHTML('Nenhuma transação encontrada.');
  document.getElementById('filter-count').textContent =
    `${list.length} transaç${list.length === 1 ? 'ão' : 'ões'}`;
}

// =============================================
//  RENDER — ANALYSIS STATS
// =============================================
function renderAnalysisStats(txs) {
  const exp   = txs.filter(t => t.type === 'despesa');
  const total = exp.reduce((s, t) => s + t.amount, 0);
  const maxTx = exp.reduce((a, t) => t.amount > a.amount ? t : a, { amount: 0 });
  const days  = new Set(exp.map(t => t.date)).size || 1;

  const catTotals = {};
  exp.forEach(t => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount; });
  const topEntry = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0];
  const topCat   = topEntry ? CATEGORIES[topEntry[0]] : null;

  document.getElementById('stat-count').textContent   = exp.length;
  document.getElementById('stat-max').textContent     = maxTx.amount ? fmt(maxTx.amount) : '—';
  document.getElementById('stat-avg').textContent     = total ? fmt(total / days) : '—';
  document.getElementById('stat-top-cat').textContent = topCat ? `${topCat.icon} ${topCat.label}` : '—';
}

// =============================================
//  RENDER — ALL
// =============================================
function renderAll() {
  const txs = txOfMonth();
  renderCards(txs);
  renderRecent(txs);
  renderAllTxs();
  renderAnalysisStats(txs);
  drawDonut(txs);
  drawLine(txs);
  drawBars(txs);
}

// =============================================
//  AI — ANALYSIS
// =============================================
function setBtnLoading(on) {
  const btn  = document.getElementById('btn-analyze');
  const text = document.getElementById('analyze-text');
  const spin = document.getElementById('analyze-loader');
  btn.disabled = on;
  text.classList.toggle('hidden', on);
  spin.classList.toggle('hidden', !on);
}

function renderAIResult(a) {
  const score      = Math.max(0, Math.min(100, a.score || 0));
  const scoreColor = score >= 75 ? 'var(--green)' : score >= 50 ? 'var(--yellow)' : 'var(--red)';
  const scoreBg    = score >= 75 ? 'rgba(16,185,129,.18)' : score >= 50 ? 'rgba(245,158,11,.18)' : 'rgba(239,68,68,.18)';
  const ul = arr => arr?.length
    ? `<ul>${arr.map(i => `<li>${escHtml(i)}</li>`).join('')}</ul>` : '';

  document.getElementById('ai-result').innerHTML = `
    <div class="ai-score">
      <div class="score-circle" style="background:${scoreBg};color:${scoreColor};border-color:${scoreColor}">
        ${score}
      </div>
      <div class="score-info">
        <h4>Saúde Financeira: <span style="color:${scoreColor}">${escHtml(a.score_label || '')}</span></h4>
        <p>${escHtml(a.summary || '')}</p>
      </div>
    </div>
    ${a.waste?.length    ? `<div class="ai-section red">   <div class="ai-section-title">⚠️ Gastos Potencialmente Desnecessários</div>${ul(a.waste)}</div>`    : ''}
    ${a.alerts?.length   ? `<div class="ai-section yellow"><div class="ai-section-title">🔔 Alertas</div>${ul(a.alerts)}</div>`   : ''}
    ${a.tips?.length     ? `<div class="ai-section purple"><div class="ai-section-title">💡 Dicas Para Economizar</div>${ul(a.tips)}</div>`     : ''}
    ${a.positive?.length ? `<div class="ai-section green"> <div class="ai-section-title">✅ Pontos Positivos</div>${ul(a.positive)}</div>` : ''}`;
}

function resetAIResult() {
  document.getElementById('ai-result').innerHTML = `
    <div class="ai-placeholder">
      <span class="ai-placeholder-icon">🤖</span>
      <p>Os dados foram alterados. Clique em <strong>"Analisar com IA"</strong> para uma nova análise.</p>
    </div>`;
}

function buildDemoAnalysis(txs) {
  const exp      = txs.filter(t => t.type === 'despesa');
  const inc      = txs.filter(t => t.type === 'receita');
  const totalExp = exp.reduce((s, t) => s + t.amount, 0);
  const totalInc = inc.reduce((s, t) => s + t.amount, 0);
  const balance  = totalInc - totalExp;
  const savRate  = totalInc > 0 ? (balance / totalInc) * 100 : 0;

  const catTotals = {};
  exp.forEach(t => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount; });
  const topCats  = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
  const topCat   = topCats[0];
  const topLabel = topCat ? (CATEGORIES[topCat[0]]?.label || 'Outros') : '';
  const topPct   = topCat && totalExp > 0 ? ((topCat[1] / totalExp) * 100).toFixed(0) : 0;

  const subs = exp.filter(t =>
    ['netflix', 'spotify', 'amazon', 'disney', 'deezer', 'youtube'].some(s =>
      t.description.toLowerCase().includes(s)
    )
  );

  let score, score_label;
  if      (savRate >= 30) { score = 85; score_label = 'Excelente'; }
  else if (savRate >= 20) { score = 72; score_label = 'Bom'; }
  else if (savRate >= 10) { score = 55; score_label = 'Regular'; }
  else if (savRate >= 0)  { score = 38; score_label = 'Preocupante'; }
  else                    { score = 20; score_label = 'Crítico'; }

  const waste = [];
  const alerts = [];
  const tips = [];
  const positive = [];

  if (subs.length > 1)
    waste.push(`${subs.length} assinaturas de streaming somando R$ ${subs.reduce((s,t) => s+t.amount, 0).toFixed(2)} — avalie se usa todas.`);
  if (catTotals['lazer'] && (catTotals['lazer'] / totalExp) > 0.15)
    waste.push(`Lazer acima de 15% das despesas — considere revisar.`);

  if (topPct > 50)
    alerts.push(`${topLabel} representa ${topPct}% das despesas — concentração acima do ideal.`);
  if (savRate < 20)
    alerts.push(`Taxa de poupança de ${savRate.toFixed(0)}% está abaixo dos 20% recomendados.`);

  tips.push(`Reserve pelo menos 20% da receita (R$ ${(totalInc * 0.2).toFixed(2)}) em investimentos ou poupança.`);
  if (catTotals['alimentacao'])
    tips.push('Planejar refeições semanalmente pode reduzir gastos com alimentação em até 30%.');
  if (catTotals['transporte'])
    tips.push('Combinar viagens ou usar transporte público em alguns dias reduz custos com combustível.');

  if (balance > 0)
    positive.push(`Saldo positivo de R$ ${balance.toFixed(2)} (${savRate.toFixed(0)}% da receita).`);
  if (inc.length > 1)
    positive.push(`${inc.length} fontes de receita — diversificação financeira é um ponto forte.`);
  if (topPct <= 45)
    positive.push('Gastos bem distribuídos entre categorias, sem concentração excessiva.');

  const expPct = totalInc > 0 ? ((totalExp / totalInc) * 100).toFixed(0) : '—';
  const summary = `Suas despesas de R$ ${totalExp.toFixed(2)} representam ${expPct}% da receita de R$ ${totalInc.toFixed(2)}. ` +
    (savRate >= 20
      ? `A taxa de poupança de ${savRate.toFixed(0)}% está dentro do recomendado.`
      : `A taxa de poupança de ${savRate.toFixed(0)}% está abaixo dos 20% recomendados.`) +
    (topLabel ? ` Maior gasto: ${topLabel}.` : '');

  return { score, score_label, summary, waste, alerts, tips, positive };
}

async function runAI() {
  const txs = txOfMonth();
  const exp = txs.filter(t => t.type === 'despesa');
  if (!exp.length) { toast('Adicione despesas para analisar.', 'err'); return; }

  setBtnLoading(true);

  if (Demo.active) {
    await new Promise(r => setTimeout(r, 900)); // simula latência
    renderAIResult(buildDemoAnalysis(txs));
    toast('Análise concluída!');
    setBtnLoading(false);
    return;
  }

  const catTotals = {};
  exp.forEach(t => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount; });
  const totalExp    = Object.values(catTotals).reduce((s, v) => s + v, 0);
  const totalIncome = txs.filter(t => t.type === 'receita').reduce((s, t) => s + t.amount, 0);

  const txLines  = exp.map(t => {
    const cat   = CATEGORIES[t.category]?.label || 'Outros';
    const notes = t.notes ? ` | Anotação: "${t.notes}"` : '';
    return `• ${fmtDate(t.date)} | ${cat} | R$ ${t.amount.toFixed(2)} | ${t.description}${notes}`;
  }).join('\n');

  const catLines = Object.entries(catTotals)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `  ${CATEGORIES[k]?.label}: R$ ${v.toFixed(2)} (${((v / totalExp) * 100).toFixed(1)}%)`)
    .join('\n');

  const prompt = `Você é um consultor financeiro pessoal. Analise os gastos de ${monthLabel(currentDate)}.

RESUMO:
- Receita: R$ ${totalIncome.toFixed(2)} | Despesa: R$ ${totalExp.toFixed(2)} | Saldo: R$ ${(totalIncome - totalExp).toFixed(2)}
- Total de transações: ${exp.length}

POR CATEGORIA:
${catLines}

TRANSAÇÕES (com anotações):
${txLines}

Responda APENAS com JSON válido, sem markdown:
{"score":<0-100>,"score_label":"<Crítico|Preocupante|Regular|Bom|Excelente>","summary":"<2-3 frases>","waste":["<...>"],"alerts":["<...>"],"tips":["<...>","<...>","<...>"],"positive":["<...>"]}`;

  try {
    const raw    = await GroqAPI.complete([{ role: 'user', content: prompt }], { maxTokens: 1600, temperature: 0.3 });
    const match  = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : raw);
    renderAIResult(parsed);
    toast('Análise concluída!');
  } catch (err) {
    document.getElementById('ai-result').innerHTML = `
      <div class="ai-section red">
        <div class="ai-section-title">❌ Erro</div>
        <p>${escHtml(err.message)}</p>
      </div>`;
    toast(err.message, 'err');
  } finally {
    setBtnLoading(false);
  }
}

// =============================================
//  AI — CHAT
// =============================================
function buildChatContext() {
  const txs      = txOfMonth();
  const exp      = txs.filter(t => t.type === 'despesa');
  const totalExp = exp.reduce((s, t) => s + t.amount, 0);
  const totalInc = txs.filter(t => t.type === 'receita').reduce((s, t) => s + t.amount, 0);

  const catTotals = {};
  exp.forEach(t => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount; });
  const catSummary = Object.entries(catTotals)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${CATEGORIES[k]?.label}: R$${v.toFixed(2)}`)
    .join(', ') || 'nenhum dado';

  return `Você é um assistente financeiro pessoal simpático, direto e prestativo. Responda sempre em português brasileiro de forma clara e objetiva.

CONTEXTO — ${monthLabel(currentDate)}:
- Receitas: R$${totalInc.toFixed(2)} | Despesas: R$${totalExp.toFixed(2)} | Saldo: R$${(totalInc - totalExp).toFixed(2)}
- Por categoria: ${catSummary}
- Total de transações: ${txs.length}`;
}

function demoChatReply(msg) {
  const m    = msg.toLowerCase();
  const txs  = txOfMonth();
  const exp  = txs.filter(t => t.type === 'despesa');
  const inc  = txs.filter(t => t.type === 'receita');
  const totE = exp.reduce((s, t) => s + t.amount, 0);
  const totI = inc.reduce((s, t) => s + t.amount, 0);
  const bal  = totI - totE;

  const catTotals = {};
  exp.forEach(t => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount; });
  const top = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0];
  const topLabel = top ? (CATEGORIES[top[0]]?.label || 'Outros') : '—';

  if (/saldo|sobr|restou|disponível/.test(m))
    return `Seu saldo em ${monthLabel(currentDate)} é **${fmt(bal)}**. Você recebeu **${fmt(totI)}** e gastou **${fmt(totE)}**.`;

  if (/maior gasto|mais car|mais gastou|top gasto/.test(m)) {
    const biggest = exp.sort((a, b) => b.amount - a.amount)[0];
    return biggest
      ? `Seu maior gasto foi **${biggest.description}** em ${fmtDate(biggest.date)}: **${fmt(biggest.amount)}** (${CATEGORIES[biggest.category]?.label || 'Outros'}).`
      : 'Nenhuma despesa registrada neste mês.';
  }

  if (/categoria|onde gast|mais gast/.test(m))
    return top
      ? `A categoria que mais pesou foi **${topLabel}**: **${fmt(top[1])}** (${((top[1] / totE) * 100).toFixed(0)}% das despesas).`
      : 'Nenhuma despesa registrada ainda.';

  if (/economiz|poupar|guardar|investir|dica/.test(m))
    return `Com um saldo de **${fmt(bal)}** você poderia poupar pelo menos **${fmt(bal * 0.5)}** este mês. Uma regra prática: 50% necessidades, 30% lazer e 20% poupança.`;

  if (/despesa|gasto|gastei|gastando/.test(m))
    return `Em ${monthLabel(currentDate)} suas despesas somam **${fmt(totE)}**, distribuídas em ${Object.keys(catTotals).length} categorias. ${topLabel ? `O maior peso é **${topLabel}**.` : ''}`;

  if (/receita|salário|renda|ganho|ganhei/.test(m))
    return `Suas receitas em ${monthLabel(currentDate)}: **${fmt(totI)}** em ${inc.length} entrada(s). ${inc.length > 1 ? 'Ter múltiplas fontes de renda é ótimo!' : 'Diversificar as fontes de renda pode aumentar sua segurança financeira.'}`;

  if (/oi|olá|ola|hey|tudo/.test(m))
    return `Olá! 👋 Sou o assistente financeiro do Atlas. Você está no **modo demo** — posso responder perguntas sobre seus dados deste mês. Tente perguntar sobre saldo, categorias ou dicas de economia!`;

  return `No modo demo respondo com base nos dados carregados. Tente perguntar: *"Qual meu saldo?"*, *"Onde mais gastei?"*, *"Como economizar?"* ou *"Maior gasto do mês"*.`;
}

async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const msg   = input.value.trim();
  if (!msg) return;

  input.value = '';
  appendChatMsg('user', msg);
  chatHistory.push({ role: 'user', content: msg });
  if (chatHistory.length > 10) chatHistory = chatHistory.slice(-10);

  showTyping();

  if (Demo.active) {
    await new Promise(r => setTimeout(r, 600));
    removeTyping();
    const reply = demoChatReply(msg);
    chatHistory.push({ role: 'assistant', content: reply });
    appendChatMsg('assistant', reply);
    return;
  }

  try {
    const reply = await GroqAPI.complete(
      [{ role: 'system', content: buildChatContext() }, ...chatHistory],
      { maxTokens: 600, temperature: 0.7 }
    );
    removeTyping();
    chatHistory.push({ role: 'assistant', content: reply });
    appendChatMsg('assistant', reply);
  } catch (err) {
    removeTyping();
    appendChatMsg('error', err.message);
    chatHistory.pop();
  }
}

function appendChatMsg(role, content) {
  const container = document.getElementById('chat-messages');
  const wrapper   = document.createElement('div');
  wrapper.className = `chat-msg chat-msg-${role}`;

  const bubble = document.createElement('div');
  if (role === 'user') {
    bubble.className   = 'chat-bubble user-bubble';
    bubble.textContent = content;
  } else if (role === 'assistant') {
    bubble.className = 'chat-bubble ai-bubble';
    bubble.innerHTML = formatChatText(content);
  } else {
    bubble.className   = 'chat-bubble error-bubble';
    bubble.textContent = '❌ ' + content;
  }

  wrapper.appendChild(bubble);
  container.appendChild(wrapper);
  container.scrollTop = container.scrollHeight;
}

function formatChatText(text) {
  return escHtml(text)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g,     '<em>$1</em>')
    .replace(/`(.*?)`/g,       '<code>$1</code>')
    .replace(/\n/g,            '<br>');
}

function showTyping() {
  const container = document.getElementById('chat-messages');
  const el = document.createElement('div');
  el.className = 'chat-msg chat-msg-assistant';
  el.id = 'chat-typing';
  el.innerHTML = `<div class="chat-typing">
    <div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>
  </div>`;
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
  document.getElementById('btn-send').disabled = true;
}

function removeTyping() {
  document.getElementById('chat-typing')?.remove();
  document.getElementById('btn-send').disabled = false;
}

function clearChat() {
  chatHistory = [];
  document.getElementById('chat-messages').innerHTML = `
    <div class="chat-welcome">
      <div class="chat-welcome-icon">🤖</div>
      <p>Conversa reiniciada. Como posso te ajudar?</p>
    </div>`;
}

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

// =============================================
//  TRANSACTIONS — ADD / DELETE
// =============================================
async function handleFormSubmit(e) {
  e.preventDefault();

  const amount = parseFloat(document.getElementById('input-amount').value);
  let   desc   = document.getElementById('input-description').value.trim();
  const notes  = document.getElementById('input-notes').value.trim();
  const date   = document.getElementById('input-date').value;

  const hasInvoiceItems = selectedPayment === 'credito' && invoiceItems.length > 0;
  if ((!amount || amount <= 0) && !hasInvoiceItems) return;
  if (!hasInvoiceItems && !desc) return;
  if (!date) return;

  const catErr = document.getElementById('cat-error');
  if (selectedType === 'despesa' && !selectedCat && !hasInvoiceItems) {
    catErr.classList.remove('hidden'); return;
  }
  catErr.classList.add('hidden');

  if (hasInvoiceItems) {
    if (!selectedCat) selectedCat = 'compras';
    if (!desc) {
      const names = invoiceItems.slice(0, 3).map(it => it.desc).join(', ');
      desc = invoiceItems.length > 3 ? `${names}…` : names;
    }
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
    paymentMethod: selectedPayment || null,
    invoiceItems:  selectedPayment === 'credito' && invoiceItems.length > 0 ? [...invoiceItems] : null,
  };

  closeModal('modal-transaction');
  e.target.reset();
  selectedCat     = '';
  selectedPayment = '';
  selectedFixed   = false;
  invoiceItems    = [];
  const fixedBtn = document.getElementById('btn-fixed');
  if (fixedBtn) { fixedBtn.setAttribute('aria-pressed', 'false'); }
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('selected'));
  document.querySelectorAll('.payment-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('invoice-group').classList.add('hidden');
  document.getElementById('invoice-items-list').innerHTML = '';
  document.getElementById('invoice-total').classList.add('hidden');
  document.getElementById('amount-group').style.display   = '';
  document.getElementById('category-group').style.display = '';
  document.getElementById('desc-group').style.display     = '';
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
    renderAll();
    toast('Transação adicionada!');

    CloudDB.add(tx)
      .then(() => setCloudStatus('connected', `${transactions.length} transações sincronizadas`))
      .catch(err => toast('Nuvem: ' + err.message, 'err'));
  } catch (err) {
    toast('Erro ao salvar transação.', 'err');
  }
}

async function deleteTx(id) {
  if (Demo.active) {
    transactions = transactions.filter(t => t.id !== id);
    resetAIResult();
    renderAll();
    toast('Transação removida. (modo demo — não salva)');
    return;
  }
  try {
    await DB.remove(id);
    transactions = transactions.filter(t => t.id !== id);
    resetAIResult();
    renderAll();
    toast('Transação removida.');

    CloudDB.remove(id)
      .then(() => setCloudStatus('connected', `${transactions.length} transações sincronizadas`))
      .catch(err => toast('Nuvem: ' + err.message, 'err'));
  } catch (err) {
    toast('Erro ao remover transação.', 'err');
  }
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

  const tx = transactions.find(t => t.id === id);
  const fixedBtn = document.getElementById('btn-menu-fixed');
  if (fixedBtn) fixedBtn.textContent = tx?.fixed ? '⏹️ Parar de repetir' : '🔄 Repetir todo mês';
  const addFaturaBtn = document.getElementById('btn-menu-add-fatura');
  if (addFaturaBtn) addFaturaBtn.classList.toggle('hidden', tx?.paymentMethod !== 'credito');

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

function hideTxMenu() {
  document.getElementById('tx-context-menu').classList.add('hidden');
}

function openRenameModal() {
  if (!activeTxId) return;
  const tx = transactions.find(t => t.id === activeTxId);
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
  const tx = transactions.find(t => t.id === txId);
  if (!tx) return;
  tx.description = newDesc;
  closeModal('modal-rename-tx');

  if (Demo.active) { renderAll(); toast('Descrição atualizada. (modo demo — não salva)'); return; }
  try {
    await DB.put(tx);
    renderAll();
    toast('Descrição atualizada.');
    CloudDB.update(tx)
      .then(() => setCloudStatus('connected', `${transactions.length} transações sincronizadas`))
      .catch(err => toast('Nuvem: ' + err.message, 'err'));
  } catch (err) { toast('Erro ao atualizar transação.', 'err'); }
}

function openEditAmountModal() {
  if (!activeTxId) return;
  const tx = transactions.find(t => t.id === activeTxId);
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
  const tx = transactions.find(t => t.id === txId);
  if (!tx) return;
  tx.amount = newAmount;
  closeModal('modal-edit-amount');

  if (Demo.active) { renderAll(); toast('Valor atualizado. (modo demo — não salva)'); return; }
  try {
    await DB.put(tx);
    renderAll();
    toast('Valor atualizado.');
    CloudDB.update(tx)
      .then(() => setCloudStatus('connected', `${transactions.length} transações sincronizadas`))
      .catch(err => toast('Nuvem: ' + err.message, 'err'));
  } catch (err) { toast('Erro ao atualizar transação.', 'err'); }
}

function openChangeCatModal() {
  if (!activeTxId) return;
  const tx = transactions.find(t => t.id === activeTxId);
  if (!tx) return;
  const modal = document.getElementById('modal-change-cat');
  modal.dataset.txId = activeTxId;
  hideTxMenu();
  activeTxId      = null;
  activeChangeCat = tx.category;

  const grid = document.getElementById('change-cat-grid');
  grid.innerHTML = Object.entries(CATEGORIES).map(([key, cat]) => `
    <button type="button" class="cat-btn${tx.category === key ? ' selected' : ''}" data-cat="${key}">
      <span class="cat-icon">${cat.icon}</span>
      <span>${cat.label}</span>
    </button>`).join('');

  grid.onclick = e => {
    const btn = e.target.closest('.cat-btn');
    if (!btn) return;
    grid.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    activeChangeCat = btn.dataset.cat;
  };

  openModal('modal-change-cat');
}

async function saveChangeCat() {
  const txId = document.getElementById('modal-change-cat').dataset.txId;
  if (!txId || !activeChangeCat) return;
  const tx = transactions.find(t => t.id === txId);
  if (!tx) return;
  tx.category     = activeChangeCat;
  activeChangeCat = null;
  closeModal('modal-change-cat');

  if (Demo.active) { renderAll(); toast('Categoria atualizada. (modo demo — não salva)'); return; }
  try {
    await DB.put(tx);
    renderAll();
    toast('Categoria atualizada.');
    CloudDB.update(tx)
      .then(() => setCloudStatus('connected', `${transactions.length} transações sincronizadas`))
      .catch(err => toast('Nuvem: ' + err.message, 'err'));
  } catch (err) { toast('Erro ao atualizar transação.', 'err'); }
}

async function toggleFixedTx() {
  if (!activeTxId) return;
  const tx = transactions.find(t => t.id === activeTxId);
  if (!tx) return;
  tx.fixed = !tx.fixed;
  closeTxMenu();

  if (Demo.active) { renderAll(); toast(tx.fixed ? 'Marcado como fixo. (modo demo)' : 'Removido recorrência. (modo demo)'); return; }
  try {
    await DB.put(tx);
    renderAll();
    toast(tx.fixed ? '🔄 Transação marcada como fixa.' : 'Recorrência removida.');
    CloudDB.update(tx)
      .then(() => setCloudStatus('connected', `${transactions.length} transações sincronizadas`))
      .catch(err => toast('Nuvem: ' + err.message, 'err'));
  } catch (err) { toast('Erro ao atualizar transação.', 'err'); }
}

let faturaEditItems = [];

function openAddToFaturaModal() {
  if (!activeTxId) return;
  const tx = transactions.find(t => t.id === activeTxId);
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
  const list  = document.getElementById('fatura-edit-list');
  const total = faturaEditItems.reduce((s, it) => s + it.value, 0);

  list.innerHTML = faturaEditItems.map((it, i) => `
    <div class="invoice-item" data-index="${i}">
      <span class="invoice-item-desc">${escHtml(it.desc)}</span>
      <span class="invoice-item-value">${fmt(it.value)}</span>
      <button type="button" class="invoice-item-remove" data-fatura-index="${i}">✕</button>
    </div>`).join('') || '<p style="font-size:.8rem;color:var(--text-3);text-align:center;padding:8px 0">Nenhum item ainda</p>';

  document.getElementById('fatura-edit-total-value').textContent = fmt(total);
}

async function saveAddToFatura() {
  const txId = document.getElementById('modal-add-fatura').dataset.txId;
  if (!txId || faturaEditItems.length === 0) { toast('Adicione pelo menos um item.', 'err'); return; }
  const tx = transactions.find(t => t.id === txId);
  if (!tx) return;

  tx.invoiceItems = [...faturaEditItems];
  tx.amount       = faturaEditItems.reduce((s, it) => s + it.value, 0);
  tx.description  = (() => {
    const names = faturaEditItems.slice(0, 3).map(it => it.desc).join(', ');
    return faturaEditItems.length > 3 ? `${names}…` : names;
  })();
  closeModal('modal-add-fatura');

  if (Demo.active) { renderAll(); toast('Fatura atualizada. (modo demo — não salva)'); return; }
  try {
    await DB.put(tx);
    renderAll();
    toast('Fatura atualizada!');
    CloudDB.update(tx)
      .then(() => setCloudStatus('connected', `${transactions.length} transações sincronizadas`))
      .catch(err => toast('Nuvem: ' + err.message, 'err'));
  } catch (err) { toast('Erro ao atualizar fatura.', 'err'); }
}

function txMenuDelete() {
  const id = activeTxId;
  closeTxMenu();
  deleteTx(id);
}

// =============================================
//  UI BUILDERS
// =============================================
function buildCategoryGrid() {
  const grid = document.getElementById('category-grid');
  grid.innerHTML = Object.entries(CATEGORIES).map(([key, cat]) => `
    <button type="button" class="cat-btn" data-cat="${key}">
      <span class="cat-icon">${cat.icon}</span>
      <span>${cat.label}</span>
    </button>`).join('');

  grid.addEventListener('click', e => {
    const btn = e.target.closest('.cat-btn');
    if (!btn) return;
    grid.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedCat = btn.dataset.cat;
    document.getElementById('cat-error').classList.add('hidden');
  });
}

function renderInvoiceItems() {
  const list  = document.getElementById('invoice-items-list');
  const total = invoiceItems.reduce((s, it) => s + it.value, 0);

  list.innerHTML = invoiceItems.map((it, i) => `
    <div class="invoice-item" data-index="${i}">
      <span class="invoice-item-desc">${it.desc}</span>
      <span class="invoice-item-value">${fmt(it.value)}</span>
      <button type="button" class="invoice-item-remove" data-index="${i}">✕</button>
    </div>`).join('');

  const totalEl = document.getElementById('invoice-total');
  if (invoiceItems.length > 0) {
    totalEl.classList.remove('hidden');
    document.getElementById('invoice-total-value').textContent = fmt(total);
    document.getElementById('input-amount').value = total.toFixed(2);
  } else {
    totalEl.classList.add('hidden');
    document.getElementById('input-amount').value = '';
  }
}

function buildCategoryFilter() {
  const sel = document.getElementById('filter-category');
  Object.entries(CATEGORIES).forEach(([key, cat]) => {
    sel.insertAdjacentHTML('beforeend',
      `<option value="${key}">${cat.icon} ${cat.label}</option>`);
  });
}

function setTodayDate() {
  document.getElementById('input-date').value = todayLocal();
}

// =============================================
//  MODAL
// =============================================
function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
  document.body.style.overflow = '';
}

// =============================================
//  TAB SWITCHING
// =============================================
function switchTab(tabName) {
  document.querySelectorAll('.nav-tab, .mobile-nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  document.querySelectorAll('.tab-content').forEach(s => {
    s.classList.toggle('active', s.id === `tab-${tabName}`);
  });
  if (tabName === 'analysis')  setTimeout(() => drawBars(txOfMonth()), 40);
  if (tabName === 'dashboard') setTimeout(() => { drawLine(txOfMonth()); drawDonut(txOfMonth()); }, 40);
}

// =============================================
//  AUTH SCREEN
// =============================================
function showAuthScreen() {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('auth-email').value    = '';
  document.getElementById('auth-password').value = '';
  document.getElementById('auth-confirm').value  = '';
  clearAuthFeedback();
  bindAuthEvents();
}

function hideAuthScreen() {
  document.getElementById('auth-screen').classList.add('hidden');
}

function bindAuthEvents() {
  document.getElementById('tab-signin').addEventListener('click', () => setAuthMode('signin'));
  document.getElementById('tab-signup').addEventListener('click', () => setAuthMode('signup'));

  document.getElementById('btn-demo').addEventListener('click', () => {
    Demo.enter();
    startApp();
  });

  document.getElementById('auth-form').addEventListener('submit', async e => {
    e.preventDefault();
    const email    = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const confirm  = document.getElementById('auth-confirm').value;
    const isSignup = document.getElementById('tab-signup').classList.contains('active');

    clearAuthFeedback();

    if (!email || !password) { showAuthError('Preencha email e senha.'); return; }
    if (isSignup && password.length < 6) { showAuthError('A senha deve ter pelo menos 6 caracteres.'); return; }
    if (isSignup && password !== confirm) { showAuthError('As senhas não coincidem.'); return; }

    setAuthLoading(true);
    try {
      if (isSignup) {
        const result = await Auth.signUp(email, password);
        if (result.confirmEmail) {
          showAuthSuccess('Cadastro realizado! Verifique seu email para confirmar, depois faça login.');
          setAuthMode('signin');
          return;
        }
      } else {
        await Auth.signIn(email, password);
      }
      await startApp();
    } catch (err) {
      showAuthError(authErrorMsg(err.message));
    } finally {
      setAuthLoading(false);
    }
  });
}

function setAuthMode(mode) {
  const isSignup = mode === 'signup';
  document.getElementById('tab-signin').classList.toggle('active', !isSignup);
  document.getElementById('tab-signup').classList.toggle('active', isSignup);
  document.getElementById('auth-confirm-group').classList.toggle('hidden', !isSignup);
  document.getElementById('auth-submit-text').textContent = isSignup ? 'Cadastrar' : 'Entrar';
  document.getElementById('btn-demo').classList.toggle('hidden', isSignup);
  document.querySelector('.auth-demo-divider').classList.toggle('hidden', isSignup);
  clearAuthFeedback();
}

function authErrorMsg(raw) {
  const m = (raw || '').toLowerCase();
  if (m.includes('invalid login credentials') || m.includes('invalid_grant'))
    return 'Email ou senha incorretos.';
  if (m.includes('email not confirmed'))
    return 'Email não confirmado. Verifique sua caixa de entrada.';
  if (m.includes('user already registered') || m.includes('user_already_exists'))
    return 'Este email já está cadastrado. Tente fazer login.';
  if (m.includes('password should be at least') || m.includes('weak_password'))
    return 'Senha muito fraca. Use pelo menos 6 caracteres.';
  if (m.includes('unable to validate email') || m.includes('invalid format') || m.includes('email_address_invalid'))
    return 'Formato de email inválido.';
  if (m.includes('over_email_send_rate_limit') || m.includes('rate limit'))
    return 'Muitas tentativas. Aguarde um momento e tente novamente.';
  if (m.includes('signup_disabled'))
    return 'Cadastro desabilitado. Entre em contato com o suporte.';
  if (m.includes('network') || m.includes('fetch'))
    return 'Erro de conexão. Verifique sua internet.';
  return raw;
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg; el.classList.remove('hidden');
}

function showAuthSuccess(msg) {
  const el = document.getElementById('auth-success');
  el.textContent = msg; el.classList.remove('hidden');
}

function clearAuthFeedback() {
  document.getElementById('auth-error').classList.add('hidden');
  document.getElementById('auth-success').classList.add('hidden');
}

function setAuthLoading(on) {
  const btn    = document.getElementById('auth-submit');
  const text   = document.getElementById('auth-submit-text');
  const loader = document.getElementById('auth-submit-loader');
  btn.disabled = on;
  text.classList.toggle('hidden', on);
  loader.classList.toggle('hidden', !on);
}

// =============================================
//  EVENT BINDING
function updateNotesFieldForType(type) {
  const label = document.querySelector('label[for="input-notes"] .optional');
  const textarea = document.getElementById('input-notes');
  if (type === 'receita') {
    if (label) label.textContent = '(de onde veio?)';
    textarea.placeholder = 'Ex: Salário, hora extra, freelance, rendimento de investimento...';
  } else {
    if (label) label.textContent = '(por que gastou isso?)';
    textarea.placeholder = 'Ex: Comemoração de aniversário, compra por impulso, mensalidade obrigatória...';
  }
}

// =============================================
function bindEvents() {
  // FAB — nova transação
  document.getElementById('btn-add').addEventListener('click', () => {
    setTodayDate();
    selectedCat     = '';
    selectedType    = 'despesa';
    selectedPayment = '';
    selectedFixed   = false;
    invoiceItems    = [];
    document.querySelectorAll('.type-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.type === 'despesa');
    });
    document.getElementById('category-group').style.display = '';
    document.getElementById('payment-group').style.display  = '';
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('selected'));
    document.querySelectorAll('.payment-btn').forEach(b => b.classList.remove('selected'));
    document.getElementById('cat-error').classList.add('hidden');
    document.getElementById('invoice-group').classList.add('hidden');
    document.getElementById('invoice-items-list').innerHTML = '';
    document.getElementById('invoice-total').classList.add('hidden');
    document.getElementById('amount-group').style.display   = '';
    document.getElementById('category-group').style.display = '';
    document.getElementById('desc-group').style.display     = '';
    document.getElementById('btn-fixed').setAttribute('aria-pressed', 'false');
    document.getElementById('transaction-form').reset();
    updateNotesFieldForType('despesa');
    openModal('modal-transaction');
  });

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

  // Formulário de transação
  document.getElementById('transaction-form').addEventListener('submit', handleFormSubmit);

  // Tipo de transação
  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedType = btn.dataset.type;
      const isDespesa = selectedType === 'despesa';
      document.getElementById('category-group').style.display = isDespesa ? '' : 'none';
      document.getElementById('payment-group').style.display  = isDespesa ? '' : 'none';
      if (!isDespesa) {
        document.getElementById('invoice-group').classList.add('hidden');
        invoiceItems    = [];
        selectedPayment = '';
        document.querySelectorAll('.payment-btn').forEach(b => b.classList.remove('selected'));
        document.getElementById('invoice-items-list').innerHTML = '';
        document.getElementById('invoice-total').classList.add('hidden');
      }
      document.getElementById('amount-group').style.display   = '';
      document.getElementById('category-group').style.display = isDespesa ? '' : 'none';
      document.getElementById('desc-group').style.display     = '';
      updateNotesFieldForType(selectedType);
    });
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
    document.getElementById('amount-group').style.display   = isCredito ? 'none' : '';
    document.getElementById('category-group').style.display = isCredito ? 'none' : '';
    document.getElementById('desc-group').style.display     = isCredito ? 'none' : '';
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
    const value   = parseFloat(valueEl.value);
    if (!desc || !value || value <= 0) return;
    invoiceItems.push({ desc, value });
    descEl.value  = '';
    valueEl.value = '';
    descEl.focus();
    renderInvoiceItems();
  });

  // Pressionar Enter no campo de descrição de item move foco para valor
  document.getElementById('invoice-item-desc').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('invoice-item-value').focus(); }
  });

  // Pressionar Enter no campo de valor adiciona o item
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

  // Modal editar fatura — adicionar item
  document.getElementById('btn-fatura-edit-add').addEventListener('click', () => {
    const descEl  = document.getElementById('fatura-edit-desc');
    const valueEl = document.getElementById('fatura-edit-value');
    const desc    = descEl.value.trim();
    const value   = parseFloat(valueEl.value);
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

  // Modal editar fatura — remover item (delegado)
  document.getElementById('fatura-edit-list').addEventListener('click', e => {
    const btn = e.target.closest('.invoice-item-remove');
    if (!btn) return;
    faturaEditItems.splice(parseInt(btn.dataset.faturaIndex), 1);
    renderFaturaEditItems();
  });

  // Navegação de mês
  document.getElementById('prev-month').addEventListener('click', () => {
    currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    renderMonthLabel(); renderAll(); resetAIResult();
  });
  document.getElementById('next-month').addEventListener('click', () => {
    currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    renderMonthLabel(); renderAll(); resetAIResult();
  });

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

  // Filtros
  document.getElementById('filter-category').addEventListener('change', renderAllTxs);
  document.getElementById('filter-type').addEventListener('change', renderAllTxs);

  // Abrir configurações
  document.getElementById('btn-settings').addEventListener('click', () => {
    const userBar = document.getElementById('auth-user-bar');
    const authDiv = document.getElementById('auth-divider');
    document.getElementById('auth-user-email').textContent = Demo.active ? 'Modo Demo' : Auth.email;
    userBar.classList.remove('hidden');
    authDiv.classList.remove('hidden');
    openModal('modal-settings');
  });

  // Logout
  document.getElementById('btn-logout').addEventListener('click', async () => {
    if (!Demo.active) await Auth.signOut();
    else Demo.exit();
    window.location.reload();
  });

  // Tema
  document.getElementById('theme-btn-dark').addEventListener('click',  () => { applyTheme('dark');  renderAll(); });
  document.getElementById('theme-btn-light').addEventListener('click', () => { applyTheme('light'); renderAll(); });

  // Análise IA
  document.getElementById('btn-analyze').addEventListener('click', runAI);

  // Exportar
  document.getElementById('btn-export-excel').addEventListener('click', () => { closeModal('modal-settings'); exportExcel(); });
  document.getElementById('btn-export-pdf').addEventListener('click',   () => { closeModal('modal-settings'); exportPDF(); });

  // Chat
  document.getElementById('btn-chat').addEventListener('click', () => {
    document.getElementById('chat-panel').classList.toggle('hidden');
  });
  document.getElementById('btn-chat-close').addEventListener('click', () => {
    document.getElementById('chat-panel').classList.add('hidden');
  });
  document.getElementById('btn-chat-clear').addEventListener('click', clearChat);
  document.getElementById('btn-send').addEventListener('click', sendChatMessage);
  document.getElementById('chat-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
  });

  // Redimensionar — redesenhar gráficos
  window.addEventListener('resize', () => {
    const active = document.querySelector('.tab-content.active');
    if (!active) return;
    const txs = txOfMonth();
    if (active.id === 'tab-dashboard') drawLine(txs);
    if (active.id === 'tab-analysis')  drawBars(txs);
  });
}

// =============================================
//  INIT
// =============================================

// Quando o usuário confirma o email, o Supabase redireciona com o token na URL.
// Enviamos o token ao backend para que ele defina o cookie httpOnly e
// limpamos o hash imediatamente — o token nunca fica exposto no JS.
async function handleAuthRedirect() {
  const hash = window.location.hash.slice(1);
  if (!hash) return false;

  const params      = new URLSearchParams(hash);
  const accessToken = params.get('access_token');
  if (!accessToken) return false;

  history.replaceState(null, '', window.location.pathname);

  try {
    await API.req('POST', '/api/auth/confirm', { access_token: accessToken });
    return true;
  } catch {
    return false;
  }
}

async function init() {
  initTheme();
  bindEvents();

  if (Demo.active) { await startApp(); return; }

  const redirected = await handleAuthRedirect();
  const loggedIn   = redirected || await Auth.check();

  if (!loggedIn) { showAuthScreen(); return; }
  await startApp();
}

function showDemoBanner() {
  document.getElementById('demo-banner').classList.remove('hidden');
  document.body.classList.add('demo-mode');

  document.getElementById('btn-demo-signup').addEventListener('click', () => {
    exitDemoMode();
    showAuthScreen();
    setAuthMode('signup');
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

  hideAuthScreen();
  renderMonthLabel();
  buildCategoryGrid();
  buildCategoryFilter();
  setTodayDate();

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

    const legacy = JSON.parse(localStorage.getItem('financeai_txs') || '[]');
    if (legacy.length) {
      for (const tx of legacy) await DB.put(tx);
      localStorage.removeItem('financeai_txs');
      toast(`${legacy.length} transações migradas.`);
    }

    transactions = await DB.getAll();
    setDbStatus('connected');
  } catch (err) {
    console.error('IndexedDB error:', err);
    setDbStatus('error');
    toast('Erro ao abrir banco de dados local.', 'err');
  }

  renderAll();
  syncFromCloud();
}

init();
