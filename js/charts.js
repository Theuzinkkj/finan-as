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
    if (_donutHovered >= 0) {
      goToTransactions('despesa', _donutSlices[_donutHovered].key);
    }
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

// =============================================
//  LINE CHART
// =============================================
let _lineChartPts     = [];
let _lineChartTooltip = null;
let _lineHoveredIdx   = -1;
let _lineBaseImage    = null;

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
  return el;
}

function showLineTooltip(pt, rect) {
  const el  = getOrCreateLineTooltip();
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

  ctx.fillStyle    = chartFg(0.4);
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'alphabetic';
  const step = Math.ceil(daysInMonth / 8);
  for (let d = 1; d <= daysInMonth; d += step) {
    const x = pL + ((d - 1) / Math.max(daysInMonth - 1, 1)) * cW;
    ctx.fillText(d, x, H - pB + 18);
  }

  _lineBaseImage  = ctx.getImageData(0, 0, W, H);
  _lineHoveredIdx = -1;

  function redrawLineDots(hovIdx) {
    ctx.putImageData(_lineBaseImage, 0, 0);

    if (hovIdx >= 0) {
      const hp = _lineChartPts[hovIdx];
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(hp.x, pT);
      ctx.lineTo(hp.x, pT + cH);
      ctx.strokeStyle = 'rgba(124,58,237,0.45)';
      ctx.lineWidth   = 1;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      ctx.save();
      ctx.font         = 'bold 10px Inter';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle    = 'rgba(124,58,237,0.9)';
      const labelX = Math.max(pL + 16, Math.min(W - pR - 16, hp.x));
      ctx.fillText(`Dia ${hp.day}`, labelX, pT - 3);
      ctx.restore();
    }

    _lineChartPts.forEach((p, i) => {
      if (p.v === 0) return;
      const hovered = i === hovIdx;
      const r = hovered ? 7 : 4;
      if (hovered) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(124,58,237,0.22)';
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle   = hovered ? '#7c3aed' : '#a78bfa';
      ctx.fill();
      ctx.strokeStyle = chartBg();
      ctx.lineWidth   = hovered ? 2.5 : 2;
      ctx.stroke();
    });
  }

  redrawLineDots(-1);

  canvas.onmousemove = e => {
    const r  = canvas.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (canvas.width  / r.width);
    const my = (e.clientY - r.top)  * (canvas.height / r.height);
    const idx = _lineChartPts.findIndex(p => p.v > 0 && Math.hypot(p.x - mx, p.y - my) < 16);
    canvas.style.cursor = idx >= 0 ? 'pointer' : 'default';
    if (idx !== _lineHoveredIdx) {
      _lineHoveredIdx = idx;
      redrawLineDots(idx);
    }
    if (idx >= 0) showLineTooltip(_lineChartPts[idx], r);
    else hideLineTooltip();
  };

  canvas.onmouseleave = () => {
    canvas.style.cursor = 'default';
    if (_lineHoveredIdx !== -1) { _lineHoveredIdx = -1; redrawLineDots(-1); }
    hideLineTooltip();
  };

  let _lineClickedDay = -1;
  canvas.onclick = e => {
    const r  = canvas.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (canvas.width  / r.width);
    const my = (e.clientY - r.top)  * (canvas.height / r.height);
    const idx = _lineChartPts.findIndex(p => p.v > 0 && Math.hypot(p.x - mx, p.y - my) < 16);
    const panel = document.getElementById('line-click-info');
    if (!panel) return;

    if (idx < 0) return;
    const pt = _lineChartPts[idx];

    if (_lineClickedDay === pt.day) {
      panel.classList.remove('open');
      _lineClickedDay = -1;
      return;
    }
    _lineClickedDay = pt.day;

    const fmtV = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const rows = pt.txList.map(t => {
      const cat = CATEGORIES[t.category] || CATEGORIES.outros;
      return `<div class="line-click-tx">
        <span class="line-click-tx-desc">${cat.icon} <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(t.description)}</span></span>
        <span class="line-click-tx-amount">${fmtV(t.amount)}</span>
      </div>`;
    }).join('');

    panel.innerHTML = `
      <div class="line-click-day">
        Dia ${pt.day}
        <button class="line-click-close" onclick="this.closest('.line-click-panel').classList.remove('open')">✕</button>
      </div>
      ${rows}
      <div class="line-click-total">
        <span class="line-click-total-label">Total do dia</span>
        <span class="line-click-total-value">${fmtV(pt.v)}</span>
      </div>`;

    panel.classList.remove('open');
    requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.add('open')));
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
