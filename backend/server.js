'use strict';

const express = require('express');
const cors    = require('cors');
const path    = require('path');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const app          = express();
const SUPA_URL     = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPA_ANON    = process.env.SUPABASE_KEY         || '';
const SUPA_SERVICE = process.env.SUPABASE_SERVICE_KEY || SUPA_ANON;
const GROQ_KEY     = process.env.GROQ_KEY             || '';
const IS_PROD      = process.env.NODE_ENV === 'production';

// ── Middleware global ─────────────────────────────────────────────────────────

app.use(express.json());

// CORS: credentials: true exige origin explícita (não pode ser *).
// Same-origin (Railway) não passa por aqui — só dev local e origens listadas.
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || '')
    .split(',').map(o => o.trim().replace(/\/+$/, '')).filter(Boolean)
);

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true); // same-origin, curl, Postman
    const clean = origin.replace(/\/+$/, '');
    if (allowedOrigins.has(clean)) return cb(null, clean);
    cb(null, false); // bloqueia origens desconhecidas
  },
  credentials: true, // necessário para cookies httpOnly
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type'],
}));

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
    const ip  = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    let entry = hits.get(ip);
    if (!entry || now > entry.resetAt) entry = { count: 0, resetAt: now + windowMs };
    entry.count++;
    hits.set(ip, entry);
    if (entry.count > max) return res.status(429).json({ message });
    next();
  };
}

const aiLimiter   = makeRateLimiter(60 * 1000,      20, 'Muitas requisições. Tente novamente em 1 minuto.');
const authLimiter = makeRateLimiter(15 * 60 * 1000, 10, 'Muitas tentativas. Tente novamente em 15 minutos.');

// ── Utilitários ───────────────────────────────────────────────────────────────

function decodeJwtPayload(token) {
  try {
    const part   = token.split('.')[1];
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function userHeaders(token) {
  return {
    'Content-Type':  'application/json',
    'apikey':        SUPA_ANON,
    'Authorization': `Bearer ${token}`,
  };
}

function authError(data) {
  const msg = data.error_description || data.msg || data.message || data.error || 'Erro desconhecido.';
  return { error_code: data.error_code || data.error || null, error_description: msg };
}

// ── Middleware de autenticação ────────────────────────────────────────────────
// Lê o JWT do cookie httpOnly — o cliente JS nunca tem acesso ao token.

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

app.post('/api/auth/signup', authLimiter, async (req, res) => {
  try {
    const r    = await fetch(`${SUPA_URL}/auth/v1/signup`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_ANON },
      body:    JSON.stringify(req.body),
    });
    const data = await r.json().catch(() => ({}));

    if (!r.ok) return res.status(r.status).json(authError(data));

    // Confirmação de email pendente — sem sessão ainda
    if (data.user && !data.session && !data.access_token) {
      return res.status(200).json({ ok: true, confirmEmail: true });
    }

    const token = data.session?.access_token || data.access_token;
    if (token) res.cookie(SESSION_COOKIE, token, COOKIE_OPTS);

    res.status(200).json({ ok: true });
  } catch {
    res.status(500).json({ message: 'Erro interno.' });
  }
});

app.post('/api/auth/signin', authLimiter, async (req, res) => {
  try {
    const r    = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_ANON },
      body:    JSON.stringify(req.body),
    });
    const data = await r.json().catch(() => ({}));

    if (!r.ok) return res.status(r.status).json(authError(data));

    res.cookie(SESSION_COOKIE, data.access_token, COOKIE_OPTS);
    res.status(200).json({ ok: true });
  } catch {
    res.status(500).json({ message: 'Erro interno.' });
  }
});

// Recebe o token do redirect de confirmação de email (hash da URL)
// e converte para cookie httpOnly — o token sai da URL e do JS.
app.post('/api/auth/confirm', authLimiter, (req, res) => {
  const { access_token } = req.body;
  if (!access_token) return res.status(400).json({ message: 'Token ausente.' });

  const payload = decodeJwtPayload(access_token);
  if (!payload?.sub) return res.status(400).json({ message: 'Token inválido.' });
  if (payload.exp && Date.now() / 1000 > payload.exp)
    return res.status(400).json({ message: 'Token expirado.' });

  res.cookie(SESSION_COOKIE, access_token, COOKIE_OPTS);
  res.status(200).json({ ok: true });
});

app.post('/api/auth/signout', (req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: '/', secure: IS_PROD, sameSite: 'lax' });
  res.status(200).json({ ok: true });
});

// Retorna informações mínimas de display — nunca o token.
app.get('/api/auth/me', requireAuth, (req, res) => {
  res.status(200).json({ id: req.userId, email: req.userEmail });
});

// ── Transactions ──────────────────────────────────────────────────────────────

app.get('/api/transactions', requireAuth, async (req, res) => {
  try {
    const url = `${SUPA_URL}/rest/v1/transactions`
              + `?user_id=eq.${encodeURIComponent(req.userId)}`
              + `&select=*&order=date.desc`;

    const r    = await fetch(url, { headers: userHeaders(req.authToken) });
    const data = await r.json().catch(() => []);
    res.status(r.status).json(data);
  } catch {
    res.status(500).json({ message: 'Erro interno.' });
  }
});

app.post('/api/transactions', requireAuth, async (req, res) => {
  try {
    // user_id vem do JWT — o cliente não precisa (nem deve) enviar
    const body = { ...req.body, user_id: req.userId };

    const r = await fetch(`${SUPA_URL}/rest/v1/transactions`, {
      method:  'POST',
      headers: { ...userHeaders(req.authToken), 'Prefer': 'return=minimal' },
      body:    JSON.stringify(body),
    });
    res.status(r.status).end();
  } catch {
    res.status(500).json({ message: 'Erro interno.' });
  }
});

app.delete('/api/transactions/:id', requireAuth, async (req, res) => {
  try {
    const url = `${SUPA_URL}/rest/v1/transactions`
              + `?id=eq.${encodeURIComponent(req.params.id)}`
              + `&user_id=eq.${encodeURIComponent(req.userId)}`;

    const r = await fetch(url, { method: 'DELETE', headers: userHeaders(req.authToken) });
    res.status(r.status).end();
  } catch {
    res.status(500).json({ message: 'Erro interno.' });
  }
});

// ── AI ────────────────────────────────────────────────────────────────────────

app.post('/api/ai/chat', requireAuth, aiLimiter, async (req, res) => {
  try {
    const r    = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
      body:    JSON.stringify(req.body),
    });
    const data = await r.json().catch(() => ({}));
    res.status(r.status).json(data);
  } catch {
    res.status(500).json({ message: 'Erro interno.' });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Atlas Finance → http://localhost:${PORT}`)
);
