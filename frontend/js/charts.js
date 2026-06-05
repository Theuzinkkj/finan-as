'use strict';

// =============================================
//  THEME HELPERS FOR CANVAS
// =============================================
function chartBg() {
  return document.documentElement.dataset.theme === 'light' ? '#ffffff' : '#080812';
}

function chartFg(alpha) {
  if (alpha === undefined) {
    return document.documentElement.dataset.theme === 'light' ? '#1e1b4b' : '#f1f5f9';
  }
  return document.documentElement.dataset.theme === 'light'
    ? `rgba(30,27,75,${alpha})`
    : `rgba(255,255,255,${alpha})`;
}

// =============================================
//  CANVAS UTILITY
// =============================================
function rrect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// =============================================
//  DONUT CHART
// =============================================
let _donutSlices  = [];
let _donutTotal   = 0;
let _donutGeo     = { cx: 0, cy: 0, OR: 0, IR: 0 };
let _donutTooltip = null;
let _donutHovered = -1;
let _donutCtx     = null;

function getOrCreateDonutTooltip() {
  if (_donutTooltip) return _donutTooltip;
  const el = document.createElement('div');
  el.id = 'donut-tooltip';
  el.style.cssText = [
    'position:fixed', 'z-index:9999',
    'background:var(--bg-card)', 'border:1px solid var(--border-h)',
    'border-radius:12px', 'padding:12px 14px',
    'box-shadow:0 8px 32px rgba(0,0,0,.45)',
    'min-width:160px',
    'pointer-events:none', 'display:none',
    'backdrop-filter:blur(12px)',
  ].join(';');
  document.body.appendChild(el);
  _donutTooltip = el;
  return el;
}

function showDonutTooltip(slice, clientX, clientY) {
  const el  = getOrCreateDonutTooltip();
  const fmt = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
      <span style="width:10px;height:10px;border-radius:50%;background:${slice.cat.color};flex-shrink:0;display:inline-block"></span>
      <span style="font-size:13px;font-weight:600;color:var(--text-1)">${slice.cat.icon} ${slice.cat.label}</span>
    </div>
    <div style="display:flex;justify-content:space-between;gap:16px;font-size:12px;">
      <span style="color:var(--text-3)">Valor</span>
      <span style="color:var(--red);font-weight:700">${fmt(slice.val)}</span>
    </div>
    <div style="display:flex;justify-content:space-between;gap:16px;font-size:12px;margin-top:4px;">
      <span style="color:var(--text-3)">Participação</span>
      <span style="color:var(--text-1);font-weight:600">${slice.pct}%</span>
    </div>`;
  el.style.display = 'block';
  const W = el.offsetWidth, H2 = el.offsetHeight;
  let x = clientX + 14, y = clientY - H2 / 2;
  if (x + W  > window.innerWidth  - 8) x = clientX - W - 14;
  if (x < 8) x = 8;
  if (y + H2 > window.innerHeight - 8) y = window.innerHeight - H2 - 8;
  if (y < 8) y = 8;
  el.style.left = x + 'px';
  el.style.top  = y + 'px';
}

function hideDonutTooltip() {
  if (_donutTooltip) _donutTooltip.style.display = 'none';
}

function redrawDonut(ctx, hoveredIdx) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const { cx, cy, OR, IR } = _donutGeo;
  const fmt = v => v >= 1000 ? `R$${(v / 1000).toFixed(1)}k` : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  ctx.clearRect(0, 0, W, H);

  _donutSlices.forEach((slice, i) => {
    const expand  = i === hoveredIdx ? 6 : 0;
    const midAngle = slice.startAngle + (slice.endAngle - slice.startAngle) / 2;
    const ox = expand * Math.cos(midAngle);
    const oy = expand * Math.sin(midAngle);

    ctx.beginPath();
    ctx.moveTo(cx + ox, cy + oy);
    ctx.arc(cx + ox, cy + oy, OR + (i === hoveredIdx ? 4 : 0), slice.startAngle, slice.endAngle);
    ctx.closePath();
    ctx.fillStyle   = slice.cat.color;
    ctx.globalAlpha = (hoveredIdx >= 0 && i !== hoveredIdx) ? 0.45 : 1;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = chartBg();
    ctx.lineWidth   = 2;
    ctx.stroke();
  });

  ctx.beginPath();
  ctx.arc(cx, cy, IR, 0, Math.PI * 2);
  ctx.fillStyle = chartBg();
  ctx.fill();

  ctx.fillStyle    = chartFg();
  ctx.font         = 'bold 11px Inter';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';

  if (hoveredIdx >= 0) {
    const s = _donutSlices[hoveredIdx];
    ctx.fillText(fmt(s.val), cx, cy - 7);
    ctx.font      = '10px Inter';
    ctx.fillStyle = chartFg(0.55);
    ctx.fillText(s.pct + '%', cx, cy + 9);
  } else {
    ctx.fillText(fmt(_donutTotal), cx, cy);
  }
}

function drawDonut(txs) {
  const canvas = document.getElementById('donut-chart');
  const ctx    = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const catTotals = {};
  txs.filter(t => t.type === 'despesa')
     .forEach(t => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount; });

  const total  = Object.values(catTotals).reduce((s, v) => s + v, 0);
  const legend = document.getElementById('donut-legend');
  legend.innerHTML = '';

  if (total === 0) {
    _donutSlices = [];
    ctx.fillStyle = chartFg(0.07);
    ctx.beginPath(); ctx.arc(W / 2, H / 2, 72, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = chartFg(0.4);
    ctx.font = '12px Inter'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Sem dados', W / 2, H / 2);
    return;
  }

  const cx = W / 2, cy = H / 2, OR = 80, IR = 52;
  _donutGeo   = { cx, cy, OR, IR };
  _donutTotal = total;
  _donutHovered = -1;
  _donutCtx = ctx;

  let angle = -Math.PI / 2;
  const sorted = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);

  _donutSlices = sorted.map(([key, val]) => {
    const cat        = CATEGORIES[key] || CATEGORIES.outros;
    const sweep      = (val / total) * Math.PI * 2;
    const startAngle = angle;
    const endAngle   = angle + sweep;
    angle            = endAngle;
    return { cat, val, pct: ((val / total) * 100).toFixed(1), startAngle, endAngle, key };
  });

  _donutSlices.forEach((slice, i) => {
    const item = document.createElement('div');
    item.className = 'legend-item';

    const barW = Math.round(parseFloat(slice.pct));
    item.innerHTML = `
      <div class="legend-dot" style="background:${slice.cat.color}"></div>
      <span class="legend-label">${slice.cat.icon} ${slice.cat.label}</span>
      <span class="legend-pct">${slice.pct}%</span>
      <div class="legend-bar-track"><div class="legend-bar-fill" style="width:${barW}%;background:${slice.cat.color}"></div></div>`;

    item.addEventListener('mouseenter', () => {
      if (_donutCtx) { _donutHovered = i; redrawDonut(_donutCtx, i); }
      item.classList.add('legend-active');
    });
    item.addEventListener('mouseleave', () => {
      if (_donutCtx) { _donutHovered = -1; redrawDonut(_donutCtx, -1); hideDonutTooltip(); }
      item.classList.remove('legend-active');
    });
    item.addEventListener('click', () => goToTransactions('despesa', slice.key));

    legend.appendChild(item);
  });

  redrawDonut(ctx, -1);

  canvas.onclick = e => {
    const r      = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / r.width;
    const scaleY = canvas.height / r.height;
    const mx     = (e.clientX - r.left) * scaleX;
    const my     = (e.clientY - r.top)  * scaleY;
    const { cx, cy, OR, IR } = _donutGeo;
    const dist = Math.hypot(mx - cx, my - cy);
    if (dist < IR || dist > OR + 12) return;
    const normStart = -Math.PI / 2;
    let rel = Math.atan2(my - cy, mx - cx) - normStart;
    if (rel < 0) rel += Math.PI * 2;
    const slice = _donutSlices.find(s => {
      let sa = s.startAngle - normStart, ea = s.endAngle - normStart;
      if (sa < 0) sa += Math.PI * 2;
      if (ea < 0) ea += Math.PI * 2;
      return sa <= ea ? rel >= sa && rel <= ea : rel >= sa || rel <= ea;
    });
    if (slice) goToTransactions('despesa', slice.key);
  };

  canvas.onmousemove = e => {
    const r   = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / r.width;
    const scaleY = canvas.height / r.height;
    const mx  = (e.clientX - r.left) * scaleX;
    const my  = (e.clientY - r.top)  * scaleY;
    const dx  = mx - cx, dy = my - cy;
    const dist = Math.hypot(dx, dy);

    if (dist < IR || dist > OR + 8) {
      if (_donutHovered !== -1) { _donutHovered = -1; redrawDonut(ctx, -1); hideDonutTooltip(); }
      canvas.style.cursor = 'default';
      return;
    }

    let a = Math.atan2(dy, dx);
    // normalize angle to match our -π/2 start
    const normStart = -Math.PI / 2;
    let rel = a - normStart;
    if (rel < 0) rel += Math.PI * 2;

    const idx = _donutSlices.findIndex(s => {
      let sa = s.startAngle - normStart;
      let ea = s.endAngle   - normStart;
      if (sa < 0) sa += Math.PI * 2;
      if (ea < 0) ea += Math.PI * 2;
      if (sa <= ea) return rel >= sa && rel <= ea;
      return rel >= sa || rel <= ea;
    });

    canvas.style.cursor = idx >= 0 ? 'pointer' : 'default';
    if (idx !== _donutHovered) {
      _donutHovered = idx;
      redrawDonut(ctx, idx);
    }
    if (idx >= 0) showDonutTooltip(_donutSlices[idx], e.clientX, e.clientY);
    else hideDonutTooltip();
  };

  canvas.onmouseleave = () => {
    canvas.style.cursor = 'default';
    if (_donutHovered !== -1) { _donutHovered = -1; redrawDonut(ctx, -1); }
    hideDonutTooltip();
  };
}

function roundedRect(ctx, x, y, w, h, r) {
  if (h < r) r = h;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// =============================================
//  LINE CHART
// =============================================
let _lineChartPts     = [];
let _lineChartTooltip = null;
let _lineHoveredIdx   = -1;
let _lineBaseImage    = null;

function drawLine(allTxs, range = 30) {
  const canvas = document.getElementById('line-chart');
  if (!canvas) return;

  const W = canvas.parentElement.clientWidth || 500;
  canvas.width  = W;
  canvas.height = 200;
  const H = 200;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);
  const groups = [];

  if (range <= 30) {
    for (let i = range - 1; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      groups.push({ key: d.toISOString().slice(0, 10), label: String(d.getDate()), income: 0, expense: 0 });
    }
  } else if (range === 90) {
    for (let i = 12; i >= 0; i--) {
      const wEnd   = new Date(today); wEnd.setDate(wEnd.getDate() - i * 7);
      const wStart = new Date(wEnd);  wStart.setDate(wStart.getDate() - 6);
      groups.push({
        start:  wStart.toISOString().slice(0, 10),
        end:    wEnd.toISOString().slice(0, 10),
        label:  wStart.toLocaleString('pt-BR', { day: 'numeric', month: 'short' }),
        income: 0, expense: 0,
      });
    }
  } else {
    for (let i = 11; i >= 0; i--) {
      const d   = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      groups.push({ key, label: d.toLocaleString('pt-BR', { month: 'short' }), income: 0, expense: 0 });
    }
  }

  const startStr = range <= 30
    ? new Date(today.getTime() - (range - 1) * 86400000).toISOString().slice(0, 10)
    : range === 90
    ? new Date(today.getTime() - 89 * 86400000).toISOString().slice(0, 10)
    : new Date(today.getFullYear(), today.getMonth() - 11, 1).toISOString().slice(0, 10);

  // Inclui transações recorrentes fixas geradas virtualmente para o período,
  // replicando a lógica de txOfMonth para evitar que receitas/despesas fixas sumam do gráfico
  const arr = allTxs || [];
  const regular = arr.filter(t => !t.fixed && t.date >= startStr && t.date <= todayStr);
  const generatedIds = new Set(regular.map(recurringTemplateId).filter(Boolean));

  const monthsInRange = new Set();
  const cursor = new Date(startStr + 'T12:00:00');
  const endDate = new Date(todayStr + 'T12:00:00');
  while (cursor <= endDate) {
    monthsInRange.add(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const virtual = [];
  arr.filter(t => t.fixed && !generatedIds.has(t.id)).forEach(tpl => {
    monthsInRange.forEach(mk => {
      if (tpl.date.slice(0, 7) > mk) return;
      const [ty, tm] = mk.split('-').map(Number);
      const dim = new Date(ty, tm, 0).getDate();
      const day = String(Math.min(parseInt(tpl.date.slice(8, 10), 10), dim)).padStart(2, '0');
      const vDate = `${mk}-${day}`;
      if (vDate >= startStr && vDate <= todayStr) virtual.push({ ...tpl, date: vDate, fixed: false });
    });
  });

  const plotted = [...regular, ...virtual.filter(t => !regular.some(r => sameRecurringOccurrence(r, t)))];

  plotted.forEach(t => {
    let g;
    if (range <= 30)       g = groups.find(g => g.key === t.date);
    else if (range === 90) g = groups.find(g => t.date >= g.start && t.date <= g.end);
    else                   g = groups.find(g => t.date.startsWith(g.key));
    if (!g) return;
    if (t.type === 'receita') g.income  += t.amount;
    else                      g.expense += t.amount;
  });

  const pL = 52, pR = 16, pT = 18, pB = 30;
  const cW = W - pL - pR, cH = H - pT - pB;
  const maxVal = Math.max(...groups.flatMap(g => [g.income, g.expense]), 1);

  ctx.font = '10px Inter'; ctx.strokeStyle = chartFg(0.07); ctx.lineWidth = 1;
  ctx.fillStyle = chartFg(0.45); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let i = 0; i <= 4; i++) {
    const y = pT + (cH / 4) * i;
    ctx.beginPath(); ctx.moveTo(pL, y); ctx.lineTo(W - pR, y); ctx.stroke();
    const v = maxVal * (1 - i / 4);
    ctx.fillText(v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0), pL - 5, y);
  }

  const pts = groups.map((g, i) => ({
    x:       pL + (i / Math.max(groups.length - 1, 1)) * cW,
    incY:    pT + cH - (g.income  / maxVal) * cH,
    expY:    pT + cH - (g.expense / maxVal) * cH,
    income:  g.income,
    expense: g.expense,
    label:   g.label,
  }));

  function drawSmoothLine(yKey, color, rgbStr) {
    if (pts.length < 2) return;
    const grad = ctx.createLinearGradient(0, pT, 0, pT + cH);
    grad.addColorStop(0, `rgba(${rgbStr},.16)`);
    grad.addColorStop(1, `rgba(${rgbStr},.01)`);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pT + cH);
    pts.forEach(p => ctx.lineTo(p.x, p[yKey]));
    ctx.lineTo(pts[pts.length - 1].x, pT + cH);
    ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0][yKey]);
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1], curr = pts[i];
      const cpx  = (prev.x + curr.x) / 2;
      ctx.bezierCurveTo(cpx, prev[yKey], cpx, curr[yKey], curr.x, curr[yKey]);
    }
    ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.stroke();
  }

  drawSmoothLine('expY', '#f87171', '248,113,113');
  drawSmoothLine('incY', '#34d399', '52,211,153');

  ctx.fillStyle = chartFg(0.4); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  const step = Math.ceil(groups.length / 8);
  groups.forEach((g, i) => {
    if (i % step !== 0 && i !== groups.length - 1) return;
    ctx.fillText(g.label, pL + (i / Math.max(groups.length - 1, 1)) * cW, H - pB + 18);
  });

  _lineChartPts   = pts;
  _lineBaseImage  = ctx.getImageData(0, 0, W, H);
  _lineHoveredIdx = -1;

  function redrawHover(hovIdx) {
    ctx.putImageData(_lineBaseImage, 0, 0);
    if (hovIdx < 0) return;
    const hp = pts[hovIdx];
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(hp.x, pT); ctx.lineTo(hp.x, pT + cH);
    ctx.strokeStyle = chartFg(0.2); ctx.lineWidth = 1;
    ctx.stroke(); ctx.setLineDash([]); ctx.restore();

    [[hp.incY, '#34d399', '52,211,153'], [hp.expY, '#f87171', '248,113,113']].forEach(([y, color, rgb]) => {
      ctx.beginPath(); ctx.arc(hp.x, y, 8, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${rgb},.18)`; ctx.fill();
      ctx.beginPath(); ctx.arc(hp.x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
      ctx.strokeStyle = chartBg(); ctx.lineWidth = 2; ctx.stroke();
    });
  }

  function showLinePanel(pt) {
    const panel = document.getElementById('line-click-info');
    if (!panel) return;
    const fmt = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const bal = pt.income - pt.expense;
    const balColor = bal >= 0 ? '#34d399' : '#f87171';
    panel.innerHTML = `
      <div class="line-click-day" style="animation-delay:60ms">${pt.label}</div>
      <div class="line-click-tx" style="animation-delay:120ms">
        <span class="line-click-tx-desc" style="color:#34d399">↑ Receitas</span>
        <span class="line-click-tx-amount" style="color:#34d399">${fmt(pt.income)}</span>
      </div>
      <div class="line-click-tx" style="animation-delay:180ms">
        <span class="line-click-tx-desc" style="color:#f87171">↓ Despesas</span>
        <span class="line-click-tx-amount" style="color:#f87171">${fmt(pt.expense)}</span>
      </div>
      <div class="line-click-total" style="animation-delay:240ms">
        <span class="line-click-total-label">Saldo</span>
        <span class="line-click-total-value" style="color:${balColor}">${bal >= 0 ? '+' : ''}${fmt(bal)}</span>
      </div>`;
    panel.classList.remove('open');
    requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.add('open')));
  }

  function hideLinePanel() {
    const el = document.getElementById('line-click-info');
    if (el) el.classList.remove('open');
  }

  canvas.onmousemove = e => {
    const r  = canvas.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (canvas.width / r.width);
    let minDist = Infinity, idx = -1;
    pts.forEach((p, i) => { const d = Math.abs(p.x - mx); if (d < minDist) { minDist = d; idx = i; } });
    if (minDist > (cW / Math.max(groups.length, 1)) * 0.6) idx = -1;
    canvas.style.cursor = idx >= 0 ? 'crosshair' : 'default';
    if (idx !== _lineHoveredIdx) {
      _lineHoveredIdx = idx;
      redrawHover(idx);
      if (idx >= 0) showLinePanel(pts[idx]);
      else hideLinePanel();
    }
  };

  canvas.onmouseleave = () => {
    canvas.style.cursor = 'default';
    if (_lineHoveredIdx !== -1) { _lineHoveredIdx = -1; redrawHover(-1); }
    hideLinePanel();
  };
}

// =============================================
//  HORIZONTAL BAR CHART
// =============================================
function drawBars(txs) {
  const canvas = document.getElementById('bar-chart');
  if (!canvas) return;

  const W = canvas.parentElement.clientWidth || 600;
  canvas.width  = W;
  canvas.height = 260;
  const H   = 260;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  const catTotals = {};
  txs.filter(t => t.type === 'despesa')
     .forEach(t => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount; });
  const sorted = Object.entries(catTotals).sort((a, b) => b[1] - a[1]).slice(0, 8);

  if (!sorted.length) {
    ctx.fillStyle    = chartFg(0.4);
    ctx.font         = '14px Inter';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Sem dados para exibir', W / 2, H / 2);
    return;
  }

  const fmt    = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const maxVal = sorted[0][1];
  const pL = 114, pR = 90, pT = 10, pB = 10;
  const barH   = Math.floor((H - pT - pB) / sorted.length) - 7;
  const trackW = W - pL - pR;

  sorted.forEach(([key, val], i) => {
    const cat = CATEGORIES[key] || CATEGORIES.outros;
    const bW  = (val / maxVal) * trackW;
    const y   = pT + i * (barH + 7);

    ctx.fillStyle    = chartFg(0.7);
    ctx.font         = '12px Inter';
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(cat.label, pL - 9, y + barH / 2);

    ctx.fillStyle = chartFg(0.05);
    ctx.beginPath(); rrect(ctx, pL, y, trackW, barH, 5); ctx.fill();

    const g = ctx.createLinearGradient(pL, 0, pL + bW, 0);
    g.addColorStop(0, cat.color);
    g.addColorStop(1, cat.color + 'aa');
    ctx.fillStyle = g;
    ctx.beginPath(); rrect(ctx, pL, y, Math.max(bW, 5), barH, 5); ctx.fill();

    ctx.fillStyle    = chartFg(0.8);
    ctx.font         = 'bold 11px Inter';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(fmt(val), pL + bW + 8, y + barH / 2);
  });
}

// =============================================
//  ANALYSIS CHARTS (Bars, Pie, Line, Radar)
// =============================================
let _currentAnalysisType = 'bars';

function _clearAnalysisCanvas(canvas) {
  canvas.onclick     = null;
  canvas.onmousemove = null;
  canvas.onmouseleave = null;
  canvas.style.cursor = 'default';
}

// ---- Analysis: Bars ----
function drawAnalysisBars(txs) {
  const canvas = document.getElementById('analysis-chart');
  if (!canvas) return;
  _clearAnalysisCanvas(canvas);
  canvas.style.width = ''; canvas.style.height = ''; canvas.style.margin = '';
  const legend = document.getElementById('analysis-legend');
  if (legend) { legend.innerHTML = ''; legend.style.display = 'none'; }

  const W = canvas.parentElement.clientWidth || 600;
  const H = 268;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  const catTotals = {};
  txs.filter(t => t.type === 'despesa')
     .forEach(t => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount; });
  const sorted = Object.entries(catTotals).sort((a, b) => b[1] - a[1]).slice(0, 8);

  if (!sorted.length) {
    ctx.fillStyle = chartFg(0.4); ctx.font = '14px Inter';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Sem dados para exibir', W / 2, H / 2);
    return;
  }

  const fmtV = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const maxVal = sorted[0][1];
  const pL = 116, pR = 96, pT = 10, pB = 10;
  const barH = Math.floor((H - pT - pB) / sorted.length) - 7;
  const trackW = W - pL - pR;

  const bars = sorted.map(([key, val], i) => {
    const cat = CATEGORIES[key] || CATEGORIES.outros;
    return { key, cat, val, bW: (val / maxVal) * trackW, y: pT + i * (barH + 7), barH };
  });

  function render(hovIdx) {
    ctx.clearRect(0, 0, W, H);
    bars.forEach(({ cat, val, bW, y, barH: bh, key }, i) => {
      const hov = i === hovIdx;

      ctx.fillStyle = chartFg(hov ? 1 : 0.65);
      ctx.font = hov ? 'bold 12px Inter' : '12px Inter';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(cat.label, pL - 9, y + bh / 2);

      ctx.fillStyle = chartFg(hov ? 0.1 : 0.05);
      ctx.beginPath(); rrect(ctx, pL, y, trackW, bh, 5); ctx.fill();

      const g = ctx.createLinearGradient(pL, 0, pL + bW, 0);
      g.addColorStop(0, cat.color + (hov ? 'ff' : 'cc'));
      g.addColorStop(1, cat.color + '88');
      ctx.fillStyle = g;
      ctx.beginPath(); rrect(ctx, pL, y, Math.max(bW, 5), bh, 5); ctx.fill();

      if (hov) {
        ctx.save(); ctx.globalAlpha = 0.55;
        ctx.strokeStyle = cat.color; ctx.lineWidth = 1.5;
        ctx.beginPath(); rrect(ctx, pL, y, trackW, bh, 5); ctx.stroke();
        ctx.restore();
      }

      ctx.fillStyle = chartFg(hov ? 1 : 0.8);
      ctx.font = 'bold 11px Inter'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(fmtV(val), pL + Math.max(bW, 5) + 8, y + bh / 2);
    });
  }

  render(-1);
  let _hov = -1;

  canvas.onmousemove = e => {
    const r  = canvas.getBoundingClientRect();
    const sy = canvas.height / r.height;
    const my = (e.clientY - r.top) * sy;
    const idx = bars.findIndex(b => my >= b.y - 2 && my <= b.y + b.barH + 2);
    canvas.style.cursor = idx >= 0 ? 'pointer' : 'default';
    if (idx !== _hov) { _hov = idx; render(idx); }
  };
  canvas.onmouseleave = () => { if (_hov !== -1) { _hov = -1; render(-1); } canvas.style.cursor = 'default'; };
  canvas.onclick      = () => { if (_hov >= 0) goToTransactions('despesa', bars[_hov].key); };
}

// ---- Analysis: Pie / Donut ----
function drawAnalysisPie(txs) {
  const canvas = document.getElementById('analysis-chart');
  if (!canvas) return;
  _clearAnalysisCanvas(canvas);

  const catTotals = {};
  txs.filter(t => t.type === 'despesa')
     .forEach(t => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount; });
  const total = Object.values(catTotals).reduce((s, v) => s + v, 0);

  const areaW = canvas.parentElement.clientWidth || 400;
  const size  = Math.min(areaW, 310);
  canvas.width = size; canvas.height = size;
  canvas.style.width = size + 'px'; canvas.style.height = size + 'px'; canvas.style.margin = '0 auto';

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  const legend = document.getElementById('analysis-legend');

  if (!total) {
    ctx.fillStyle = chartFg(0.4); ctx.font = '14px Inter';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Sem dados para exibir', size / 2, size / 2);
    if (legend) legend.style.display = 'none';
    return;
  }

  const cx = size / 2, cy = size / 2;
  const OR = size * 0.38, IR = size * 0.23;
  const sorted = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
  let angle = -Math.PI / 2;
  const slices = sorted.map(([key, val]) => {
    const cat = CATEGORIES[key] || CATEGORIES.outros;
    const sweep = (val / total) * Math.PI * 2;
    const sa = angle; angle += sweep;
    return { cat, val, pct: ((val / total) * 100).toFixed(1), sa, ea: angle, key };
  });

  const fmtV = v => v >= 1000 ? `R$${(v / 1000).toFixed(1)}k` : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  let hov = -1;

  function redraw(hovIdx) {
    ctx.clearRect(0, 0, size, size);
    slices.forEach((sl, i) => {
      const expand = i === hovIdx ? 9 : 0;
      const mid = sl.sa + (sl.ea - sl.sa) / 2;
      const ox = expand * Math.cos(mid), oy = expand * Math.sin(mid);
      ctx.beginPath();
      ctx.moveTo(cx + ox, cy + oy);
      ctx.arc(cx + ox, cy + oy, OR + (i === hovIdx ? 4 : 0), sl.sa, sl.ea);
      ctx.closePath();
      ctx.fillStyle  = sl.cat.color;
      ctx.globalAlpha = (hovIdx >= 0 && i !== hovIdx) ? 0.4 : 1;
      ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = chartBg(); ctx.lineWidth = 2.5; ctx.stroke();
    });
    ctx.beginPath(); ctx.arc(cx, cy, IR, 0, Math.PI * 2);
    ctx.fillStyle = chartBg(); ctx.fill();

    ctx.fillStyle = chartFg(); ctx.font = 'bold 11px Inter';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (hovIdx >= 0) {
      const s = slices[hovIdx];
      ctx.fillText(fmtV(s.val), cx, cy - 8);
      ctx.font = '10px Inter'; ctx.fillStyle = chartFg(0.55);
      ctx.fillText(s.pct + '%', cx, cy + 8);
    } else {
      ctx.fillText(fmtV(total), cx, cy);
    }
  }

  redraw(-1);

  if (legend) {
    legend.style.display = 'flex';
    legend.innerHTML = '';
    slices.forEach((sl, i) => {
      const item = document.createElement('div');
      item.className = 'legend-item';
      const barW = Math.round(parseFloat(sl.pct));
      item.innerHTML = `
        <div class="legend-dot" style="background:${sl.cat.color}"></div>
        <span class="legend-label">${sl.cat.icon} ${sl.cat.label}</span>
        <span class="legend-pct">${sl.pct}%</span>
        <div class="legend-bar-track"><div class="legend-bar-fill" style="width:${barW}%;background:${sl.cat.color}"></div></div>`;
      item.addEventListener('mouseenter', () => { hov = i; redraw(i); item.classList.add('legend-active'); });
      item.addEventListener('mouseleave', () => { hov = -1; redraw(-1); item.classList.remove('legend-active'); });
      item.addEventListener('click', () => goToTransactions('despesa', sl.key));
      legend.appendChild(item);
    });
  }

  function hitSlice(mx, my) {
    const dist = Math.hypot(mx - cx, my - cy);
    if (dist < IR || dist > OR + 12) return -1;
    let rel = (Math.atan2(my - cy, mx - cx) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
    return slices.findIndex(sl => {
      let sa = (sl.sa + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
      let ea = (sl.ea + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
      return sa <= ea ? rel >= sa && rel <= ea : rel >= sa || rel <= ea;
    });
  }

  canvas.onmousemove = e => {
    const r  = canvas.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (size / r.width);
    const my = (e.clientY - r.top)  * (size / r.height);
    const idx = hitSlice(mx, my);
    canvas.style.cursor = idx >= 0 ? 'pointer' : 'default';
    if (idx !== hov) { hov = idx; redraw(idx); }
  };
  canvas.onmouseleave = () => { if (hov !== -1) { hov = -1; redraw(-1); } canvas.style.cursor = 'default'; };
  canvas.onclick      = () => { if (hov >= 0) goToTransactions('despesa', slices[hov].key); };
}

// ---- Analysis: Line ----
function drawAnalysisLine(txs) {
  const canvas = document.getElementById('analysis-chart');
  if (!canvas) return;
  _clearAnalysisCanvas(canvas);
  canvas.style.width = ''; canvas.style.height = ''; canvas.style.margin = '';
  const legend = document.getElementById('analysis-legend');
  if (legend) { legend.innerHTML = ''; legend.style.display = 'none'; }

  const W = canvas.parentElement.clientWidth || 500;
  const H = 230;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  const year = currentDate.getFullYear(), month = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const now = new Date();
  const maxDay = (now.getMonth() === month && now.getFullYear() === year) ? now.getDate() : daysInMonth;

  const daily    = Array(daysInMonth + 1).fill(0);
  const dailyTxs = Array.from({ length: daysInMonth + 1 }, () => []);
  txs.filter(t => t.type === 'despesa').forEach(t => {
    const d = parseInt(t.date.split('-')[2], 10);
    daily[d] += t.amount; dailyTxs[d].push(t);
  });

  const maxVal = Math.max(...daily, 1);
  const pL = 52, pR = 16, pT = 20, pB = 34;
  const cW = W - pL - pR, cH = H - pT - pB;

  ctx.strokeStyle = chartFg(0.07); ctx.lineWidth = 1;
  ctx.font = '10px Inter'; ctx.fillStyle = chartFg(0.45);
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let i = 0; i <= 4; i++) {
    const y = pT + (cH / 4) * i;
    ctx.beginPath(); ctx.moveTo(pL, y); ctx.lineTo(W - pR, y); ctx.stroke();
    const v = maxVal * (1 - i / 4);
    ctx.fillText(v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0), pL - 5, y);
  }

  const pts = [];
  for (let d = 1; d <= maxDay; d++) {
    pts.push({
      x: pL + ((d - 1) / Math.max(daysInMonth - 1, 1)) * cW,
      y: pT + cH - (daily[d] / maxVal) * cH,
      v: daily[d], day: d, txList: dailyTxs[d],
    });
  }

  if (pts.length < 2) {
    ctx.fillStyle = chartFg(0.4); ctx.font = '13px Inter';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Poucos dados para exibir', W / 2, H / 2);
    return;
  }

  const grad = ctx.createLinearGradient(0, pT, 0, pT + cH);
  grad.addColorStop(0, 'rgba(124,58,237,.3)');
  grad.addColorStop(1, 'rgba(124,58,237,.01)');
  ctx.beginPath(); ctx.moveTo(pts[0].x, pT + cH);
  pts.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(pts[pts.length - 1].x, pT + cH); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();

  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1], curr = pts[i], cpx = (prev.x + curr.x) / 2;
    ctx.bezierCurveTo(cpx, prev.y, cpx, curr.y, curr.x, curr.y);
  }
  ctx.strokeStyle = '#7c3aed'; ctx.lineWidth = 2.5; ctx.stroke();

  const step = Math.ceil(daysInMonth / 8);
  ctx.fillStyle = chartFg(0.4); ctx.font = '10px Inter';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let d = 1; d <= daysInMonth; d += step) {
    const x = pL + ((d - 1) / Math.max(daysInMonth - 1, 1)) * cW;
    ctx.fillText(d, x, H - pB + 6);
  }

  const baseImg = ctx.getImageData(0, 0, W, H);
  let hov = -1;

  function drawDots(hovIdx) {
    ctx.putImageData(baseImg, 0, 0);
    if (hovIdx >= 0) {
      const hp = pts[hovIdx];
      ctx.save(); ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(hp.x, pT); ctx.lineTo(hp.x, pT + cH);
      ctx.strokeStyle = 'rgba(124,58,237,.5)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.setLineDash([]); ctx.restore();
    }
    pts.forEach((p, i) => {
      if (!p.v) return;
      const isH = i === hovIdx;
      if (isH) {
        ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(124,58,237,.18)'; ctx.fill();
      }
      ctx.beginPath(); ctx.arc(p.x, p.y, isH ? 6 : 4, 0, Math.PI * 2);
      ctx.fillStyle = isH ? '#7c3aed' : '#a78bfa'; ctx.fill();
      ctx.strokeStyle = chartBg(); ctx.lineWidth = isH ? 2.5 : 2; ctx.stroke();
    });
    if (hovIdx >= 0) {
      const p = pts[hovIdx];
      const fmtV = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const label = `Dia ${p.day}: ${fmtV(p.v)}`;
      ctx.font = 'bold 11px Inter';
      const lW = ctx.measureText(label).width + 22;
      let lx = p.x - lW / 2;
      if (lx < pL) lx = pL;
      if (lx + lW > W - pR) lx = W - pR - lW;
      const ly = p.y - 36;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(lx, Math.max(2, ly), lW, 22, 6)
                    : ctx.rect(lx, Math.max(2, ly), lW, 22);
      ctx.fillStyle = 'rgba(124,58,237,.9)'; ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, lx + lW / 2, Math.max(2, ly) + 11);
    }
  }

  drawDots(-1);

  canvas.onmousemove = e => {
    const r  = canvas.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (W / r.width);
    const my = (e.clientY - r.top)  * (H / r.height);
    const idx = pts.findIndex(p => p.v > 0 && Math.hypot(p.x - mx, p.y - my) < 18);
    canvas.style.cursor = idx >= 0 ? 'pointer' : 'default';
    if (idx !== hov) { hov = idx; drawDots(idx); }
  };
  canvas.onmouseleave = () => { if (hov !== -1) { hov = -1; drawDots(-1); } canvas.style.cursor = 'default'; };
}

// ---- Analysis: Radar ----
function drawAnalysisRadar(txs) {
  const canvas = document.getElementById('analysis-chart');
  if (!canvas) return;
  _clearAnalysisCanvas(canvas);
  const legend = document.getElementById('analysis-legend');
  if (legend) { legend.innerHTML = ''; legend.style.display = 'none'; }

  const catTotals = {};
  txs.filter(t => t.type === 'despesa')
     .forEach(t => { catTotals[t.category] = (catTotals[t.category] || 0) + t.amount; });
  const sorted = Object.entries(catTotals).sort((a, b) => b[1] - a[1]).slice(0, 7);

  const areaW = canvas.parentElement.clientWidth || 400;
  const size  = Math.min(areaW, 360);
  canvas.width = size; canvas.height = size;
  canvas.style.width = size + 'px'; canvas.style.height = size + 'px'; canvas.style.margin = '0 auto';

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);

  if (!sorted.length) {
    ctx.fillStyle = chartFg(0.4); ctx.font = '14px Inter';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Sem dados para exibir', size / 2, size / 2);
    return;
  }

  const N  = sorted.length;
  const cx = size / 2, cy = size / 2;
  const maxR   = size * 0.30;
  const maxVal = sorted[0][1];
  const levels = 4;
  const angleFor = i => (i / N) * Math.PI * 2 - Math.PI / 2;

  for (let l = 1; l <= levels; l++) {
    const r = (l / levels) * maxR;
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const a = angleFor(i);
      i === 0 ? ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
              : ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
    ctx.closePath();
    ctx.strokeStyle = chartFg(l === levels ? 0.14 : 0.07);
    ctx.lineWidth   = l === levels ? 1.5 : 1;
    ctx.stroke();
    if (l === levels) {
      ctx.fillStyle = chartFg(0.03); ctx.fill();
    }
  }

  sorted.forEach((_, i) => {
    const a = angleFor(i);
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + maxR * Math.cos(a), cy + maxR * Math.sin(a));
    ctx.strokeStyle = chartFg(0.1); ctx.lineWidth = 1; ctx.stroke();
  });

  const pts = sorted.map(([key, val], i) => {
    const cat = CATEGORIES[key] || CATEGORIES.outros;
    const a   = angleFor(i);
    const r   = (val / maxVal) * maxR;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), cat, val, key, a };
  });

  ctx.beginPath();
  pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.closePath();
  ctx.fillStyle = 'rgba(124,58,237,0.16)'; ctx.fill();
  ctx.strokeStyle = '#7c3aed'; ctx.lineWidth = 2; ctx.stroke();

  const fmtV = v => v >= 1000 ? `R$${(v / 1000).toFixed(1)}k` : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  pts.forEach((p, i) => {
    ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = p.cat.color; ctx.fill();
    ctx.strokeStyle = chartBg(); ctx.lineWidth = 2; ctx.stroke();

    const labelR = maxR + 28;
    const a = angleFor(i);
    const lx = cx + labelR * Math.cos(a), ly = cy + labelR * Math.sin(a);
    ctx.fillStyle    = chartFg(0.82); ctx.font = '11px Inter';
    ctx.textAlign    = Math.cos(a) > 0.15 ? 'left' : Math.cos(a) < -0.15 ? 'right' : 'center';
    ctx.textBaseline = Math.sin(a) > 0.15 ? 'top'  : Math.sin(a) < -0.15 ? 'bottom' : 'middle';
    ctx.fillText(p.cat.label, lx, ly);

    const valLabelR = (p.val / maxVal) * maxR - 12;
    if (valLabelR > 8) {
      const vx = cx + valLabelR * Math.cos(a), vy = cy + valLabelR * Math.sin(a);
      ctx.fillStyle = p.cat.color; ctx.font = 'bold 9px Inter';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(fmtV(p.val), vx, vy);
    }
  });

  const totalExp = sorted.reduce((s, [, v]) => s + v, 0);
  ctx.fillStyle = chartFg(0.45); ctx.font = '9px Inter';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('total', cx, cy - 9);
  ctx.fillStyle = chartFg(0.9); ctx.font = 'bold 11px Inter';
  ctx.fillText(fmtV(totalExp), cx, cy + 8);
}

// ---- Dispatcher ----
function drawAnalysisChart(txs, type) {
  if (type !== undefined) _currentAnalysisType = type;
  if (_currentAnalysisType === 'pie')   drawAnalysisPie(txs);
  else if (_currentAnalysisType === 'line')  drawAnalysisLine(txs);
  else if (_currentAnalysisType === 'radar') drawAnalysisRadar(txs);
  else                                       drawAnalysisBars(txs);
}

// =============================================
//  ANNUAL HISTORY CHART
// =============================================
let annualDisplayYear    = null;
let _annualHoveredMonth  = -1;
let _annualSelectedMonth = -1;
let _annualAnimState     = Array.from({ length: 12 }, () => 0);
let _annualAnimRaf       = null;

function _redrawAnnualCanvas(canvas) {
  const s = canvas._annualFull;
  if (!s) return;
  const { ctx, dpr, W, H, padL, padR, padT, padB, cW, cH,
          groupW, barW, gap, maxVal, data, monthNames, year,
          curM, isDark, greenClr, redClr, gridClr, textClr } = s;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  // Current-month column highlight
  if (curM >= 0) {
    ctx.fillStyle = 'rgba(99,102,241,.08)';
    ctx.fillRect(padL + curM * groupW, padT, groupW, cH);
  }

  // Selected-month column highlight
  if (_annualSelectedMonth >= 0) {
    ctx.fillStyle = isDark ? 'rgba(99,102,241,0.18)' : 'rgba(99,102,241,0.13)';
    ctx.fillRect(padL + _annualSelectedMonth * groupW, padT, groupW, cH);
  }

  // Animated hover-column highlight
  for (let i = 0; i < 12; i++) {
    const p = _annualAnimState[i];
    if (p > 0.002) {
      ctx.fillStyle = isDark
        ? `rgba(255,255,255,${0.05 * p})`
        : `rgba(99,102,241,${0.07 * p})`;
      ctx.fillRect(padL + i * groupW + 1, padT, groupW - 2, cH);
    }
  }

  // Grid lines + y-axis labels
  ctx.strokeStyle = gridClr;
  ctx.lineWidth   = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padT + cH - (i / 4) * cH;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + cW, y); ctx.stroke();
    const val   = (i / 4) * maxVal;
    const label = val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val.toFixed(0);
    ctx.fillStyle = textClr;
    ctx.font      = '10px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`R$${label}`, padL - 5, y + 3.5);
  }

  // Bars with grow + glow on hover
  const hasSel = _annualSelectedMonth >= 0;
  for (let i = 0; i < 12; i++) {
    const { income, expense, isFuture } = data[i];
    const p      = _annualAnimState[i];
    const scaleY = 1 + p * 0.10;
    const isSel  = i === _annualSelectedMonth;
    const alpha  = isFuture ? 0.28 : (hasSel && !isSel ? 0.22 : 1);
    const groupX = padL + i * groupW + groupW / 2;

    ctx.globalAlpha = alpha;

    if (income > 0) {
      const h = (income / maxVal) * cH * scaleY;
      const x = groupX - barW - gap / 2;
      const y = padT + cH - h;
      if (p > 0.01) { ctx.shadowColor = '#10b981'; ctx.shadowBlur = 10 * p; }
      ctx.fillStyle = greenClr;
      ctx.beginPath();
      rrect(ctx, x, y, barW, Math.max(h, 2), Math.min(3, barW / 2));
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    if (expense > 0) {
      const h = (expense / maxVal) * cH * scaleY;
      const x = groupX + gap / 2;
      const y = padT + cH - h;
      if (p > 0.01) { ctx.shadowColor = '#f87171'; ctx.shadowBlur = 10 * p; }
      ctx.fillStyle = redClr;
      ctx.beginPath();
      rrect(ctx, x, y, barW, Math.max(h, 2), Math.min(3, barW / 2));
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    ctx.globalAlpha = 1;

    const labelBright = curM === i || isSel;
    ctx.globalAlpha = hasSel && !isSel ? 0.35 : 1;
    ctx.fillStyle   = labelBright ? chartFg(.9) : textClr;
    ctx.font        = labelBright ? 'bold 10px Inter, sans-serif' : '10px Inter, sans-serif';
    ctx.textAlign   = 'center';
    ctx.fillText(monthNames[i], groupX, padT + cH + 16);
    ctx.globalAlpha = 1;
  }
}

function _startAnnualAnimLoop(canvas) {
  if (_annualAnimRaf) return;
  const LERP = 0.18;

  function tick() {
    let needMore = false;
    for (let i = 0; i < 12; i++) {
      const target = i === _annualHoveredMonth ? 1 : 0;
      const diff   = target - _annualAnimState[i];
      if (Math.abs(diff) > 0.002) {
        _annualAnimState[i] += diff * LERP;
        needMore = true;
      } else {
        _annualAnimState[i] = target;
      }
    }
    _redrawAnnualCanvas(canvas);
    _annualAnimRaf = needMore ? requestAnimationFrame(tick) : null;
  }

  _annualAnimRaf = requestAnimationFrame(tick);
}

function drawAnnualChart() {
  const canvas = document.getElementById('annual-chart');
  if (!canvas) return;

  if (annualDisplayYear === null) annualDisplayYear = currentDate.getFullYear();
  const year    = annualDisplayYear;
  const labelEl = document.getElementById('annual-year-label');
  if (labelEl) labelEl.textContent = year;

  const now      = new Date();
  const nowYear  = now.getFullYear();
  const nowMonth = now.getMonth();

  const data = [];
  for (let m = 0; m < 12; m++) {
    const d        = new Date(year, m, 1);
    const monthTxs = txOfMonth(d);
    const income   = monthTxs.filter(t => t.type === 'receita').reduce((s, t) => s + t.amount, 0);
    const expense  = monthTxs.filter(t => t.type === 'despesa').reduce((s, t) => s + t.amount, 0);
    const isFuture = year > nowYear || (year === nowYear && m > nowMonth);
    data.push({ income, expense, isFuture });
  }

  const totalIncome  = data.reduce((s, d) => s + d.income,  0);
  const totalExpense = data.reduce((s, d) => s + d.expense, 0);
  const balance      = totalIncome - totalExpense;
  const summaryEl    = document.getElementById('annual-summary');
  if (summaryEl) {
    const fmt = v => v.toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
    summaryEl.innerHTML = `
      <div class="annual-summary-box">
        <div class="annual-summary-label">Total de Receitas</div>
        <div class="annual-summary-value" style="color:#10b981">${fmt(totalIncome)}</div>
      </div>
      <div class="annual-summary-box">
        <div class="annual-summary-label">Total de Despesas</div>
        <div class="annual-summary-value" style="color:#f87171">${fmt(totalExpense)}</div>
      </div>
      <div class="annual-summary-box">
        <div class="annual-summary-label">Saldo do Ano</div>
        <div class="annual-summary-value" style="color:${balance >= 0 ? '#10b981' : '#f87171'}">${fmt(balance)}</div>
      </div>`;
  }

  const dpr  = window.devicePixelRatio || 1;
  const wrap = canvas.parentElement;
  const rect = wrap.getBoundingClientRect();
  const W    = rect.width  || 600;
  const H    = rect.height || 240;
  canvas.width        = W * dpr;
  canvas.height       = H * dpr;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';

  const ctx      = canvas.getContext('2d');
  const isDark   = document.documentElement.dataset.theme !== 'light';
  const padL = 54, padR = 12, padT = 14, padB = 26;
  const cW   = W - padL - padR;
  const cH   = H - padT - padB;
  const maxVal   = Math.max(...data.map(d => Math.max(d.income, d.expense)), 1);
  const curM     = (year === nowYear) ? nowMonth : -1;
  const groupW   = cW / 12;
  const barW     = Math.max(Math.floor(groupW * 0.28), 4);
  const monthNames = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

  canvas._annualFull = {
    ctx, dpr, W, H, padL, padR, padT, padB, cW, cH,
    groupW, barW, gap: 2, maxVal, data, monthNames, year, curM,
    isDark,
    greenClr: '#10b981',
    redClr:   '#f87171',
    gridClr:  isDark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.07)',
    textClr:  isDark ? '#94a3b8' : '#78716c',
  };

  // Reset animation state on chart rebuild (year nav, theme change, etc.)
  _annualHoveredMonth = -1;
  _annualAnimState.fill(0);
  if (_annualAnimRaf) { cancelAnimationFrame(_annualAnimRaf); _annualAnimRaf = null; }

  _redrawAnnualCanvas(canvas);
  _initAnnualInteractions(canvas, data, monthNames, year);
}

function _initAnnualInteractions(canvas, data, monthNames, year) {
  if (canvas._annualListeners) {
    canvas.removeEventListener('mousemove', canvas._annualListeners.move);
    canvas.removeEventListener('mouseleave', canvas._annualListeners.leave);
    canvas.removeEventListener('click', canvas._annualListeners.click);
  }

  const tooltip = document.getElementById('annual-tooltip');
  const fmt     = v => v.toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
  const { padL, padT, cW, cH, groupW } = canvas._annualFull;

  function getMonthIndex(e) {
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (x < padL || x > padL + cW || y < padT || y > padT + cH) return -1;
    return Math.floor((x - padL) / groupW);
  }

  const onMove = (e) => {
    const mi         = getMonthIndex(e);
    const newHovered = (mi >= 0 && mi < 12) ? mi : -1;

    if (newHovered !== _annualHoveredMonth) {
      _annualHoveredMonth = newHovered;
      _startAnnualAnimLoop(canvas);
    }
    canvas.style.cursor = newHovered >= 0 ? 'pointer' : 'default';

    if (mi < 0 || mi >= 12) { tooltip.classList.add('hidden'); return; }
    const { income, expense, isFuture } = data[mi];
    const balance = income - expense;
    tooltip.innerHTML = `
      <div class="annual-tooltip-month">${monthNames[mi]} ${year}</div>
      <div class="annual-tooltip-row">
        <span class="annual-tooltip-dot" style="background:#10b981"></span>
        Receitas: <span class="annual-tooltip-val">${fmt(income)}</span>
      </div>
      <div class="annual-tooltip-row">
        <span class="annual-tooltip-dot" style="background:#f87171"></span>
        Despesas: <span class="annual-tooltip-val">${fmt(expense)}</span>
      </div>
      <div class="annual-tooltip-row" style="border-top:1px solid var(--border);margin-top:5px;padding-top:5px">
        <span class="annual-tooltip-dot" style="background:${balance >= 0 ? '#10b981' : '#f87171'}"></span>
        Saldo: <span class="annual-tooltip-val" style="color:${balance >= 0 ? '#10b981' : '#f87171'}">${fmt(balance)}</span>
      </div>
      ${isFuture ? '<div style="font-size:.7rem;color:var(--text-3);margin-top:5px">Mês futuro</div>' : ''}`;
    tooltip.classList.remove('hidden');
    const wrap  = canvas.parentElement;
    const wRect = wrap.getBoundingClientRect();
    const cx    = e.clientX - wRect.left;
    const cy    = e.clientY - wRect.top;
    const tw    = tooltip.offsetWidth;
    tooltip.style.left = Math.min(cx + 12, wRect.width - tw - 8) + 'px';
    tooltip.style.top  = Math.max(cy - 10, 4) + 'px';
  };

  const onLeave = () => {
    tooltip.classList.add('hidden');
    canvas.style.cursor = 'default';
    if (_annualHoveredMonth !== -1) {
      _annualHoveredMonth = -1;
      _startAnnualAnimLoop(canvas);
    }
  };

  const onClick = (e) => {
    const mi = getMonthIndex(e);
    if (mi < 0 || mi >= 12) return;
    _annualSelectedMonth = _annualSelectedMonth === mi ? -1 : mi;
    _redrawAnnualCanvas(canvas);
    currentDate = new Date(year, mi, 1);
    renderMonthLabel();
    renderAll();
  };

  canvas.addEventListener('mousemove', onMove);
  canvas.addEventListener('mouseleave', onLeave);
  canvas.addEventListener('click', onClick);
  canvas._annualListeners = { move: onMove, leave: onLeave, click: onClick };
}

function _setupAnnualYearNav() {
  const btnPrev = document.getElementById('btn-annual-prev');
  const btnNext = document.getElementById('btn-annual-next');
  if (!btnPrev || btnPrev._annualNavReady) return;
  btnPrev._annualNavReady = true;
  btnPrev.addEventListener('click', () => {
    if (annualDisplayYear === null) annualDisplayYear = currentDate.getFullYear();
    annualDisplayYear--;
    _annualSelectedMonth = -1;
    drawAnnualChart();
  });
  btnNext.addEventListener('click', () => {
    if (annualDisplayYear === null) annualDisplayYear = currentDate.getFullYear();
    annualDisplayYear++;
    _annualSelectedMonth = -1;
    drawAnnualChart();
  });
}
