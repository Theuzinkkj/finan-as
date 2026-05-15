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
    ctx.fillStyle = chartFg(0.07);
    ctx.beginPath(); ctx.arc(W / 2, H / 2, 72, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = chartFg(0.4);
    ctx.font = '12px Inter'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Sem dados', W / 2, H / 2);
    return;
  }

  const cx = W / 2, cy = H / 2, OR = 80, IR = 52;
  let angle = -Math.PI / 2;
  const sorted = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);

  sorted.forEach(([key, val]) => {
    const cat   = CATEGORIES[key] || CATEGORIES.outros;
    const sweep = (val / total) * Math.PI * 2;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, OR, angle, angle + sweep);
    ctx.closePath();
    ctx.fillStyle   = cat.color;
    ctx.fill();
    ctx.strokeStyle = chartBg();
    ctx.lineWidth   = 2;
    ctx.stroke();
    angle += sweep;

    const pct = ((val / total) * 100).toFixed(1);
    legend.innerHTML += `
      <div class="legend-item">
        <div class="legend-dot" style="background:${cat.color}"></div>
        <span class="legend-label">${cat.icon} ${cat.label}</span>
        <span class="legend-pct">${pct}%</span>
      </div>`;
  });

  ctx.beginPath();
  ctx.arc(cx, cy, IR, 0, Math.PI * 2);
  ctx.fillStyle = chartBg();
  ctx.fill();

  ctx.fillStyle    = chartFg();
  ctx.font         = 'bold 11px Inter';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    total >= 1000 ? `R$${(total / 1000).toFixed(1)}k` : total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
    cx, cy
  );
}

// =============================================
//  LINE CHART
// =============================================
let _lineChartPts    = [];
let _lineChartTooltip = null;

function getOrCreateLineTooltip() {
  if (_lineChartTooltip) return _lineChartTooltip;
  const el = document.createElement('div');
  el.id = 'line-tooltip';
  el.style.cssText = [
    'position:fixed', 'z-index:9999',
    'background:var(--bg-card)', 'border:1px solid var(--border-h)',
    'border-radius:12px', 'padding:12px 14px',
    'box-shadow:0 8px 32px rgba(0,0,0,.45)',
    'min-width:200px', 'max-width:290px',
    'pointer-events:none', 'display:none',
    'backdrop-filter:blur(12px)',
  ].join(';');
  document.body.appendChild(el);
  _lineChartTooltip = el;
  document.addEventListener('click', e => {
    if (!e.target.closest('#line-chart')) hideLineTooltip();
  });
  return el;
}

function showLineTooltip(pt, rect) {
  const el  = getOrCreateLineTooltip();
  if (el.dataset.day === String(pt.day)) { hideLineTooltip(); return; }
  el.dataset.day = pt.day;

  const fmtV = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const rows = pt.txList.map(t => {
    const cat = CATEGORIES[t.category] || CATEGORIES.outros;
    return `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--border);font-size:12px;">
      <span style="color:var(--text-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${cat.icon} ${escHtml(t.description)}</span>
      <span style="color:var(--red);font-weight:600;white-space:nowrap;flex-shrink:0">${fmtV(t.amount)}</span>
    </div>`;
  }).join('');

  el.innerHTML = `
    <div style="font-size:11px;color:var(--text-3);margin-bottom:7px;font-weight:500;letter-spacing:.03em">DIA ${pt.day}</div>
    ${rows}
    <div style="display:flex;justify-content:space-between;padding-top:7px;font-size:13px;font-weight:700;">
      <span style="color:var(--text-2)">Total</span>
      <span style="color:var(--red)">${fmtV(pt.v)}</span>
    </div>`;

  el.style.display = 'block';
  const tooltipW = 290;
  let x = rect.left + pt.x + 14;
  let y = rect.top  + pt.y - 16;
  if (x + tooltipW > window.innerWidth  - 8) x = rect.left + pt.x - tooltipW - 14;
  if (x < 8) x = 8;
  const tooltipH = el.offsetHeight;
  if (y + tooltipH > window.innerHeight - 8) y = window.innerHeight - tooltipH - 8;
  if (y < 8) y = 8;
  el.style.left = x + 'px';
  el.style.top  = y + 'px';
}

function hideLineTooltip() {
  if (!_lineChartTooltip) return;
  _lineChartTooltip.style.display = 'none';
  delete _lineChartTooltip.dataset.day;
}

function drawLine(txs) {
  const canvas = document.getElementById('line-chart');
  if (!canvas) return;

  const W = canvas.parentElement.clientWidth || 500;
  canvas.width  = W;
  canvas.height = 200;
  const H   = 200;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  const year        = currentDate.getFullYear();
  const month       = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const now         = new Date();
  const maxDay      = (now.getMonth() === month && now.getFullYear() === year)
                        ? now.getDate() : daysInMonth;

  const daily    = Array(daysInMonth + 1).fill(0);
  const dailyTxs = Array.from({ length: daysInMonth + 1 }, () => []);
  txs.filter(t => t.type === 'despesa').forEach(t => {
    const d = parseInt(t.date.split('-')[2], 10);
    daily[d] += t.amount;
    dailyTxs[d].push(t);
  });

  const maxVal = Math.max(...daily, 1);
  const pL = 52, pR = 16, pT = 18, pB = 30;
  const cW = W - pL - pR, cH = H - pT - pB;

  ctx.strokeStyle  = chartFg(0.07);
  ctx.lineWidth    = 1;
  ctx.font         = '10px Inter';
  ctx.fillStyle    = chartFg(0.45);
  ctx.textAlign    = 'right';
  ctx.textBaseline = 'middle';

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
      v: daily[d],
      day: d,
      txList: dailyTxs[d],
    });
  }
  _lineChartPts = pts;
  if (pts.length < 2) return;

  const grad = ctx.createLinearGradient(0, pT, 0, pT + cH);
  grad.addColorStop(0, 'rgba(124,58,237,.28)');
  grad.addColorStop(1, 'rgba(124,58,237,.01)');

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pT + cH);
  pts.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(pts[pts.length - 1].x, pT + cH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1], curr = pts[i];
    const cpx  = (prev.x + curr.x) / 2;
    ctx.bezierCurveTo(cpx, prev.y, cpx, curr.y, curr.x, curr.y);
  }
  ctx.strokeStyle = '#7c3aed';
  ctx.lineWidth   = 2.5;
  ctx.stroke();

  pts.forEach(p => {
    if (p.v === 0) return;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fillStyle   = '#a78bfa';
    ctx.fill();
    ctx.strokeStyle = chartBg();
    ctx.lineWidth   = 2;
    ctx.stroke();
  });

  ctx.fillStyle    = chartFg(0.4);
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'alphabetic';
  const step = Math.ceil(daysInMonth / 8);
  for (let d = 1; d <= daysInMonth; d += step) {
    const x = pL + ((d - 1) / Math.max(daysInMonth - 1, 1)) * cW;
    ctx.fillText(d, x, H - pB + 18);
  }

  canvas.onmousemove = e => {
    const r  = canvas.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (canvas.width  / r.width);
    const my = (e.clientY - r.top)  * (canvas.height / r.height);
    const hit = _lineChartPts.find(p => p.v > 0 && Math.hypot(p.x - mx, p.y - my) < 14);
    canvas.style.cursor = hit ? 'pointer' : 'default';
  };

  canvas.onclick = e => {
    const r  = canvas.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (canvas.width  / r.width);
    const my = (e.clientY - r.top)  * (canvas.height / r.height);
    const hit = _lineChartPts.find(p => p.v > 0 && Math.hypot(p.x - mx, p.y - my) < 14);
    if (hit) { e.stopPropagation(); showLineTooltip(hit, r); }
    else hideLineTooltip();
  };

  canvas.onmouseleave = () => { canvas.style.cursor = 'default'; };
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
    ctx.fillText(`${cat.icon} ${cat.label}`, pL - 9, y + barH / 2);

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
