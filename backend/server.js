'use strict';

const express    = require('express');
const path       = require('path');
const nodemailer = require('nodemailer');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const app          = express();
const SUPA_URL     = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPA_ANON    = process.env.SUPABASE_KEY         || '';
const SUPA_SERVICE = process.env.SUPABASE_SERVICE_KEY || SUPA_ANON;
const GROQ_KEY     = process.env.GROQ_KEY             || '';
const IS_PROD      = process.env.NODE_ENV === 'production';

// ── Email (Nodemailer) ────────────────────────────────────────────────────────
// Suporta SMTP genérico (Gmail, Outlook, Brevo, etc.) via variáveis de ambiente.
// SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
function createMailer() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  const port = +(process.env.SMTP_PORT || 587);
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth:   { user, pass },
  });
}

const _mailer   = createMailer();
const SMTP_FROM = process.env.SMTP_FROM || process.env.SMTP_USER || 'Atlas <noreply@atlas.app>';

// ── Validação de ambiente ─────────────────────────────────────────────────────
// Falha rápido na inicialização — melhor que erros silenciosos em runtime.

const MISSING = ['SUPABASE_URL', 'SUPABASE_KEY', 'GROQ_KEY'].filter(k => !process.env[k]);
if (MISSING.length) {
  console.error(`[Atlas] Variáveis de ambiente ausentes: ${MISSING.join(', ')}`);
  if (IS_PROD) process.exit(1);
}

// ── Middleware global ─────────────────────────────────────────────────────────

app.use(express.json());

// ── CORS ──────────────────────────────────────────────────────────────────────
// Middleware próprio — o pacote cors não expõe req no callback de origin,
// impedindo a comparação com o Host header para detectar same-origin.

const extraOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || '')
    .split(',').map(o => o.trim().replace(/\/+$/, '')).filter(Boolean)
);

app.use((req, res, next) => {
  const origin = (req.headers.origin || '').replace(/\/+$/, '');

  // Sem Origin = same-origin (GET sem fetch, curl, Postman)
  if (!origin) return next();

  // Same-origin: browser envia Origin mesmo em fetch() POST same-origin.
  // Comparar com o Host header resolve sem precisar configurar ALLOWED_ORIGINS.
  const host = req.headers.host || '';
  const isSameOrigin = origin === `https://${host}` || origin === `http://${host}`;

  const isAllowed =
    isSameOrigin ||
    extraOrigins.has(origin) ||
    /^https?:\/\/localhost(:\d+)?$/.test(origin) ||
    /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin);

  if (!isAllowed) {
    return res.status(403).json({ message: 'Origem não permitida.' });
  }

  // Cabeçalhos CORS para origens permitidas
  res.setHeader('Access-Control-Allow-Origin',      origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods',     'GET, POST, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers',     'Content-Type');
  res.setHeader('Vary', 'Origin');

  // Responde preflight diretamente
  if (req.method === 'OPTIONS') return res.status(204).end();

  next();
});

// ── Content-Security-Policy ───────────────────────────────────────────────────
app.use((_req, res, next) => {
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' blob: https://cdnjs.cloudflare.com",
    "style-src 'self' 'unsafe-inline' blob: https://fonts.googleapis.com",
    "font-src 'self' blob: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' blob: https:",
    "worker-src 'self' blob:",
  ].join('; '));
  next();
});

// ── Rotas de navegação ────────────────────────────────────────────────────────
const fe = f => path.join(__dirname, '..', 'frontend', f);

app.get('/',        (_req, res) => res.redirect('/landing'));
app.get('/landing', (_req, res) => res.sendFile(fe('landing.html')));
app.get('/login',   (_req, res) => res.sendFile(fe('login.html')));
app.get('/app',     (_req, res) => res.sendFile(fe('index.html')));

// ── Arquivos estáticos ────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ── Cookie ────────────────────────────────────────────────────────────────────

const SESSION_COOKIE  = 'atlas_sid';
const REFRESH_COOKIE  = 'atlas_refresh';
const COOKIE_OPTS     = {
  httpOnly: true,
  secure:   IS_PROD,
  sameSite: 'lax',
  path:     '/',
  maxAge:   7 * 24 * 60 * 60 * 1000, // 7 dias
};

function setSessionCookies(res, access_token, refresh_token) {
  res.cookie(SESSION_COOKIE, access_token, COOKIE_OPTS);
  if (refresh_token) res.cookie(REFRESH_COOKIE, refresh_token, COOKIE_OPTS);
}

function clearSessionCookies(res) {
  res.clearCookie(SESSION_COOKIE,  { path: '/', secure: IS_PROD, sameSite: 'lax' });
  res.clearCookie(REFRESH_COOKIE, { path: '/', secure: IS_PROD, sameSite: 'lax' });
}

function parseCookies(req) {
  const out = {};
  for (const pair of (req.headers.cookie || '').split(';')) {
    const idx = pair.indexOf('=');
    if (idx < 0) continue;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    try { out[k] = decodeURIComponent(v); } catch { out[k] = v; }
  }
  return out;
}

// ── Rate limiting ─────────────────────────────────────────────────────────────

function makeRateLimiter(windowMs, max, message) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (now > entry.resetAt) hits.delete(key);
    }
  }, windowMs);

  return function rateLimiter(req, res, next) {
    const ip  = req.ip || req.connection?.remoteAddress || 'unknown';
    const now = Date.now();
    let entry = hits.get(ip);
    if (!entry || now > entry.resetAt) entry = { count: 0, resetAt: now + windowMs };
    entry.count++;
    hits.set(ip, entry);
    if (entry.count > max) return res.status(429).json({ message });
    next();
  };
}

const aiLimiter   = makeRateLimiter(60_000,       20, 'Muitas requisições. Tente novamente em 1 minuto.');
const authLimiter = makeRateLimiter(15 * 60_000,  10, 'Muitas tentativas. Tente novamente em 15 minutos.');

// ── Utilitários ───────────────────────────────────────────────────────────────

function decodeJwtPayload(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function supaHeaders(token) {
  return {
    'Content-Type':  'application/json',
    'apikey':        SUPA_ANON,
    'Authorization': `Bearer ${token}`,
  };
}

// Faz fetch ao proxy externo com tratamento de erro claro.
async function proxyFetch(url, opts) {
  let r;
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 10_000);
    r = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(tid);
  } catch (err) {
    // Erro de rede / DNS / timeout — Supabase ou Groq inacessível
    const isTimeout = err.name === 'AbortError';
    const e = new Error(isTimeout ? 'Tempo limite excedido. Tente novamente.' : 'Serviço externo inacessível. Tente novamente.');
    e.status = 502;
    throw e;
  }

  const text = await r.text().catch(() => '');
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }

  return { ok: r.ok, status: r.status, data };
}

// Extrai a mensagem de erro do payload Supabase.
function supaErrorMsg(data) {
  return data?.error_description || data?.msg || data?.message || data?.error || 'Erro desconhecido.';
}

// ── Middleware de autenticação ────────────────────────────────────────────────

async function requireAuth(req, res, next) {
  const cookies = parseCookies(req);
  let token     = cookies[SESSION_COOKIE];

  if (!token) return res.status(401).json({ message: 'Autenticação necessária.' });

  let payload = decodeJwtPayload(token);
  if (!payload?.sub) return res.status(401).json({ message: 'Token inválido.' });

  // Token expirado — tenta refresh automático com o refresh_token
  if (payload.exp && Date.now() / 1000 > payload.exp) {
    const refreshToken = cookies[REFRESH_COOKIE];
    if (!refreshToken) {
      clearSessionCookies(res);
      return res.status(401).json({ message: 'Sessão expirada. Faça login novamente.' });
    }

    try {
      const { ok, data } = await proxyFetch(
        `${SUPA_URL}/auth/v1/token?grant_type=refresh_token`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': SUPA_ANON },
          body:    JSON.stringify({ refresh_token: refreshToken }),
        }
      );

      if (!ok || !data?.access_token) {
        clearSessionCookies(res);
        return res.status(401).json({ message: 'Sessão expirada. Faça login novamente.' });
      }

      token   = data.access_token;
      payload = decodeJwtPayload(token);
      setSessionCookies(res, token, data.refresh_token || refreshToken);
    } catch {
      clearSessionCookies(res);
      return res.status(401).json({ message: 'Sessão expirada. Faça login novamente.' });
    }
  }

  req.userId    = payload.sub;
  req.userEmail = payload.email || '';
  req.authToken = token;
  next();
}

// ── Auth ──────────────────────────────────────────────────────────────────────

app.post('/api/auth/signup', authLimiter, async (req, res, next) => {
  try {
    const { ok, status, data } = await proxyFetch(`${SUPA_URL}/auth/v1/signup`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_ANON },
      body:    JSON.stringify(req.body),
    });

    if (!ok) return res.status(status).json({
      error_code:        data?.error_code  || null,
      error_description: supaErrorMsg(data),
    });

    if (data?.user && !data.session && !data.access_token) {
      return res.status(200).json({ ok: true, confirmEmail: true });
    }

    const token   = data?.session?.access_token || data?.access_token;
    const refresh = data?.session?.refresh_token || data?.refresh_token;
    if (token) setSessionCookies(res, token, refresh);

    res.status(200).json({ ok: true });
  } catch (err) { next(err); }
});

app.post('/api/auth/signin', authLimiter, async (req, res, next) => {
  try {
    const { ok, status, data } = await proxyFetch(
      `${SUPA_URL}/auth/v1/token?grant_type=password`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPA_ANON },
        body:    JSON.stringify(req.body),
      }
    );

    if (!ok) return res.status(status).json({
      error_code:        data?.error_code  || null,
      error_description: supaErrorMsg(data),
    });

    setSessionCookies(res, data.access_token, data.refresh_token);
    res.status(200).json({ ok: true });
  } catch (err) { next(err); }
});

// Converte o token do redirect de confirmação de email em cookie httpOnly.
app.post('/api/auth/confirm', authLimiter, (req, res) => {
  const { access_token, refresh_token } = req.body || {};
  if (!access_token) return res.status(400).json({ message: 'Token ausente.' });

  const payload = decodeJwtPayload(access_token);
  if (!payload?.sub)                                return res.status(400).json({ message: 'Token inválido.' });
  if (payload.exp && Date.now() / 1000 > payload.exp) return res.status(400).json({ message: 'Token expirado.' });

  setSessionCookies(res, access_token, refresh_token || undefined);
  res.status(200).json({ ok: true });
});

app.post('/api/auth/signout', (req, res) => {
  clearSessionCookies(res);
  res.status(200).json({ ok: true });
});

app.get('/api/auth/me', requireAuth, async (req, res, next) => {
  try {
    let email = req.userEmail;
    if (!email) {
      const { ok, data } = await proxyFetch(`${SUPA_URL}/auth/v1/user`, {
        headers: supaHeaders(req.authToken),
      });
      if (ok) email = data?.email || '';
    }
    res.status(200).json({ id: req.userId, email });
  } catch (err) { next(err); }
});

// ── Transactions ──────────────────────────────────────────────────────────────

app.get('/api/transactions', requireAuth, async (req, res, next) => {
  try {
    const url = `${SUPA_URL}/rest/v1/transactions`
              + `?user_id=eq.${encodeURIComponent(req.userId)}`
              + `&select=*&order=date.desc`;

    const { ok, status, data } = await proxyFetch(url, { headers: supaHeaders(req.authToken) });
    if (!ok) return res.status(status).json({ message: supaErrorMsg(data) });
    res.status(200).json(Array.isArray(data) ? data : []);
  } catch (err) { next(err); }
});

app.post('/api/transactions', requireAuth, async (req, res, next) => {
  try {
    const body = { ...req.body, user_id: req.userId };

    const { ok, status, data } = await proxyFetch(`${SUPA_URL}/rest/v1/transactions`, {
      method:  'POST',
      headers: { ...supaHeaders(req.authToken), 'Prefer': 'return=minimal' },
      body:    JSON.stringify(body),
    });

    if (!ok) return res.status(status).json({ message: supaErrorMsg(data) });
    res.status(201).end();
  } catch (err) { next(err); }
});

app.delete('/api/transactions/:id', requireAuth, async (req, res, next) => {
  try {
    const url = `${SUPA_URL}/rest/v1/transactions`
              + `?id=eq.${encodeURIComponent(req.params.id)}`
              + `&user_id=eq.${encodeURIComponent(req.userId)}`;

    const { ok, status, data } = await proxyFetch(url, {
      method:  'DELETE',
      headers: supaHeaders(req.authToken),
    });

    if (!ok) return res.status(status).json({ message: supaErrorMsg(data) });
    res.status(200).end();
  } catch (err) { next(err); }
});

app.patch('/api/transactions/:id', requireAuth, async (req, res, next) => {
  try {
    const url = `${SUPA_URL}/rest/v1/transactions`
              + `?id=eq.${encodeURIComponent(req.params.id)}`
              + `&user_id=eq.${encodeURIComponent(req.userId)}`;

    const { ok, status, data } = await proxyFetch(url, {
      method:  'PATCH',
      headers: { ...supaHeaders(req.authToken), 'Prefer': 'return=minimal' },
      body:    JSON.stringify(req.body),
    });

    if (!ok) return res.status(status).json({ message: supaErrorMsg(data) });
    res.status(200).end();
  } catch (err) { next(err); }
});

// ── Profile ───────────────────────────────────────────────────────────────────

app.post('/api/profile/photo', requireAuth, async (req, res, next) => {
  try {
    const { base64 } = req.body || {};
    if (!base64) return res.status(400).json({ message: 'Imagem obrigatória.' });

    const match = base64.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return res.status(400).json({ message: 'Formato de imagem inválido.' });

    const [, contentType, imageData] = match;
    const ext     = contentType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
    const buffer  = Buffer.from(imageData, 'base64');
    const filePath = `${req.userId}.${ext}`;

    let uploadRes;
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 30_000);
      uploadRes = await fetch(`${SUPA_URL}/storage/v1/object/avatars/${filePath}`, {
        method:  'POST',
        headers: {
          'Content-Type':  contentType,
          'apikey':        SUPA_SERVICE,
          'Authorization': `Bearer ${SUPA_SERVICE}`,
          'x-upsert':      'true',
        },
        body:   buffer,
        signal: controller.signal,
      });
      clearTimeout(tid);
    } catch (err) {
      const e = new Error(err.name === 'AbortError' ? 'Tempo limite ao enviar foto.' : 'Erro ao enviar foto.');
      e.status = 502;
      throw e;
    }

    if (!uploadRes.ok) {
      const errText = await uploadRes.text().catch(() => '');
      let errData; try { errData = JSON.parse(errText); } catch { errData = null; }
      return res.status(uploadRes.status).json({ message: errData?.message || 'Erro ao salvar foto.' });
    }

    const photoUrl = `${SUPA_URL}/storage/v1/object/public/avatars/${filePath}`;

    // Salva a URL (pequena) no user_metadata — não o base64
    await proxyFetch(`${SUPA_URL}/auth/v1/user`, {
      method:  'PUT',
      headers: supaHeaders(req.authToken),
      body:    JSON.stringify({ data: { photo: photoUrl } }),
    });

    res.status(200).json({ url: photoUrl });
  } catch (err) { next(err); }
});

app.delete('/api/profile/photo', requireAuth, async (req, res, next) => {
  try {
    // Busca metadados para encontrar URL atual da foto
    const { ok, data } = await proxyFetch(`${SUPA_URL}/auth/v1/user`, {
      headers: supaHeaders(req.authToken),
    });
    if (ok && data?.user_metadata?.photo) {
      // Extrai o caminho do arquivo da URL pública
      const url = data.user_metadata.photo;
      const match = url.match(/\/object\/public\/avatars\/(.+)$/);
      if (match) {
        await fetch(`${SUPA_URL}/storage/v1/object/avatars/${match[1]}`, {
          method:  'DELETE',
          headers: { 'apikey': SUPA_SERVICE, 'Authorization': `Bearer ${SUPA_SERVICE}` },
        });
      }
    }
    // Remove foto dos metadados
    await proxyFetch(`${SUPA_URL}/auth/v1/user`, {
      method:  'PUT',
      headers: supaHeaders(req.authToken),
      body:    JSON.stringify({ data: { photo: null } }),
    });
    res.status(200).json({ ok: true });
  } catch (err) { next(err); }
});

app.get('/api/profile', requireAuth, async (req, res, next) => {
  try {
    const { ok, status, data } = await proxyFetch(`${SUPA_URL}/auth/v1/user`, {
      headers: supaHeaders(req.authToken),
    });
    if (!ok) return res.status(status).json({ message: supaErrorMsg(data) });
    res.status(200).json(data?.user_metadata || {});
  } catch (err) { next(err); }
});

app.patch('/api/profile', requireAuth, async (req, res, next) => {
  try {
    const { ok, status, data } = await proxyFetch(`${SUPA_URL}/auth/v1/user`, {
      method:  'PUT',
      headers: supaHeaders(req.authToken),
      body:    JSON.stringify({ data: req.body }),
    });
    if (!ok) return res.status(status).json({ message: supaErrorMsg(data) });
    res.status(200).json({ ok: true });
  } catch (err) { next(err); }
});

// ── Auth extra ───────────────────────────────────────────────────────────────

// Envia email de redefinição de senha (não requer autenticação prévia)
app.post('/api/auth/reset-password', authLimiter, async (req, res, next) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ message: 'Email obrigatório.' });

    const { ok, status, data } = await proxyFetch(`${SUPA_URL}/auth/v1/recover`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_ANON },
      body:    JSON.stringify({ email }),
    });

    if (!ok) return res.status(status).json({ message: supaErrorMsg(data) });
    res.status(200).json({ ok: true });
  } catch (err) { next(err); }
});

// Atualiza senha do usuário autenticado (chamado após fluxo de recovery)
app.post('/api/auth/update-password', requireAuth, async (req, res, next) => {
  try {
    const { password } = req.body || {};
    if (!password || password.length < 6)
      return res.status(400).json({ message: 'A senha deve ter pelo menos 6 caracteres.' });

    const { ok, status, data } = await proxyFetch(`${SUPA_URL}/auth/v1/user`, {
      method:  'PUT',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        SUPA_ANON,
        'Authorization': `Bearer ${req.authToken}`,
      },
      body: JSON.stringify({ password }),
    });

    if (!ok) return res.status(status).json({ message: supaErrorMsg(data) });
    res.status(200).json({ ok: true });
  } catch (err) { next(err); }
});

// Exclui a conta do usuário autenticado (usa service key para admin)
app.delete('/api/auth/account', requireAuth, async (req, res, next) => {
  try {
    const { ok, status, data } = await proxyFetch(
      `${SUPA_URL}/auth/v1/admin/users/${req.userId}`,
      {
        method:  'DELETE',
        headers: {
          'Content-Type':  'application/json',
          'apikey':        SUPA_SERVICE,
          'Authorization': `Bearer ${SUPA_SERVICE}`,
        },
      }
    );

    if (!ok) return res.status(status).json({ message: supaErrorMsg(data) });
    clearSessionCookies(res);
    res.status(200).json({ ok: true });
  } catch (err) { next(err); }
});

// ── Portfolio ─────────────────────────────────────────────────────────────────

app.get('/api/portfolio', requireAuth, async (req, res, next) => {
  try {
    const url = `${SUPA_URL}/rest/v1/portfolio_entries`
              + `?user_id=eq.${encodeURIComponent(req.userId)}`
              + `&select=*&order=date.desc,created_at.desc`;
    const { ok, status, data } = await proxyFetch(url, { headers: supaHeaders(req.authToken) });
    if (!ok) return res.status(status).json({ message: supaErrorMsg(data) });
    res.json(Array.isArray(data) ? data : []);
  } catch (err) { next(err); }
});

app.post('/api/portfolio', requireAuth, async (req, res, next) => {
  try {
    const { date, asset, amount, notes, asset_type, transaction_type, quantity, price, other_costs } = req.body || {};
    if (!date || !asset || !amount) return res.status(400).json({ message: 'date, asset e amount são obrigatórios.' });
    if (isNaN(amount) || +amount <= 0) return res.status(400).json({ message: 'Valor inválido.' });

    const body = {
      date,
      asset: asset.trim(),
      amount: +amount,
      notes: notes?.trim() || null,
      asset_type: asset_type || null,
      transaction_type: transaction_type || 'compra',
      quantity: quantity != null ? +quantity : null,
      price: price != null ? +price : null,
      other_costs: other_costs != null ? +other_costs : null,
      user_id: req.userId,
    };
    let r = await proxyFetch(`${SUPA_URL}/rest/v1/portfolio_entries`, {
      method:  'POST',
      headers: { ...supaHeaders(req.authToken), 'Prefer': 'return=representation' },
      body:    JSON.stringify(body),
    });
    // Fallback: if schema cache rejects extended columns, retry with core fields only
    if (!r.ok) {
      const msg = (supaErrorMsg(r.data) || '').toLowerCase();
      if (msg.includes('column') || msg.includes('schema') || msg.includes('relation')) {
        const coreBody = { date: body.date, asset: body.asset, amount: body.amount, notes: body.notes, user_id: body.user_id };
        r = await proxyFetch(`${SUPA_URL}/rest/v1/portfolio_entries`, {
          method:  'POST',
          headers: { ...supaHeaders(req.authToken), 'Prefer': 'return=representation' },
          body:    JSON.stringify(coreBody),
        });
      }
    }
    if (!r.ok) return res.status(r.status).json({ message: supaErrorMsg(r.data) });
    res.status(201).json(Array.isArray(r.data) ? r.data[0] : r.data);
  } catch (err) { next(err); }
});

app.patch('/api/portfolio/:id', requireAuth, async (req, res, next) => {
  try {
    const { date, asset, amount, notes, asset_type, transaction_type, quantity, price, other_costs } = req.body || {};
    const updates = {};
    if (date)             updates.date             = date;
    if (asset)            updates.asset            = asset.trim();
    if (amount != null)   updates.amount           = +amount;
    if (notes !== undefined) updates.notes         = notes?.trim() || null;
    if (asset_type !== undefined)       updates.asset_type       = asset_type || null;
    if (transaction_type !== undefined) updates.transaction_type = transaction_type || 'compra';
    if (quantity != null) updates.quantity   = +quantity;
    if (price    != null) updates.price      = +price;
    if (other_costs != null) updates.other_costs = +other_costs;

    const url = `${SUPA_URL}/rest/v1/portfolio_entries`
              + `?id=eq.${encodeURIComponent(req.params.id)}`
              + `&user_id=eq.${encodeURIComponent(req.userId)}`;
    let rp = await proxyFetch(url, {
      method:  'PATCH',
      headers: { ...supaHeaders(req.authToken), 'Prefer': 'return=representation' },
      body:    JSON.stringify(updates),
    });
    // Fallback: retry without extended columns if schema cache error
    if (!rp.ok) {
      const msg = (supaErrorMsg(rp.data) || '').toLowerCase();
      if (msg.includes('column') || msg.includes('schema') || msg.includes('relation')) {
        const coreUpdates = {};
        if (updates.date)   coreUpdates.date   = updates.date;
        if (updates.asset)  coreUpdates.asset  = updates.asset;
        if (updates.amount != null) coreUpdates.amount = updates.amount;
        if (updates.notes  !== undefined) coreUpdates.notes = updates.notes;
        rp = await proxyFetch(url, {
          method:  'PATCH',
          headers: { ...supaHeaders(req.authToken), 'Prefer': 'return=representation' },
          body:    JSON.stringify(coreUpdates),
        });
      }
    }
    if (!rp.ok) return res.status(rp.status).json({ message: supaErrorMsg(rp.data) });
    res.json(Array.isArray(rp.data) ? rp.data[0] : rp.data);
  } catch (err) { next(err); }
});

app.delete('/api/portfolio/:id', requireAuth, async (req, res, next) => {
  try {
    const url = `${SUPA_URL}/rest/v1/portfolio_entries`
              + `?id=eq.${encodeURIComponent(req.params.id)}`
              + `&user_id=eq.${encodeURIComponent(req.userId)}`;
    const { ok, status, data } = await proxyFetch(url, {
      method:  'DELETE',
      headers: supaHeaders(req.authToken),
    });
    if (!ok) return res.status(status).json({ message: supaErrorMsg(data) });
    res.status(200).end();
  } catch (err) { next(err); }
});

// ── Market Stocks (Yahoo Finance proxy) ──────────────────────────────────────

let _stocksCache = null;
let _stocksAt    = 0;
const STOCKS_TTL = 15 * 60 * 1000; // 15 min

const STOCK_NAMES = {
  'PETR4': 'Petrobras PN',
  'VALE3': 'Vale ON',
  'ITUB4': 'Itaú PN',
  'ABEV3': 'Ambev ON',
  'BBDC4': 'Bradesco PN',
  '^BVSP': 'IBOVESPA',
};

app.get('/api/market-stocks', async (req, res, next) => {
  try {
    const now = Date.now();
    if (_stocksCache && now - _stocksAt < STOCKS_TTL) return res.json(_stocksCache);

    // Yahoo Finance chart API — funciona sem autenticação, uma req por ticker
    const TICKERS = ['^BVSP', 'PETR4.SA', 'VALE3.SA', 'ITUB4.SA', 'ABEV3.SA', 'BBDC4.SA'];
    const YF_HEADERS = { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' };

    const fetchChart = async (symbol) => {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
      const { ok, data } = await proxyFetch(url, { headers: YF_HEADERS });
      if (!ok) return null;
      const meta = data?.chart?.result?.[0]?.meta;
      if (!meta?.regularMarketPrice) return null;
      const price  = meta.regularMarketPrice;
      const prev   = meta.chartPreviousClose ?? null;
      const change = prev != null ? +(price - prev).toFixed(2) : null;
      const pct    = prev != null ? +((change / prev) * 100).toFixed(2) : null;
      return {
        symbol:    symbol.replace('.SA', ''),
        shortName: meta.shortName || meta.longName || '',
        price, prev, change, pct,
        high:   meta.regularMarketDayHigh   ?? null,
        low:    meta.regularMarketDayLow    ?? null,
        volume: meta.regularMarketVolume    ?? null,
      };
    };

    const results = await Promise.all(TICKERS.map(t => fetchChart(t).catch(() => null)));
    const rawResults = results.filter(Boolean);

    if (!rawResults.length) return res.status(502).json({ message: 'Mercado indisponível.' });

    _stocksCache = rawResults.map(q => ({
      symbol: q.symbol,
      name:   STOCK_NAMES[q.symbol] || q.shortName || q.symbol,
      price:  q.price,
      change: q.change,
      pct:    q.pct,
      prev:   q.prev,
      high:   q.high,
      low:    q.low,
      volume: q.volume,
    }));
    _stocksAt = now;
    res.json(_stocksCache);
  } catch (err) { next(err); }
});

// ── Market Rates (BCB proxy) ──────────────────────────────────────────────────

let _ratesCache = null;
let _ratesAt    = 0;
const RATES_TTL = 4 * 60 * 60 * 1000; // 4 h

app.get('/api/market-rates', async (req, res, next) => {
  try {
    const now = Date.now();
    if (_ratesCache && now - _ratesAt < RATES_TTL) return res.json(_ratesCache);

    const bcb = s => proxyFetch(
      `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${s}/dados/ultimos/1?formato=json`,
      { headers: { Accept: 'application/json' } }
    );

    const [selicR, cdiR, ipcaR] = await Promise.all([
      bcb(4390),  // Meta SELIC % a.a.
      bcb(4391),  // CDI anualizado base 252 % a.a.
      bcb(13522), // IPCA acumulado 12 meses %
    ]);

    const parseVal   = r => parseFloat((r.data?.[0]?.valor || '0').replace(',', '.'));
    const dateOf     = r => r.data?.[0]?.data || '';
    const annualize  = m => +((Math.pow(1 + m / 100, 12) - 1) * 100).toFixed(2);

    _ratesCache = {
      selic: { value: annualize(parseVal(selicR)), date: dateOf(selicR), unit: '% a.a.' },
      cdi:   { value: annualize(parseVal(cdiR)),   date: dateOf(cdiR),   unit: '% a.a.' },
      ipca:  { value: parseVal(ipcaR),             date: dateOf(ipcaR),  unit: '% 12m'  },
    };
    _ratesAt = now;
    res.json(_ratesCache);
  } catch (err) { next(err); }
});

// ── AI ────────────────────────────────────────────────────────────────────────

app.post('/api/ai/chat', aiLimiter, requireAuth, async (req, res, next) => {
  try {
    const { ok, status, data } = await proxyFetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
        body:    JSON.stringify(req.body),
      }
    );

    if (!ok) return res.status(status).json({ message: data?.error?.message || 'Erro na IA.' });
    res.status(200).json(data);
  } catch (err) { next(err); }
});

// ── Notifications (Email) ─────────────────────────────────────────────────────
const notifLimiter = makeRateLimiter(60_000, 5, 'Muitas notificações. Tente em 1 minuto.');

async function sendEmail({ to, subject, html }) {
  if (!_mailer) return { ok: false, reason: 'Email não configurado. Adicione SMTP_HOST, SMTP_USER e SMTP_PASS no .env.' };
  try {
    await _mailer.sendMail({ from: SMTP_FROM, to, subject, html });
    return { ok: true };
  } catch (err) {
    console.error('[Atlas] Erro ao enviar email:', err.message);
    return { ok: false, reason: err.message };
  }
}

// Alerta de orçamento — dispara quando usuário atinge >= 80% de uma categoria
app.post('/api/notify/budget-alert', notifLimiter, requireAuth, async (req, res, next) => {
  try {
    const { category, spent, limit, pct } = req.body || {};
    if (!category || !spent || !limit) return res.status(400).json({ message: 'Parâmetros inválidos.' });

    const fmtBRL = v => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    const subject = `⚠️ Alerta Atlas: ${pct}% do orçamento de ${category} usado`;
    const html = `
      <div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#0f0e17;color:#f1f5f9;border-radius:16px">
        <div style="font-size:1.6rem;font-weight:800;color:#7c3aed;margin-bottom:4px">💎 Atlas</div>
        <div style="color:#94a3b8;font-size:.85rem;margin-bottom:24px">Alerta de Orçamento</div>
        <div style="background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.3);border-radius:12px;padding:20px;margin-bottom:20px">
          <div style="font-size:1.1rem;font-weight:700;color:#f59e0b;margin-bottom:8px">⚠️ ${pct}% do orçamento de ${category} consumido</div>
          <div style="color:#94a3b8;font-size:.9rem">
            Você gastou <strong style="color:#f1f5f9">${fmtBRL(spent)}</strong> de um limite de <strong style="color:#f1f5f9">${fmtBRL(limit)}</strong> em <strong style="color:#f1f5f9">${category}</strong> neste mês.
          </div>
        </div>
        <div style="color:#94a3b8;font-size:.85rem;margin-bottom:24px">
          Ainda restam <strong style="color:#f1f5f9">${fmtBRL(limit - spent)}</strong> no orçamento. Monitore seus gastos para não ultrapassar o limite.
        </div>
        <a href="${process.env.APP_URL || 'https://app.mathsouza.online'}/app?tab=dashboard"
           style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:10px 22px;border-radius:10px;font-weight:600;font-size:.9rem">
          Ver meus gastos →
        </a>
        <div style="margin-top:32px;color:#4a5568;font-size:.75rem;border-top:1px solid rgba(255,255,255,.08);padding-top:16px">
          Você recebeu este email porque configurou alertas de orçamento no Atlas.
        </div>
      </div>`;

    const result = await sendEmail({ to: req.userEmail, subject, html });
    if (!result.ok) return res.status(503).json({ message: result.reason });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Resumo mensal — enviado manualmente pelo usuário ou por cron externo
app.post('/api/notify/monthly-summary', notifLimiter, requireAuth, async (req, res, next) => {
  try {
    const { month, income, expense, balance, score, score_label, top_category } = req.body || {};
    if (!month) return res.status(400).json({ message: 'Parâmetro month obrigatório.' });

    const fmtBRL  = v => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    const positive = (balance || 0) >= 0;
    const scoreColor = (score || 0) >= 75 ? '#10b981' : (score || 0) >= 50 ? '#f59e0b' : '#ef4444';
    const subject = `📊 Resumo Atlas — ${month}`;

    const html = `
      <div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#0f0e17;color:#f1f5f9;border-radius:16px">
        <div style="font-size:1.6rem;font-weight:800;color:#7c3aed;margin-bottom:4px">💎 Atlas</div>
        <div style="color:#94a3b8;font-size:.85rem;margin-bottom:24px">Resumo Mensal</div>
        <div style="font-size:1.3rem;font-weight:700;margin-bottom:20px">Seu mês de <strong style="color:#7c3aed">${month}</strong></div>
        <div style="display:grid;gap:12px;margin-bottom:20px">
          <div style="background:rgba(255,255,255,.05);border-radius:10px;padding:14px 18px">
            <div style="color:#94a3b8;font-size:.75rem;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Saldo</div>
            <div style="font-size:1.4rem;font-weight:800;color:${positive ? '#10b981' : '#ef4444'}">${positive ? '+' : ''}${fmtBRL(balance)}</div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div style="background:rgba(16,185,129,.08);border-radius:10px;padding:14px 18px">
              <div style="color:#94a3b8;font-size:.75rem;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Receitas</div>
              <div style="font-size:1.1rem;font-weight:700;color:#10b981">${fmtBRL(income)}</div>
            </div>
            <div style="background:rgba(239,68,68,.08);border-radius:10px;padding:14px 18px">
              <div style="color:#94a3b8;font-size:.75rem;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Despesas</div>
              <div style="font-size:1.1rem;font-weight:700;color:#ef4444">${fmtBRL(expense)}</div>
            </div>
          </div>
          ${score != null ? `
          <div style="background:rgba(255,255,255,.05);border-radius:10px;padding:14px 18px;display:flex;align-items:center;gap:14px">
            <div style="font-size:2rem;font-weight:800;color:${scoreColor}">${score}</div>
            <div>
              <div style="color:#94a3b8;font-size:.75rem;text-transform:uppercase;letter-spacing:.06em">Score Financeiro</div>
              <div style="font-weight:700;color:${scoreColor}">${score_label || ''}</div>
            </div>
          </div>` : ''}
          ${top_category ? `
          <div style="background:rgba(255,255,255,.05);border-radius:10px;padding:14px 18px">
            <div style="color:#94a3b8;font-size:.75rem;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Maior gasto</div>
            <div style="font-weight:600">${top_category}</div>
          </div>` : ''}
        </div>
        <a href="${process.env.APP_URL || 'https://app.mathsouza.online'}/app?tab=analysis"
           style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:10px 22px;border-radius:10px;font-weight:600;font-size:.9rem">
          Ver análise completa →
        </a>
        <div style="margin-top:32px;color:#4a5568;font-size:.75rem;border-top:1px solid rgba(255,255,255,.08);padding-top:16px">
          Atlas Finance — seus dados, seu controle.
        </div>
      </div>`;

    const result = await sendEmail({ to: req.userEmail, subject, html });
    if (!result.ok) return res.status(503).json({ message: result.reason });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Error handler global ──────────────────────────────────────────────────────
// Centraliza todos os erros não tratados — CORS, proxy, runtime.

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const status  = err.status || 500;
  const message = err.status ? err.message : 'Erro interno do servidor.';
  if (!err.status) console.error('[Atlas] Erro interno:', err);
  res.status(status).json({ message });
});

// ── Start ─────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () =>
    console.log(`Atlas Finance → http://localhost:${PORT}  [${IS_PROD ? 'prod' : 'dev'}]`)
  );
}

module.exports = app;
