'use strict';

const express = require('express');
const path    = require('path');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const app          = express();
const SUPA_URL     = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPA_ANON    = process.env.SUPABASE_KEY         || '';
const SUPA_SERVICE = process.env.SUPABASE_SERVICE_KEY || SUPA_ANON;
const GROQ_KEY     = process.env.GROQ_KEY             || '';
const IS_PROD      = process.env.NODE_ENV === 'production';

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
  res.setHeader('Access-Control-Allow-Methods',     'GET, POST, DELETE');
  res.setHeader('Access-Control-Allow-Headers',     'Content-Type');
  res.setHeader('Vary', 'Origin');

  // Responde preflight diretamente
  if (req.method === 'OPTIONS') return res.status(204).end();

  next();
});

// ── Arquivos estáticos ────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..')));

// ── Cookie ────────────────────────────────────────────────────────────────────

const SESSION_COOKIE = 'atlas_sid';
const COOKIE_OPTS    = {
  httpOnly: true,
  secure:   IS_PROD,
  sameSite: 'lax',
  path:     '/',
  maxAge:   7 * 24 * 60 * 60 * 1000, // 7 dias
};

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
    r = await fetch(url, opts);
  } catch (err) {
    // Erro de rede / DNS / timeout — Supabase ou Groq inacessível
    const e = new Error('Serviço externo inacessível. Tente novamente.');
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

function requireAuth(req, res, next) {
  const cookies = parseCookies(req);
  const token   = cookies[SESSION_COOKIE];

  if (!token) return res.status(401).json({ message: 'Autenticação necessária.' });

  const payload = decodeJwtPayload(token);
  if (!payload?.sub) return res.status(401).json({ message: 'Token inválido.' });

  if (payload.exp && Date.now() / 1000 > payload.exp) {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return res.status(401).json({ message: 'Sessão expirada. Faça login novamente.' });
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

    const token = data?.session?.access_token || data?.access_token;
    if (token) res.cookie(SESSION_COOKIE, token, COOKIE_OPTS);

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

    res.cookie(SESSION_COOKIE, data.access_token, COOKIE_OPTS);
    res.status(200).json({ ok: true });
  } catch (err) { next(err); }
});

// Converte o token do redirect de confirmação de email em cookie httpOnly.
app.post('/api/auth/confirm', authLimiter, (req, res) => {
  const { access_token } = req.body || {};
  if (!access_token) return res.status(400).json({ message: 'Token ausente.' });

  const payload = decodeJwtPayload(access_token);
  if (!payload?.sub)                                return res.status(400).json({ message: 'Token inválido.' });
  if (payload.exp && Date.now() / 1000 > payload.exp) return res.status(400).json({ message: 'Token expirado.' });

  res.cookie(SESSION_COOKIE, access_token, COOKIE_OPTS);
  res.status(200).json({ ok: true });
});

app.post('/api/auth/signout', (req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: '/', secure: IS_PROD, sameSite: 'lax' });
  res.status(200).json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.status(200).json({ id: req.userId, email: req.userEmail });
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

// ── AI ────────────────────────────────────────────────────────────────────────

app.post('/api/ai/chat', aiLimiter, async (req, res, next) => {
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Atlas Finance → http://localhost:${PORT}  [${IS_PROD ? 'prod' : 'dev'}]`)
);
