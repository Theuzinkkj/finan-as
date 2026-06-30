'use strict';

// =============================================
//  AI — ANALYSIS
// =============================================
let _aiAnalysisDone = false;

function setBtnLoading(on) {
  const btn  = document.getElementById('btn-analyze');
  const text = document.getElementById('analyze-text');
  const spin = document.getElementById('analyze-loader');
  if (!btn) return;
  btn.disabled = on;
  text.classList.toggle('hidden', on);
  spin.classList.toggle('hidden', !on);
}

function showAISkeleton() {
  const el = document.getElementById('ai-result');
  if (!el) return;
  el.innerHTML = `
    <div class="ai-skeleton">
      <div class="ai-skeleton-score">
        <div class="ai-skel-circle"></div>
        <div class="ai-skel-lines">
          <div class="ai-skel-line"></div>
          <div class="ai-skel-line short"></div>
        </div>
      </div>
      <div class="ai-skel-section"></div>
      <div class="ai-skel-section"></div>
      <div class="ai-skeleton-label">
        <div class="ai-thinking-dots">
          <span></span><span></span><span></span>
        </div>
        Analisando seus dados financeiros…
      </div>
    </div>`;
}

function autoRunAIOnce() {
  if (_aiAnalysisDone) return;
  const txs = txOfMonth();
  if (!txs.filter(t => t.type === 'despesa').length) return;
  _aiAnalysisDone = true;
  showAISkeleton();
  setBtnLoading(true);
  setTimeout(() => runAI(), 600);
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
    ${a.waste?.length    ? `<div class="ai-section red">   <div class="ai-section-title"><i class="bi bi-exclamation-triangle-fill"></i> Gastos Potencialmente Desnecessários</div>${ul(a.waste)}</div>`    : ''}
    ${a.alerts?.length   ? `<div class="ai-section yellow"><div class="ai-section-title"><i class="bi bi-bell-fill"></i> Alertas</div>${ul(a.alerts)}</div>`   : ''}
    ${a.tips?.length     ? `<div class="ai-section purple"><div class="ai-section-title"><i class="bi bi-lightbulb-fill"></i> Dicas Para Economizar</div>${ul(a.tips)}</div>`     : ''}
    ${a.positive?.length ? `<div class="ai-section green"> <div class="ai-section-title"><i class="bi bi-check-circle-fill"></i> Pontos Positivos</div>${ul(a.positive)}</div>` : ''}`;
}

function resetAIResult() {
  _aiAnalysisDone = false;
  const el = document.getElementById('ai-result');
  if (!el) return;
  el.innerHTML = `
    <div class="ai-placeholder">
      <span class="ai-placeholder-icon"><i class="bi bi-robot"></i></span>
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

  const waste = [], alerts = [], tips = [], positive = [];

  if (subs.length > 1)
    waste.push(`${subs.length} assinaturas de streaming somando R$ ${subs.reduce((s, t) => s + t.amount, 0).toFixed(2)} — avalie se usa todas.`);
  if (catTotals['lazer'] && (catTotals['lazer'] / totalExp) > 0.15)
    waste.push('Lazer acima de 15% das despesas — considere revisar.');

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

  const expPct  = totalInc > 0 ? ((totalExp / totalInc) * 100).toFixed(0) : '—';
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
  if (!exp.length) {
    setBtnLoading(false);
    toast('Adicione despesas para analisar.', 'err');
    return;
  }

  _aiAnalysisDone = true;
  setBtnLoading(true);
  const resultEl = document.getElementById('ai-result');
  if (resultEl && !resultEl.querySelector('.ai-skeleton')) showAISkeleton();

  if (Demo.active) {
    await new Promise(r => setTimeout(r, 900));
    renderAIResult(buildDemoAnalysis(txs));
    toast('Análise concluída!');
    setBtnLoading(false);
    return;
  }

  const catTotals = {};
  exp.forEach(t => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount; });
  const totalExp    = Object.values(catTotals).reduce((s, v) => s + v, 0);
  const totalIncome = txs.filter(t => t.type === 'receita').reduce((s, t) => s + t.amount, 0);

  const txLines = exp.map(t => {
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
        <div class="ai-section-title"><i class="bi bi-x-circle-fill"></i> Erro</div>
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
  const today    = todayLocal();
  const openingBalance = typeof getOpeningBalance === 'function' ? getOpeningBalance() : 0;
  const exp      = txs.filter(t => t.type === 'despesa');
  const inc      = txs.filter(t => t.type === 'receita');
  const totalExp = exp.reduce((s, t) => s + t.amount, 0);
  const paidExp  = exp.filter(t => t.paid).reduce((s, t) => s + t.amount, 0);
  const pendingExp = totalExp - paidExp;
  const totalInc = inc.reduce((s, t) => s + t.amount, 0);
  const receivedInc = inc.filter(t => t.date <= today).reduce((s, t) => s + t.amount, 0);
  const pendingInc = totalInc - receivedInc;
  const availableBalance = openingBalance + receivedInc - paidExp;

  const catTotals = {};
  exp.forEach(t => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount; });
  const catSummary = Object.entries(catTotals)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${CATEGORIES[k]?.label}: R$${v.toFixed(2)}`)
    .join(', ') || 'nenhum dado';

  const txLines = txs
    .sort((a, b) => b.amount - a.amount)
    .map(t => {
      const cat  = CATEGORIES[t.category]?.label || 'Outros';
      const bt   = t.type === 'beneficio' && t.benefitType ? BENEFIT_TYPES[t.benefitType] : null;
      const tipo = t.type === 'receita' ? 'Receita' : t.type === 'beneficio' ? `Benefício (${bt ? bt.label : 'VR/VT'})` : 'Despesa';
      return `• ${fmtDate(t.date)} | ${tipo} | ${cat} | R$${t.amount.toFixed(2)} | ${t.description}`;
    })
    .join('\n') || 'Nenhuma transação neste mês.';

  return `Você é um assistente financeiro pessoal simpático, direto e prestativo. Responda sempre em português brasileiro de forma clara e objetiva.

CONTEXTO — ${monthLabel(currentDate)}:
- Saldo livre inicial: R$${openingBalance.toFixed(2)} | Receitas recebidas: R$${receivedInc.toFixed(2)} | Receitas a receber: R$${pendingInc.toFixed(2)} | Despesas pagas: R$${paidExp.toFixed(2)} | Despesas pendentes: R$${pendingExp.toFixed(2)} | Saldo disponivel: R$${availableBalance.toFixed(2)} | Receitas totais: R$${totalInc.toFixed(2)} | Despesas totais: R$${totalExp.toFixed(2)}
- Por categoria: ${catSummary}

TRANSAÇÕES DO MÊS (ordenadas por valor):
${txLines}

REGRA IMPORTANTE: Quando o usuário mencionar um nome (ex: "cartão", "mercado", "netflix"), busque esse termo na coluna DESCRIÇÃO das transações, não na categoria. Some os valores de todas as transações cuja descrição contenha o termo mencionado. Se perguntar sobre o que está dentro da fatura do cartão, verifique os gastos de dentro da categoria cartão e veja os gastos.`;
}

function demoChatReply(msg) {
  const m    = msg.toLowerCase();
  const txs  = txOfMonth();
  const today = todayLocal();
  const openingBalance = typeof getOpeningBalance === 'function' ? getOpeningBalance() : 0;
  const exp  = txs.filter(t => t.type === 'despesa');
  const inc  = txs.filter(t => t.type === 'receita');
  const totE = exp.reduce((s, t) => s + t.amount, 0);
  const paidE = exp.filter(t => t.paid).reduce((s, t) => s + t.amount, 0);
  const pendingE = totE - paidE;
  const totI = inc.reduce((s, t) => s + t.amount, 0);
  const receivedI = inc.filter(t => t.date <= today).reduce((s, t) => s + t.amount, 0);
  const pendingI = totI - receivedI;
  const bal  = openingBalance + receivedI - paidE;

  const catTotals = {};
  exp.forEach(t => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount; });
  const top      = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0];
  const topLabel = top ? (CATEGORIES[top[0]]?.label || 'Outros') : '—';

  if (/saldo|sobr|restou|disponível/.test(m))
    return `Seu saldo disponível em ${monthLabel(currentDate)} é **${fmt(bal)}**. Ele considera **${fmt(openingBalance)}** de saldo livre inicial, **${fmt(receivedI)}** recebidos, **${fmt(pendingI)}** a receber, **${fmt(paidE)}** já pagos e **${fmt(pendingE)}** pendentes.`;

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
    return `Olá! Sou o assistente financeiro do Atlas. Você está no **modo demo** — posso responder perguntas sobre seus dados deste mês. Tente perguntar sobre saldo, categorias ou dicas de economia!`;

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
    bubble.textContent = 'Erro: ' + content;
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
      <div class="chat-welcome-icon"><i class="bi bi-robot"></i></div>
      <p>Conversa reiniciada. Como posso te ajudar?</p>
    </div>`;
}
